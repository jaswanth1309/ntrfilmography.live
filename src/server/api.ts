import { Hono } from "hono";
import { cors } from "hono/cors";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const api = new Hono().basePath("/api/v1");

// Helper function to extract env variables context-agnostically (works on both Node.js & Cloudflare Workers)
function getEnvVal(c: any, keys: string[]): string {
  if (c && c.env) {
    for (const key of keys) {
      if (c.env[key]) return String(c.env[key]).trim();
    }
  }
  if (typeof process !== "undefined" && process.env) {
    for (const key of keys) {
      if (process.env[key]) return String(process.env[key]).trim();
    }
  }
  return "";
}

function getR2Credentials(c: any) {
  const endpointRaw = getEnvVal(c, [
    "CLOUDFLARE_R2_ENDPOINT",
    "R2_ENDPOINT",
    "CLOUDFLARE_ENDPOINT",
    "ENDPOINT"
  ]);

  const accessKeyId = getEnvVal(c, [
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "R2_ACCESS_KEY_ID",
    "CLOUDFLARE_ACCESS_KEY_ID",
    "ACCESS_KEY_ID"
  ]);

  const secretAccessKey = getEnvVal(c, [
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_SECRET_ACCESS_KEY",
    "SECRET_ACCESS_KEY"
  ]);

  const bucketName = getEnvVal(c, [
    "CLOUDFLARE_R2_BUCKET_NAME",
    "R2_BUCKET_NAME",
    "CLOUDFLARE_BUCKET_NAME",
    "BUCKET_NAME"
  ]) || "ntrfilmography-media";

  const publicUrlRaw = getEnvVal(c, [
    "CLOUDFLARE_R2_PUBLIC_URL",
    "R2_PUBLIC_URL",
    "CLOUDFLARE_PUBLIC_URL",
    "PUBLIC_URL"
  ]) || "https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev";

  // Sanitize endpoint
  let endpoint = endpointRaw;
  if (endpoint) {
    if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
      endpoint = "https://" + endpoint;
    }
    endpoint = endpoint.replace(/\/$/, "");
    const match = endpoint.match(/^(https?:\/\/[a-z0-9\-]+\.r2\.cloudflarestorage\.com)/i);
    if (match) {
      endpoint = match[1];
    }
  }

  // Sanitize publicUrl
  let publicUrl = publicUrlRaw.replace(/\/$/, "");
  if (publicUrl && !publicUrl.startsWith("http://") && !publicUrl.startsWith("https://")) {
    publicUrl = "https://" + publicUrl;
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl
  };
}

// Enable secure dynamic CORS based on ALLOWED_ORIGINS setting
api.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  const allowedOriginsEnv = getEnvVal(c, ["ALLOWED_ORIGINS"]) || "";
  const allowedOrigins = allowedOriginsEnv.split(",").map(o => o.trim()).filter(Boolean);

  let allowed = false;
  if (origin) {
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
      allowed = true;
    }
  }

  const corsHandler = cors({
    origin: origin && allowed ? origin : "*",
    allowMethods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
  });
  return corsHandler(c, next);
});

// Security Header Safeguards middleware
api.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  await next();
});

// Production-ready IP-based Rate Limiter (best effort on serverless, 100% on dev)
class IPAddressRateLimiter {
  private store = new Map<string, { count: number; resetTime: number }>();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    if (typeof setInterval !== "undefined") {
      setInterval(() => this.prune(), 5 * 60 * 1000);
    }
  }

  public checkLimit(ip: string) {
    const now = Date.now();
    const record = this.store.get(ip);

    if (!record || now > record.resetTime) {
      const resetTime = now + this.windowMs;
      this.store.set(ip, { count: 1, resetTime });
      return { limited: false, limit: this.maxRequests, remaining: this.maxRequests - 1, resetTime };
    }

    record.count++;
    const remaining = Math.max(0, this.maxRequests - record.count);

    if (record.count > this.maxRequests) {
      return { limited: true, limit: this.maxRequests, remaining: 0, resetTime: record.resetTime };
    }

    return { limited: false, limit: this.maxRequests, remaining, resetTime: record.resetTime };
  }

  private prune() {
    const now = Date.now();
    for (const [ip, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(ip);
      }
    }
  }
}

const listRateLimiter = new IPAddressRateLimiter(60 * 1000, 150);
const downloadRateLimiter = new IPAddressRateLimiter(60 * 1000, 30);

const getClientIP = (c: any): string => {
  const xForwardedFor = c.req.header("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  return c.env?.incoming?.socket?.remoteAddress || "unknown_ip";
};

function sanitizePrefix(prefix: string): string {
  if (!prefix) return "";
  let sanitized = prefix.replace(/\x00/g, "");
  sanitized = sanitized.replace(/\.\.(?:\/|\\)/g, "");
  // Strip control characters, quotes, and backslashes, but allow normal path characters including spaces, parentheses, brackets, Unicode etc.
  sanitized = sanitized.replace(/[\x00-\x1F\x7F"\\;\r\n]/g, "");
  return sanitized;
}

function sanitizeFilename(filename: string): string {
  if (!filename) return "download.bin";
  let clean = filename.replace(/[\x00-\x1F\x7F"\\;\/\r\n]/g, "_");
  // Simple extraction of basename equivalent to block path insertions
  const lastSlash = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  if (lastSlash !== -1) {
    clean = clean.substring(lastSlash + 1);
  }
  if (clean.length > 150) {
    const extIdx = clean.lastIndexOf(".");
    if (extIdx !== -1 && clean.length - extIdx < 8) {
      const ext = clean.substring(extIdx);
      clean = clean.substring(0, 140) + ext;
    } else {
      clean = clean.substring(0, 150);
    }
  }
  return clean || "download.bin";
}

function isUrlSafeAndAllowed(targetUrlStr: string, c: any): boolean {
  try {
    const parsed = new URL(targetUrlStr);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    const unsafePatterns = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
      /^224\./,
      /^::1$/,
      /^fe80:/,
      /^fc00:/,
    ];

    if (unsafePatterns.some(pattern => pattern.test(hostname))) {
      console.warn(`[SECURITY ALERT] SSRF attempt blocked! Requested private/local hostname: "${hostname}"`);
      return false;
    }

    const allowedDomains = new Set<string>();
    allowedDomains.add("pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev");
    allowedDomains.add("images.unsplash.com");
    allowedDomains.add("www.w3schools.com");
    allowedDomains.add("w3schools.com");
    allowedDomains.add("img.youtube.com");
    allowedDomains.add("youtube.com");
    allowedDomains.add("youtu.be");
    allowedDomains.add("player.vimeo.com");
    allowedDomains.add("vimeo.com");

    const envPublicUrl = getEnvVal(c, [
      "CLOUDFLARE_R2_PUBLIC_URL",
      "R2_PUBLIC_URL",
      "CLOUDFLARE_PUBLIC_URL",
      "PUBLIC_URL"
    ]);
    if (envPublicUrl) {
      try {
        const u = new URL(envPublicUrl);
        allowedDomains.add(u.hostname.toLowerCase());
      } catch {
        allowedDomains.add(envPublicUrl.replace(/^https?:\/\//, "").split("/")[0].toLowerCase());
      }
    }

    const envEndpoint = getEnvVal(c, [
      "CLOUDFLARE_R2_ENDPOINT",
      "R2_ENDPOINT",
      "CLOUDFLARE_ENDPOINT",
      "ENDPOINT"
    ]);
    if (envEndpoint) {
      try {
        const u = new URL(envEndpoint);
        allowedDomains.add(u.hostname.toLowerCase());
      } catch {
        allowedDomains.add(envEndpoint.replace(/^https?:\/\//, "").split("/")[0].toLowerCase());
      }
    }

    const isDomainAllowed = Array.from(allowedDomains).some(domain => {
      return hostname === domain || hostname.endsWith("." + domain);
    });

    if (!isDomainAllowed) {
      console.warn(`[SECURITY WARNING] Blocked proxy request to non-whitelisted domain: "${hostname}"`);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function listFilesSingle(c: any, prefix: string) {
  try {
    const { endpoint, accessKeyId, secretAccessKey, bucketName, publicUrl } = getR2Credentials(c);

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      return [];
    }

    const s3Client = new S3Client({
      endpoint,
      region: "auto",
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    });

    const response = await s3Client.send(command);
    if (!response.Contents) {
      return [];
    }

    return response.Contents
      .filter(item => item.Key && !item.Key.endsWith("/"))
      .map(item => ({
        key: item.Key,
        url: `${publicUrl}/${item.Key.split("/").map(encodeURIComponent).join("/")}`,
        size: item.Size || 0,
        lastModified: item.LastModified ? item.LastModified.toISOString() : new Date().toISOString(),
      }));
  } catch (err: any) {
    console.error(`Error listing R2 prefix ${prefix}:`, err.message);
    return [];
  }
}

async function listAllBucketFiles(c: any) {
  const { endpoint, accessKeyId, secretAccessKey, bucketName, publicUrl } = getR2Credentials(c);

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_CREDENTIALS_MISSING: Cloudflare R2 bucket credentials are not configured or are incomplete in your environment variables. Please check your CLOUDFLARE_R2_ENDPOINT, CLOUDFLARE_R2_ACCESS_KEY_ID, and CLOUDFLARE_R2_SECRET_ACCESS_KEY.");
  }

  const s3Client = new S3Client({
    endpoint,
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  let allFiles: any[] = [];
  let isTruncated = true;
  let nextContinuationToken: string | undefined = undefined;

  try {
    while (isTruncated) {
      const command: any = new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: nextContinuationToken,
      });

      const response: any = await s3Client.send(command);
      if (response.Contents) {
        const files = response.Contents
          .filter(item => item.Key && !item.Key.endsWith("/"))
          .map(item => ({
            key: item.Key,
            url: `${publicUrl}/${item.Key.split("/").map(encodeURIComponent).join("/")}`,
            size: item.Size || 0,
            lastModified: item.LastModified ? item.LastModified.toISOString() : new Date().toISOString(),
          }));
        allFiles.push(...files);
      }
      isTruncated = response.IsTruncated || false;
      nextContinuationToken = response.NextContinuationToken;
    }
  } catch (s3Err: any) {
    const errMsg = s3Err.message || "";
    const isAuthError = errMsg.includes("SignatureDoesNotMatch") || 
                        errMsg.includes("InvalidAccessKeyId") || 
                        errMsg.includes("AccessDenied") || 
                        errMsg.includes("Forbidden") ||
                        errMsg.includes("NoSuchBucket") ||
                        s3Err.name === "SignatureDoesNotMatch" ||
                        s3Err.name === "InvalidAccessKeyId" ||
                        s3Err.name === "AccessDenied" ||
                        s3Err.name === "NoSuchBucket";
    
    if (isAuthError) {
      throw new Error(`R2_AUTH_ERROR: Cloudflare R2 bucket access denied or misconfigured. Details: ${errMsg}`);
    } else {
      throw new Error(`R2_CONNECT_ERROR: Intermittent error communicating with Cloudflare R2: ${errMsg}`);
    }
  }

  return allFiles;
}

async function listFiles(c: any, prefix: string) {
  const candidates = [prefix];

  if (prefix === "photos/movies/") {
    candidates.push(
      "Photos/Movie/",
      "ntrfilmography/Photos/Movie/",
      "Photos/Movie/AI/",
      "ntrfilmography/Photos/Movie/AI/"
    );
  } else if (prefix === "photos/events/") {
    candidates.push(
      "Photos/Event/",
      "ntrfilmography/Photos/Event/"
    );
  } else if (prefix === "photos/offline/") {
    candidates.push(
      "Photos/Latest/",
      "ntrfilmography/Photos/Latest/"
    );
  } else if (prefix === "video-cuts/cuts/") {
    candidates.push(
      "VideoCuts/Movie Cuts/",
      "ntrfilmography/VideoCuts/Movie Cuts/"
    );
  } else if (prefix === "video-cuts/songs/") {
    candidates.push(
      "VideoCuts/Video Songs/",
      "ntrfilmography/VideoCuts/Video Songs/"
    );
  } else if (prefix === "offline-videos/events/") {
    candidates.push(
      "Videos/Events/",
      "ntrfilmography/Videos/Events/"
    );
  } else if (prefix === "offline-videos/fans/") {
    candidates.push(
      "Videos/Celebrations/",
      "ntrfilmography/Videos/Celebrations/"
    );
  } else if (prefix === "movies/") {
    candidates.push("ntrfilmography/Movies/", "ntrfilmography/movies/", "Movies/", "movies/");
  } else if (prefix === "thumbnailsP/") {
    candidates.push(
      "ntrfilmography/Movie Posters/Potrait/",
      "ntrfilmography/Movie Posters/Portrait/",
      "Movie Posters/Potrait/",
      "Movie Posters/Portrait/"
    );
  } else if (prefix === "thumbnailsL/") {
    candidates.push(
      "ntrfilmography/Movie Posters/Landscape/",
      "Movie Posters/Landscape/"
    );
  } else if (prefix === "photosMovieThumbnails/") {
    candidates.push(
      "ntrfilmography/Photos Thumbnails/Movie Thumbnails/",
      "Photos Thumbnails/Movie Thumbnails/"
    );
  } else if (prefix === "photosEventThumbnails/") {
    candidates.push(
      "ntrfilmography/Photos Thumbnails/Event Thumbnails/",
      "Photos Thumbnails/Event Thumbnails/"
    );
  } else if (prefix === "videosEventThumbnails/") {
    candidates.push(
      "ntrfilmography/Videos Thumbnails/Event Thumbnails/",
      "Videos Thumbnails/Event Thumbnails/"
    );
  } else if (prefix === "videoCutsMovieThumbnails/") {
    candidates.push(
      "ntrfilmography/VideoCuts Thumbnails/Movie Cuts Thumbnails/",
      "VideoCuts Thumbnails/Movie Cuts Thumbnails/"
    );
  } else if (prefix === "audio/") {
    candidates.push("ntrfilmography/Audio/", "ntrfilmography/audio/", "Audio/", "audio/");
  }

  const uniqueCandidates = Array.from(new Set(candidates));
  const allFiles: any[] = [];
  const seenKeys = new Set<string>();

  for (const candidate of uniqueCandidates) {
    const files = await listFilesSingle(c, candidate);
    for (const f of files) {
      if (!seenKeys.has(f.key)) {
        seenKeys.add(f.key);
        allFiles.push(f);
      }
    }
  }

  return allFiles;
}

let cachedMediaAll: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache

// Hono Routes

api.get("/media/list", async (c) => {
  const ip = getClientIP(c);
  const limitStatus = listRateLimiter.checkLimit(ip);

  c.header("X-RateLimit-Limit", String(limitStatus.limit));
  c.header("X-RateLimit-Remaining", String(limitStatus.remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(limitStatus.resetTime / 1000)));

  if (limitStatus.limited) {
    c.header("Retry-After", String(Math.ceil((limitStatus.resetTime - Date.now()) / 1000)));
    return c.json({
      error: "Too many requests. Please slow down and try again.",
      code: "RATE_LIMIT_EXCEEDED"
    }, 429);
  }

  const rawPrefix = c.req.query("prefix") || "";
  const prefix = sanitizePrefix(rawPrefix);

  const files = await listFiles(c, prefix);
  return c.json(files);
});

api.get("/media/download", async (c) => {
  const ip = getClientIP(c);
  const limitStatus = downloadRateLimiter.checkLimit(ip);

  c.header("X-RateLimit-Limit", String(limitStatus.limit));
  c.header("X-RateLimit-Remaining", String(limitStatus.remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(limitStatus.resetTime / 1000)));

  if (limitStatus.limited) {
    c.header("Retry-After", String(Math.ceil((limitStatus.resetTime - Date.now()) / 1000)));
    return c.json({
      error: "Download rate limit exceeded. Please try again shortly.",
      code: "RATE_LIMIT_EXCEEDED"
    }, 429);
  }

  let fileUrl = c.req.query("url") || "";
  const key = c.req.query("key") || "";
  let filename = c.req.query("filename") || "";

  // If the download URL is a wsrv.nl optimized URL, extract the original URL
  if (fileUrl && fileUrl.includes("wsrv.nl")) {
    try {
      const parsedUrl = new URL(fileUrl);
      const extracted = parsedUrl.searchParams.get("url");
      if (extracted) {
        fileUrl = decodeURIComponent(extracted);
        console.log(`[DOWNLOAD PROXY] Extracted original file URL from optimized wsrv.nl link: "${fileUrl}"`);
      }
    } catch (e) {
      console.warn("[DOWNLOAD PROXY] Failed to extract original file URL from wsrv.nl link:", e);
    }
  }

  const { endpoint, accessKeyId, secretAccessKey, bucketName, publicUrl } = getR2Credentials(c);

  let activeKey = key || "";
  const isMockId = activeKey.match(/^m\d+$/) || activeKey.startsWith("mock-") || (activeKey && !activeKey.includes("/"));
  if ((!activeKey || isMockId) && fileUrl) {
    try {
      if (fileUrl.includes(".r2.dev") || (publicUrl && fileUrl.includes(publicUrl))) {
        const parsedUrl = new URL(fileUrl);
        activeKey = decodeURIComponent(parsedUrl.pathname).replace(/^\//, "");
      } else if (fileUrl.includes("ntrfilmography/")) {
        const index = fileUrl.indexOf("ntrfilmography/");
        activeKey = decodeURIComponent(fileUrl.substring(index));
      }
    } catch (e) {
      console.warn("Failed to extract R2 key from URL safely:", fileUrl);
    }
  }

  if (activeKey) {
    activeKey = sanitizePrefix(activeKey);
  }

  if (!filename) {
    const sourcePath = activeKey || fileUrl || "download";
    try {
      if (sourcePath.startsWith("http://") || sourcePath.startsWith("https://")) {
        const parsedUrl = new URL(sourcePath);
        const pathname = parsedUrl.pathname;
        filename = pathname.substring(pathname.lastIndexOf("/") + 1) || "download";
      } else {
        filename = sourcePath.substring(sourcePath.lastIndexOf("/") + 1) || "download";
      }
    } catch (e) {
      filename = sourcePath.substring(sourcePath.lastIndexOf("/") + 1) || "download";
    }
  }

  const safeFilename = sanitizeFilename(filename);

  // Try generating a presigned URL and redirecting directly to R2 if credentials exist!
  // This avoids memory buffers and gateway timeouts on large files like videos or movies.
  if (activeKey && endpoint && accessKeyId && secretAccessKey) {
    try {
      console.log(`[DOWNLOAD PROXY] Generating S3/R2 Presigned Redirect for Key="${activeKey}" -> Filename="${safeFilename}"`);
      const s3Client = new S3Client({
        endpoint,
        region: "auto",
        forcePathStyle: true,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      const cleanFilename = safeFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const utf8Filename = encodeURIComponent(safeFilename);
      const contentDisposition = `attachment; filename="${cleanFilename}"; filename*=UTF-8''${utf8Filename}`;

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: activeKey,
        ResponseContentDisposition: contentDisposition,
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      return c.redirect(presignedUrl, 307);
    } catch (s3Err: any) {
      console.warn(`[DOWNLOAD PROXY] R2 S3 presign failed for key "${activeKey}". Error:`, s3Err.message);
    }
  }

  // Fallback to proxy stream via URL (SSRF guarded proxying)
  let targetUrl = fileUrl;
  if (!targetUrl && activeKey) {
    targetUrl = `${publicUrl}/${activeKey}`;
  }

  if (!targetUrl) {
    return c.json({ error: "Missing url or key parameter", code: "BAD_REQUEST" }, 400);
  }

  // To prevent proxy stream memory exhaustion and timeouts for video, zip, or movie files,
  // we redirect them directly to the target URL (which is the high-speed CDN URL)
  const isVideoOrLarge = safeFilename.toLowerCase().endsWith('.mp4') || 
                         safeFilename.toLowerCase().endsWith('.mkv') || 
                         safeFilename.toLowerCase().endsWith('.avi') || 
                         safeFilename.toLowerCase().endsWith('.webm') || 
                         safeFilename.toLowerCase().endsWith('.mov') ||
                         safeFilename.toLowerCase().endsWith('.zip') ||
                         (activeKey && (activeKey.includes('Videos/') || activeKey.includes('VideoCuts/') || activeKey.includes('Movies/')));

  if (isVideoOrLarge) {
    console.log(`[DOWNLOAD PROXY] Redirecting large video/movie/zip directly to CDN to bypass container size limits: ${targetUrl}`);
    return c.redirect(targetUrl, 307);
  }

  if (!isUrlSafeAndAllowed(targetUrl, c)) {
    return c.json({
      error: "Forbidden proxy target: The requested URL is blocked for security reasons.",
      code: "SSRF_PROHIBITED"
    }, 403);
  }

  const encodedTargetUrl = targetUrl.startsWith("http") ? encodeURI(decodeURI(targetUrl)) : targetUrl;
  console.log(`Streaming proxy download request: ${encodedTargetUrl.substring(0, 100)}... -> ${safeFilename}`);

  const response = await fetch(encodedTargetUrl);
  if (!response.ok) {
    return c.json({ error: `Failed to fetch original file: ${response.status} ${response.statusText}` }, 500);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const contentLength = response.headers.get("content-length");

  const utf8Filename = encodeURIComponent(safeFilename);
  c.header("Content-Disposition", `attachment; filename="${safeFilename.replace(/[^a-zA-Z0-9._-]/g, "_")}"; filename*=UTF-8''${utf8Filename}`);
  c.header("Content-Type", contentType);
  if (contentLength) {
    c.header("Content-Length", contentLength);
  }

  return c.body(response.body);
});

api.get("/media/all", async (c) => {
  const ip = getClientIP(c);
  const limitStatus = listRateLimiter.checkLimit(ip);

  c.header("X-RateLimit-Limit", String(limitStatus.limit));
  c.header("X-RateLimit-Remaining", String(limitStatus.remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(limitStatus.resetTime / 1000)));

  if (limitStatus.limited) {
    c.header("Retry-After", String(Math.ceil((limitStatus.resetTime - Date.now()) / 1000)));
    return c.json({
      error: "Too many aggregate requests. Please wait a bit.",
      code: "RATE_LIMIT_EXCEEDED"
    }, 429);
  }

  const bypassCache = c.req.query("rescan") === "true" || c.req.query("bypassCache") === "true";
  const now = Date.now();

  if (cachedMediaAll && (now - cacheTimestamp < CACHE_DURATION) && !bypassCache) {
    console.log("Serving all aggregated media from server-side cache");
    return c.json(cachedMediaAll);
  }

  try {
    console.log("Fetching fresh media files from Cloudflare R2 bucket...");
    const bucketFiles = await listAllBucketFiles(c);

    const filterFromBucket = (prefixes: string[]) => {
      const seenKeys = new Set<string>();
      const result: any[] = [];
      for (const prefix of prefixes) {
        for (const file of bucketFiles) {
          if (file.key.startsWith(prefix)) {
            if (!seenKeys.has(file.key)) {
              seenKeys.add(file.key);
              result.push(file);
            }
          }
        }
      }
      return result;
    };

    const photoMovies = filterFromBucket([
      "ntrfilmography/Photos/Movie/",
      "Photos/Movie/"
    ]);

    const photoEvents = filterFromBucket([
      "ntrfilmography/Photos/Event/",
      "Photos/Event/"
    ]);

    const photoOffline = filterFromBucket([
      "ntrfilmography/Photos/Latest/",
      "Photos/Latest/"
    ]);

    const cutCuts = filterFromBucket([
      "ntrfilmography/VideoCuts/Movie Cuts/",
      "VideoCuts/Movie Cuts/"
    ]);

    const cutSongs = filterFromBucket([
      "ntrfilmography/VideoCuts/Video Songs/",
      "VideoCuts/Video Songs/"
    ]);

    const offlineEvents = filterFromBucket([
      "ntrfilmography/Videos/Events/",
      "Videos/Events/"
    ]);

    const offlineFans = filterFromBucket([
      "ntrfilmography/Videos/Celebrations/",
      "Videos/Celebrations/"
    ]);

    const moviesList = filterFromBucket(["ntrfilmography/Movies/", "ntrfilmography/movies/", "Movies/", "movies/"]);

    const thumbnailsP = filterFromBucket([
      "ntrfilmography/Movie Posters/Potrait/",
      "ntrfilmography/Movie Posters/Portrait/",
      "Movie Posters/Potrait/",
      "Movie Posters/Portrait/"
    ]);

    const thumbnailsL = filterFromBucket([
      "ntrfilmography/Movie Posters/Landscape/",
      "Movie Posters/Landscape/"
    ]);

    const photosMovieThumbnails = filterFromBucket([
      "ntrfilmography/Photos Thumbnails/Movie Thumbnails/",
      "Photos Thumbnails/Movie Thumbnails/"
    ]);

    const photosEventThumbnails = filterFromBucket([
      "ntrfilmography/Photos Thumbnails/Event Thumbnails/",
      "Photos Thumbnails/Event Thumbnails/"
    ]);

    const videosEventThumbnails = filterFromBucket([
      "ntrfilmography/Videos Thumbnails/Event Thumbnails/",
      "Videos Thumbnails/Event Thumbnails/"
    ]);

    const videoCutsMovieThumbnails = filterFromBucket([
      "ntrfilmography/VideoCuts Thumbnails/Movie Cuts Thumbnails/",
      "VideoCuts Thumbnails/Movie Cuts Thumbnails/"
    ]);

    const audioSongs = filterFromBucket(["ntrfilmography/Audio/", "ntrfilmography/audio/", "Audio/", "audio/"]);

    const responsePayload = {
      photos: {
        movies: photoMovies,
        events: photoEvents,
        offline: photoOffline,
      },
      videoCuts: {
        cuts: cutCuts,
        songs: cutSongs,
      },
      offlineVideos: {
        events: offlineEvents,
        fans: offlineFans,
      },
      movies: moviesList,
      thumbnailsP: thumbnailsP,
      thumbnailsL: thumbnailsL,
      photosMovieThumbnails: photosMovieThumbnails,
      photosEventThumbnails: photosEventThumbnails,
      videosEventThumbnails: videosEventThumbnails,
      videoCutsMovieThumbnails: videoCutsMovieThumbnails,
      audio: audioSongs,
      bucketFiles: bucketFiles.map(f => ({
        key: f.key,
        size: f.size
      }))
    };

    if (bucketFiles && bucketFiles.length > 0) {
      cachedMediaAll = responsePayload;
      cacheTimestamp = Date.now();
    }

    return c.json(responsePayload);
  } catch (err: any) {
    console.error("Failed to list R2 bucket files:", err.message);
    const isMisconfigured = err.message.includes("R2_CREDENTIALS_MISSING") || err.message.includes("R2_AUTH_ERROR");
    return c.json({
      error: err.message || "Failed to list R2 bucket files",
      code: isMisconfigured ? "R2_MISCONFIGURED" : "R2_CONNECT_ERROR"
    }, 500);
  }
});

api.onError((err, c) => {
  console.error("[CRITICAL BACKEND ERROR]:", {
    message: err.message,
    stack: err.stack,
    url: c.req.url,
    ip: getClientIP(c),
    timestamp: new Date().toISOString()
  });

  return c.json({
    error: "An unexpected system error occurred. Please try again later.",
    code: "INTERNAL_SERVER_ERROR"
  }, 500);
});
