import { Hono } from "hono";
import { cors } from "hono/cors";
import { DOMParser } from "@xmldom/xmldom";

// Polyfill DOMParser for Cloudflare Workers / workerd environments (preventing AWS/S3 SDK deserialization errors)
if (typeof globalThis.DOMParser === "undefined") {
  (globalThis as any).DOMParser = DOMParser;
}

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

// Get the R2 public CDN URL
function getR2PublicUrl(c: any): string {
  return getEnvVal(c, [
    "CLOUDFLARE_R2_PUBLIC_URL",
    "R2_PUBLIC_URL",
    "CLOUDFLARE_PUBLIC_URL",
    "PUBLIC_URL"
  ]) || "https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev";
}

// Fallback high-quality mock files database for local development and local preview when R2 is not bound
function getFallbackMockFiles(c: any): any[] {
  const publicUrlRaw = getR2PublicUrl(c);
  let publicUrl = publicUrlRaw.replace(/\/$/, "");
  if (publicUrl && !publicUrl.startsWith("http://") && !publicUrl.startsWith("https://")) {
    publicUrl = "https://" + publicUrl;
  }

  const mockKeys = [
    // Photos Movies
    { key: "ntrfilmography/Photos/Movie/devara_pose.jpg", url: "https://images.unsplash.com/photo-1509281373149-e957c6296406?q=80&w=800", size: 1250320 },
    { key: "ntrfilmography/Photos/Movie/rrr_action.jpg", url: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=800", size: 1420500 },
    
    // Photos Events
    { key: "ntrfilmography/Photos/Event/success_meet.jpg", url: "https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=800", size: 2100450 },
    
    // Photos Offline/Latest
    { key: "ntrfilmography/Photos/Latest/airport_look.jpg", url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=800", size: 980120 },
    
    // Video Cuts Movie Cuts
    { key: "ntrfilmography/VideoCuts/Movie Cuts/rrr_intro.mp4", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", size: 15420300 },
    
    // Video Cuts Video Songs
    { key: "ntrfilmography/VideoCuts/Video Songs/naatu_naatu.mp4", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", size: 22400100 },
    
    // Videos Events
    { key: "ntrfilmography/Videos/Events/audio_launch.mp4", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", size: 18450000 },
    
    // Videos Celebrations
    { key: "ntrfilmography/Videos/Celebrations/fans_celebration.mp4", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4", size: 12900000 },
    
    // Movies
    { key: "ntrfilmography/Movies/Devara_Full_Movie.mp4", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4", size: 150420100 },
    
    // Movie Posters Portrait
    { key: "ntrfilmography/Movie Posters/Portrait/devara_portrait.jpg", url: "https://images.unsplash.com/photo-1509281373149-e957c6296406?q=80&w=800", size: 850120 },
    
    // Movie Posters Landscape
    { key: "ntrfilmography/Movie Posters/Landscape/rrr_banner.jpg", url: "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?q=80&w=800", size: 1150400 },
    
    // Photos Thumbnails Movie Thumbnails
    { key: "ntrfilmography/Photos Thumbnails/Movie Thumbnails/devara_pose_thumb.jpg", url: "https://images.unsplash.com/photo-1509281373149-e957c6296406?q=80&w=300", size: 82000 },
    
    // Photos Thumbnails Event Thumbnails
    { key: "ntrfilmography/Photos Thumbnails/Event Thumbnails/success_meet_thumb.jpg", url: "https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=300", size: 75000 },
    
    // Videos Thumbnails Event Thumbnails
    { key: "ntrfilmography/Videos Thumbnails/Event Thumbnails/audio_launch_thumb.jpg", url: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?q=80&w=300", size: 95000 },
    
    // VideoCuts Thumbnails Movie Cuts Thumbnails
    { key: "ntrfilmography/VideoCuts Thumbnails/Movie Cuts Thumbnails/rrr_intro_thumb.jpg", url: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=300", size: 68000 },
    
    // Audio Songs
    { key: "ntrfilmography/Audio/Fear_Song.mp3", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", size: 4500120 }
  ];

  return mockKeys.map(item => ({
    key: item.key,
    url: item.url,
    size: item.size,
    lastModified: new Date().toISOString()
  }));
}

// Server-side lightweight R2 payload compressor to strip repeating R2 domains and shorten keys
function compressR2Data(data: any): { b: string; f: any } {
  if (!data) {
    return { b: '', f: {} };
  }
  let publicUrlBase = '';
  
  const findBase = (item: any) => {
    if (item && item.url && item.key) {
      const idx = item.url.lastIndexOf('/' + item.key);
      if (idx !== -1) {
        publicUrlBase = item.url.substring(0, idx);
        return true;
      }
    }
    return false;
  };

  const scan = (obj: any): boolean => {
    if (!obj) return false;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (findBase(item)) return true;
        if (scan(item)) return true;
      }
    } else if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (scan(obj[key])) return true;
      }
    }
    return false;
  };

  scan(data);

  const compressFile = (file: any) => {
    if (!file) return null;
    const time = file.lastModified ? new Date(file.lastModified).getTime() : 0;
    return {
      k: file.key,
      s: file.size,
      m: time
    };
  };

  const compressList = (list: any[]) => {
    if (!Array.isArray(list)) return [];
    return list.map(compressFile).filter(Boolean);
  };

  const compressMap = (map: any) => {
    if (!map || typeof map !== 'object') return {};
    const res: any = {};
    for (const key of Object.keys(map)) {
      if (Array.isArray(map[key])) {
        res[key] = compressList(map[key]);
      } else if (map[key] && typeof map[key] === 'object') {
        res[key] = compressMap(map[key]);
      }
    }
    return res;
  };

  const compressed: any = {
    photos: compressMap(data.photos),
    videoCuts: compressMap(data.videoCuts),
    offlineVideos: compressMap(data.offlineVideos),
    movies: compressList(data.movies),
    thumbnailsP: compressList(data.thumbnailsP),
    thumbnailsL: compressList(data.thumbnailsL),
    photosMovieThumbnails: compressList(data.photosMovieThumbnails),
    photosEventThumbnails: compressList(data.photosEventThumbnails || []),
    videosEventThumbnails: compressList(data.videosEventThumbnails || []),
    audio: compressList(data.audio || []),
    bucketFiles: compressList(data.bucketFiles || [])
  };

  return {
    b: publicUrlBase,
    f: compressed
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

// Production-ready IP-based Rate Limiter (No top-level setInterval to avoid Cloudflare startup crash)
class IPAddressRateLimiter {
  private store = new Map<string, { count: number; resetTime: number }>();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  public checkLimit(ip: string) {
    // Lazy pruning on checkLimit avoids the disallowed global setInterval/timers on Worker startup
    this.prune();

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
  return (c.env as any)?.incoming?.socket?.remoteAddress || "unknown_ip";
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

    const envPublicUrl = getR2PublicUrl(c);
    if (envPublicUrl) {
      try {
        const u = new URL(envPublicUrl);
        allowedDomains.add(u.hostname.toLowerCase());
      } catch {
        allowedDomains.add(envPublicUrl.replace(/^https?:\/\//, "").split("/")[0].toLowerCase());
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

// 100% Native Cloudflare R2 listing (No AWS SDK)
async function listFilesSingle(c: any, prefix: string) {
  try {
    const bucket = (c.env as any)?.MY_BUCKET;
    if (!bucket) {
      console.warn("[R2 LIST] 'MY_BUCKET' binding is missing in current environment. Returning fallback mock files.");
      const mockFiles = getFallbackMockFiles(c);
      return mockFiles.filter(f => f.key.startsWith(prefix));
    }

    const publicUrlRaw = getR2PublicUrl(c);
    let publicUrl = publicUrlRaw.replace(/\/$/, "");
    if (publicUrl && !publicUrl.startsWith("http://") && !publicUrl.startsWith("https://")) {
      publicUrl = "https://" + publicUrl;
    }

    const options: any = {};
    if (prefix) {
      options.prefix = prefix;
    }

    console.log(`[R2 LIST] Listing native prefix: "${prefix}"`);
    const listResult = await (bucket as any).list(options);
    if (!listResult || !listResult.objects) {
      return [];
    }

    return listResult.objects
      .filter((item: any) => item.key && !item.key.endsWith("/"))
      .map((item: any) => ({
        key: item.key,
        url: `${publicUrl}/${item.key.split("/").map(encodeURIComponent).join("/")}`,
        size: item.size || 0,
        lastModified: item.uploaded ? new Date(item.uploaded).toISOString() : new Date().toISOString(),
      }));
  } catch (err: any) {
    console.error(`Error listing R2 prefix ${prefix}:`, err.message);
    return [];
  }
}

// 100% Native Cloudflare R2 recursive all files lister with pagination cursor
// Highly optimized parallel prefix pre-fetching to prevent slow sequential page walks
async function listAllBucketFiles(c: any) {
  const bucket = (c.env as any)?.MY_BUCKET;
  console.log("MY_BUCKET EXISTS:", !!bucket);
  if (!bucket) {
    console.warn("MY_BUCKET is not bound in c.env. Returning fallback mock files for development mode.");
    return getFallbackMockFiles(c);
  }

  const publicUrlRaw = getR2PublicUrl(c);
  let publicUrl = publicUrlRaw.replace(/\/$/, "");
  if (publicUrl && !publicUrl.startsWith("http://") && !publicUrl.startsWith("https://")) {
    publicUrl = "https://" + publicUrl;
  }

  const prefixes = [
    "ntrfilmography/",
    "Photos/",
    "VideoCuts/",
    "Videos/",
    "Movies/",
    "Movie/",
    "Movie Posters/",
    "Photos Thumbnails/",
    "Videos Thumbnails/",
    "VideoCuts Thumbnails/",
    "Audio/",
    "audio/"
  ];

  try {
    console.log(`[R2 LIST ALL] Launching parallel pre-fetch for ${prefixes.length} prefixes...`);
    
    const fetchPrefixFiles = async (prefix: string): Promise<any[]> => {
      const prefixFiles: any[] = [];
      let isTruncated = true;
      let cursor: string | undefined = undefined;
      
      while (isTruncated) {
        const options: any = { prefix };
        if (cursor) {
          options.cursor = cursor;
        }
        
        const listResult = await (bucket as any).list(options);
        if (listResult && listResult.objects) {
          const files = listResult.objects
            .filter((item: any) => item.key && !item.key.endsWith("/"))
            .map((item: any) => ({
              key: item.key,
              url: `${publicUrl}/${item.key.split("/").map(encodeURIComponent).join("/")}`,
              size: item.size || 0,
              lastModified: item.uploaded ? new Date(item.uploaded).toISOString() : new Date().toISOString(),
            }));
          prefixFiles.push(...files);
        }
        isTruncated = listResult?.truncated || false;
        cursor = listResult?.cursor;
      }
      return prefixFiles;
    };

    // Execute list requests in parallel
    const results = await Promise.all(prefixes.map(p => fetchPrefixFiles(p)));
    
    // Flatten and de-duplicate by key
    const allFilesMap = new Map<string, any>();
    for (const fileList of results) {
      for (const file of fileList) {
        allFilesMap.set(file.key, file);
      }
    }
    
    const allFiles = Array.from(allFilesMap.values());
    console.log(`[R2 LIST ALL] Parallel pre-fetch finished. Found ${allFiles.length} unique files.`);
    return allFiles;
  } catch (err: any) {
    console.warn("[R2 LIST ALL] Parallel pre-fetch failed/partially rejected, falling back to sequential scan:", err.message);
    return await listAllBucketFilesSequential(c, publicUrl);
  }
}

async function listAllBucketFilesSequential(c: any, publicUrl: string) {
  const bucket = (c.env as any)?.MY_BUCKET;
  if (!bucket) return [];
  const allFiles: any[] = [];
  let isTruncated = true;
  let cursor: string | undefined = undefined;

  try {
    while (isTruncated) {
      const options: any = {};
      if (cursor) {
        options.cursor = cursor;
      }

      console.log(`[R2 LIST ALL FALLBACK] Fetching bucket page with cursor: ${cursor || 'none'}`);
      const listResult = await (bucket as any).list(options);
      if (listResult && listResult.objects) {
        const files = listResult.objects
          .filter((item: any) => item.key && !item.key.endsWith("/"))
          .map((item: any) => ({
            key: item.key,
            url: `${publicUrl}/${item.key.split("/").map(encodeURIComponent).join("/")}`,
            size: item.size || 0,
            lastModified: item.uploaded ? new Date(item.uploaded).toISOString() : new Date().toISOString(),
          }));
        allFiles.push(...files);
      }
      isTruncated = listResult?.truncated || false;
      cursor = listResult?.cursor;
    }
  } catch (err: any) {
    console.error("[R2 LIST ALL FALLBACK] Exception details:", err);
    throw new Error(`R2_CONNECT_ERROR: Intermittent error communicating with Cloudflare R2: ${err.message}`);
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

  const publicUrl = getR2PublicUrl(c);

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
  const rangeHeader = c.req.header("range") || c.req.header("Range");

  // 100% Native Cloudflare R2 Streaming Download
  const bucket = (c.env as any)?.MY_BUCKET;
  if (activeKey && bucket) {
    try {
      console.log(`[DOWNLOAD PROXY] Direct native R2 Get request for key: "${activeKey}" with Range: ${rangeHeader || "None"}`);
      let file: any = null;
      if (rangeHeader) {
        try {
          file = await (bucket as any).get(activeKey, { range: rangeHeader });
        } catch (rangeErr) {
          console.warn("[DOWNLOAD PROXY] R2 get with range failed, trying full get:", rangeErr);
          file = await (bucket as any).get(activeKey);
        }
      } else {
        file = await (bucket as any).get(activeKey);
      }

      if (file) {
        const contentType = file.httpMetadata?.contentType || "application/octet-stream";
        const totalSize = file.size;

        const utf8Filename = encodeURIComponent(safeFilename);
        c.header("Content-Disposition", `attachment; filename="${safeFilename.replace(/[^a-zA-Z0-9._-]/g, "_")}"; filename*=UTF-8''${utf8Filename}`);
        c.header("Content-Type", contentType);
        c.header("Accept-Ranges", "bytes");

        if (file.range) {
          const start = file.range.offset;
          const end = file.range.offset + file.range.length - 1;
          c.header("Content-Range", `bytes ${start}-${end}/${totalSize}`);
          c.header("Content-Length", String(file.range.length));
          c.status(206);
        } else {
          c.header("Content-Length", String(totalSize));
          c.status(200);
        }
        return c.body(file.body);
      }
    } catch (err: any) {
      console.warn(`[DOWNLOAD PROXY] Native R2 get failed for key "${activeKey}". Fallback to URL proxy. Error:`, err.message);
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

  if (!isUrlSafeAndAllowed(targetUrl, c)) {
    return c.json({
      error: "Forbidden proxy target: The requested URL is blocked for security reasons.",
      code: "SSRF_PROHIBITED"
    }, 403);
  }

  const encodedTargetUrl = targetUrl.startsWith("http") ? encodeURI(decodeURI(targetUrl)) : targetUrl;
  console.log(`Streaming proxy download request: ${encodedTargetUrl.substring(0, 100)}... -> ${safeFilename} with Range: ${rangeHeader || "None"}`);

  const fetchHeaders: Record<string, string> = {};
  if (rangeHeader) {
    fetchHeaders["Range"] = rangeHeader;
  }

  const response = await fetch(encodedTargetUrl, { headers: fetchHeaders });
  if (!response.ok && response.status !== 206) {
    return c.json({ error: `Failed to fetch original file: ${response.status} ${response.statusText}` }, 500);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const contentLength = response.headers.get("content-length");
  const contentRange = response.headers.get("content-range");

  const utf8Filename = encodeURIComponent(safeFilename);
  c.header("Content-Disposition", `attachment; filename="${safeFilename.replace(/[^a-zA-Z0-9._-]/g, "_")}"; filename*=UTF-8''${utf8Filename}`);
  c.header("Content-Type", contentType);
  c.header("Accept-Ranges", "bytes");

  if (contentRange) {
    c.header("Content-Range", contentRange);
  }
  if (contentLength) {
    c.header("Content-Length", contentLength);
  }

  c.status(response.status as any);
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

  // Admin Rescan Security Check
  const reqRescan = c.req.query("rescan") === "true";
  if (reqRescan) {
    const envToken = (c.env as any)?.ADMIN_RESCAN_TOKEN || (typeof process !== "undefined" && process.env?.ADMIN_RESCAN_TOKEN);
    let providedToken = c.req.query("token") || c.req.query("admin_token") || c.req.header("X-Admin-Token");
    const authHeader = c.req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      providedToken = authHeader.substring(7);
    }

    if (envToken) {
      if (!providedToken || providedToken !== envToken) {
        console.warn(`[RESCAN SECURITY] Unauthorized rescan attempt from IP: ${ip}`);
        return c.json({
          error: "Unauthorized: Invalid or missing admin rescan token.",
          code: "UNAUTHORIZED_RESCAN"
        }, 401);
      }
      console.log(`[RESCAN SECURITY] Authorized rescan requested by IP: ${ip}`);
    } else {
      console.warn(`[RESCAN SECURITY WARNING] rescan=true was called but ADMIN_RESCAN_TOKEN is not configured in the environment.`);
    }
  }

  const bypassCache = c.req.query("rescan") === "true" || c.req.query("bypassCache") === "true";
  
  // 1. Check Cloudflare Cache API first (extremely fast CDN/edge response)
  const hasCacheAPI = typeof globalThis.caches !== "undefined" && typeof (globalThis.caches as any).default !== "undefined";
  let cacheKey: any = null;
  let cache: any = null;

  if (hasCacheAPI && !bypassCache) {
    try {
      cache = (globalThis.caches as any).default;
      const cacheUrl = new URL(c.req.url);
      // Strip rescan and bypassCache query parameters for stable cache key
      cacheUrl.searchParams.delete("rescan");
      cacheUrl.searchParams.delete("bypassCache");
      cacheKey = new Request(cacheUrl.toString(), c.req as any);
      
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        console.log("[CACHE] Serving /media/all from Cloudflare Edge Cache API");
        const headers = new Headers(cachedResponse.headers);
        headers.set("X-Cache", "HIT-EDGE");
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers
        });
      }
    } catch (cacheErr: any) {
      console.warn("[CACHE] Failed to read from Cloudflare Edge Cache API:", cacheErr.message);
    }
  }

  const now = Date.now();

  // 2. Check in-memory fallback cache
  if (cachedMediaAll && (now - cacheTimestamp < CACHE_DURATION) && !bypassCache) {
    console.log("Serving all aggregated media from server-side memory cache");
    const responseHeaders = {
      "Content-Type": "application/json",
      "X-Cache": "HIT-MEMORY"
    };
    const shouldCompress = c.req.query("compress") !== "false";
    const payload = shouldCompress ? compressR2Data(cachedMediaAll) : cachedMediaAll;
    return c.json(payload, 200, responseHeaders);
  }

  try {
    console.log("Fetching fresh media files from native Cloudflare R2 bucket...");
    const bucketFiles = await listAllBucketFiles(c);

    const normalizePath = (p: string): string => {
      let temp = p.replace(/\\/g, "/").toLowerCase();
      if (temp.startsWith("ntrfilmography/")) {
        temp = temp.slice("ntrfilmography/".length);
      }
      return temp
        .replace(/^\//, "")
        .replace(/\/$/, "");
    };

    const filterFromBucket = (prefixes: string[]) => {
      const seenKeys = new Set<string>();
      const result: any[] = [];
      const normPrefixes = prefixes.map(p => normalizePath(p));

      for (const file of bucketFiles) {
        const normKey = normalizePath(file.key);
        const isMatch = normPrefixes.some(normPrefix => {
          return normKey === normPrefix || normKey.startsWith(normPrefix + "/");
        });

        if (isMatch) {
          if (!seenKeys.has(file.key)) {
            seenKeys.add(file.key);
            result.push(file);
          }
        }
      }
      return result;
    };

    const photoMovies = filterFromBucket([
      "ntrfilmography/Photos/Movie/",
      "ntrfilmography/Photos/Movies/",
      "Photos/Movie/",
      "Photos/Movies/"
    ]);

    const photoEvents = filterFromBucket([
      "ntrfilmography/Photos/Event/",
      "ntrfilmography/Photos/Events/",
      "Photos/Event/",
      "Photos/Events/"
    ]);

    const photoOffline = filterFromBucket([
      "ntrfilmography/Photos/Latest/",
      "Photos/Latest/"
    ]);

    const cutCuts = filterFromBucket([
      "ntrfilmography/VideoCuts/Movie Cuts/",
      "ntrfilmography/VideoCuts/Movie Cut/",
      "VideoCuts/Movie Cuts/",
      "VideoCuts/Movie Cut/"
    ]);

    const cutSongs = filterFromBucket([
      "ntrfilmography/VideoCuts/Video Songs/",
      "ntrfilmography/VideoCuts/Video Song/",
      "VideoCuts/Video Songs/",
      "VideoCuts/Video Song/"
    ]);

    const offlineEvents = filterFromBucket([
      "ntrfilmography/Videos/Events/",
      "ntrfilmography/Videos/Event/",
      "Videos/Events/",
      "Videos/Event/"
    ]);

    const offlineFans = filterFromBucket([
      "ntrfilmography/Videos/Celebrations/",
      "ntrfilmography/Videos/Celebration/",
      "Videos/Celebrations/",
      "Videos/Celebration/"
    ]);

    const moviesList = filterFromBucket([
      "ntrfilmography/Movies/",
      "ntrfilmography/Movie/",
      "Movies/",
      "Movie/"
    ]);

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
      "ntrfilmography/Photos Thumbnails/Movie Thumbnail/",
      "Photos Thumbnails/Movie Thumbnails/",
      "Photos Thumbnails/Movie Thumbnail/"
    ]);

    const photosEventThumbnails = filterFromBucket([
      "ntrfilmography/Photos Thumbnails/Event Thumbnails/",
      "ntrfilmography/Photos Thumbnails/Event Thumbnail/",
      "Photos Thumbnails/Event Thumbnails/",
      "Photos Thumbnails/Event Thumbnail/"
    ]);

    const videosEventThumbnails = filterFromBucket([
      "ntrfilmography/Videos Thumbnails/Event Thumbnails/",
      "ntrfilmography/Videos Thumbnails/Event Thumbnail/",
      "Videos Thumbnails/Event Thumbnails/",
      "Videos Thumbnails/Event Thumbnail/"
    ]);

    const videoCutsMovieThumbnails = filterFromBucket([
      "ntrfilmography/VideoCuts Thumbnails/Movie Cuts Thumbnails/",
      "ntrfilmography/VideoCuts Thumbnails/Movie Cut Thumbnails/",
      "VideoCuts Thumbnails/Movie Cuts Thumbnails/",
      "VideoCuts Thumbnails/Movie Cut Thumbnails/"
    ]);

    const audioSongs = filterFromBucket([
      "ntrfilmography/Audio/",
      "ntrfilmography/audio/",
      "Audio/",
      "audio/"
    ]);

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
      })),
      debug: {
        myBucketExists: !!(c.env as any)?.MY_BUCKET,
        totalFiles: bucketFiles.length,
        first30Keys: bucketFiles.slice(0, 30).map(f => f.key)
      }
    };

    const shouldCompress = c.req.query("compress") !== "false";
    const finalPayload = shouldCompress ? compressR2Data(responsePayload) : responsePayload;

    if (bucketFiles && bucketFiles.length > 0) {
      cachedMediaAll = responsePayload;
      cacheTimestamp = Date.now();

      // Write to Cloudflare Cache API for instant subsequent fetches
      if (hasCacheAPI && cache && cacheKey) {
        try {
          const jsonString = JSON.stringify(finalPayload);
          const cacheResponse = new Response(jsonString, {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=14400, s-maxage=14400" // Cache for 4 hours
            }
          });
          if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
            c.executionCtx.waitUntil(cache.put(cacheKey, cacheResponse));
          } else {
            await cache.put(cacheKey, cacheResponse);
          }
          console.log("[CACHE] Successfully wrote fresh response payload to Cloudflare Edge Cache API");
        } catch (putErr: any) {
          console.warn("[CACHE] Failed to write to Cloudflare Edge Cache API:", putErr.message);
        }
      }
    }

    const resHeaders = {
      "Content-Type": "application/json",
      "X-Cache": "MISS"
    };
    return c.json(finalPayload, 200, resHeaders);
  } catch (err: any) {
    const errMsg = err?.message || String(err || "Unknown error");
    console.error("Failed to list native R2 bucket files:", errMsg);
    const isMisconfigured = errMsg.includes("R2_BINDING_MISSING") || errMsg.includes("binding is missing") || errMsg.includes("undefined");
    return c.json({
      error: errMsg,
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
