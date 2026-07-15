import React, { useState, useEffect, useRef } from 'react';
import { registerFirstVisible, enqueueMediaLoad } from '../utils/mediaCache';

interface LazyVideoProps {
  src: string | null | undefined;
  className?: string;
  poster?: string;
}

export default function LazyVideo({ src, className, poster }: LazyVideoProps) {
  const [isIntersected, setIsIntersected] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!src) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          registerFirstVisible(src); // Prioritizes this video's metadata since it's the first visible
          setIsIntersected(true);
          observer.disconnect(); // Once loaded, keep it loaded
        }
      },
      {
        rootMargin: '200px', // Start loading 200px before entering viewport
        threshold: 0.01,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [src]);

  useEffect(() => {
    if (isIntersected && src) {
      enqueueMediaLoad(src).then((url) => {
        setResolvedUrl(url);
      });
    }
  }, [src, isIntersected]);

  return (
    <div ref={containerRef} className={`w-full h-full bg-zinc-950/20 ${className}`}>
      {isIntersected && (resolvedUrl || src) ? (
        <video
          src={resolvedUrl || src || null}
          poster={poster}
          preload="metadata"
          muted
          loop
          playsInline
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          referrerPolicy="no-referrer"
        />
      ) : poster ? (
        <img
          src={poster}
          alt="Video Preview"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-zinc-900/40 animate-pulse" />
      )}
    </div>
  );
}
