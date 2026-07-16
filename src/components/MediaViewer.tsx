import React, { useState, useEffect } from 'react';
import { X, ZoomIn, Download, Heart, Share2, Check, ChevronLeft, ChevronRight, Play, Loader2 } from 'lucide-react';
import { Photo, Video } from '../types';
import { 
  isCacheableUrl, 
  loadAndCacheMedia, 
  preloadNeighbours, 
  abortAllPreloads
} from '../utils/mediaCache';
import { getOptimizedImageUrl } from '../utils/mediaOptim';

interface MediaViewerProps {
  item: Photo | Video | { type: 'poster'; title: string; imageUrl: string; movieId: string };
  onClose: () => void;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  relatedItems?: any[];
  onSelectRelated?: (item: any) => void;
  onNext?: () => void;
  onPrev?: () => void;
  onDownload?: (url: string, filename: string, key?: string) => void;
}

export default function MediaViewer({
  item,
  onClose,
  isFavorited,
  onToggleFavorite,
  relatedItems,
  onNext,
  onPrev,
  onDownload
}: MediaViewerProps) {
  const [copied, setCopied] = useState(false);

  const isVideo = 'videoUrl' in item && typeof (item as any).videoUrl === 'string' && (item as any).videoUrl !== '';
  const isPhoto = 'imageUrl' in item && typeof (item as any).imageUrl === 'string' && (item as any).imageUrl !== '' && !('type' in item);
  const isPoster = ('type' in item && item.type === 'poster') || ('posterUrl' in item && typeof (item as any).posterUrl === 'string' && (item as any).posterUrl !== '');

  const checkInitialPortrait = () => {
    if (isPoster) return true;
    const dimensions = (item as any).dimensions;
    if (dimensions && typeof dimensions === 'string') {
      const parts = dimensions.toLowerCase().split('x');
      if (parts.length === 2) {
        const w = parseInt(parts[0], 10);
        const h = parseInt(parts[1], 10);
        if (!isNaN(w) && !isNaN(h)) {
          return h > w;
        }
      }
    }
    return false;
  };

  const [isPortrait, setIsPortrait] = useState(checkInitialPortrait());

  const getAspectRatio = () => {
    if (isPoster) return '2/3';
    const dimensions = (item as any).dimensions;
    if (dimensions && typeof dimensions === 'string') {
      const parts = dimensions.toLowerCase().split('x');
      if (parts.length === 2) {
        const w = parseInt(parts[0], 10);
        const h = parseInt(parts[1], 10);
        if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
          return `${w}/${h}`;
        }
      }
    }
    return isPortrait ? '2/3' : '16/9';
  };

  const videoRef = React.useRef<HTMLVideoElement>(null);

  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isFromCache, setIsFromCache] = useState(false);

  const getOriginalFilename = (url: string, fallback: string) => {
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const parsed = new URL(url);
        const pathname = parsed.pathname;
        const extracted = pathname.substring(pathname.lastIndexOf('/') + 1);
        if (extracted && extracted.includes('.')) {
          return extracted;
        }
      }
    } catch (e) {
      const lastSlash = url.lastIndexOf('/');
      if (lastSlash !== -1) {
        const extracted = url.substring(lastSlash + 1);
        if (extracted && extracted.includes('.')) {
          return extracted;
        }
      }
    }
    return fallback;
  };

  // Extract original URL if it's currently an optimized/resized wsrv.nl link
  const getOriginalUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('wsrv.nl')) {
      try {
        const parsed = new URL(url);
        const extracted = parsed.searchParams.get('url');
        if (extracted) {
          return decodeURIComponent(extracted);
        }
      } catch (e) {
        // fallback
      }
    }
    return url;
  };

  const rawUrl = getOriginalUrl(isVideo ? (item as Video).videoUrl : isPhoto ? (item as Photo).imageUrl : ((item as any).imageUrl || (item as any).posterUrl || ''));
  const itemKey = (item as any).id || (item as any).key || '';
  const originalFilename = getOriginalFilename(rawUrl, `${item.title}${isVideo ? '.mp4' : '.jpg'}`);
  const proxyDownloadUrl = `/api/v1/media/download?url=${encodeURIComponent(rawUrl)}&key=${encodeURIComponent(itemKey)}&filename=${encodeURIComponent(originalFilename)}`;

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onDownload) {
      onDownload(rawUrl, originalFilename, itemKey);
    } else {
      // Create a temporary link element and click it to trigger direct attachment download
      const link = document.createElement('a');
      link.href = proxyDownloadUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('download', originalFilename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Trigger preloading of previous and next items
  const triggerNeighbourPreload = () => {
    if (!relatedItems || relatedItems.length <= 1) return;
    
    const itemId = ('id' in item) ? (item as any).id : (('movieId' in item) ? (item as any).movieId : (item as any).title);
    const currentIndex = relatedItems.findIndex(p => {
      const pId = p.id || p.movieId || p.title;
      return pId === itemId;
    });
    if (currentIndex === -1) return;

    const neighborUrls: string[] = [];
    
    // Previous neighbor
    const prevIndex = (currentIndex - 1 + relatedItems.length) % relatedItems.length;
    const prevItem = relatedItems[prevIndex];
    if (prevItem) {
      const prevUrl = prevItem.videoUrl || prevItem.imageUrl || prevItem.posterUrl;
      if (prevUrl) {
        const isNeighborVideo = !!prevItem.videoUrl;
        neighborUrls.push(isNeighborVideo ? prevUrl : getOptimizedImageUrl(prevUrl, 'medium'));
      }
    }

    // Next neighbor
    const nextIndex = (currentIndex + 1) % relatedItems.length;
    const nextItem = relatedItems[nextIndex];
    if (nextItem) {
      const nextUrl = nextItem.videoUrl || nextItem.imageUrl || nextItem.posterUrl;
      if (nextUrl) {
        const isNeighborVideo = !!nextItem.videoUrl;
        neighborUrls.push(isNeighborVideo ? nextUrl : getOptimizedImageUrl(nextUrl, 'medium'));
      }
    }

    if (neighborUrls.length > 0) {
      preloadNeighbours(neighborUrls);
    }
  };

  // High preference loading for the clicked (active) item first
  useEffect(() => {
    const originalUrl = isVideo 
      ? (item as any).videoUrl 
      : (isPhoto ? (item as any).imageUrl : ((item as any).imageUrl || (item as any).posterUrl));

    const targetUrl = isVideo 
      ? originalUrl 
      : getOptimizedImageUrl(originalUrl, 'medium');

    if (!isCacheableUrl(targetUrl)) {
      setResolvedUrl(targetUrl || '');
      setLoadingMedia(false);
      setLoadProgress(100);
      setIsFromCache(false);
      triggerNeighbourPreload();
      return;
    }

    // Check if already in the browser cache
    caches.open('media-viewer-cache-v1')
      .then(cache => cache.match(targetUrl))
      .then(match => {
        setIsFromCache(!!match);
      })
      .catch(() => {
        setIsFromCache(false);
      });

    setLoadingMedia(true);
    setLoadProgress(0);
    const controller = new AbortController();

    loadAndCacheMedia(targetUrl, (percent) => {
      setLoadProgress(percent);
    }, controller.signal)
      .then((url) => {
        setResolvedUrl(url);
        setLoadingMedia(false);
        setLoadProgress(100);
        setIsFromCache(true);
        // Give full preference to the active item, only load neighbor items AFTER the active one loads!
        triggerNeighbourPreload();
      })
      .catch((err) => {
        console.warn('Failed to load media via cache manager:', err);
        setResolvedUrl(targetUrl);
        setLoadingMedia(false);
        setLoadProgress(100);
        triggerNeighbourPreload();
      });

    return () => {
      controller.abort();
      abortAllPreloads(); // Cancel neighbor preloads from previous context
    };
  }, [item, isVideo, isPhoto, relatedItems]);

  // Reset states when the item changes
  useEffect(() => {
    setIsPortrait(checkInitialPortrait());
  }, [item, isPoster]);

  // Handle robust autoplay unmuted-to-muted fallback when item is video
  useEffect(() => {
    let isMounted = true;
    let playPromise: Promise<void> | null = null;
    let fallbackPromise: Promise<void> | null = null;

    if (isVideo && videoRef.current) {
      const videoEl = videoRef.current;
      videoEl.muted = false; // Try unmuted first
      
      playPromise = videoEl.play();
      if (playPromise !== undefined && playPromise !== null) {
        playPromise
          .then(() => {
            if (!isMounted) {
              videoEl.pause();
            }
          })
          .catch((error) => {
            if (!isMounted) return;
            // Ignore AbortError / Play interrupted errors gracefully
            if (error.name === 'AbortError') {
              return;
            }
            console.warn("Autoplay unmuted failed, falling back to muted play:", error);
            
            videoEl.muted = true;
            fallbackPromise = videoEl.play();
            if (fallbackPromise !== undefined && fallbackPromise !== null) {
              fallbackPromise
                .then(() => {
                  if (!isMounted) {
                    videoEl.pause();
                  }
                })
                .catch((err) => {
                  if (!isMounted) return;
                  if (err.name === 'AbortError') {
                    return;
                  }
                  console.error("Autoplay completely blocked by browser:", err);
                });
            }
          });
      }
    }

    return () => {
      isMounted = false;
    };
  }, [item, isVideo, resolvedUrl]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalHeight > img.naturalWidth) {
      setIsPortrait(true);
    } else {
      setIsPortrait(false);
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && onNext) {
        onNext();
      } else if (e.key === 'ArrowLeft' && onPrev) {
        onPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/95 backdrop-blur-lg p-4 md:p-8 animate-fade-in" id="media-viewer-overlay">
      {/* Top Bar Actions */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10" id="media-viewer-header">
        {/* Fixed Box for Title/Filename */}
        <div className="flex items-center">
          <div className="w-36 sm:w-56 md:w-80 h-9 sm:h-10 bg-zinc-950/85 backdrop-blur-md px-3 py-2 rounded-xl text-zinc-50 font-sans font-black text-xs sm:text-sm border border-zinc-800/80 shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-center justify-start overflow-hidden">
            <span className="truncate w-full block">{item.title}</span>
          </div>
        </div>

        {/* Unified, equal-sized action buttons + close button */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Favorite Toggle */}
          <button
            onClick={onToggleFavorite}
            className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full border transition-all active:scale-95 cursor-pointer ${
              isFavorited
                ? 'bg-red-500/20 text-red-500 border-red-500/30'
                : 'bg-zinc-900/80 text-zinc-300 hover:text-zinc-50 border-zinc-800 hover:bg-zinc-800'
            }`}
            title="Add to Favorites"
          >
            <Heart className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Share Action */}
          <button
            onClick={handleShare}
            className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full border transition-all active:scale-95 cursor-pointer ${
              copied
                ? 'bg-green-500/20 text-green-500 border-green-500/30'
                : 'bg-zinc-900/80 text-zinc-300 hover:text-zinc-50 border-zinc-800 hover:bg-zinc-800'
            }`}
            title="Share Link"
          >
            {copied ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          {/* Direct Download Action */}
          {(!isVideo || ((item as Video).videoUrl && (item as Video).videoUrl.startsWith('http'))) ? (
            <button
              onClick={handleDownload}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-amber-500 text-zinc-950 hover:bg-amber-400 border border-amber-400/40 transition-all font-semibold flex items-center justify-center shadow-lg active:scale-95 cursor-pointer"
              title="Download Original"
            >
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          ) : (
            <a
              href={`https://www.youtube.com/watch?v=${(item as Video).videoUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-amber-500 text-zinc-950 hover:bg-amber-400 border border-amber-400/40 transition-all font-semibold flex items-center justify-center shadow-lg active:scale-95"
              title="Watch on YouTube"
            >
              <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </a>
          )}

          {/* Red Close (Cancel/X) Button - Integrated into button bar at identical size */}
          <button
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-red-600 hover:bg-red-500 text-white border border-red-500/40 shadow-[0_4px_20px_rgba(239,68,68,0.4)] transition-all active:scale-95 flex items-center justify-center cursor-pointer"
            title="Close Viewer"
            id="close-viewer-btn"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-5xl mt-12 h-[calc(100vh-160px)] flex items-center justify-center relative" onClick={(e) => e.stopPropagation()}>
        
        {/* Left Arrow Button (Fixed at left side of screen) */}
        {onPrev && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="fixed left-4 md:left-8 top-1/2 -translate-y-1/2 z-50 w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center bg-transparent border-transparent text-zinc-400 hover:text-amber-400 hover:scale-110 active:scale-90 transition-all duration-300 focus:outline-none cursor-pointer group"
            aria-label="Previous Item"
            title="Previous"
          >
            <ChevronLeft className="w-6 h-6 md:w-7 h-7 group-hover:-translate-x-1 transition-transform" />
          </button>
        )}

        {/* Right Arrow Button (Fixed at right side of screen) */}
        {onNext && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="fixed right-4 md:right-8 top-1/2 -translate-y-1/2 z-50 w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center bg-transparent border-transparent text-zinc-400 hover:text-amber-400 hover:scale-110 active:scale-90 transition-all duration-300 focus:outline-none cursor-pointer group"
            aria-label="Next Item"
            title="Next"
          >
            <ChevronRight className="w-6 h-6 md:w-7 h-7 group-hover:translate-x-1 transition-transform" />
          </button>
        )}

        {/* Stage Media Box - Always occupies centered screen space nicely */}
        <div className="w-full h-full flex items-center justify-center relative bg-zinc-950/25 rounded-2xl overflow-hidden p-2">
          {(isPhoto || isPoster) && (
            <div 
              className="relative max-w-full max-h-full flex items-center justify-center"
              style={{
                aspectRatio: getAspectRatio(),
                width: isPortrait ? 'auto' : '100vw',
                height: isPortrait ? '100vh' : 'auto',
              }}
            >
              {loadingMedia && (
                <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-3 border border-zinc-900/60 z-20">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                  <span className="text-[10px] font-mono font-bold text-zinc-400 tracking-wider">LOADING {loadProgress}%</span>
                </div>
              )}
              <img
                src={resolvedUrl || getOptimizedImageUrl(isPhoto ? (item as Photo).imageUrl : ((item as any).imageUrl || (item as any).posterUrl), 'medium') || null}
                alt={item.title}
                referrerPolicy="no-referrer"
                onLoad={handleImageLoad}
                className="w-full h-full object-contain rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-zinc-900/60 select-none touch-pan-x touch-pan-y"
              />
            </div>
          )}

          {isVideo && (item as Video).videoUrl && (
            (item as Video).videoUrl.startsWith('http') ? (
              <video
                ref={videoRef}
                src={resolvedUrl || (item as Video).videoUrl || null}
                controls
                loop
                playsInline
                preload="auto"
                {...{ referrerPolicy: "no-referrer" } as any}
                className="max-w-full max-h-full rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-zinc-900/60 bg-zinc-950 p-1 md:p-2"
              />
            ) : (
              <iframe
                src={`https://www.youtube.com/embed/${(item as Video).videoUrl}?autoplay=1&mute=0&loop=1&playlist=${(item as Video).videoUrl}&playsinline=1&rel=0&controls=1`}
                title={item.title}
                className="w-full aspect-video max-h-full rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-zinc-900/60"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
