import React from 'react';

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

