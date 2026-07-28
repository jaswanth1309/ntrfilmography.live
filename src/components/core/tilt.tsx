import React, { useRef, useCallback } from 'react';

export interface TiltProps {
  children: React.ReactNode;
  className?: string;
  rotationFactor?: number;
  isRevese?: boolean;
  isReverse?: boolean;
  style?: React.CSSProperties;
  [key: string]: any;
}

export const Tilt: React.FC<TiltProps> = ({
  children,
  className = '',
  rotationFactor = 8,
  isRevese,
  isReverse,
  style,
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | null>(null);

  const reverse = isRevese ?? isReverse ?? false;

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    // Disable on touch / coarse pointer devices to keep native touch scrolling buttery smooth
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xPct = (x / rect.width) - 0.5;
    const yPct = (y / rect.height) - 0.5;

    const factor = rotationFactor;
    const rotateY = (reverse ? -1 : 1) * xPct * factor * 2;
    const rotateX = (reverse ? 1 : -1) * yPct * factor * 2;

    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }

    rafId.current = requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.style.transition = 'transform 0.1s ease-out';
        containerRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
      }
    });
  }, [rotationFactor, reverse]);

  const handleMouseEnter = useCallback(() => {
    if (!containerRef.current) return;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
    containerRef.current.style.transition = 'transform 0.1s ease-out';
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }
    if (!containerRef.current) return;
    containerRef.current.style.transition = 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)';
    containerRef.current.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`will-change-transform ${className}`}
      style={{
        transformStyle: 'preserve-3d',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

export default Tilt;
