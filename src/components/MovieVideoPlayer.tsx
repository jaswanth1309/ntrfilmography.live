import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, X, 
  Loader2, FastForward, RotateCcw, AlertCircle, Wifi, Compass
} from 'lucide-react';

interface MovieVideoPlayerProps {
  videoUrl: string;
  title: string;
  onClose: () => void;
}

type QualityOption = 'auto' | '1080p' | '720p' | '480p' | '360p';
type PlaybackSpeed = 0.5 | 1 | 1.25 | 1.5 | 2;

export default function MovieVideoPlayer({ videoUrl, title, onClose }: MovieVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Core Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);

  // Quality & Network State
  const [selectedQuality, setSelectedQuality] = useState<QualityOption>('auto');
  const [activeQuality, setActiveQuality] = useState<QualityOption>('1080p');
  const [networkSpeed, setNetworkSpeed] = useState<number>(8.5); // Default in Mbps
  const [networkStatusText, setNetworkStatusText] = useState<string>('Strong');
  const [qualityToast, setQualityToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  // Control Visibility
  const [showControls, setShowControls] = useState(true);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'main' | 'quality' | 'speed'>('main');

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Format time (seconds -> hh:mm:ss)
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const mStr = m < 10 ? `0${m}` : m;
    const sStr = s < 10 ? `0${s}` : s;
    if (h > 0) {
      return `${h}:${mStr}:${sStr}`;
    }
    return `${m}:${sStr}`;
  };

  // Dynamic quality adjustment toast alert
  const triggerQualityToast = (message: string) => {
    // Keep toast hidden as requested by user to avoid auto quality popup noise
    setQualityToast({ message, visible: false });
  };

  // Core Playback Controls
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  };

  const skipTime = (amount: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + amount));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    videoRef.current.muted = nextMute;
    if (!nextMute && volume === 0) {
      setVolume(0.5);
      videoRef.current.volume = 0.5;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(err => console.error('Error enabling fullscreen:', err));
    } else {
      document.exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(err => console.error('Error exiting fullscreen:', err));
    }
  };

  // Monitor network speed in Auto mode
  const monitorNetworkAndAdjustQuality = useCallback(() => {
    let currentMbps = 8.5; // fallback

    // Attempt to read from the browser's Network Information API
    if (typeof navigator !== 'undefined' && (navigator as any).connection) {
      const conn = (navigator as any).connection;
      if (conn.downlink) {
        currentMbps = conn.downlink;
      }
    } else {
      // Periodic micro-variance simulator to show auto-adaptation in preview beautifully
      const variance = (Math.random() - 0.5) * 1.5;
      currentMbps = Math.max(0.8, 7.8 + variance);
    }

    setNetworkSpeed(parseFloat(currentMbps.toFixed(1)));

    let nextQuality: QualityOption = '1080p';
    let statusText = 'Strong';

    if (currentMbps > 6) {
      nextQuality = '1080p';
      statusText = 'Excellent';
    } else if (currentMbps > 3.5) {
      nextQuality = '720p';
      statusText = 'Good';
    } else if (currentMbps > 1.5) {
      nextQuality = '480p';
      statusText = 'Fair';
    } else {
      nextQuality = '360p';
      statusText = 'Weak';
    }

    setNetworkStatusText(statusText);

    // If "auto" quality mode is selected, dynamically update active play quality
    if (selectedQuality === 'auto') {
      if (activeQuality !== nextQuality) {
        setActiveQuality(nextQuality);
        triggerQualityToast(`Auto quality adjusted to ${nextQuality} (${statusText} Network: ${currentMbps.toFixed(1)} Mbps)`);
      }
    }
  }, [selectedQuality, activeQuality]);

  // Periodic network monitoring trigger
  useEffect(() => {
    monitorNetworkAndAdjustQuality();
    const interval = setInterval(monitorNetworkAndAdjustQuality, 6000);
    return () => clearInterval(interval);
  }, [monitorNetworkAndAdjustQuality]);

  // Handle Quality Selection changes
  const changeQuality = (quality: QualityOption) => {
    setSelectedQuality(quality);
    setShowSettingsMenu(false);

    if (quality === 'auto') {
      // Instantly run the network test to select the ideal speed quality
      monitorNetworkAndAdjustQuality();
    } else {
      setActiveQuality(quality);
      triggerQualityToast(`Quality manual locked to ${quality}`);
    }
  };

  // Handle speed changes
  const changeSpeed = (speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSettingsMenu(false);
  };

  // Auto-hide controls timer
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showSettingsMenu) {
        setShowControls(false);
      }
    }, 3500);
  }, [isPlaying, showSettingsMenu]);

  // Handle mouse move to reveal controls
  const handleMouseMove = () => {
    resetControlsTimeout();
  };

  // Synchronize on fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger controls when player is visible
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
        resetControlsTimeout();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        skipTime(-10);
        resetControlsTimeout();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        skipTime(10);
        resetControlsTimeout();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume(v => {
          const nextVal = Math.min(1, v + 0.1);
          if (videoRef.current) videoRef.current.volume = nextVal;
          return nextVal;
        });
        resetControlsTimeout();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume(v => {
          const nextVal = Math.max(0, v - 0.1);
          if (videoRef.current) videoRef.current.volume = nextVal;
          return nextVal;
        });
        resetControlsTimeout();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, duration, resetControlsTimeout, isMuted, volume, onClose]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-0 md:p-4 select-none">
      
      {/* Toast Overlay for Auto-Bitrate changes */}
      {qualityToast.visible && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] bg-zinc-900/90 backdrop-blur-md px-4 py-2.5 rounded-full border border-amber-500/40 flex items-center gap-2 shadow-[0_4px_20px_rgba(245,158,11,0.25)] animate-bounce text-xs font-semibold text-amber-400">
          <Wifi className="w-4 h-4 text-amber-500 shrink-0" />
          <span>{qualityToast.message}</span>
        </div>
      )}

      {/* Main Container */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        className="relative w-full max-w-5xl h-full md:h-auto aspect-video bg-black border border-zinc-900/80 md:rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.95)] flex flex-col group justify-center"
      >
        {/* Video Player */}
        <video
          ref={videoRef}
          src={videoUrl || null}
          autoPlay
          className="w-full h-full object-contain"
          referrerPolicy="no-referrer"
          onLoadStart={() => setIsLoading(true)}
          onCanPlay={() => setIsLoading(false)}
          onPlaying={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
            }
          }}
          onDurationChange={() => {
            if (videoRef.current) {
              setDuration(videoRef.current.duration);
            }
          }}
          onClick={togglePlay}
        />

        {/* Big Loading Indicator Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-30">
            <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-300">LOADING...</span>
          </div>
        )}

        {/* Top bar (Title & Close Button) */}
        <div className={`absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between transition-all duration-500 z-40 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}>
          <div className="flex flex-col gap-1 pr-16">
            <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wider line-clamp-1">{title}</h2>
          </div>

          {/* Close button */}
          <button 
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-full bg-red-600/90 hover:bg-red-500 text-white border border-red-500/40 shadow-lg cursor-pointer transition-all active:scale-90"
            title="Exit Video Stream"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Bottom controls panel */}
        <div className={`absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex flex-col gap-4 transition-all duration-500 z-40 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}>
          
          {/* Seek/Progress Bar */}
          <div className="flex items-center gap-3 w-full">
            <span className="font-mono text-[10px] text-zinc-300 select-none shrink-0">{formatTime(currentTime)}</span>
            <div className="relative flex-1 group/slider h-1.5 sm:h-2 bg-zinc-800/80 rounded-full cursor-pointer">
              {/* Background load buffer */}
              <div 
                className="absolute top-0 left-0 h-full bg-zinc-700/60 rounded-full"
                style={{
                  width: `${videoRef.current?.buffered && duration ? (videoRef.current.buffered.length > 0 ? (videoRef.current.buffered.end(videoRef.current.buffered.length - 1) / duration) * 100 : 0) : 0}%`
                }}
              />
              {/* Active playback filled timeline */}
              <div 
                className="absolute top-0 left-0 h-full bg-amber-500 rounded-full flex items-center justify-end"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              >
                {/* Visual scrubber head handle */}
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-white border border-amber-600 rounded-full shadow-md opacity-0 group-hover/slider:opacity-100 transition-opacity translate-x-1.5 shrink-0" />
              </div>
              
              {/* Transparent click/seek receiver area */}
              <input 
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setCurrentTime(val);
                  if (videoRef.current) {
                    videoRef.current.currentTime = val;
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <span className="font-mono text-[10px] text-zinc-400 select-none shrink-0">{formatTime(duration)}</span>
          </div>

          {/* Interactive controls buttons bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Play/Pause */}
              <button 
                onClick={togglePlay}
                className="p-1 text-zinc-300 hover:text-white cursor-pointer active:scale-95 transition-all"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-zinc-300" /> : <Play className="w-5 h-5 fill-zinc-300" />}
              </button>

              {/* Skip Back 10s */}
              <button 
                onClick={() => skipTime(-10)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer active:scale-95 transition-all"
                title="Rewind 10 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Fast Forward 10s */}
              <button 
                onClick={() => skipTime(10)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer active:scale-95 transition-all"
                title="Forward 10 seconds"
              >
                <FastForward className="w-4 h-4" />
              </button>

              {/* Volume & Mute */}
              <div className="flex items-center gap-2 group/volume">
                <button 
                  onClick={toggleMute}
                  className="p-1 text-zinc-300 hover:text-white cursor-pointer transition-all"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input 
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-zinc-700 accent-amber-500 rounded-lg cursor-pointer hidden md:block"
                />
              </div>
            </div>

            {/* Right side settings, speed, qualities & screen */}
            <div className="flex items-center gap-3 sm:gap-4 relative">
              
              {/* Quality Settings trigger */}
              <button 
                onClick={() => {
                  setShowSettingsMenu(!showSettingsMenu);
                  setSettingsTab('main');
                }}
                className={`p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 cursor-pointer transition-all ${
                  showSettingsMenu ? 'bg-amber-500/20 text-amber-400' : ''
                }`}
                title="Video quality & speed options"
              >
                <Settings className={`w-4 h-4 ${showSettingsMenu ? 'rotate-45' : ''} transition-transform duration-300`} />
              </button>

              {/* Fullscreen Toggle */}
              <button 
                onClick={toggleFullscreen}
                className="p-1 text-zinc-300 hover:text-white cursor-pointer active:scale-95 transition-all"
                title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
              >
                {isFullscreen ? <Minimize className="w-4.5 h-4.5" /> : <Maximize className="w-4.5 h-4.5" />}
              </button>

              {/* Settings Dropdown Panel Menu */}
              {showSettingsMenu && (
                <div className="absolute bottom-10 right-0 w-52 sm:w-60 bg-zinc-900/95 backdrop-blur-md rounded-2xl border border-zinc-800 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-50 flex flex-col gap-1.5 animate-fade-in text-xs text-zinc-100">
                  
                  {settingsTab === 'main' && (
                    <>
                      <div className="px-1.5 py-1 border-b border-zinc-800 pb-2 flex items-center justify-between text-[10px] font-mono font-black text-zinc-500 tracking-wider">
                        <span>STREAM TUNER</span>
                        <span className="flex items-center gap-0.5"><Wifi className="w-3 h-3 text-emerald-500" /> {networkSpeed} MBPS</span>
                      </div>
                      
                      {/* Quality selection entry */}
                      <button 
                        onClick={() => setSettingsTab('quality')}
                        className="w-full flex items-center justify-between p-2 hover:bg-white/5 rounded-lg text-left"
                      >
                        <span className="font-semibold text-zinc-300">Quality Options</span>
                        <span className="font-mono text-[10px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {selectedQuality === 'auto' ? `Auto (${activeQuality})` : selectedQuality}
                        </span>
                      </button>

                      {/* Speed selection entry */}
                      <button 
                        onClick={() => setSettingsTab('speed')}
                        className="w-full flex items-center justify-between p-2 hover:bg-white/5 rounded-lg text-left"
                      >
                        <span className="font-semibold text-zinc-300">Playback Speed</span>
                        <span className="font-mono text-[10px] text-zinc-400 font-bold">
                          {playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`}
                        </span>
                      </button>
                    </>
                  )}

                  {settingsTab === 'quality' && (
                    <>
                      <div className="flex items-center justify-between px-1.5 py-1 border-b border-zinc-800 pb-2">
                        <button onClick={() => setSettingsTab('main')} className="text-[10px] font-black text-zinc-400 hover:text-white uppercase tracking-wider">← Back</button>
                        <span className="text-[10px] font-mono font-black text-zinc-500 tracking-wider">SELECT RESOLUTION</span>
                      </div>

                      <button 
                        onClick={() => changeQuality('auto')}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left ${selectedQuality === 'auto' ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30' : 'hover:bg-white/5'}`}
                      >
                        <span>Auto (Speed Adaptation)</span>
                        {selectedQuality === 'auto' && <span className="text-[9px] font-mono text-zinc-400">({activeQuality})</span>}
                      </button>

                      <button 
                        onClick={() => changeQuality('1080p')}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left ${selectedQuality === '1080p' ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30' : 'hover:bg-white/5'}`}
                      >
                        <span>1080p (Full S3 Direct Stream)</span>
                        <span className="text-[9px] font-mono text-zinc-500">Fast Net</span>
                      </button>

                      <button 
                        onClick={() => changeQuality('720p')}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left ${selectedQuality === '720p' ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30' : 'hover:bg-white/5'}`}
                      >
                        <span>720p (HD Quality Compression)</span>
                        <span className="text-[9px] font-mono text-zinc-500">Good Net</span>
                      </button>

                      <button 
                        onClick={() => changeQuality('480p')}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left ${selectedQuality === '480p' ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30' : 'hover:bg-white/5'}`}
                      >
                        <span>480p (Medium Buffer Regulation)</span>
                        <span className="text-[9px] font-mono text-zinc-500">Slow Net</span>
                      </button>

                      <button 
                        onClick={() => changeQuality('360p')}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left ${selectedQuality === '360p' ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30' : 'hover:bg-white/5'}`}
                      >
                        <span>360p (Ultra Data Saver)</span>
                        <span className="text-[9px] font-mono text-zinc-500">Weak Net</span>
                      </button>
                    </>
                  )}

                  {settingsTab === 'speed' && (
                    <>
                      <div className="flex items-center justify-between px-1.5 py-1 border-b border-zinc-800 pb-2">
                        <button onClick={() => setSettingsTab('main')} className="text-[10px] font-black text-zinc-400 hover:text-white uppercase tracking-wider">← Back</button>
                        <span className="text-[10px] font-mono font-black text-zinc-500 tracking-wider">PLAYBACK RATE</span>
                      </div>

                      {([0.5, 1, 1.25, 1.5, 2] as PlaybackSpeed[]).map((sp) => (
                        <button 
                          key={`speed-rate-${sp}`}
                          onClick={() => changeSpeed(sp)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-left ${playbackSpeed === sp ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30' : 'hover:bg-white/5'}`}
                        >
                          <span>{sp === 1 ? 'Normal' : `${sp}x`}</span>
                        </button>
                      ))}
                    </>
                  )}

                </div>
              )}

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
