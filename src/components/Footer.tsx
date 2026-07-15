import React from 'react';

interface FooterProps {
  onNavigate: (view: 'movies' | 'photos' | 'cuts' | 'offline') => void;
}

export default function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="w-full py-8 mt-auto select-none">
      <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-4 text-center">
        <h2 className="font-sans font-black text-3xl tracking-widest text-white uppercase">
          TIGERNATION
        </h2>
        <p className="text-zinc-500 text-xs max-w-md leading-relaxed">
          Preserving the legendary cinematic legacy and archives. Syncing high-definition media assets live from Cloudflare storage.
        </p>
        <p className="text-[10px] text-zinc-700 tracking-wider font-mono mt-2">
          © 2026 TIGERNATION. ALL RIGHTS RESERVED.
        </p>
      </div>
    </footer>
  );
}
