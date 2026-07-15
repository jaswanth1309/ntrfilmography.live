const CACHE_NAME = 'media-viewer-cache-v1';

// In-memory cache for generated object URLs to avoid recreating them and causing memory leaks
const objectUrlMap = new Map<string, string>();

// Keep track of active preloads so we can abort them when the priority changes
let activePreloadControllers: AbortController[] = [];

// Track the first visible element identifier to prioritize its metadata/loading
let firstVisibleUrl: string | null = null;

/**
 * Normalizes and checks if a URL is cacheable (must be a direct HTTP/S URL, not a YouTube ID or local path)
 */
export function isCacheableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Gets a media URL. If it's already in the Cache Storage, returns an Object URL of the cached blob.
 * Otherwise, returns the original URL.
 */
export async function getCachedOrOriginalUrl(url: string): Promise<string> {
  if (!isCacheableUrl(url)) return url;

  // Check in-memory object URL first
  if (objectUrlMap.has(url)) {
    return objectUrlMap.get(url)!;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
      const blob = await cachedResponse.blob();
      const objectUrl = URL.createObjectURL(blob);
      objectUrlMap.set(url, objectUrl);
      return objectUrl;
    }
  } catch (error) {
    console.warn('Cache Storage match failed, using original URL:', error);
  }

  return url;
}

/**
 * Downloads a media file, stores it in Cache Storage, and returns an Object URL.
 * Supports progress updates and can be aborted.
 */
export async function loadAndCacheMedia(
  url: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!isCacheableUrl(url)) return url;

  // Check in-memory object URL first
  if (objectUrlMap.has(url)) {
    onProgress?.(100);
    return objectUrlMap.get(url)!;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url);
    
    // If already in browser cache, return object URL
    if (cachedResponse) {
      onProgress?.(100);
      const blob = await cachedResponse.blob();
      const objectUrl = URL.createObjectURL(blob);
      objectUrlMap.set(url, objectUrl);
      return objectUrl;
    }

    // Otherwise, fetch with progress monitoring
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.statusText}`);
    }

    // Check if progress is possible
    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    // Use a custom reader to track progress if content-length is available
    if (totalBytes > 0 && response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        receivedBytes += value.length;
        
        const percent = Math.round((receivedBytes / totalBytes) * 100);
        onProgress?.(percent);
      }

      // Combine chunks into a single blob
      const blob = new Blob(chunks);
      
      // Store in Cache Storage
      const responseToCache = new Response(blob, {
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
          'Content-Length': blob.size.toString(),
        }
      });
      await cache.put(url, responseToCache);

      const objectUrl = URL.createObjectURL(blob);
      objectUrlMap.set(url, objectUrl);
      return objectUrl;
    } else {
      // Fallback if no content-length or body stream reader (or browser does not support)
      // We clone the response because body can only be read once
      const responseClone = response.clone();
      const blob = await response.clone().blob();
      
      await cache.put(url, responseClone);
      const objectUrl = URL.createObjectURL(blob);
      objectUrlMap.set(url, objectUrl);
      onProgress?.(100);
      return objectUrl;
    }

  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('Media load aborted:', url);
    } else {
      console.warn(`Caching failed for ${url}, falling back to original URL:`, error);
    }
  }

  return url;
}

/**
 * Aborts any active background preloads.
 */
export function abortAllPreloads(): void {
  activePreloadControllers.forEach(controller => {
    try {
      controller.abort();
    } catch (e) {
      // Ignore
    }
  });
  activePreloadControllers = [];
}

/**
 * Preloads list of neighbor URLs in the background with lower priority.
 * Aborts previously running preloads.
 */
export function preloadNeighbours(urls: string[]): void {
  // First, cancel any running preloads
  abortAllPreloads();

  const cacheableUrls = urls.filter(isCacheableUrl);
  if (cacheableUrls.length === 0) return;

  cacheableUrls.forEach(async (url) => {
    // Skip if already in memory object map
    if (objectUrlMap.has(url)) return;

    const controller = new AbortController();
    activePreloadControllers.push(controller);

    try {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(url);
      
      if (!cachedResponse) {
        // Fetch and put to Cache Storage in background
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: { 'Range': 'bytes=0-' } // Request full/initial range if supported
        });
        if (response.ok) {
          await cache.put(url, response);
          console.log(`Successfully preloaded neighbor in background: ${url}`);
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.warn(`Background preload failed for ${url}:`, error);
      }
    }
  });
}

/**
 * Clear cached media to free up space if needed
 */
export async function clearMediaCache(): Promise<boolean> {
  // Revoke all active object URLs to prevent memory leaks
  objectUrlMap.forEach(url => URL.revokeObjectURL(url));
  objectUrlMap.clear();
  return caches.delete(CACHE_NAME);
}

// Queue system task type
interface QueueTask {
  url: string;
  isPriority: boolean;
  resolve: (url: string) => void;
  reject: (err: any) => void;
}

/**
 * MediaLoadQueue ensures sequential loading of media objects.
 * It prioritizes specific assets (like the first visible element or active lightboxes)
 * and processes secondary requests asynchronously to prevent thread congestion.
 */
class MediaLoadQueue {
  private queue: QueueTask[] = [];
  private activeCount = 0;
  private maxConcurrent = 1; // Sequential execution for low priority items

  /**
   * Enqueues a URL to be loaded sequentially.
   * If isPriority is true, it is prepended to the front of the queue.
   */
  public enqueue(url: string, isPriority: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const task: QueueTask = { url, isPriority, resolve, reject };

      if (isPriority) {
        // Put priority tasks at the absolute front
        this.queue.unshift(task);
      } else {
        // Secondary/background tasks go to the end
        this.queue.push(task);
      }

      // Begin processing
      this.processNext();
    });
  }

  /**
   * Processes the next task in the queue.
   */
  private async processNext(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;

    const executeTask = async () => {
      try {
        const result = await getCachedOrOriginalUrl(task.url);
        task.resolve(result);
      } catch (err) {
        // Fallback to original url on any issue
        task.resolve(task.url);
      } finally {
        this.activeCount--;
        // Trigger next item in queue
        this.processNext();
      }
    };

    // Offload execution to requestIdleCallback or a macro-task thread to prevent UI blocks
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        executeTask();
      });
    } else {
      setTimeout(() => {
        executeTask();
      }, 0);
    }
  }
}

// Singleton instances of the sequential loading queue
export const mediaLoadQueue = new MediaLoadQueue();

/**
 * Registers the first visible URL so that it is prioritized above other lazy-loaded media.
 */
export function registerFirstVisible(url: string): void {
  if (!firstVisibleUrl) {
    firstVisibleUrl = url;
  }
}

/**
 * Resolves a URL with the custom priority queue-based loading strategy.
 */
export async function enqueueMediaLoad(url: string, isForcedPriority?: boolean): Promise<string> {
  const isPriority = isForcedPriority || firstVisibleUrl === url;
  return mediaLoadQueue.enqueue(url, isPriority);
}
