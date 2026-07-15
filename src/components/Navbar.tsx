import React from 'react';
import { Film, Image as ImageIcon, Video, Award, Calendar, BookOpen, BarChart2, Heart, Bookmark, Shield, Search } from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  favoritesCount: number;
  watchlistCount: number;
}

export default function Navbar({ currentView, onNavigate, favoritesCount, watchlistCount }: NavbarProps) {
  const navItems = [
    { id: 'home', label: 'Home', icon: Film },
    { id: 'filmography', label: 'Filmography', icon: Film },
    { id: 'photos', label: 'Photos', icon: ImageIcon },
    { id: 'videos', label: 'Videos', icon: Video },
    { id: 'awards', label: 'Awards', icon: Award },
    { id: 'timeline', label: 'Timeline', icon: Calendar },
    { id: 'biography', label: 'Biography', icon: BookOpen },
    { id: 'statistics', label: 'Statistics', icon: BarChart2 },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-zinc-950/80 border-b border-zinc-900/50 backdrop-blur-md px-4 py-3 md:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand Logo */}
        <div 
          onClick={() => onNavigate('home')} 
          className="flex items-center gap-2 cursor-pointer group"
          id="brand-logo"
        >
          <div className="bg-amber-500 text-zinc-950 p-1.5 rounded font-bold tracking-tighter text-lg group-hover:scale-105 transition-transform">
            NTR
          </div>
          <div>
            <h1 className="font-sans font-bold text-base tracking-wide text-zinc-50">FILMOGRAPHY</h1>
            <p className="text-[9px] font-mono tracking-widest text-amber-500 uppercase">Tiger Nation Legacy</p>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex flex-wrap items-center justify-center gap-1 md:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id || (item.id === 'filmography' && currentView === 'movie-detail');
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => onNavigate(item.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isActive 
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* User Items & Search Actions */}
        <div className="flex items-center gap-2">
          <button
            id="nav-search"
            onClick={() => onNavigate('search')}
            className={`p-2 rounded-full transition-all ${
              currentView === 'search' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
            }`}
            title="Search"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            id="nav-watchlist"
            onClick={() => onNavigate('watchlist')}
            className={`p-2 rounded-full relative transition-all ${
              currentView === 'watchlist' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
            }`}
            title="Watchlist"
          >
            <Bookmark className="w-4 h-4" />
            {watchlistCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-zinc-950 font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                {watchlistCount}
              </span>
            )}
          </button>

          <button
            id="nav-favorites"
            onClick={() => onNavigate('favorites')}
            className={`p-2 rounded-full relative transition-all ${
              currentView === 'favorites' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
            }`}
            title="Favorites System"
          >
            <Heart className="w-4 h-4" />
            {favoritesCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-zinc-50 font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                {favoritesCount}
              </span>
            )}
          </button>

          <button
            id="nav-admin"
            onClick={() => onNavigate('admin')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              currentView === 'admin' 
                ? 'bg-amber-500 text-zinc-950 border-amber-500' 
                : 'text-zinc-300 border-zinc-800 hover:bg-zinc-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
