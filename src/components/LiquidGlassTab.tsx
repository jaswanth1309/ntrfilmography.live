import React, { useRef, useState } from 'react';

// High-Fidelity Custom Tiger Nation Logo Component
export function TigerLogo({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <div className={`relative ${className} flex items-center justify-center select-none overflow-hidden rounded-full border border-zinc-800 bg-black shadow-[0_0_15px_rgba(239,68,68,0.25)] hover:shadow-[0_0_25px_rgba(239,68,68,0.45)] transition-all duration-300`}>
      <img 
        src="https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Logo/IMG-20260507-WA0004.jpg.jpeg" 
        alt="Tiger Nation" 
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

// Interactive Liquid Glass Tab Component
interface LiquidGlassTabProps {
  label: string;
  icon: any;
  isActive: boolean;
  onClick: () => void;
  colorTheme?: 'amber' | 'emerald' | 'cyan' | 'rose';
}

export function LiquidGlassTab({ 
  label, 
  icon: Icon, 
  isActive, 
  onClick,
  colorTheme = 'amber'
}: LiquidGlassTabProps) {
  const tabRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!tabRef.current) return;
    const rect = tabRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCoords({ x, y });
  };

  // Color Theme definitions for active/inactive state boundaries
  const activeClasses = {
    amber: 'clay-tab-movies-active text-zinc-950',
    emerald: 'clay-tab-photos-active text-zinc-950',
    cyan: 'clay-tab-cuts-active text-zinc-950',
    rose: 'clay-tab-offline-active text-zinc-950'
  };

  const textHoverClasses = {
    amber: 'hover:text-amber-400',
    emerald: 'hover:text-emerald-400',
    cyan: 'hover:text-cyan-400',
    rose: 'hover:text-rose-400'
  };

  const iconClasses = {
    amber: 'text-amber-500',
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    rose: 'text-rose-400'
  };

  const glowColors = {
    amber: 'rgba(245, 158, 11, 0.25)',
    emerald: 'rgba(16, 185, 129, 0.25)',
    cyan: 'rgba(6, 182, 212, 0.25)',
    rose: 'rgba(244, 63, 94, 0.25)'
  };

  return (
    <button
      ref={tabRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden px-5 py-3 rounded-2xl flex items-center gap-2.5 cursor-pointer transition-all duration-300 select-none ${
        isActive 
          ? activeClasses[colorTheme] 
          : `clay-tab text-zinc-400 ${textHoverClasses[colorTheme]} hover:bg-zinc-900/60`
      }`}
    >
      {/* Liquid Glass Highlight Lens */}
      <span 
        className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(90px circle at ${coords.x}px ${coords.y}px, ${glowColors[colorTheme]} 0%, transparent 80%)`,
        }}
      />
      {Icon && <Icon className={`w-4 h-4 ${isActive ? 'text-zinc-950' : iconClasses[colorTheme]}`} />}
      <span className="text-xs md:text-sm font-bold tracking-wide uppercase">{label}</span>
    </button>
  );
}
