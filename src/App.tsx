import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Film, Image as ImageIcon, Video, Volume2, Play, Pause, RefreshCw, Sparkles, 
  Layers, Disc, Star, Heart, Download, Search, X, ArrowLeft, Loader2, Folder, FolderOpen, Trash,
  FileDown, Flame, HeartCrack, Database, Lock, AlertTriangle,
  Instagram, Twitter, Youtube, ChevronLeft, ChevronRight, ChevronDown,
  SkipBack, SkipForward, VolumeX, Music, LayoutGrid, List, Grid, ArrowUpDown, Info
} from 'lucide-react';
import JSZip from 'jszip';

import { MOVIES, PHOTOS, VIDEOS } from './data/mockData';
import { Movie, Photo, Video as VideoType, Song } from './types';
import MediaViewer from './components/MediaViewer';
import MovieVideoPlayer from './components/MovieVideoPlayer';
import Footer from './components/Footer';
import PremiumRunningTiger from './components/PremiumRunningTiger';
import LazyVideo from './components/LazyVideo';
import { getOptimizedImageUrl } from './utils/mediaOptim';

// Modular utility imports
import {
  formatFileName,
  getBaseName,
  MOVIE_ALIASES,
  matchesMovie,
  sortCategoryKeys,
  FolderNode,
  buildFolderTree,
  getAllFilesRecursive,
  findFolderNodeByPath,
  getMockBucketFiles,
  idbMediaCache,
  compressR2Data,
  decompressR2Data
} from './utils/mediaHelpers';

// Modular component imports
import { TigerLogo, LiquidGlassTab } from './components/LiquidGlassTab';

// Keep global reference map to prevent garbage collection of preloaded images
const globalPreloadedImageRefs = new Map<string, HTMLImageElement>();

// Base API URL for separate frontend hosting (Option 2)
const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL || "").replace(/\/$/, "");

// =========================================================================
// [TAG: SECTION_3_MAIN_APP_STATE] - MAIN CORE APPLICATION STATE, EFFECTS, AND HOOKS
// =========================================================================

export default function App() {
  // Reusable haptic feedback helper (Vibrations fully disabled)
  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'double' = 'light') => {
    // Vibrations completely removed
  };

  // Navigation State: 'home' is the single view root displaying 4 large cards.
  // Clicking cards sets view to 'movies' | 'photos' | 'cuts' | 'offline' | 'favorites'
  const [currentView, setCurrentView] = useState<'home' | 'movies' | 'photos' | 'cuts' | 'offline' | 'favorites'>('home');
  
  // Sub-tab States for inside sections
  const [photoSubTab, setPhotoSubTab] = useState<'movies' | 'events' | 'offline'>('movies');
  const [videoSubTab, setVideoSubTab] = useState<'cuts' | 'songs'>('cuts');
  const [offlineSubTab, setOfflineSubTab] = useState<'events' | 'fans'>('events');

  // Sub-view index vs selected screen states
  const [activePhotoSubView, setActivePhotoSubView] = useState<'index' | 'selected'>('selected');
  const [selectedPhotoFolder, setSelectedPhotoFolder] = useState<string | null>(null);
  const [photoMovieFilter, setPhotoMovieFilter] = useState<string>('All');
  const [selectedMovieSubTab, setSelectedMovieSubTab] = useState<'soundtrack' | 'stills'>('soundtrack');
  const [activeVideoSubView, setActiveVideoSubView] = useState<'index' | 'selected'>('selected');
  const [activeOfflineSubView, setActiveOfflineSubView] = useState<'index' | 'selected'>('selected');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [movieSortField, setMovieSortField] = useState<'name' | 'size' | 'length'>('name');
  const [movieSortOrder, setMovieSortOrder] = useState<'asc' | 'desc'>('asc');
  const [gridDensity, setGridDensity] = useState<'cozy' | 'standard' | 'compact'>('standard');
  const [isDensityDropdownOpen, setIsDensityDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Favorites state (local storage backed)
  const [favorites, setFavorites] = useState<{ [key: string]: boolean }>(() => {
    try {
      const saved = localStorage.getItem('ntr_favorites_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Deleted folder / photo persistence state
  const [deletedFolders, setDeletedFolders] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ntr_deleted_folders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [deletedPhotos, setDeletedPhotos] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ntr_deleted_photos');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Custom movie ratings manager state (persists in localStorage)
  const [customRatings, setCustomRatings] = useState<{ [key: string]: number }>(() => {
    try {
      const saved = localStorage.getItem('ntr_custom_ratings_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [isRatingsModalOpen, setIsRatingsModalOpen] = useState(false);

  // Media Player State
  const [activeMediaItem, setActiveMediaItem] = useState<any | null>(null);
  const [currentAudioSong, setCurrentAudioSong] = useState<Song | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(0.8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Multi-select / Bulk selection states
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const wasPlayingAudioBeforeVideoRef = useRef(false);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setGridDensity('standard');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-pause and auto-resume song when video is playing/closed
  useEffect(() => {
    if (activeMediaItem) {
      const isPhoto = 'imageUrl' in activeMediaItem && !('type' in activeMediaItem);
      const isVideo = !isPhoto;
      if (isVideo) {
        if (isPlayingAudio) {
          wasPlayingAudioBeforeVideoRef.current = true;
          setIsPlayingAudio(false);
        }
      }
    } else {
      if (wasPlayingAudioBeforeVideoRef.current) {
        wasPlayingAudioBeforeVideoRef.current = false;
        setIsPlayingAudio(true);
      }
    }
  }, [activeMediaItem]);

  const toggleSelection = (item: any, type: 'video' | 'photo' | 'song') => {
    setSelectedItems(prev => {
      const exists = prev.some(x => x.id === item.id);
      let updated;
      if (exists) {
        updated = prev.filter(x => x.id !== item.id);
      } else {
        const url = item.videoUrl || item.imageUrl || item.audioUrl || '';
        updated = [...prev, { ...item, type, downloadUrl: url }];
      }
      if (updated.length === 0) {
        setIsSelectMode(false);
      }
      return updated;
    });
  };



  const handleBulkDownloadSelected = async () => {
    triggerHaptic('double');
    if (selectedItems.length === 0) {
      showToast('No selected items to download.', 'info');
      return;
    }

    setIsBulkDownloading(true);
    setBulkDownloadProgress({ current: 0, total: selectedItems.length, filename: 'Initializing ZIP Engine...' });

    const zip = new JSZip();

    try {
      const concurrency = 10;
      let completedCount = 0;
      let index = 0;

      const worker = async () => {
        while (index < selectedItems.length) {
          const i = index++;
          const item = selectedItems[i];
          if (!item) break;

          try {
            const url = item.videoUrl || item.imageUrl || item.audioUrl || '';
            if (!url) {
              zip.file(`${item.title || 'item'}_Info.txt`, `Item Title:\n${item.title || 'Untitled'}\n\nCould not fetch direct URL.`);
              continue;
            }

            const cleanName = (item.title || 'Asset').replace(/[^a-zA-Z0-9-_ ]/g, '');
            const isVideo = item.type === 'video' || url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.mkv') || url.toLowerCase().includes('.webm');

            if (isVideo) {
              // Direct CDN link shortcut instead of zipping gigabytes of video blobs in memory which crashes browser/timeouts
              zip.file(`${cleanName}_Direct_Download_Link.txt`, `Direct High-Speed Download URL for "${item.title || 'Asset'}":\n${url}\n\nTo download this video at maximum speed, copy this URL and open it in a new tab, then right-click and choose "Save Video As" or click the player 3-dots and choose "Download".`);
              completedCount++;
              setBulkDownloadProgress(prev => ({
                ...prev,
                current: completedCount,
                filename: `Linked Video: ${item.title || 'Asset'}`
              }));
              continue;
            }

            const directUrl = reconstructDirectR2Url(url, item.id);
            let response;
            try {
              response = await fetch(directUrl);
              if (!response.ok) throw new Error(`Direct fetch failed with status ${response.status}`);
            } catch (directErr) {
              console.warn(`Direct fetch failed for selected item ${item.title || 'Asset'}, trying proxy fallback...`, directErr);
              const proxyUrl = `${API_BASE_URL}/api/v1/media/download?url=${encodeURIComponent(directUrl)}&key=${encodeURIComponent(item.id || '')}`;
              response = await fetch(proxyUrl);
              if (!response.ok) throw new Error(`Proxy fallback fetch failed: ${response.status}`);
            }
            const blob = await response.blob();
            
            let ext = 'jpg';
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('png')) ext = 'png';
            else if (contentType.includes('mp4')) ext = 'mp4';
            else if (contentType.includes('webm')) ext = 'webm';
            else if (contentType.includes('audio') || contentType.includes('mp3')) ext = 'mp3';
            else {
              const lastDot = url.lastIndexOf('.');
              if (lastDot !== -1) {
                ext = url.substring(lastDot + 1).toLowerCase();
              }
            }
            
            zip.file(`${cleanName}.${ext}`, blob);
          } catch (err) {
            console.warn(`Bulk download failed for selected item ${item.title}. Putting link shortcut instead.`, err);
            const url = item.videoUrl || item.imageUrl || item.audioUrl || '';
            zip.file(`${item.title || 'Asset'}_Resource_Link.txt`, `External Asset Source URL:\n${url}\n\nDownload directly from device browser.`);
          } finally {
            completedCount++;
            setBulkDownloadProgress(prev => ({
              ...prev,
              current: completedCount,
              filename: `Fetched: ${item.title || 'Asset'}`
            }));
          }
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, selectedItems.length) }, worker);
      await Promise.all(workers);

      setBulkDownloadProgress(prev => ({ ...prev, filename: 'Compressing archive...' }));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `NTR_Filmography_Selected_Archive.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setIsSelectMode(false);
      setSelectedItems([]);
      showToast('Successfully downloaded selected items as a ZIP archive!', 'success');
    } catch (err: any) {
      console.error('Failed to bundle assets:', err);
      showToast('Failed to generate bulk ZIP folder. Individual download remains fully functional.', 'error');
    } finally {
      setIsBulkDownloading(false);
    }
  };

  const handleBulkUnfavoriteSelected = () => {
    setFavorites(prev => {
      const updated = { ...prev };
      selectedItems.forEach(item => {
        delete updated[item.id];
      });
      localStorage.setItem('ntr_favorites_v1', JSON.stringify(updated));
      return updated;
    });
    setIsSelectMode(false);
    setSelectedItems([]);
    showToast('Removed selected items from favorites!', 'success');
  };

  // Exact durations cache mapping song.id -> "MM:SS"
  const [exactDurations, setExactDurations] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.play().catch(err => {
        console.warn('Audio play error:', err.message);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlayingAudio]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (currentAudioSong) {
      const url = currentAudioSong.audioUrl || "";
      if (audioRef.current.src !== url) {
        audioRef.current.src = url;
        audioRef.current.load();
      }
      if (isPlayingAudio) {
        audioRef.current.play().catch(err => {
          console.warn('Audio track play error:', err.message);
        });
      }
    } else {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
  }, [currentAudioSong]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setAudioCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const dur = audioRef.current.duration;
      setAudioDuration(dur || 0);
      if (currentAudioSong && dur && !isNaN(dur) && dur !== Infinity) {
        const minutes = Math.floor(dur / 60);
        const seconds = Math.floor(dur % 60);
        const durationStr = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        setExactDurations(prev => ({ ...prev, [currentAudioSong.id]: durationStr }));
      }
    }
  };

  const handleAudioEnded = () => {
    setIsPlayingAudio(false);
    setAudioCurrentTime(0);
  };

  const handleSeek = (value: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value;
      setAudioCurrentTime(value);
    }
  };

  const handleVolumeChange = (value: number) => {
    setAudioVolume(value);
    if (audioRef.current) {
      audioRef.current.volume = value;
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const cleanSongTitle = (key: string): string => {
    const parts = key.split('/');
    let filename = parts[parts.length - 1];
    
    // Remove extension
    filename = filename.replace(/\.[^/.]+$/, "");
    
    // Remove leading numbers, spaces, dashes, dots, underscores
    filename = filename.replace(/^\d+[\s\-_.]*/, "");
    
    // Replace underscores with spaces
    filename = filename.replace(/_/g, " ");
    
    // Trim and return
    return filename.trim();
  };

  const getMovieAudioSongs = (movie: Movie): Song[] => {
    const movieTitleClean = movie.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const movieSlugClean = movie.slug.toLowerCase().replace(/[^a-z0-9]/g, '');

    let r2Matches: Song[] = [];
    if (r2Data?.audio && r2Data.audio.length > 0) {
      r2Matches = r2Data.audio
        .filter((file: any) => {
          // Extract the part after the "Audio/" folder
          const keyPart = file.key
            .replace(/^.*\/Audio\//i, '')
            .replace(/^.*\/audio\//i, '')
            .replace(/^Audio\//i, '')
            .replace(/^audio\//i, '');
          
          const parts = keyPart.split('/');
          const folderName = parts.length > 1 ? parts[0] : "";
          
          // Clean the folder name by removing (year) e.g. "(2007)"
          const folderCleaned = folderName.replace(/\(\s*\d{4}\s*\)/g, '').trim();
          const f = folderCleaned.toLowerCase().replace(/[^a-z0-9]/g, '');
          const t = movieTitleClean;
          const s = movieSlugClean;

          // Strict folder/movie matching
          if (f === t || f === s) return true;
          
          // Handle Aravindha Sametha / Aravinda Sametha
          if ((f === 'aravindasametha' || f === 'aravindhasametha') && 
              (t.includes('aravindasametha') || t.includes('aravindhasametha') || s.includes('aravinda-sametha') || s.includes('aravindha-sametha'))) {
            return true;
          }
          
          // Handle Devara / Devara Part 1
          if ((f === 'devara' || f === 'devarapart1') && 
              (t === 'devara' || t === 'devarapart1' || s === 'devara' || s === 'devara-part-1')) {
            return true;
          }
          
          return false;
        })
        .map((file: any, index: number) => {
          const songTitle = cleanSongTitle(file.key);
          return {
            id: `r2-audio-${index}-${file.key}`,
            title: songTitle,
            singers: 'Official Soundtrack',
            lyricist: 'Cloudflare R2',
            duration: '3:30',
            audioUrl: file.url
          };
        });
    }

    const finalSongs: Song[] = movie.songs.map((mockSong) => {
      const mockTitleClean = mockSong.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Look in the matches from this movie first
      const matchedFromR2Matches = r2Matches.find((r2Song) => {
        const r2TitleClean = r2Song.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        return r2TitleClean.includes(mockTitleClean) || 
               mockTitleClean.includes(r2TitleClean) ||
               (mockTitleClean === 'yedapoyado' && r2TitleClean === 'yedapoinado') ||
               (mockTitleClean === 'fearsong' && r2TitleClean === 'feartheme') ||
               (mockTitleClean === 'chuttamalle' && (r2TitleClean === 'chuttamale' || r2TitleClean === 'manofmasses'));
      });

      if (matchedFromR2Matches) {
        return {
          ...mockSong,
          audioUrl: matchedFromR2Matches.audioUrl
        };
      }

      // Otherwise look globally
      const matchedR2Global = r2Data?.audio?.find((file: any) => {
        const keyCleaned = file.key.replace(/\(\s*\d{4}\s*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const fileSongTitleClean = cleanSongTitle(file.key).toLowerCase().replace(/[^a-z0-9]/g, '');
        return keyCleaned.includes(mockTitleClean) || 
               fileSongTitleClean === mockTitleClean ||
               (mockTitleClean === 'yedapoyado' && fileSongTitleClean === 'yedapoinado') ||
               (mockTitleClean === 'fearsong' && fileSongTitleClean === 'feartheme') ||
               (mockTitleClean === 'chuttamalle' && (fileSongTitleClean === 'chuttamale' || fileSongTitleClean === 'manofmasses'));
      });

      let fallbackFolder = movie.title;
      if (movie.title.toLowerCase().includes('rrr')) {
        fallbackFolder = 'RRR';
      } else if (movie.title.toLowerCase().includes('devara')) {
        fallbackFolder = 'Devara';
      } else if (movie.title.toLowerCase().includes('aravinda sametha')) {
        fallbackFolder = 'Aravinda Sametha';
      }

      let fallbackFileName = mockSong.title;
      if (mockTitleClean === 'yedapoyado') {
        fallbackFileName = 'Yeda Poinado';
      } else if (mockTitleClean === 'fearsong') {
        fallbackFileName = 'Fear Theme';
      } else if (mockTitleClean === 'chuttamalle') {
        fallbackFileName = 'Man Of Masses';
      }

      const encodedFolder = encodeURIComponent(fallbackFolder);
      const encodedFile = encodeURIComponent(fallbackFileName);
      const fallbackUrl = `https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Audio/${encodedFolder}/${encodedFile}.mp3`;

      return {
        ...mockSong,
        audioUrl: matchedR2Global ? matchedR2Global.url : fallbackUrl
      };
    });

    r2Matches.forEach(r2Song => {
      const isAlreadyListed = finalSongs.some(fs => {
        const fsTitleClean = fs.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const r2TitleClean = r2Song.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        return fsTitleClean === r2TitleClean || r2TitleClean.includes(fsTitleClean) || fsTitleClean.includes(r2TitleClean);
      });
      if (!isAlreadyListed) {
        finalSongs.push(r2Song);
      }
    });

    return finalSongs;
  };

  const handleSkipNext = (movieSongs: Song[]) => {
    if (!currentAudioSong || movieSongs.length <= 1) return;
    const currentIndex = movieSongs.findIndex(s => s.id === currentAudioSong.id);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % movieSongs.length;
    setCurrentAudioSong(movieSongs[nextIndex]);
    setIsPlayingAudio(true);
  };

  const handleSkipPrevious = (movieSongs: Song[]) => {
    if (!currentAudioSong || movieSongs.length <= 1) return;
    const currentIndex = movieSongs.findIndex(s => s.id === currentAudioSong.id);
    if (currentIndex === -1) return;
    const prevIndex = (currentIndex - 1 + movieSongs.length) % movieSongs.length;
    setCurrentAudioSong(movieSongs[prevIndex]);
    setIsPlayingAudio(true);
  };

  // Cinematic Movies Page Selection State
  const [selectedMovie, setSelectedMovie] = useState<any | null>(null);
  const [activeMovieTab, setActiveMovieTab] = useState<'info' | 'cast' | 'songs' | 'trivia'>('info');
  const [movieVideoUrl, setMovieVideoUrl] = useState<string | null>(null);

  const isPoppingRef = useRef(false);

  // Dynamic background height adjustments for Mobile dynamic address bars
  const [bgDimensions, setBgDimensions] = useState<{ width: string; height: string }>(() => {
    if (typeof window !== 'undefined') {
      const isMob = window.innerWidth < 768;
      if (isMob) {
        const screenHeight = window.screen && window.screen.height ? window.screen.height : window.innerHeight;
        return {
          width: '100vw',
          height: `${screenHeight + 150}px`,
        };
      }
    }
    return {
      width: '100vw',
      height: '100vh',
    };
  });

  useEffect(() => {
    const updateBgDimensions = () => {
      if (isMobile) {
        // Use physical screen height to make sure we always exceed any possible viewport height
        const screenHeight = window.screen && window.screen.height ? window.screen.height : window.innerHeight;
        // Add safety margin (e.g., 150px) to make sure standard address bars or navigation panels never reveal white gaps
        setBgDimensions({
          width: '100vw',
          height: `${screenHeight + 150}px`,
        });
      } else {
        setBgDimensions({
          width: '100vw',
          height: '100vh',
        });
      }
    };

    updateBgDimensions();
    window.addEventListener('resize', updateBgDimensions);
    window.addEventListener('orientationchange', updateBgDimensions);
    return () => {
      window.removeEventListener('resize', updateBgDimensions);
      window.removeEventListener('orientationchange', updateBgDimensions);
    };
  }, [isMobile]);

  // Cloudflare R2 Sync States
  const [r2Data, setR2Data] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'finishing' | 'ready'>('loading');
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    if (!selectedMovie) return;
    const movieSongsList = getMovieAudioSongs(selectedMovie);
    movieSongsList.forEach((song) => {
      if (song.audioUrl && !exactDurations[song.id]) {
        const tempAudio = new Audio();
        tempAudio.src = song.audioUrl;
        tempAudio.preload = 'metadata';
        tempAudio.onloadedmetadata = () => {
          if (tempAudio.duration && !isNaN(tempAudio.duration) && tempAudio.duration !== Infinity) {
            const minutes = Math.floor(tempAudio.duration / 60);
            const seconds = Math.floor(tempAudio.duration % 60);
            const durationStr = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
            setExactDurations(prev => ({ ...prev, [song.id]: durationStr }));
          }
        };
      }
    });
  }, [selectedMovie, r2Data]);
  const [error, setError] = useState<string | null>(null);

  // =========================================================================
  // DYNAMIC FOLDER TREE INTEGRATION AND PARSING
  // =========================================================================
  const parsedBucketData = useMemo(() => {
    const files = r2Data?.bucketFiles && r2Data.bucketFiles.length > 0
      ? r2Data.bucketFiles
      : getMockBucketFiles();

    const photos = buildFolderTree(files, "Photos/");
    const videoCuts = buildFolderTree(files, "VideoCuts/");
    const videos = buildFolderTree(files, "Videos/");

    return { photos, videoCuts, videos };
  }, [r2Data]);

  // High performance memoized R2 lists to prevent infinite re-renders and lags
  const r2PhotosMovies = useMemo(() => {
    if (!r2Data?.photos?.movies) return [];
    return r2Data.photos.movies.map((file: any) => ({
      id: file.key,
      title: formatFileName(file.key),
      description: `Synced live from Cloudflare R2 bucket path: ${file.key}`,
      imageUrl: file.url,
      category: 'Stills',
      fileSize: `${(file.size / 1024).toFixed(1)} KB`,
      dimensions: 'Cloudflare Dynamic'
    }));
  }, [r2Data]);

  const r2PhotosEvents = useMemo(() => {
    if (!r2Data?.photos?.events) return [];
    return r2Data.photos.events.map((file: any) => ({
      id: file.key,
      title: formatFileName(file.key),
      description: `Synced live from Cloudflare R2 bucket path: ${file.key}`,
      imageUrl: file.url,
      category: 'Events',
      fileSize: `${(file.size / 1024).toFixed(1)} KB`,
      dimensions: 'Cloudflare Dynamic'
    }));
  }, [r2Data]);

  const r2PhotosOffline = useMemo(() => {
    if (!r2Data?.photos?.offline) return [];
    return r2Data.photos.offline.map((file: any) => ({
      id: file.key,
      title: formatFileName(file.key),
      description: `Synced live from Cloudflare R2 bucket path: ${file.key}`,
      imageUrl: file.url,
      category: 'Offscreen',
      fileSize: `${(file.size / 1024).toFixed(1)} KB`,
      dimensions: 'Cloudflare Dynamic'
    }));
  }, [r2Data]);

  const r2CutsVideos = useMemo(() => {
    if (!r2Data?.videoCuts?.cuts) return [];
    
    const getCleanFilename = (path: string) => {
      const parts = path.split('/');
      const filename = parts[parts.length - 1];
      return filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, "").toLowerCase().trim();
    };

    return r2Data.videoCuts.cuts.map((file: any) => {
      const videoName = getCleanFilename(file.key);
      let matchedThumbUrl = undefined;
      
      if (r2Data?.videoCutsMovieThumbnails) {
        // Try exact filename match
        let match = r2Data.videoCutsMovieThumbnails.find((thumb: any) => {
          const thumbName = getCleanFilename(thumb.key);
          return thumbName === videoName;
        });
        
        if (!match) {
          // Try partial match
          match = r2Data.videoCutsMovieThumbnails.find((thumb: any) => {
            const thumbName = getCleanFilename(thumb.key);
            return thumbName.includes(videoName) || videoName.includes(thumbName);
          });
        }
        
        if (match) {
          matchedThumbUrl = match.url;
        }
      }

      return {
        id: file.key,
        title: formatFileName(file.key),
        description: `Synced live from Cloudflare R2 bucket folder`,
        videoUrl: file.url,
        thumbnailUrl: matchedThumbUrl,
        category: 'Cut',
        duration: 'Direct Stream',
        views: 'Cloudflare Live'
      };
    });
  }, [r2Data]);

  const r2SongsVideos = useMemo(() => {
    if (!r2Data?.videoCuts?.songs) return [];
    return r2Data.videoCuts.songs.map((file: any) => ({
      id: file.key,
      title: formatFileName(file.key),
      description: `Synced live from Cloudflare R2 bucket folder`,
      videoUrl: file.url,
      category: 'BehindTheScenes',
      duration: 'Direct Stream',
      views: 'Cloudflare Live'
    }));
  }, [r2Data]);

  const r2OfflineEventsVideos = useMemo(() => {
    if (!r2Data?.offlineVideos?.events) return [];
    return r2Data.offlineVideos.events.map((file: any) => ({
      id: file.key,
      title: formatFileName(file.key),
      description: `Synced live from Cloudflare R2 bucket folder`,
      videoUrl: file.url,
      category: 'Cut',
      duration: 'Direct Stream',
      views: 'Cloudflare Live'
    }));
  }, [r2Data]);

  const r2OfflineFansVideos = useMemo(() => {
    if (!r2Data?.offlineVideos?.fans) return [];
    return r2Data.offlineVideos.fans.map((file: any) => ({
      id: file.key,
      title: formatFileName(file.key),
      description: `Synced live from Cloudflare R2 bucket folder`,
      videoUrl: file.url,
      category: 'Cut',
      duration: 'Direct Stream',
      views: 'Cloudflare Live'
    }));
  }, [r2Data]);

  const allMovies = useMemo(() => {
    const r2MoviesList = r2Data?.movies || [];
    
    const matchedMovies: Movie[] = r2MoviesList.map((file: any) => {
      // Find matching local movie metadata
      const matchedLocalMovie = MOVIES.find(m => 
        matchesMovie(file.key, m.title) || 
        matchesMovie(file.key, m.originalTitle)
      );
      
      // Look for matched portrait thumbnail under r2Data?.thumbnailsP
      const portraitFile = r2Data?.thumbnailsP?.find((thumb: any) => 
        matchesMovie(file.key, thumb.key) ||
        matchesMovie(thumb.key, file.key)
      );
      
      // Look for matched landscape thumbnail under r2Data?.thumbnailsL
      const landscapeFile = r2Data?.thumbnailsL?.find((thumb: any) => 
        matchesMovie(file.key, thumb.key) ||
        matchesMovie(thumb.key, file.key)
      );
      
      const rawTitle = matchedLocalMovie ? matchedLocalMovie.title : formatFileName(file.key);
      let title = rawTitle;
      let releaseYear = matchedLocalMovie ? matchedLocalMovie.releaseYear : (file.lastModified ? new Date(file.lastModified).getFullYear() : 2026);
      
      const yearMatch = rawTitle.match(/\((\d{4})\)/);
      if (yearMatch) {
        releaseYear = parseInt(yearMatch[1], 10);
        title = rawTitle.replace(/\s*\(\d{4}\)/g, '').trim();
      }

      const originalTitle = matchedLocalMovie ? matchedLocalMovie.originalTitle : 'R2 Synced Film';
      
      let posterUrl = portraitFile ? portraitFile.url : (matchedLocalMovie?.posterUrl || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=400');
      const isNaaga = getBaseName(file.key) === 'naaga' || getBaseName(file.key) === 'naga' || title.toLowerCase() === 'naaga' || title.toLowerCase() === 'naga';
      if (isNaaga) {
        const nagaThumb = r2Data?.thumbnailsP?.find((thumb: any) => 
          thumb.key.toLowerCase().includes('naaga') || thumb.key.toLowerCase().includes('naga')
        );
        if (nagaThumb) {
          posterUrl = nagaThumb.url;
        } else {
          let basePrefix = 'https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev';
          const sampleMovie = r2Data?.movies?.find((m: any) => m.url);
          if (sampleMovie && sampleMovie.url) {
            const moviesIdx = sampleMovie.url.toLowerCase().indexOf('/movies/');
            if (moviesIdx !== -1) {
              basePrefix = sampleMovie.url.substring(0, moviesIdx);
            }
          }
          posterUrl = `${basePrefix}/Movie%20Posters/Potrait/Naaga.jpg`;
        }
      }
      const bannerUrl = landscapeFile ? landscapeFile.url : (matchedLocalMovie?.bannerUrl || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=1200');
      
      return {
        id: file.key,
        title,
        originalTitle,
        slug: file.key.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
        releaseYear,
        releaseDate: matchedLocalMovie ? matchedLocalMovie.releaseDate : (file.lastModified ? file.lastModified.split('T')[0] : '2026-06-24'),
        runTime: matchedLocalMovie ? matchedLocalMovie.runTime : 120,
        language: matchedLocalMovie ? matchedLocalMovie.language : 'Telugu',
        story: matchedLocalMovie ? matchedLocalMovie.story : `Synced live from your Cloudflare R2 bucket path: ${file.key}. Ready for viewing.`,
        trivia: matchedLocalMovie ? matchedLocalMovie.trivia : ['Synced dynamically from Cloudflare R2.'],
        boxOfficeCollections: matchedLocalMovie ? matchedLocalMovie.boxOfficeCollections : 'N/A',
        budget: matchedLocalMovie ? matchedLocalMovie.budget : 'N/A',
        rating: customRatings[file.key] !== undefined ? customRatings[file.key] : (matchedLocalMovie ? matchedLocalMovie.rating : 9.5),
        posterUrl,
        bannerUrl,
        trailerUrl: matchedLocalMovie ? matchedLocalMovie.trailerUrl : '',
        eraCategory: matchedLocalMovie ? matchedLocalMovie.eraCategory : 'R2 Synced',
        status: 'Released',
        starringType: matchedLocalMovie ? matchedLocalMovie.starringType : 'Junior',
        cast: matchedLocalMovie ? matchedLocalMovie.cast : [],
        crew: matchedLocalMovie ? matchedLocalMovie.crew : [],
        songs: matchedLocalMovie ? matchedLocalMovie.songs : [],
        awards: matchedLocalMovie ? matchedLocalMovie.awards : [],
        movieUrl: file.url,
        fileSize: file.size
      } as any;
    });

    const localRemaining = MOVIES.filter(m => 
      !matchedMovies.some(mm => mm.title.toLowerCase() === m.title.toLowerCase())
    ).map(m => {
      const portraitFile = r2Data?.thumbnailsP?.find((thumb: any) => 
        matchesMovie(m.title, thumb.key) ||
        matchesMovie(thumb.key, m.title)
      );
      const landscapeFile = r2Data?.thumbnailsL?.find((thumb: any) => 
        matchesMovie(m.title, thumb.key) ||
        matchesMovie(thumb.key, m.title)
      );
      const finalRating = customRatings[m.id] !== undefined ? customRatings[m.id] : m.rating;
      return {
        ...m,
        rating: finalRating,
        posterUrl: portraitFile ? portraitFile.url : m.posterUrl,
        bannerUrl: landscapeFile ? landscapeFile.url : m.bannerUrl,
        movieUrl: '',
        fileSize: 0
      };
    });

    return [...matchedMovies, ...localRemaining];
  }, [r2Data, customRatings]);

  const [photoFirstLevel, setPhotoFirstLevel] = useState<string>('Movies');
  const [photoFolderStack, setPhotoFolderStack] = useState<FolderNode[]>([]);

  const selectedPhotoFolderNode = photoFolderStack.length > 0 ? photoFolderStack[0] : null;
  const selectedPhotoSubFolderNode = photoFolderStack.length > 1 ? photoFolderStack[photoFolderStack.length - 1] : null;

  const setSelectedPhotoFolderNode = (node: FolderNode | null) => {
    if (node === null) {
      setPhotoFolderStack([]);
    } else {
      setPhotoFolderStack([node]);
    }
  };

  const setSelectedPhotoSubFolderNode = (node: FolderNode | null) => {
    if (node === null) {
      setPhotoFolderStack(prev => prev.slice(0, 1));
    } else {
      setPhotoFolderStack(prev => {
        if (prev.length === 0) return [node];
        return [prev[0], node];
      });
    }
  };

  useEffect(() => {
    // Clear photo folder stack if first level category changes
    setPhotoFolderStack([]);
  }, [photoFirstLevel]);

  const [videoCutsFirstLevel, setVideoCutsFirstLevel] = useState<string>('');
  const [selectedVideoCutsFolderNode, setSelectedVideoCutsFolderNode] = useState<FolderNode | null>(null);

  const [videosFirstLevel, setVideosFirstLevel] = useState<string>('');
  const [selectedVideosFolderNode, setSelectedVideosFolderNode] = useState<FolderNode | null>(null);

  const [activeMediaList, setActiveMediaList] = useState<any[]>([]);

  // Maintain a ref to parsedBucketData to prevent stale closures in popstate handler
  const parsedBucketDataRef = useRef(parsedBucketData);
  useEffect(() => {
    parsedBucketDataRef.current = parsedBucketData;
  }, [parsedBucketData]);

  // Helper to determine structural depth
  const getNavigationDepth = () => {
    let d = 0;
    if (currentView !== 'home') {
      d += 1;
    }
    if (selectedMovie) {
      d += 1;
    }
    if (currentView === 'photos') {
      d += photoFolderStack.length;
    } else if (currentView === 'cuts') {
      if (selectedVideoCutsFolderNode) d += 1;
    } else if (currentView === 'offline') {
      if (selectedVideosFolderNode) d += 1;
    }
    if (activeMediaItem) {
      d += 1;
    }
    return d;
  };

  // Helper to perform a structural "one step back" transition
  const executeStructuralBack = () => {
    setSearchQuery('');
    
    // 1. Close active media item if open
    if (activeMediaItem) {
      setActiveMediaItem(null);
      return true;
    }
    
    // 2. Close selected movie details if open
    if (selectedMovie) {
      setSelectedMovie(null);
      return true;
    }
    
    // 3. Handle folder structure back in photos view
    if (currentView === 'photos') {
      if (photoFolderStack.length > 0) {
        setPhotoFolderStack(prev => prev.slice(0, -1));
        return true;
      } else {
        setCurrentView('home');
        return true;
      }
    }
    
    // 4. Handle folder structure back in video cuts view
    if (currentView === 'cuts') {
      if (selectedVideoCutsFolderNode) {
        setSelectedVideoCutsFolderNode(null);
        return true;
      } else {
        setCurrentView('home');
        return true;
      }
    }
    
    // 5. Handle folder structure back in offline videos view
    if (currentView === 'offline') {
      if (selectedVideosFolderNode) {
        setSelectedVideosFolderNode(null);
        return true;
      } else {
        setCurrentView('home');
        return true;
      }
    }
    
    // 6. Handle transitioning from any other non-home subview back to home
    if (currentView !== 'home') {
      setCurrentView('home');
      return true;
    }
    
    return false;
  };

  const executeStructuralBackRef = useRef(executeStructuralBack);
  useEffect(() => {
    executeStructuralBackRef.current = executeStructuralBack;
  }, [executeStructuralBack]);

  const currentDepth = getNavigationDepth();
  const prevDepthRef = useRef(currentDepth);

  // Sync state changes with HTML5 history API using structural depth tracking
  useEffect(() => {
    if (isPoppingRef.current) {
      isPoppingRef.current = false;
      prevDepthRef.current = currentDepth;
      return;
    }

    if (currentDepth > prevDepthRef.current) {
      // Pushing to history stack when user navigates deeper structurally
      window.history.pushState({ depth: currentDepth }, '');
    } else if (currentDepth < prevDepthRef.current) {
      // User performed a programmatic back navigation (e.g. clicked close on media viewer or UI button)
      // We go back in browser history to keep it synced without re-triggering popstate logic
      isPoppingRef.current = true;
      const diff = prevDepthRef.current - currentDepth;
      window.history.go(-diff);
    }
    
    prevDepthRef.current = currentDepth;
  }, [currentDepth]);

  // Listen to browser's popstate events (native mobile gestures or browser back clicks)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (isPoppingRef.current) {
        isPoppingRef.current = false;
        return;
      }
      
      // Execute the structural "one step back" transition instead of temporal state restores
      isPoppingRef.current = true;
      executeStructuralBackRef.current();
    };

    // Initialize root history state
    window.history.replaceState({ depth: 0 }, '');

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const [isScrolled, setIsScrolled] = useState(false);
  const scrollPositionsRef = useRef({
    movies: 0,
    photos: 0,
    cuts: 0,
    offline: 0,
  });

  const prevStatesRef = useRef({
    currentView: 'movies',
    selectedMovie: null as any,
    selectedPhotoFolderNode: null as FolderNode | null,
    selectedPhotoSubFolderNode: null as FolderNode | null,
    selectedVideoCutsFolderNode: null as FolderNode | null,
    selectedVideosFolderNode: null as FolderNode | null,
  });

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsScrolled(window.scrollY > 20);
          
          // Save scroll positions for parent lists
          if (currentView === 'movies' && !selectedMovie) {
            scrollPositionsRef.current.movies = window.scrollY;
          } else if (currentView === 'photos' && !selectedPhotoFolderNode) {
            scrollPositionsRef.current.photos = window.scrollY;
          } else if (currentView === 'cuts' && !selectedVideoCutsFolderNode) {
            scrollPositionsRef.current.cuts = window.scrollY;
          } else if (currentView === 'offline' && !selectedVideosFolderNode) {
            scrollPositionsRef.current.offline = window.scrollY;
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [currentView, selectedMovie, selectedPhotoFolderNode, selectedVideoCutsFolderNode, selectedVideosFolderNode, photoFolderStack]);

  const handleGoBack = () => {
    triggerHaptic('light');
    setSearchQuery('');
    window.history.back();
  };

  useEffect(() => {
    if (parsedBucketData) {
      const pFirstKeys = sortCategoryKeys(Object.keys(parsedBucketData.photos.folders));
      if (pFirstKeys.length > 0 && (!photoFirstLevel || !pFirstKeys.includes(photoFirstLevel))) {
        // Find matching casing or use first sorted
        const match = pFirstKeys.find(k => k.toLowerCase() === photoFirstLevel.toLowerCase());
        setPhotoFirstLevel(match || pFirstKeys[0]);
      }

      const vcFirstKeys = sortCategoryKeys(Object.keys(parsedBucketData.videoCuts.folders));
      if (vcFirstKeys.length > 0 && (!videoCutsFirstLevel || !vcFirstKeys.includes(videoCutsFirstLevel))) {
        const match = vcFirstKeys.find(k => k.toLowerCase() === videoCutsFirstLevel.toLowerCase());
        setVideoCutsFirstLevel(match || vcFirstKeys[0]);
      }

      const vFirstKeys = sortCategoryKeys(Object.keys(parsedBucketData.videos.folders));
      if (vFirstKeys.length > 0 && (!videosFirstLevel || !vFirstKeys.includes(videosFirstLevel))) {
        const match = vFirstKeys.find(k => k.toLowerCase() === videosFirstLevel.toLowerCase());
        setVideosFirstLevel(match || vFirstKeys[0]);
      }
    }
  }, [parsedBucketData]);

  // Dynamic Floating Notification Toast State
  const [toast, setToast] = useState<{ 
    message: string; 
    type: 'success' | 'error' | 'info'; 
    undoAction?: () => void; 
    undoLabel?: string; 
  } | null>(null);

  const showToast = (
    message: string, 
    type: 'success' | 'error' | 'info' = 'info', 
    undoAction?: () => void, 
    undoLabel?: string
  ) => {
    setToast({ message, type, undoAction, undoLabel });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
       setToast(null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  const renderVideosGrid = (videosList: any[], themeColor: 'cyan' | 'rose' = 'cyan', hideTitle: boolean = false) => {
    return (
      <div className={`grid ${
        isMobile
          ? (gridDensity === 'cozy'
              ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6'
              : gridDensity === 'standard'
                ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4'
                : 'grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2')
          : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6'
      }`}>
        {videosList.map((video: any) => {
          const isDirectStream = video.videoUrl && video.videoUrl.startsWith('http');
          const isSelected = isMobile && isSelectMode && selectedItems.some(x => x.id === video.id);
          
          let resolvedThumbnailUrl = video.thumbnailUrl;
          if (!resolvedThumbnailUrl && r2Data?.videoCutsMovieThumbnails && isDirectStream) {
            const getCleanFilename = (path: string) => {
              const parts = path.split('/');
              const filename = parts[parts.length - 1];
              return filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, "").toLowerCase().trim();
            };
            const videoName = getCleanFilename(video.id || video.key || '');
            if (videoName) {
              let match = r2Data.videoCutsMovieThumbnails.find((thumb: any) => {
                const thumbName = getCleanFilename(thumb.key);
                return thumbName === videoName;
              });
              if (!match) {
                match = r2Data.videoCutsMovieThumbnails.find((thumb: any) => {
                  const thumbName = getCleanFilename(thumb.key);
                  return thumbName.includes(videoName) || videoName.includes(thumbName);
                });
              }
              if (match) {
                resolvedThumbnailUrl = match.url;
              }
            }
          }

          return (
            <div 
              key={video.id}
              onClick={() => {
                if (isMobile && isSelectMode) {
                  toggleSelection(video, 'video');
                } else {
                  setActiveMediaItem(video);
                  setActiveMediaList(videosList);
                }
              }}
              className={`group bg-transparent transition-all duration-300 flex flex-col justify-between cursor-pointer relative overflow-hidden aspect-video ${
                isMobile
                  ? (gridDensity === 'cozy'
                      ? 'rounded-2xl'
                      : gridDensity === 'standard'
                        ? 'rounded-xl'
                        : 'rounded-lg')
                  : 'rounded-2xl'
              } ${isSelected ? 'ring-2 ring-amber-500 scale-[0.96]' : 'hover:scale-[1.02]'}`}
            >
              <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
                {isDirectStream ? (
                  <>
                    <LazyVideo 
                      src={video.videoUrl || null} 
                      poster={resolvedThumbnailUrl}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/5 group-hover:bg-black/45 transition-all duration-300 flex flex-col items-center justify-center z-10 p-2 text-center">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 backdrop-blur-md border border-amber-500/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                        <Play className="w-4 h-4 fill-amber-400 translate-x-0.5" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full relative">
                    <img 
                      src={video.videoUrl ? `https://img.youtube.com/vi/${video.videoUrl}/0.jpg` : null} 
                      alt={video.title} 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/5 group-hover:bg-black/45 transition-all duration-300 flex flex-col items-center justify-center z-10 p-2 text-center">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 backdrop-blur-md border border-amber-500/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                        <Play className="w-4 h-4 fill-amber-400 translate-x-0.5" />
                      </div>
                    </div>
                  </div>
                )}
 
                {/* Aesthetic Title overlay on top of thumbnail at the bottom */}
                {!hideTitle && (
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 via-black/45 to-transparent z-20 pointer-events-none">
                    <h4 
                      className={`${isMobile && gridDensity === 'compact' ? 'text-[9px]' : isMobile && gridDensity === 'standard' ? 'text-[10px]' : 'text-xs'} font-bold text-zinc-100 group-hover:text-amber-400 transition-colors truncate font-sans`}
                      title={video.title}
                    >
                      {video.title}
                    </h4>
                  </div>
                )}

                {/* Selection indicator circle checkbox */}
                {isMobile && isSelectMode && (
                  <div className="absolute top-2 right-2 z-30 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white bg-black/50 shadow-md">
                    {isSelected && (
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Bulk Downloading Progress States
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState({ current: 0, total: 0, filename: '' });

  // Carousel & View tracking states
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [movieViews, setMovieViews] = useState<{ [key: string]: number }>(() => {
    try {
      const saved = localStorage.getItem('movie_views_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Automatically increment view count when a movie is selected
  useEffect(() => {
    if (selectedMovie && selectedMovie.id) {
      setMovieViews(prev => {
        const updated = { ...prev, [selectedMovie.id]: (prev[selectedMovie.id] || 0) + 1 };
        localStorage.setItem('movie_views_v1', JSON.stringify(updated));
        return updated;
      });
    }
  }, [selectedMovie]);

  // Smooth/instant scroll to top or restore position when changing views or items
  useEffect(() => {
    const prev = prevStatesRef.current;
    
    let targetScroll = 0;
    let shouldRestore = false;

    // Check if we went BACK to a parent view
    if (currentView === prev.currentView) {
      if (prev.selectedMovie && !selectedMovie) {
        targetScroll = scrollPositionsRef.current.movies;
        shouldRestore = true;
      } else if (prev.selectedPhotoFolderNode && !selectedPhotoFolderNode) {
        targetScroll = scrollPositionsRef.current.photos;
        shouldRestore = true;
      } else if (prev.selectedVideoCutsFolderNode && !selectedVideoCutsFolderNode) {
        targetScroll = scrollPositionsRef.current.cuts;
        shouldRestore = true;
      } else if (prev.selectedVideosFolderNode && !selectedVideosFolderNode) {
        targetScroll = scrollPositionsRef.current.offline;
        shouldRestore = true;
      }
    }

    if (shouldRestore) {
      // Restore scroll with a tiny microtask delay to ensure layout rendering is complete
      setTimeout(() => {
        window.scrollTo({ top: targetScroll, behavior: 'instant' as any });
      }, 0);
    } else {
      // Scroll to top for deep dive or tab change
      window.scrollTo({ top: 0, behavior: 'instant' as any });
    }

    // Update prevStatesRef
    prevStatesRef.current = {
      currentView,
      selectedMovie,
      selectedPhotoFolderNode,
      selectedPhotoSubFolderNode,
      selectedVideoCutsFolderNode,
      selectedVideosFolderNode,
    };
  }, [currentView, selectedMovie, selectedPhotoFolderNode, selectedPhotoSubFolderNode, selectedVideoCutsFolderNode, selectedVideosFolderNode, photoFolderStack]);

  // Carousel auto-rotation timer
  useEffect(() => {
    if (currentView !== 'movies' || searchQuery) return;
    
    const carouselMovies = getCarouselMovies(allMovies);
    const moviesCount = carouselMovies.length;
    if (moviesCount <= 1) return;

    const timer = setTimeout(() => {
      setCarouselIndex(prev => {
        const currentIndex = prev >= moviesCount ? 0 : prev;
        return (currentIndex + 1) % moviesCount;
      });
    }, 5000); // 5 seconds slide duration, resets whenever carouselIndex changes

    return () => clearTimeout(timer);
  }, [currentView, searchQuery, carouselIndex, allMovies, movieViews]);

  // =========================================================================
  // [TAG: SECTION_4_S3_SYNC_SERVICES] - CLOUDFLARE R2 DATA INTEGRATIONS AND SYNCHRONIZERS
  // =========================================================================

  // Sync with R2 Proxy on startup
  const syncWithCloudflare = async (isRescan = false) => {
    // Abort previous running requests to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const cacheKey = 'ntr_r2_media_cache';
    let hasValidCache = false;
    let activeData: any = null;

    React.startTransition(() => {
      setError(null);
    });

    // Start with loading state
    setIsLoading(true);
    setLoadingState('loading');
    setLoadingProgress(0);

    let targetProgress = 15; // Start with 15% target
    let currentProgress = 0;
    let interval: any = null;

    interval = setInterval(() => {
      if (currentProgress < targetProgress) {
        const diff = targetProgress - currentProgress;
        if (diff > 20) {
          currentProgress += Math.random() * 1.5 + 0.5;
        } else if (diff > 5) {
          currentProgress += Math.random() * 0.8 + 0.2;
        } else {
          currentProgress += Math.random() * 0.3 + 0.05;
        }
      } else if (currentProgress < 99) {
        // Continuous smooth crawling so it NEVER gets stuck
        currentProgress += 0.02 + Math.random() * 0.03;
      }
      const finalVal = Math.min(currentProgress, 99);
      setLoadingProgress(finalVal);
    }, 45);

    const isCompleteData = (d: any): boolean => {
      if (!d) return false;
      const hasBucketFiles = Array.isArray(d.bucketFiles) && d.bucketFiles.length > 0;
      const hasPhotos = d.photos && (
        (Array.isArray(d.photos.movies) && d.photos.movies.length > 0) ||
        (Array.isArray(d.photos.events) && d.photos.events.length > 0) ||
        (Array.isArray(d.photos.offline) && d.photos.offline.length > 0)
      );
      const hasVideoCuts = d.videoCuts && (
        (Array.isArray(d.videoCuts.cuts) && d.videoCuts.cuts.length > 0) ||
        (Array.isArray(d.videoCuts.songs) && d.videoCuts.songs.length > 0)
      );
      const hasOfflineVideos = d.offlineVideos && (
        (Array.isArray(d.offlineVideos.events) && d.offlineVideos.events.length > 0) ||
        (Array.isArray(d.offlineVideos.fans) && d.offlineVideos.fans.length > 0)
      );
      const hasMovies = Array.isArray(d.movies) && d.movies.length > 0;
      const hasAudio = Array.isArray(d.audio) && d.audio.length > 0;
      return !!(hasBucketFiles && hasPhotos && hasVideoCuts && hasOfflineVideos && hasMovies && hasAudio);
    };

    const doPreloadStage = async (dataForPreload: any) => {
      if (!dataForPreload) return;

      const files = dataForPreload.bucketFiles && dataForPreload.bucketFiles.length > 0
        ? dataForPreload.bucketFiles
        : [];

      const photos = buildFolderTree(files, "Photos/");
      const videoCuts = buildFolderTree(files, "VideoCuts/");
      const videos = buildFolderTree(files, "Videos/");
      const localParsedBucketData = { photos, videoCuts, videos };

      const r2MoviesList = dataForPreload.movies || [];
      const derivedMovies = r2MoviesList.map((file: any) => {
        const matchedLocalMovie = MOVIES.find(m => 
          matchesMovie(file.key, m.title) || 
          matchesMovie(file.key, m.originalTitle)
        );
        return {
          id: file.key,
          title: matchedLocalMovie ? matchedLocalMovie.title : formatFileName(file.key),
          videoUrl: file.url,
          posterUrl: matchedLocalMovie?.posterUrl || '',
          bannerUrl: matchedLocalMovie?.bannerUrl || ''
        };
      });

      // Gather URLs
      const urls = new Set<string>();

      // 1. Movies posterUrl
      derivedMovies.forEach((m: any) => {
        if (m.posterUrl) {
          const opt = getOptimizedImageUrl(m.posterUrl, 'low');
          if (opt) urls.add(opt);
        }
      });

      // 2. R2 portrait thumbnails
      if (Array.isArray(dataForPreload.thumbnailsP)) {
        dataForPreload.thumbnailsP.forEach((thumb: any) => {
          if (thumb?.url) {
            const opt = getOptimizedImageUrl(thumb.url, 'low');
            if (opt) urls.add(opt);
          }
        });
      }

      // 3. R2 landscape thumbnails
      if (Array.isArray(dataForPreload.thumbnailsL)) {
        dataForPreload.thumbnailsL.forEach((thumb: any) => {
          if (thumb?.url) {
            const opt = getOptimizedImageUrl(thumb.url, 'low');
            if (opt) urls.add(opt);
          }
        });
      }

      // 4. Photo subfolder thumbnails
      if (localParsedBucketData.photos?.folders) {
        Object.keys(localParsedBucketData.photos.folders).forEach((firstLevelKey) => {
          const firstLevelNode = localParsedBucketData.photos.folders[firstLevelKey];
          if (firstLevelNode?.folders) {
            Object.keys(firstLevelNode.folders).forEach((subFolderName) => {
              const subFolderNode = firstLevelNode.folders[subFolderName];
              const recFiles = getAllFilesRecursive(subFolderNode);
              const isMovieTab = firstLevelKey.toLowerCase() === 'movie' || firstLevelKey.toLowerCase() === 'movies';
              let thumbnail = '';
              const fLower = subFolderNode.name.toLowerCase();
              if (fLower === 'naaga' || fLower === 'naga') {
                thumbnail = 'https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Photos%20Thumbnails/Movie%20Thumbnails/Naaga.png';
              } else if (fLower === 'chintakayala ravi' || fLower === 'chintakayalaravi') {
                thumbnail = 'https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Photos%20Thumbnails/Movie%20Thumbnails/Chintakayala%20Ravi.jpeg';
              } else if (fLower === 'ntr-neel' || fLower === 'ntr neel') {
                thumbnail = 'https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Photos%20Thumbnails/Movie%20Thumbnails/NTR-NEEL.jpg';
              } else if (isMovieTab) {
                const match = dataForPreload.photosMovieThumbnails?.find((t: any) => 
                  matchesMovie(t.key, subFolderNode.name) || 
                  matchesMovie(subFolderNode.name, t.key)
                );
                thumbnail = match ? match.url : (recFiles.length > 0 ? (recFiles[0].imageUrl || recFiles[0].videoUrl) : '');
              } else {
                thumbnail = getFolderThumbnail(subFolderNode.name, recFiles.map(f => ({ imageUrl: f.imageUrl || f.videoUrl } as any)), undefined, 'photos');
              }
              if (thumbnail) {
                const opt = getOptimizedImageUrl(thumbnail, 'low');
                if (opt) urls.add(opt);
              }
            });
          }
        });
      }

      // 5. VideoCuts subfolder thumbnails
      if (localParsedBucketData.videoCuts?.folders) {
        Object.keys(localParsedBucketData.videoCuts.folders).forEach((firstLevelKey) => {
          const firstLevelNode = localParsedBucketData.videoCuts.folders[firstLevelKey];
          if (firstLevelNode?.folders) {
            Object.keys(firstLevelNode.folders).forEach((subFolderName) => {
              const subFolderNode = firstLevelNode.folders[subFolderName];
              const recFiles = getAllFilesRecursive(subFolderNode);
              const thumbnail = getFolderThumbnail(subFolderNode.name, recFiles.map(f => ({ imageUrl: f.imageUrl || f.videoUrl } as any)), undefined, 'videocuts');
              if (thumbnail) {
                const opt = getOptimizedImageUrl(thumbnail, 'low');
                if (opt) urls.add(opt);
              }
            });
          }
        });
      }

      // 6. Videos subfolder thumbnails
      if (localParsedBucketData.videos?.folders) {
        Object.keys(localParsedBucketData.videos.folders).forEach((firstLevelKey) => {
          const firstLevelNode = localParsedBucketData.videos.folders[firstLevelKey];
          if (firstLevelNode?.folders) {
            Object.keys(firstLevelNode.folders).forEach((subFolderName) => {
              const subFolderNode = firstLevelNode.folders[subFolderName];
              const recFiles = getAllFilesRecursive(subFolderNode);
              const thumbnail = getFolderThumbnail(subFolderNode.name, recFiles.map(f => ({ imageUrl: f.imageUrl || f.videoUrl } as any)), undefined, 'videos');
              if (thumbnail) {
                const opt = getOptimizedImageUrl(thumbnail, 'low');
                if (opt) urls.add(opt);
              }
            });
          }
        });
      }

      const urlList = Array.from(urls);
      if (urlList.length === 0) {
        targetProgress = 95;
        return;
      }

      // Preload images with concurrency limit
      const concurrency = 45;
      let completedCount = 0;
      let index = 0;

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('Preloading thumbnails timed out safely');
          resolve();
        }, 1000); // Max 1 second limit

        const worker = async () => {
          while (index < urlList.length) {
            const currentIdx = index++;
            const url = urlList[currentIdx];
            if (!url) break;

            if (globalPreloadedImageRefs.has(url)) {
              completedCount++;
              targetProgress = 45 + Math.round((completedCount / urlList.length) * 50);
              continue;
            }

            try {
              await new Promise<void>((imgResolve) => {
                const img = new Image();
                img.onload = () => {
                  globalPreloadedImageRefs.set(url, img);
                  imgResolve();
                };
                img.onerror = () => {
                  imgResolve();
                };
                img.src = url;
              });
            } catch (e) {}

            completedCount++;
            targetProgress = 45 + Math.round((completedCount / urlList.length) * 50);
          }
        };

        const workers = Array.from({ length: Math.min(concurrency, urlList.length) }, worker);
        Promise.all(workers).then(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    };

    if (!isRescan) {
      // 1. Try reading from IndexedDB first
      try {
        const cached = await idbMediaCache.get(cacheKey);
        if (cached && cached.data && cached.timestamp) {
          const cacheAge = Date.now() - cached.timestamp;
          if (cacheAge < 2 * 60 * 60 * 1000) {
            const decompressedData = cached.compressed ? decompressR2Data(cached.data) : cached.data;
            if (isCompleteData(decompressedData)) {
              activeData = decompressedData;
              setR2Data(decompressedData);
              hasValidCache = true;
            } else {
              console.warn('Stale/incomplete cache found in IndexedDB, ignoring and forcing fresh fetch');
              try {
                await idbMediaCache.delete(cacheKey);
              } catch (e) {}
            }
          }
        }
      } catch (idbErr) {
        console.warn('IndexedDB cache read failed, trying localStorage fallback:', idbErr);
      }

      // 2. Try reading from localStorage as fallback
      if (!hasValidCache) {
        try {
          const cachedStr = localStorage.getItem(cacheKey);
          if (cachedStr) {
            const parsed = JSON.parse(cachedStr);
            if (parsed && parsed.data && parsed.timestamp) {
              const cacheAge = Date.now() - parsed.timestamp;
              if (cacheAge < 2 * 60 * 60 * 1000) {
                const decompressedData = parsed.compressed ? decompressR2Data(parsed.data) : parsed.data;
                if (isCompleteData(decompressedData)) {
                  activeData = decompressedData;
                  setR2Data(decompressedData);
                  hasValidCache = true;
                } else {
                  console.warn('Stale/incomplete cache found in localStorage, ignoring and forcing fresh fetch');
                  try {
                    localStorage.removeItem(cacheKey);
                  } catch (e) {}
                }
              }
            }
          }
        } catch (lsErr) {
          console.warn('Failed to parse R2 localStorage cache:', lsErr);
        }
      }
    }

    if (hasValidCache) {
      targetProgress = 45;
    }

    try {
      if (!hasValidCache) {
        const url = isRescan ? `${API_BASE_URL}/api/v1/media/all?rescan=true` : `${API_BASE_URL}/api/v1/media/all`;
        
        let data: any = null;
        const maxAttempts = 4;
        const baseDelay = 500;
        const backoffFactor = 2;
        let lastError: any = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const res = await fetch(url, { signal: abortController.signal });
            if (!res.ok) {
              let errText = '';
              let isMisconfig = false;
              try {
                const errJson = await res.json();
                errText = errJson.error || '';
                isMisconfig = errJson.code === 'R2_MISCONFIGURED' || errText.includes('R2_CREDENTIALS_MISSING') || errText.includes('R2_AUTH_ERROR');
              } catch (e) {
                try {
                  errText = await res.text();
                } catch (e2) {
                  errText = `HTTP status ${res.status}`;
                }
              }
              
              const errorWithCode = new Error(isMisconfig ? `R2_MISCONFIGURED: ${errText}` : errText || `HTTP ${res.status}`);
              throw errorWithCode;
            }
            
            data = await res.json();
            break; // Success! Exit the retry loop.
          } catch (fetchErr: any) {
            lastError = fetchErr;
            if (abortController.signal.aborted) {
              throw fetchErr;
            }
            
            // If it is a misconfiguration error, DO NOT retry! Throw immediately.
            const errorMsg = fetchErr.message || '';
            const isMisconfig = errorMsg.includes('R2_MISCONFIGURED') || errorMsg.includes('R2_CREDENTIALS_MISSING') || errorMsg.includes('R2_AUTH_ERROR');
            if (isMisconfig) {
              throw fetchErr;
            }

            console.warn(`Intermittent Cloudflare R2 connection error (attempt ${attempt}/${maxAttempts}):`, errorMsg);
            
            if (attempt === maxAttempts) {
              throw fetchErr;
            }
            
            // Calculate backoff delay with jitter
            const delay = baseDelay * Math.pow(backoffFactor, attempt - 1) + Math.random() * 200;
            
            // Wait with abort support
            await new Promise<void>((resolve, reject) => {
              const onAbort = () => {
                clearTimeout(timeout);
                reject(new DOMException('Aborted', 'AbortError'));
              };
              if (abortController.signal.aborted) {
                return reject(new DOMException('Aborted', 'AbortError'));
              }
              abortController.signal.addEventListener('abort', onAbort);
              const timeout = setTimeout(() => {
                abortController.signal.removeEventListener('abort', onAbort);
                resolve();
              }, delay);
            });
          }
        }

        if (abortController.signal.aborted) return;

        activeData = data;

        // Compress data before saving to stay well below quota limit
        let compressed: any = null;
        try {
          compressed = compressR2Data(data);
        } catch (compErr) {
          console.warn('Compression failed, using raw data fallback:', compErr);
        }

        // Save fresh data to caches in parallel
        await Promise.all([
          (async () => {
            try {
              await idbMediaCache.set(cacheKey, {
                timestamp: Date.now(),
                data: compressed || data,
                compressed: !!compressed
              });
            } catch (idbWriteErr) {
              console.warn('Failed to write R2 cache to IndexedDB:', idbWriteErr);
            }
          })(),
          (async () => {
            try {
              if (compressed) {
                localStorage.setItem(cacheKey, JSON.stringify({
                  timestamp: Date.now(),
                  data: compressed,
                  compressed: true
                }));
              } else {
                localStorage.setItem(cacheKey, JSON.stringify({
                  timestamp: Date.now(),
                  data
                }));
              }
            } catch (lsWriteErr: any) {
              if (lsWriteErr.name === 'QuotaExceededError' || lsWriteErr.message?.includes('quota')) {
                try {
                  localStorage.removeItem(cacheKey);
                } catch (e) {}
              }
              console.warn('Failed to write secondary fallback R2 cache to localStorage:', lsWriteErr.message || lsWriteErr);
            }
          })()
        ]);

        React.startTransition(() => {
          setR2Data(data);
          setError(null);
        });
      }

      targetProgress = 45;

      // Now run preloading of all optimized thumbnails
      await doPreloadStage(activeData);

      // Transition to 100% smoothly
      targetProgress = 100;
      if (interval) clearInterval(interval);

      await new Promise<void>((resolveComplete) => {
        let finalProgress = currentProgress;
        const completeInterval = setInterval(() => {
          if (finalProgress < 100) {
            // Speed up smoothly to 100%
            finalProgress += Math.max(2.0, (100 - finalProgress) * 0.15);
            setLoadingProgress(Math.min(finalProgress, 100));
          } else {
            clearInterval(completeInterval);
            resolveComplete();
          }
        }, 30);
      });

      React.startTransition(() => {
        setLoadingState('finishing');
      });
      
      setTimeout(() => {
        if (abortController.signal.aborted) return;
        React.startTransition(() => {
          setLoadingState('ready');
          setIsLoading(false);
        });
      }, 400);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        if (interval) clearInterval(interval);
        return;
      }
      
      if (abortController.signal.aborted) return;

      console.warn('Serving pre-seeded local assets (offline backup active). Error detail:', err.message);
      
      const isMisconfig = err.message?.includes('R2_MISCONFIGURED') || err.message?.includes('R2_CREDENTIALS_MISSING') || err.message?.includes('R2_AUTH_ERROR');

      React.startTransition(() => {
        if (isMisconfig) {
          setError('R2_MISCONFIGURED');
        } else {
          setError(err.message);
        }
      });

      if (interval) clearInterval(interval);
      
      // Smoothly animate progress to 100% even on error/fallback
      await new Promise<void>((resolveComplete) => {
        let finalProgress = currentProgress;
        const completeInterval = setInterval(() => {
          if (finalProgress < 100) {
            finalProgress += Math.max(3.0, (100 - finalProgress) * 0.25);
            setLoadingProgress(Math.min(finalProgress, 100));
          } else {
            clearInterval(completeInterval);
            resolveComplete();
          }
        }, 25);
      });

      React.startTransition(() => {
        setLoadingState('finishing');
      });
      
      setTimeout(() => {
        if (abortController.signal.aborted) return;
        React.startTransition(() => {
          setLoadingState('ready');
          setIsLoading(false);
        });
      }, 500);
    }
  };

  useEffect(() => {
    syncWithCloudflare(false);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ntr_deleted_folders', JSON.stringify(deletedFolders));
  }, [deletedFolders]);

  useEffect(() => {
    localStorage.setItem('ntr_deleted_photos', JSON.stringify(deletedPhotos));
  }, [deletedPhotos]);

  const findItemById = (itemId: string): { type: 'movie' | 'photo' | 'video' | 'song'; item: any } | null => {
    // 1. Check movies
    const movies = getAllMovies();
    const movie = movies.find(m => m.id === itemId);
    if (movie) return { type: 'movie', item: movie };

    // 2. Check photos
    const dynamicPhotos = parsedBucketData?.photos ? getAllFilesRecursive(parsedBucketData.photos) : [];
    const categoryPhotos = [...getR2Photos('movies'), ...getR2Photos('events'), ...getR2Photos('offline')];
    const allPhotos = [...dynamicPhotos, ...categoryPhotos, ...PHOTOS];
    const photo = allPhotos.find(p => p.id === itemId);
    if (photo) return { type: 'photo', item: photo };

    // 3. Check videos
    const dynamicVideoCuts = parsedBucketData?.videoCuts ? getAllFilesRecursive(parsedBucketData.videoCuts) : [];
    const dynamicVideos = parsedBucketData?.videos ? getAllFilesRecursive(parsedBucketData.videos) : [];
    const categoryVideos = [
      ...getR2Videos('cuts'), 
      ...getR2Videos('songs'), 
      ...getR2Videos('offline_events'), 
      ...getR2Videos('offline_fans')
    ];
    const allVideos = [...dynamicVideoCuts, ...dynamicVideos, ...categoryVideos, ...VIDEOS];
    const video = allVideos.find(v => v.id === itemId);
    if (video) return { type: 'video', item: video };

    // 4. Check songs
    const allSongs: any[] = [];
    movies.forEach(m => {
      const movieSongs = getMovieAudioSongs(m);
      movieSongs.forEach(song => {
        allSongs.push({
          ...song,
          movieTitle: m.title
        });
      });
    });
    const song = allSongs.find(s => s.id === itemId);
    if (song) return { type: 'song', item: song };

    return null;
  };

  // Save favorites to local storage on change
  const toggleFavorite = (itemId: string) => {
    const isCurrentlyFavorited = !!favorites[itemId];
    
    if (isCurrentlyFavorited) {
      // Find item details before removing
      const itemDetails = findItemById(itemId);
      if (itemDetails) {
        const { type, item } = itemDetails;
        const displayType = type === 'photo' ? 'photo' : type === 'movie' ? 'movie' : type === 'song' ? 'song' : 'video';
        const displayTitle = item.title || 'Item';
        
        // Remove from favorites
        const updated = { ...favorites };
        delete updated[itemId];
        setFavorites(updated);
        localStorage.setItem('ntr_favorites_v1', JSON.stringify(updated));

        // Show toast with undo button
        showToast(
          `You unliked ${displayType} "${displayTitle}"`,
          'info',
          () => {
            // Undo action: add it back!
            const restored = { ...favorites, [itemId]: true };
            setFavorites(restored);
            localStorage.setItem('ntr_favorites_v1', JSON.stringify(restored));
            showToast(`Restored "${displayTitle}" to Favorites!`, 'success');
          }
        );
        return;
      }
    }

    // Default toggling behavior
    const updated = { ...favorites, [itemId]: !favorites[itemId] };
    if (!updated[itemId]) delete updated[itemId];
    setFavorites(updated);
    localStorage.setItem('ntr_favorites_v1', JSON.stringify(updated));
  };

  const isItemFavorited = (itemId: string) => {
    return !!favorites[itemId];
  };

  const handleDeleteFolder = (folderName: string) => {
    if (confirm(`Are you sure you want to remove the entire folder "${folderName}" and all its photos?`)) {
      setDeletedFolders(prev => [...prev, folderName]);
      showToast(`Folder "${folderName}" has been removed.`, 'success');
    }
  };

  const handleDeletePhoto = (photoId: string) => {
    if (confirm('Are you sure you want to remove this photo?')) {
      setDeletedPhotos(prev => [...prev, photoId]);
      showToast('Photo has been removed.', 'success');
    }
  };

  // Inline Song Player Audio simulator helper
  const handlePlaySong = (song: Song) => {
    if (currentAudioSong?.id === song.id) {
      setIsPlayingAudio(!isPlayingAudio);
    } else {
      setCurrentAudioSong(song);
      setIsPlayingAudio(true);
    }
  };

  // Utility to reconstruct high-resolution direct R2 public bucket URLs bypassing any proxy or optimization layers
  const reconstructDirectR2Url = (url: string, itemKey?: string): string => {
    let finalUrl = url;
    if (url && url.includes('wsrv.nl')) {
      try {
        const parsed = new URL(url);
        const extracted = parsed.searchParams.get('url');
        if (extracted) {
          finalUrl = decodeURIComponent(extracted);
        }
      } catch (e) {
        // fallback
      }
    }

    let extractedOrigin = "";
    if (finalUrl && finalUrl.startsWith("http")) {
      try {
        const parsed = new URL(finalUrl);
        extractedOrigin = parsed.origin;
      } catch (e) {
        // fallback
      }
    }
    const r2PublicUrl = extractedOrigin || "https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev";

    const isMock = itemKey && (itemKey.startsWith('mock-') || itemKey.match(/^[mp]\d+$/));
    if (itemKey && !isMock) {
      const cleanKey = itemKey.replace(/^\//, "");
      finalUrl = `${r2PublicUrl}/${cleanKey.split('/').map(encodeURIComponent).join('/')}`;
    }

    if (finalUrl) {
      try {
        const parsed = new URL(finalUrl);
        const hostname = parsed.hostname.toLowerCase();
        const isR2CustomDomain = parsed.pathname.includes('/ntrfilmography/');
        if (hostname.includes('r2.dev') || hostname.includes('unsplash.com') || isR2CustomDomain) {
          finalUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        }
      } catch (e) {
        // fallback
      }
    }
    return finalUrl;
  };

  // Direct single file downloader (CORS-safe browser download helper)
  const triggerSingleDownload = async (url: string, fallbackFilename: string, itemKey?: string) => {
    triggerHaptic('double');
    
    // Reconstruct the direct absolute high-resolution direct R2 bucket URL
    const finalUrl = reconstructDirectR2Url(url, itemKey);

    // Determine safe, clean filename
    let filename = fallbackFilename;
    const sourcePath = itemKey || finalUrl;
    try {
      if (sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) {
        const parsed = new URL(sourcePath);
        const pathname = parsed.pathname;
        const extracted = pathname.substring(pathname.lastIndexOf('/') + 1);
        if (extracted && extracted.includes('.')) {
          filename = decodeURIComponent(extracted);
        }
      } else {
        const lastSlash = sourcePath.lastIndexOf('/');
        if (lastSlash !== -1) {
          const extracted = sourcePath.substring(lastSlash + 1);
          if (extracted && extracted.includes('.')) {
            filename = decodeURIComponent(extracted);
          }
        }
      }
    } catch (e) {
      // fallback
    }

    // Sanitize filename for downloading
    if (filename) {
      filename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    }

    showToast('Download started. Preparing your file...', 'info');
    
    try {
      // Bypassing any proxy-based URL modification: Fetch the file directly from finalUrl (R2 Bucket)
      const response = await fetch(finalUrl);
      if (!response.ok) throw new Error(`Direct fetch failed with status ${response.status}`);
      const blob = await response.blob();
      
      let ext = '';
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('png')) ext = 'png';
      else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
      else if (contentType.includes('webp')) ext = 'webp';
      else if (contentType.includes('gif')) ext = 'gif';
      else if (contentType.includes('mp4')) ext = 'mp4';
      else if (contentType.includes('mkv')) ext = 'mkv';
      
      let finalFilename = filename;
      if (ext && !filename.toLowerCase().endsWith(`.${ext}`) && !filename.toLowerCase().endsWith('.jpg') && !filename.toLowerCase().endsWith('.png') && !filename.toLowerCase().endsWith('.mp4') && !filename.toLowerCase().endsWith('.mkv')) {
        finalFilename = `${filename}.${ext}`;
      }

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', finalFilename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      showToast('Download completed successfully!', 'success');
    } catch (err) {
      console.warn('[SINGLE DOWNLOAD] Direct bucket blob fetch failed, falling back to direct window.open:', err);
      showToast('Opening direct stream link...', 'info');
      
      // Fallback: Open finalUrl directly in a new window/tab to bypass proxy entirely
      const link = document.createElement('a');
      link.href = finalUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Convert R2 Files dynamically into standard photo data schema
  const getR2Photos = useCallback((categoryPrefix: 'movies' | 'events' | 'offline'): Photo[] => {
    if (categoryPrefix === 'movies') return r2PhotosMovies;
    if (categoryPrefix === 'events') return r2PhotosEvents;
    return r2PhotosOffline;
  }, [r2PhotosMovies, r2PhotosEvents, r2PhotosOffline]);

  // Helper to retrieve currently visible/active photos list for navigation inside MediaViewer lightbox
  const getActiveGalleryPhotos = (): Photo[] => {
    const r2Photos = getR2Photos(photoSubTab);
    let localPhotos: Photo[] = [];

    if (photoSubTab === 'movies') {
      localPhotos = PHOTOS.filter(p => p.category === 'Stills' || p.category === 'Vintage');
    } else if (photoSubTab === 'events') {
      localPhotos = PHOTOS.filter(p => p.category === 'Events');
      if (localPhotos.length === 0) {
        localPhotos = [
          {
            id: 'mock-e1',
            title: 'Sr NTR Chaitanya Ratham Rally',
            description: 'Historic campaign photograph of NTR waving to massive crowds.',
            imageUrl: 'https://images.unsplash.com/photo-1596727147705-61a532a659bd?auto=format&fit=crop&q=80&w=800',
            category: 'Events',
            fileSize: '820 KB',
            dimensions: '1920x1080'
          },
          {
            id: 'mock-e2',
            title: 'Devara Press Meet Mumbai',
            description: 'NTR Jr smiling at the grand trailer launch event.',
            imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=800',
            category: 'Events',
            fileSize: '1.4 MB',
            dimensions: '2048x1365'
          }
        ];
      }
    } else {
      localPhotos = PHOTOS.filter(p => p.category === 'Offscreen');
    }

    const unfilteredStills = [...r2Photos, ...localPhotos].filter(item => !deletedPhotos.includes(item.id));

    // Movies specific filtering
    const MOVIE_FOLDERS_39 = [
      "AI", "Aadi", "Adhurs", "Allari Ramudu", "Andhrawala", "Aravinda sametha", 
      "Ashok", "Baadshah", "Bala Ramayanam", "Bhaktha Markandeya", "Brahmarshi Vishwamitra", 
      "Brindaavanam", "Chintakayala Ravi", "Design Edits", "Devara", "Dhammu", 
      "Jai Lava Kusa", "Janatha Garage", "NTR-NEEL", "Naa Alludu", "Naaga", 
      "Nannaku Prematho", "Narasimhudu", "Ninnu Choodalani", "Oosaravelli", "RRR", 
      "Rabhasa", "Rakhi", "Ramayya Vastavayya", "Samba", "Shakti", "Simhadri", 
      "Student No1", "Subbu", "Temper", "Title PNG_s", "War2", "YamaDonga", "Kantri"
    ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    let activeTab = selectedPhotoFolder || photoMovieFilter;
    if ((activeTab === 'All' || !activeTab) && MOVIE_FOLDERS_39.length > 0) {
      activeTab = MOVIE_FOLDERS_39[0];
    } else if (!MOVIE_FOLDERS_39.includes(activeTab) && MOVIE_FOLDERS_39.length > 0) {
      const match = MOVIE_FOLDERS_39.find(f => f.toLowerCase() === activeTab.toLowerCase());
      activeTab = match || MOVIE_FOLDERS_39[0];
    }

    return unfilteredStills.filter(photo => {
      const folder = getPhotoFolder(photo);
      if (folder !== activeTab && !matchesMovie(folder, activeTab) && !matchesMovie(activeTab, folder)) {
        return false;
      }
      if (searchQuery) {
        return (
          photo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          photo.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      return true;
    });
  };

  // Extract folder name from a photo (from R2 key or local metadata)
  const getPhotoFolder = (photo: Photo): string => {
    if (!photo || !photo.id) return 'General';
    const id = photo.id;
    const lowerId = id.toLowerCase();
    
    // Check for "AI" first to keep it fully aligned
    if (lowerId.includes('/ai/') || lowerId.includes('photos/movie/ai/') || lowerId.startsWith('ai/')) {
      return 'AI';
    }

    let cleanKey = id;
    
    // Find key markers anywhere in the string case-insensitively and slice after them
    const markers = [
      'ntrfilmography/photos/movie/',
      'ntrfilmography/photos/movies/',
      'photos/movie/',
      'photos/movies/',
      'ntrfilmography/movies/',
      'ntrfilmography/events/',
      'ntrfilmography/offline/',
      'movies/',
      'events/',
      'offline/'
    ];

    let foundMarker = false;
    for (const marker of markers) {
      const idx = lowerId.indexOf(marker);
      if (idx !== -1) {
        cleanKey = id.slice(idx + marker.length);
        foundMarker = true;
        break;
      }
    }

    // In case no standard marker matched but it contains slashes, try slicing prefixes
    if (!foundMarker && id.includes('/')) {
      const prefixes = [
        'ntrfilmography/',
        'photos/'
      ];
      for (const prefix of prefixes) {
        if (lowerId.startsWith(prefix.toLowerCase())) {
          cleanKey = id.slice(prefix.length);
          break;
        }
      }
    }

    // Strip leading slashes if any
    if (cleanKey.startsWith('/')) {
      cleanKey = cleanKey.slice(1);
    }

    const parts = cleanKey.split('/');
    if (parts.length > 1) {
      const folderCandidate = parts[0];
      if (
        folderCandidate.toLowerCase() !== 'photos' && 
        folderCandidate.toLowerCase() !== 'movies' &&
        folderCandidate.toLowerCase() !== 'movie'
      ) {
        return folderCandidate;
      }
      if (parts.length > 2) {
        return parts[1];
      }
    }
    
    if (photo.movieTitle) {
      return photo.movieTitle;
    }
    
    if (photo.category) {
      return photo.category;
    }
    return 'General';
  };

  // Find matching poster from r2Data.thumbnailsP or local MOVIES database for folder
  const getFolderThumbnail = (
    folderName: string,
    photos: any[],
    assignedUrls?: Set<string>,
    context?: 'photos' | 'videos' | 'videocuts'
  ): string => {
    if (!folderName) {
      return 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=400';
    }

    const fLower = folderName.toLowerCase();

    // Explicit override for 'Naaga' and 'Chintakayala Ravi' to their correct specific thumbnail paths
    const naagaUrl = 'https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Photos%20Thumbnails/Movie%20Thumbnails/Naaga.png';
    const chintakayalaUrl = 'https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Photos%20Thumbnails/Movie%20Thumbnails/Chintakayala%20Ravi.jpeg';
    const ntrNeelUrl = 'https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Photos%20Thumbnails/Movie%20Thumbnails/NTR-NEEL.jpg';

    if (fLower === 'naaga' || fLower === 'naga') {
      if (!assignedUrls || !assignedUrls.has(naagaUrl)) {
        if (assignedUrls) assignedUrls.add(naagaUrl);
        return naagaUrl;
      }
    }
    if (fLower === 'chintakayala ravi' || fLower === 'chintakayalaravi') {
      if (!assignedUrls || !assignedUrls.has(chintakayalaUrl)) {
        if (assignedUrls) assignedUrls.add(chintakayalaUrl);
        return chintakayalaUrl;
      }
    }
    if (fLower === 'ntr-neel' || fLower === 'ntr neel') {
      if (!assignedUrls || !assignedUrls.has(ntrNeelUrl)) {
        if (assignedUrls) assignedUrls.add(ntrNeelUrl);
        return ntrNeelUrl;
      }
    }

    if (folderName === 'AI') {
      const aiUrl = 'https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Photos/Movie/AI/np%20dance.png';
      if (!assignedUrls || !assignedUrls.has(aiUrl)) {
        if (assignedUrls) assignedUrls.add(aiUrl);
        return aiUrl;
      }
    }

    // Try finding matching thumbnail under Event Thumbnails based on strict context
    if (context === 'photos') {
      // Strictly use Photos Thumbnails / Event Thumbnails for photos
      if (r2Data?.photosEventThumbnails) {
        const match = r2Data.photosEventThumbnails.find((thumb: any) => {
          const thumbFileName = (thumb.key.split('/').pop() || '').toLowerCase();
          const cleanKey = thumbFileName.replace(/\.[^/.]+$/, "").replace(/\s+[pPlL]$/, "").replace(/_[pPlL]$/, "").replace(/[-_]/g, ' ').trim();
          const cleanFolder = folderName.replace(/[-_]/g, ' ').replace(/_+$/, "").trim().toLowerCase();
          
          return cleanKey === cleanFolder ||
                 cleanKey.replace(/\s+/g, '') === cleanFolder.replace(/\s+/g, '') ||
                 matchesMovie(thumb.key, folderName) ||
                 matchesMovie(folderName, thumb.key) ||
                 thumb.key.toLowerCase().includes(fLower) ||
                 fLower.includes(thumb.key.toLowerCase().replace(/\.[^/.]+$/, ""));
        });
        if (match && (!assignedUrls || !assignedUrls.has(match.url))) {
          if (assignedUrls) assignedUrls.add(match.url);
          return match.url;
        }
      }
    } else if (context === 'videos' || context === 'videocuts') {
      if (context === 'videocuts' && r2Data?.videoCutsMovieThumbnails) {
        const match = r2Data.videoCutsMovieThumbnails.find((thumb: any) => {
          const thumbFileName = (thumb.key.split('/').pop() || '').toLowerCase();
          const cleanKey = thumbFileName.replace(/\.[^/.]+$/, "").replace(/\s+[pPlL]$/, "").replace(/_[pPlL]$/, "").replace(/[-_]/g, ' ').trim();
          const cleanFolder = folderName.replace(/[-_]/g, ' ').replace(/_+$/, "").trim().toLowerCase();
          
          return cleanKey === cleanFolder ||
                 cleanKey.replace(/\s+/g, '') === cleanFolder.replace(/\s+/g, '') ||
                 matchesMovie(thumb.key, folderName) ||
                 matchesMovie(folderName, thumb.key) ||
                 thumb.key.toLowerCase().includes(fLower) ||
                 fLower.includes(thumb.key.toLowerCase().replace(/\.[^/.]+$/, ""));
        });
        if (match && (!assignedUrls || !assignedUrls.has(match.url))) {
          if (assignedUrls) assignedUrls.add(match.url);
          return match.url;
        }
      }
      
      // Strictly use Videos Thumbnails / Event Thumbnails for videos/cuts
      if (r2Data?.videosEventThumbnails) {
        const match = r2Data.videosEventThumbnails.find((thumb: any) => {
          const thumbFileName = (thumb.key.split('/').pop() || '').toLowerCase();
          const cleanKey = thumbFileName.replace(/\.[^/.]+$/, "").replace(/\s+[pPlL]$/, "").replace(/_[pPlL]$/, "").replace(/[-_]/g, ' ').trim();
          const cleanFolder = folderName.replace(/[-_]/g, ' ').replace(/_+$/, "").trim().toLowerCase();
          
          return cleanKey === cleanFolder ||
                 cleanKey.replace(/\s+/g, '') === cleanFolder.replace(/\s+/g, '') ||
                 matchesMovie(thumb.key, folderName) ||
                 matchesMovie(folderName, thumb.key) ||
                 thumb.key.toLowerCase().includes(fLower) ||
                 fLower.includes(thumb.key.toLowerCase().replace(/\.[^/.]+$/, ""));
        });
        if (match && (!assignedUrls || !assignedUrls.has(match.url))) {
          if (assignedUrls) assignedUrls.add(match.url);
          return match.url;
        }
      }
    } else {
      // Fallback/Legacy if no context specified: try photos event first, then videos event
      if (r2Data?.photosEventThumbnails) {
        const match = r2Data.photosEventThumbnails.find((thumb: any) => {
          const thumbFileName = (thumb.key.split('/').pop() || '').toLowerCase();
          const cleanKey = thumbFileName.replace(/\.[^/.]+$/, "").replace(/\s+[pPlL]$/, "").replace(/_[pPlL]$/, "").replace(/[-_]/g, ' ').trim();
          const cleanFolder = folderName.replace(/[-_]/g, ' ').replace(/_+$/, "").trim().toLowerCase();
          
          return cleanKey === cleanFolder ||
                 cleanKey.replace(/\s+/g, '') === cleanFolder.replace(/\s+/g, '') ||
                 matchesMovie(thumb.key, folderName) ||
                 matchesMovie(folderName, thumb.key) ||
                 thumb.key.toLowerCase().includes(fLower) ||
                 fLower.includes(thumb.key.toLowerCase().replace(/\.[^/.]+$/, ""));
        });
        if (match && (!assignedUrls || !assignedUrls.has(match.url))) {
          if (assignedUrls) assignedUrls.add(match.url);
          return match.url;
        }
      }
      if (r2Data?.videosEventThumbnails) {
        const match = r2Data.videosEventThumbnails.find((thumb: any) => {
          const thumbFileName = (thumb.key.split('/').pop() || '').toLowerCase();
          const cleanKey = thumbFileName.replace(/\.[^/.]+$/, "").replace(/\s+[pPlL]$/, "").replace(/_[pPlL]$/, "").replace(/[-_]/g, ' ').trim();
          const cleanFolder = folderName.replace(/[-_]/g, ' ').replace(/_+$/, "").trim().toLowerCase();
          
          return cleanKey === cleanFolder ||
                 cleanKey.replace(/\s+/g, '') === cleanFolder.replace(/\s+/g, '') ||
                 matchesMovie(thumb.key, folderName) ||
                 matchesMovie(folderName, thumb.key) ||
                 thumb.key.toLowerCase().includes(fLower) ||
                 fLower.includes(thumb.key.toLowerCase().replace(/\.[^/.]+$/, ""));
        });
        if (match && (!assignedUrls || !assignedUrls.has(match.url))) {
          if (assignedUrls) assignedUrls.add(match.url);
          return match.url;
        }
      }
    }

    // Try finding matching thumbnail under Photos Thumbnails/Movie Thumbnails
    if (r2Data?.photosMovieThumbnails) {
      const match = r2Data.photosMovieThumbnails.find((thumb: any) => {
        const thumbFileName = (thumb.key.split('/').pop() || '').toLowerCase();
        const cleanKey = thumbFileName.replace(/\.[^/.]+$/, "").replace(/\s+[pPlL]$/, "").replace(/_[pPlL]$/, "").replace(/[-_]/g, ' ').trim();
        const cleanFolder = folderName.replace(/[-_]/g, ' ').replace(/_+$/, "").trim().toLowerCase();
        
        return (cleanKey === cleanFolder ||
                cleanKey.replace(/\s+/g, '') === cleanFolder.replace(/\s+/g, '') ||
                matchesMovie(thumb.key, folderName) || 
                matchesMovie(folderName, thumb.key)) &&
               (!assignedUrls || !assignedUrls.has(thumb.url));
      });
      if (match) {
        if (assignedUrls) assignedUrls.add(match.url);
        return match.url;
      }
    }

    if (fLower === 'naga' || fLower === 'naaga') {
      const nagaPoster = 'https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Movie%20Posters/Potrait/Naaga.jpg';
      if (!assignedUrls || !assignedUrls.has(nagaPoster)) {
        if (assignedUrls) assignedUrls.add(nagaPoster);
        return nagaPoster;
      }
    }
    if (fLower.includes('asvr') || fLower.includes('aravinda') || fLower.includes('aravindha')) {
      const match = r2Data?.thumbnailsP?.find((thumb: any) => 
        thumb.key.toLowerCase().includes('asvr') &&
        (!assignedUrls || !assignedUrls.has(thumb.url))
      );
      if (match) {
        if (assignedUrls) assignedUrls.add(match.url);
        return match.url;
      }
    }
    if (fLower.includes('jlk') || fLower.includes('jai lava') || fLower.includes('lava kusa') || fLower.includes('jailavakusa')) {
      const match = r2Data?.thumbnailsP?.find((thumb: any) => 
        thumb.key.toLowerCase().includes('jlk') &&
        (!assignedUrls || !assignedUrls.has(thumb.url))
      );
      if (match) {
        if (assignedUrls) assignedUrls.add(match.url);
        return match.url;
      }
    }

    if (r2Data?.thumbnailsP) {
      const match = r2Data.thumbnailsP.find((thumb: any) => 
        (matchesMovie(thumb.key, folderName) || matchesMovie(folderName, thumb.key)) &&
        (!assignedUrls || !assignedUrls.has(thumb.url))
      );
      if (match) {
        if (assignedUrls) assignedUrls.add(match.url);
        return match.url;
      }
    }
    
    const matchedMovie = MOVIES.find(m => 
      m.title.toLowerCase() === folderName.toLowerCase() || 
      m.originalTitle.toLowerCase() === folderName.toLowerCase() ||
      matchesMovie(m.title, folderName)
    );
    if (matchedMovie?.posterUrl) {
      if (!assignedUrls || !assignedUrls.has(matchedMovie.posterUrl)) {
        if (assignedUrls) assignedUrls.add(matchedMovie.posterUrl);
        return matchedMovie.posterUrl;
      }
    }
    
    if (photos.length > 0) {
      const portraitFile = photos.find(p => {
        const url = p.imageUrl || p.videoUrl;
        if (assignedUrls && assignedUrls.has(url)) return false;
        if (p.dimensions) {
          const parts = p.dimensions.split('x');
          if (parts.length === 2) {
            const w = parseInt(parts[0], 10);
            const h = parseInt(parts[1], 10);
            return h > w;
          }
        }
        return false;
      });
      if (portraitFile) {
        const url = portraitFile.imageUrl || portraitFile.videoUrl;
        if (assignedUrls) assignedUrls.add(url);
        return url;
      }

      const unusedFile = photos.find(p => {
        const url = p.imageUrl || p.videoUrl;
        return !assignedUrls || !assignedUrls.has(url);
      });
      if (unusedFile) {
        const url = unusedFile.imageUrl || unusedFile.videoUrl;
        if (assignedUrls) assignedUrls.add(url);
        return url;
      }

      const url = photos[0].imageUrl || photos[0].videoUrl;
      if (assignedUrls) assignedUrls.add(url);
      return url;
    }
    
    return 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=400';
  };

  // Find matching landscape poster from r2Data.thumbnailsL or local MOVIES database for video folder
  const getVideoFolderThumbnail = (folderName: string, files: any[], assignedUrls?: Set<string>): string => {
    if (!folderName) {
      return 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=800';
    }

    const fLower = folderName.toLowerCase();

    // 1. Check for specific overrides first if any
    const naagaUrlL = 'https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Movie%20Posters/Landscape/Naaga.jpg';
    if (fLower === 'naaga' || fLower === 'naga') {
      if (!assignedUrls || !assignedUrls.has(naagaUrlL)) {
        if (assignedUrls) assignedUrls.add(naagaUrlL);
        return naagaUrlL;
      }
    }

    // 2. Search in thumbnailsL (Landscape thumbnails from ntrfilmography/Movie Posters/Landscape/)
    if (r2Data?.thumbnailsL) {
      const match = r2Data.thumbnailsL.find((thumb: any) => 
        (matchesMovie(thumb.key, folderName) || matchesMovie(folderName, thumb.key) || thumb.key.toLowerCase().includes(fLower) || fLower.includes(thumb.key.toLowerCase().replace(/\.[^/.]+$/, ""))) &&
        (!assignedUrls || !assignedUrls.has(thumb.url))
      );
      if (match) {
        if (assignedUrls) assignedUrls.add(match.url);
        return match.url;
      }
    }

    // 3. Search in MOVIES for a movie match to get its bannerUrl (which is landscape)
    const matchedMovie = MOVIES.find(m => 
      m.title.toLowerCase() === folderName.toLowerCase() || 
      m.originalTitle.toLowerCase() === folderName.toLowerCase() ||
      matchesMovie(m.title, folderName)
    );
    if (matchedMovie?.bannerUrl) {
      if (!assignedUrls || !assignedUrls.has(matchedMovie.bannerUrl)) {
        if (assignedUrls) assignedUrls.add(matchedMovie.bannerUrl);
        return matchedMovie.bannerUrl;
      }
    }

    // 4. Try getting a file inside this folder that might have a thumbnail or fallback to a landscape cinema image
    if (files.length > 0) {
      const unusedFile = files.find(f => {
        const url = f.imageUrl || f.videoUrl;
        return !assignedUrls || !assignedUrls.has(url);
      });
      if (unusedFile) {
        const url = unusedFile.imageUrl || unusedFile.videoUrl;
        if (assignedUrls) assignedUrls.add(url);
        return url;
      }
      const url = files[0].imageUrl || files[0].videoUrl;
      if (assignedUrls) assignedUrls.add(url);
      return url;
    }

    return 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=800';
  };

  // Compute folders list from photos
  const getPhotoFolders = (photosList: Photo[]) => {
    const foldersMap: { [folderName: string]: Photo[] } = {};
    
    photosList.forEach(photo => {
      const folder = getPhotoFolder(photo);
      if (!foldersMap[folder]) {
        foldersMap[folder] = [];
      }
      foldersMap[folder].push(photo);
    });
    
    const assignedUrls = new Set<string>();
    return Object.keys(foldersMap).map(folderName => {
      const folderPhotos = foldersMap[folderName];
      const thumbnail = getFolderThumbnail(folderName, folderPhotos, assignedUrls, 'photos');
      return {
        name: folderName,
        photos: folderPhotos,
        thumbnail,
        count: folderPhotos.length
      };
    }).sort((a, b) => b.count - a.count);
  };

  // Convert R2 Files dynamically into standard video data schema
  const getR2Videos = useCallback((section: 'cuts' | 'songs' | 'offline_events' | 'offline_fans'): VideoType[] => {
    if (section === 'cuts') return r2CutsVideos;
    if (section === 'songs') return r2SongsVideos;
    if (section === 'offline_events') return r2OfflineEventsVideos;
    return r2OfflineFansVideos;
  }, [r2CutsVideos, r2SongsVideos, r2OfflineEventsVideos, r2OfflineFansVideos]);

  // Dynamic Content Filtering & Merging lists
  const getFilteredPhotos = (): Photo[] => {
    const r2Photos = getR2Photos(photoSubTab);
    let localPhotos: Photo[] = [];

    if (photoSubTab === 'movies') {
      localPhotos = PHOTOS.filter(p => p.category === 'Stills' || p.category === 'Vintage');
    } else if (photoSubTab === 'events') {
      localPhotos = PHOTOS.filter(p => p.category === 'Events');
      if (localPhotos.length === 0) {
        localPhotos = [
          {
            id: 'mock-e1',
            title: 'Sr NTR Chaitanya Ratham Rally',
            description: 'Historic campaign photograph of NTR waving to massive crowds.',
            imageUrl: 'https://images.unsplash.com/photo-1596727147705-61a532a659bd?auto=format&fit=crop&q=80&w=800',
            category: 'Events',
            fileSize: '820 KB',
            dimensions: '1920x1080'
          },
          {
            id: 'mock-e2',
            title: 'Devara Press Meet Mumbai',
            description: 'NTR Jr smiling at the grand trailer launch event.',
            imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=800',
            category: 'Events',
            fileSize: '1.4 MB',
            dimensions: '2048x1365'
          }
        ];
      }
    } else {
      localPhotos = PHOTOS.filter(p => p.category === 'Offscreen');
    }

    const merged = [...r2Photos, ...localPhotos];
    
    return merged.filter(item => {
      // Filter out deleted photos
      if (deletedPhotos.includes(item.id)) return false;
      
      // Filter out deleted folders
      const folderName = getPhotoFolder(item);
      if (deletedFolders.includes(folderName)) return false;

      return (
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  };

  const getFilteredVideos = (): VideoType[] => {
    const r2Videos = getR2Videos(videoSubTab);
    let localVideos: VideoType[] = [];

    if (videoSubTab === 'cuts') {
      localVideos = VIDEOS.filter(v => v.category === 'Cut' || v.category === 'Trailer' || v.category === 'Teaser');
    } else {
      localVideos = VIDEOS.filter(v => v.category === 'BehindTheScenes' || v.title.toLowerCase().includes('song'));
    }

    const merged = [...r2Videos, ...localVideos];

    return merged.filter(item => 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const getFilteredOfflineVideos = (): VideoType[] => {
    const r2Videos = getR2Videos(offlineSubTab === 'events' ? 'offline_events' : 'offline_fans');
    let localVideos: VideoType[] = [];

    if (offlineSubTab === 'events') {
      localVideos = [
        {
          id: 'mock-off-v1',
          title: 'Senior NTR Political Chariot Entry',
          description: 'Monumental historical footage of the Chaitanya Ratham tour across AP.',
          videoUrl: 'NgBoMJy386M',
          category: 'Teaser',
          duration: '4:15',
          views: 'Legacy Classic'
        },
        {
          id: 'mock-off-v2',
          title: 'TDP Welfare Pledge Advert (1983)',
          description: 'Original archival campaign advertisement broadcasting welfare programs.',
          videoUrl: 'sAz7XFisqK4',
          category: 'Trailer',
          duration: '1:30',
          views: 'Archived Advert'
        }
      ];
    } else {
      localVideos = [
        {
          id: 'mock-fan-v1',
          title: 'Devara Grand Release Fan Celebrations',
          description: 'Insane fan celebrations and massive cut-outs at Sandhya Theater, Hyderabad.',
          videoUrl: 'NgBoMJy386M',
          category: 'BehindTheScenes',
          duration: '3:05',
          views: 'Fan Made'
        },
        {
          id: 'mock-fan-v2',
          title: 'RRR Oscar Winning Street Parade',
          description: 'Deafening street celebrations of proud Telugu film fans across the globe.',
          videoUrl: 'sAz7XFisqK4',
          category: 'BehindTheScenes',
          duration: '5:40',
          views: 'Global Pride'
        }
      ];
    }

    const merged = [...r2Videos, ...localVideos];

    return merged.filter(item => 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const getAllMovies = useCallback((): Movie[] => {
    return allMovies;
  }, [allMovies]);

  const getFilteredMovies = useCallback((): Movie[] => {
    const filtered = allMovies.filter(movie => 
      movie.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      movie.story.toLowerCase().includes(searchQuery.toLowerCase()) ||
      movie.originalTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      movie.eraCategory.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return [...filtered].sort((a, b) => {
      let valA: any;
      let valB: any;

      if (movieSortField === 'name') {
        valA = a.title.toLowerCase();
        valB = b.title.toLowerCase();
      } else if (movieSortField === 'size') {
        valA = a.fileSize || 0;
        valB = b.fileSize || 0;
      } else {
        // default 'length'
        valA = a.runTime || 0;
        valB = b.runTime || 0;
      }

      if (valA < valB) return movieSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return movieSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allMovies, searchQuery, movieSortField, movieSortOrder]);

  // Get movies to display in the carousel (user watched movies + their neighbors in the full movies list)
  const getCarouselMovies = (allMovies: Movie[]): Movie[] => {
    if (!allMovies || allMovies.length === 0) return [];
    
    // Find all watched movies (views > 0), sorted by view count descending
    const watchedMovies = [...allMovies]
      .filter(m => (movieViews[m.id] || 0) > 0)
      .sort((a, b) => (movieViews[b.id] || 0) - (movieViews[a.id] || 0));
    
    if (watchedMovies.length > 0) {
      const carouselMoviesList: Movie[] = [];
      const addedIds = new Set<string>();

      // For each watched movie, add itself, and its left/right neighbors in allMovies
      watchedMovies.forEach(watched => {
        // Add the watched movie itself
        if (!addedIds.has(watched.id)) {
          carouselMoviesList.push(watched);
          addedIds.add(watched.id);
        }

        // Find index of this watched movie in the original allMovies array to locate its neighbors
        const idx = allMovies.findIndex(m => m.id === watched.id);
        if (idx !== -1) {
          // Left neighbor
          if (idx > 0) {
            const leftNeighbor = allMovies[idx - 1];
            if (!addedIds.has(leftNeighbor.id)) {
              carouselMoviesList.push(leftNeighbor);
              addedIds.add(leftNeighbor.id);
            }
          }
          // Right neighbor
          if (idx < allMovies.length - 1) {
            const rightNeighbor = allMovies[idx + 1];
            if (!addedIds.has(rightNeighbor.id)) {
              carouselMoviesList.push(rightNeighbor);
              addedIds.add(rightNeighbor.id);
            }
          }
        }
      });

      // If we have fewer than 6 movies in the list, pad with other non-added movies to keep the carousel lively
      if (carouselMoviesList.length < 6) {
        for (const movie of allMovies) {
          if (!addedIds.has(movie.id)) {
            carouselMoviesList.push(movie);
            addedIds.add(movie.id);
            if (carouselMoviesList.length >= 6) break;
          }
        }
      }

      return carouselMoviesList.slice(0, 8); // Keep up to 8 movies in the carousel
    } else {
      // Fallback: take the first 6 movies if no views are tracked yet
      return allMovies.slice(0, 6);
    }
  };

  // Global keyboard navigation & accessibility support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keyboard shortcuts if the user is typing in a form input, select, or textarea
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      // 1. Escape key to close modals
      if (e.key === 'Escape') {
        if (movieVideoUrl) {
          setMovieVideoUrl(null);
          e.preventDefault();
        } else if (activeMediaItem) {
          window.history.back(); // Closes MediaViewer
          e.preventDefault();
        } else if (selectedMovie) {
          setSelectedMovie(null);
          e.preventDefault();
        }
      }

      // 2. Left / Right arrow keys for Cinematic Hero Carousel
      // Only navigate if no modal is actively overlayed on the screen (no movieVideoUrl, no activeMediaItem, and not currently inside selectedMovie details view)
      if (!movieVideoUrl && !activeMediaItem && !selectedMovie && currentView === 'movies' && !searchQuery) {
        const carouselMovies = getCarouselMovies(allMovies);
        if (carouselMovies.length > 1) {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setCarouselIndex(prev => (prev + 1) % carouselMovies.length);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setCarouselIndex(prev => (prev - 1 + carouselMovies.length) % carouselMovies.length);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [movieVideoUrl, activeMediaItem, selectedMovie, currentView, searchQuery, allMovies]);

  // Unified global favorites lookup (memoized to keep the app highly responsive)
  const allFavoritesMemo = useMemo(() => {
    const favoritedList: { type: 'movie' | 'photo' | 'video' | 'song'; item: any }[] = [];
    
    // Add movies
    const seenMovieIds = new Set();
    allMovies.forEach(m => {
      if (favorites[m.id] && !seenMovieIds.has(m.id)) {
        seenMovieIds.add(m.id);
        favoritedList.push({ type: 'movie', item: m });
      }
    });

    // Add photos (check dynamic folder tree recursive lists, categorized lists, and local PHOTOS)
    const dynamicPhotos = parsedBucketData?.photos ? getAllFilesRecursive(parsedBucketData.photos) : [];
    const categoryPhotos = [...r2PhotosMovies, ...r2PhotosEvents, ...r2PhotosOffline];
    const allPhotos = [...dynamicPhotos, ...categoryPhotos, ...PHOTOS];
    const seenPhotoIds = new Set();
    allPhotos.forEach(p => {
      if (favorites[p.id] && !seenPhotoIds.has(p.id)) {
        seenPhotoIds.add(p.id);
        favoritedList.push({ type: 'photo', item: p });
      }
    });

    // Add videos (check dynamic folder tree recursive lists, categorized lists, and local VIDEOS)
    const dynamicVideoCuts = parsedBucketData?.videoCuts ? getAllFilesRecursive(parsedBucketData.videoCuts) : [];
    const dynamicVideos = parsedBucketData?.videos ? getAllFilesRecursive(parsedBucketData.videos) : [];
    const categoryVideos = [
      ...r2CutsVideos,
      ...r2SongsVideos,
      ...r2OfflineEventsVideos,
      ...r2OfflineFansVideos
    ];
    const allVideos = [...dynamicVideoCuts, ...dynamicVideos, ...categoryVideos, ...VIDEOS];
    const seenVideoIds = new Set();
    allVideos.forEach(v => {
      if (favorites[v.id] && !seenVideoIds.has(v.id)) {
        seenVideoIds.add(v.id);
        favoritedList.push({ type: 'video', item: v });
      }
    });

    // Add songs (collect from all movies)
    const allSongs: any[] = [];
    allMovies.forEach(m => {
      const movieSongs = getMovieAudioSongs(m);
      movieSongs.forEach(song => {
        allSongs.push({
          ...song,
          movieTitle: m.title
        });
      });
    });
    const seenSongIds = new Set();
    allSongs.forEach(song => {
      if (favorites[song.id] && !seenSongIds.has(song.id)) {
        seenSongIds.add(song.id);
        favoritedList.push({ type: 'song', item: song });
      }
    });

    return favoritedList;
  }, [allMovies, favorites, parsedBucketData, r2PhotosMovies, r2PhotosEvents, r2PhotosOffline, r2CutsVideos, r2SongsVideos, r2OfflineEventsVideos, r2OfflineFansVideos]);

  const getAllFavorites = useCallback(() => {
    return allFavoritesMemo;
  }, [allFavoritesMemo]);

  // =========================================================================
  // [TAG: SECTION_5_EXPORT_DOWNLOADS] - ZIP COMPRESSION AND MASS DOWNLOADING SERVICES
  // =========================================================================

  // JSZip-powered Parallel Bulk Downloader
  const triggerBulkDownload = async () => {
    triggerHaptic('double');
    let itemsToDownload: { title: string; url: string; key: string }[] = [];

    if (currentView === 'photos') {
      const activePhotos = getFilteredPhotos();
      itemsToDownload = activePhotos.map(p => ({
        title: p.title,
        url: p.imageUrl,
        key: p.id
      }));
    } else if (currentView === 'cuts') {
      const activeVideos = getFilteredVideos();
      activeVideos.forEach(v => {
        if (v.videoUrl && v.videoUrl.startsWith('http')) {
          itemsToDownload.push({ title: v.title, url: v.videoUrl, key: v.id });
        } else {
          itemsToDownload.push({ 
            title: `${v.title}_YouTubeLink`, 
            url: `https://img.youtube.com/vi/${v.videoUrl}/0.jpg`, 
            key: v.id 
          });
        }
      });
    } else if (currentView === 'offline') {
      const activeOffline = getFilteredOfflineVideos();
      activeOffline.forEach(v => {
        if (v.videoUrl && v.videoUrl.startsWith('http')) {
          itemsToDownload.push({ title: v.title, url: v.videoUrl, key: v.id });
        } else {
          itemsToDownload.push({ 
            title: `${v.title}_YouTubeLink`, 
            url: `https://img.youtube.com/vi/${v.videoUrl}/0.jpg`, 
            key: v.id 
          });
        }
      });
    } else if (currentView === 'movies') {
      const activeMovies = getFilteredMovies();
      activeMovies.forEach(m => {
        itemsToDownload.push({ title: `${m.title}_Poster`, url: m.posterUrl, key: `${m.id}_poster` });
        itemsToDownload.push({ title: `${m.title}_CinematicBanner`, url: m.bannerUrl, key: `${m.id}_banner` });
      });
    } else if (currentView === 'favorites') {
      const activeFavs = getAllFavorites();
      activeFavs.forEach(f => {
        if (f.type === 'photo') {
          itemsToDownload.push({ title: f.item.title, url: f.item.imageUrl, key: f.item.id });
        } else if (f.type === 'movie') {
          itemsToDownload.push({ title: `${f.item.title}_Poster`, url: f.item.posterUrl, key: f.item.id });
        } else if (f.type === 'video') {
          if (f.item.videoUrl && f.item.videoUrl.startsWith('http')) {
            itemsToDownload.push({ title: f.item.title, url: f.item.videoUrl, key: f.item.id });
          } else {
            itemsToDownload.push({ 
              title: `${f.item.title}_YouTubeLink`, 
              url: `https://img.youtube.com/vi/${f.item.videoUrl}/0.jpg`, 
              key: f.item.id 
            });
          }
        }
      });
    }

    if (itemsToDownload.length === 0) {
      showToast('No downloadable media files found in the current view.', 'info');
      return;
    }

    setIsBulkDownloading(true);
    setBulkDownloadProgress({ current: 0, total: itemsToDownload.length, filename: 'Initializing ZIP Engine...' });

    const zip = new JSZip();

    try {
      const concurrency = 10;
      let completedCount = 0;
      let index = 0;

      const worker = async () => {
        while (index < itemsToDownload.length) {
          const i = index++;
          const item = itemsToDownload[i];
          if (!item) break;

          try {
            const cleanName = item.title.replace(/[^a-zA-Z0-9-_ ]/g, '');
            const isVideo = item.url.toLowerCase().endsWith('.mp4') || item.url.toLowerCase().endsWith('.mkv') || item.url.toLowerCase().endsWith('.webm') || (item.key && (item.key.includes('Videos/') || item.key.includes('VideoCuts/')));

            if (isVideo) {
              // Direct CDN link shortcut instead of zipping gigabytes of video blobs in memory which crashes browser/timeouts
              zip.file(`${cleanName}_Direct_Download_Link.txt`, `Direct High-Speed Download URL for "${item.title}":\n${item.url}\n\nTo download this video at maximum speed, copy this URL and open it in a new tab, then right-click/long-press and select "Save Video As" or click the player 3-dots and choose "Download".`);
              completedCount++;
              setBulkDownloadProgress(prev => ({
                ...prev,
                current: completedCount,
                filename: `Linked Video: ${item.title}`
              }));
              continue;
            }

            const directUrl = reconstructDirectR2Url(item.url, item.key);
            let response;
            try {
              response = await fetch(directUrl);
              if (!response.ok) throw new Error(`Direct fetch failed with status ${response.status}`);
            } catch (directErr) {
              console.warn(`Direct fetch failed for item ${item.title}, trying proxy fallback...`, directErr);
              const proxyUrl = `/api/v1/media/download?url=${encodeURIComponent(directUrl)}&key=${encodeURIComponent(item.key || '')}`;
              response = await fetch(proxyUrl);
              if (!response.ok) throw new Error(`Proxy fallback fetch failed: ${response.status}`);
            }
            const blob = await response.blob();
            
            let ext = 'jpg';
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('png')) ext = 'png';
            else if (contentType.includes('mp4')) ext = 'mp4';
            else if (contentType.includes('webm')) ext = 'webm';
            else {
              const lastDot = item.url.lastIndexOf('.');
              if (lastDot !== -1) {
                ext = item.url.substring(lastDot + 1).toLowerCase();
              }
            }
            
            zip.file(`${cleanName}.${ext}`, blob);
          } catch (err) {
            console.warn(`Bulk download failed for item ${item.title}. Putting link shortcut instead.`, err);
            zip.file(`${item.title}_Resource_Link.txt`, `External Asset Source URL:\n${item.url}\n\nDownload directly from device browser.`);
          } finally {
            completedCount++;
            setBulkDownloadProgress(prev => ({
              ...prev,
              current: completedCount,
              filename: `Fetched: ${item.title}`
            }));
          }
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, itemsToDownload.length) }, worker);
      await Promise.all(workers);

      setBulkDownloadProgress(prev => ({ ...prev, filename: 'Compressing archive...' }));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `NTR_Filmography_${currentView}_BulkArchive.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('Failed to bundle assets:', err);
      showToast('Failed to generate bulk ZIP folder. Individual download remains fully functional.', 'error');
    } finally {
      setIsBulkDownloading(false);
    }
  };

  // =========================================================================
  // [TAG: SECTION_6_RENDER_TREE] - MAIN USER-INTERFACE RENDER TREE & RESPONSIVE VIEWPORTS
  // =========================================================================

  return (
    <div className="min-h-screen text-zinc-100 flex flex-col font-sans selection:bg-amber-500 selection:text-zinc-950 relative z-0">
      {/* Hardware-Accelerated Smooth Background Layer */}
      <div 
        className="fixed top-0 left-0 -z-10 pointer-events-none bg-zinc-950 will-change-transform"
        style={{
          width: bgDimensions.width,
          height: bgDimensions.height,
          backgroundImage: `linear-gradient(rgba(9, 9, 11, 0.88), rgba(9, 9, 11, 0.94)), url('${
            isMobile 
              ? "https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/BG%20Images/Man%20Of%20Masses%20NTR%20P.png" 
              : "https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/BG%20Images/Man%20of%20Masses%20NTR%20L.png"
          }')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          transform: 'translate3d(0, 0, 0)',
          WebkitTransform: 'translate3d(0, 0, 0)'
        }}
      />
      
      {/* PREMIUM TIGER LOADING ANIMATION */}
      <AnimatePresence mode="wait">
        {loadingState !== 'ready' && (
          <motion.div
            key="premium-loading-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
            className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 select-none"
          >
            <div className="max-w-md w-full flex flex-col items-center gap-8">
              
              {/* Title */}
              <div className="text-center">
                <h2 className="text-2xl font-black text-white uppercase tracking-wider animate-pulse">
                  NTR <span className="text-amber-500">Filmography</span>
                </h2>
                <p className="text-[10px] text-zinc-500 tracking-widest uppercase font-mono mt-1">
                  Loading Legacy Assets...
                </p>
              </div>

              {/* Dynamic Running Track & Loading Line */}
              <div className="w-full relative py-4">
                
                {/* Background Track Line */}
                <div className="w-full bg-zinc-900/80 border border-zinc-800/30 rounded-full h-1.5 overflow-hidden relative">
                  {/* Active Fills Progress Bar */}
                  <div 
                    className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(245,158,11,0.8)]"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>

              </div>

              {/* Text & Numeric Progress */}
              <div className="text-center flex flex-col items-center gap-1">
                <p className="text-xs text-zinc-400 tracking-widest uppercase font-mono">
                  Loading...
                </p>
                <div className="font-mono font-bold text-amber-500 text-sm tracking-widest mt-1">
                  {Math.round(loadingProgress)}%
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={{ opacity: loadingState === 'ready' ? 1 : 0 }}
        initial={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex-grow flex flex-col w-full"
      >
        {/* HEADER BAR */}
      <header className="border-b border-zinc-900/60 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 px-4 py-3 sm:py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-row items-center justify-between gap-3 sm:gap-4">
          
          {/* Brand Logo & Name */}
          <div 
            onClick={() => {
              setCurrentView('home');
              setActivePhotoSubView('selected');
              setActiveVideoSubView('selected');
              setActiveOfflineSubView('selected');
            }} 
            className="flex items-center gap-2 sm:gap-3 cursor-pointer group select-none min-w-0"
          >
            <TigerLogo className="w-8 h-8 sm:w-10 sm:h-10 group-hover:scale-105 transition-transform shrink-0" />
            <div className="min-w-0">
              <h1 className="font-sans font-black text-sm sm:text-xl tracking-tight text-white uppercase flex items-center gap-1 truncate">
                NTR <span className="text-amber-500">Filmography</span>
              </h1>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[9px] sm:text-[10px] text-zinc-500 uppercase tracking-widest font-mono flex items-center gap-1 shrink-0">
                  <span className="text-xs">🐯</span>
                  TIGERNATION LEGACY
                </p>
                {/* Mobile Social Links next to P comp in small size */}
                <div className="flex sm:hidden items-center gap-1 border-l border-zinc-800/80 pl-1.5">
                  <a 
                    href="https://www.instagram.com/jrntr" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-0.5 rounded bg-zinc-900/60 text-zinc-400 hover:text-amber-500 transition-all active:scale-95"
                    title="Official Instagram"
                  >
                    <Instagram className="w-2.5 h-2.5" />
                  </a>
                  <a 
                    href="https://x.com/tarak9999" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-0.5 rounded bg-zinc-900/60 text-zinc-400 hover:text-amber-500 transition-all active:scale-95"
                    title="Official Twitter (X)"
                  >
                    <Twitter className="w-2.5 h-2.5" />
                  </a>
                  <a 
                    href="https://www.youtube.com/@NTRArtsOfficial" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-0.5 rounded bg-zinc-900/60 text-zinc-400 hover:text-amber-500 transition-all active:scale-95"
                    title="Official YouTube"
                  >
                    <Youtube className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Sync Status & Navigation Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            
            {/* View Favorites Button (reduced size on mobile, placed side-by-side) */}
            <button
              onClick={() => {
                setCurrentView(currentView === 'favorites' ? 'home' : 'favorites');
                setActivePhotoSubView('selected');
                setActiveVideoSubView('selected');
                setActiveOfflineSubView('selected');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider transition-all border flex items-center gap-1.5 sm:gap-2 ${
                currentView === 'favorites'
                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                  : 'bg-zinc-900/40 text-zinc-400 border-zinc-900 hover:text-red-400 hover:bg-zinc-900/80'
              }`}
              title="Show Starred Items"
            >
              <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${currentView === 'favorites' ? 'fill-red-500 text-red-400' : ''}`} />
              <span className="hidden sm:inline">Favorites</span>
              <span className="bg-zinc-950 px-1 py-0.5 sm:px-1.5 sm:py-0.5 rounded-md text-[9px] sm:text-[10px] text-zinc-500 font-mono">
                {Object.keys(favorites).length}
              </span>
            </button>

            {/* Official Social Media Links (Visible only on desktop) */}
            <div className="hidden sm:flex items-center gap-2 border-l border-zinc-900 pl-3 ml-1">
              <a 
                href="https://www.instagram.com/jrntr" 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-1.5 rounded-xl bg-zinc-900/40 border border-zinc-900 text-zinc-400 hover:text-amber-500 hover:bg-zinc-900/80 hover:border-amber-500/20 transition-all active:scale-95"
                title="Official Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a 
                href="https://x.com/tarak9999" 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-1.5 rounded-xl bg-zinc-900/40 border border-zinc-900 text-zinc-400 hover:text-amber-500 hover:bg-zinc-900/80 hover:border-amber-500/20 transition-all active:scale-95"
                title="Official Twitter (X)"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a 
                href="https://www.youtube.com/@NTRArtsOfficial" 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-1.5 rounded-xl bg-zinc-900/40 border border-zinc-900 text-zinc-400 hover:text-amber-500 hover:bg-zinc-900/80 hover:border-amber-500/20 transition-all active:scale-95"
                title="Official YouTube"
              >
                <Youtube className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* PRIMARY CONTENT ENGINE */}
      <main className="flex-grow max-w-7xl mx-auto px-4 md:px-8 pt-0 pb-8 w-full flex flex-col justify-between">
        
        {/* R2 CONFIGURATION ERROR BANNER */}
        {error === 'R2_MISCONFIGURED' && (
          <motion.div 
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 mt-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_0_20px_rgba(239,68,68,0.1)]"
          >
            <div className="flex gap-3 items-start sm:items-center">
              <div className="p-2 rounded-xl bg-red-500/20 text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider">Cloudflare R2 Bucket Inaccessible</h4>
                <p className="text-xs text-zinc-400 mt-1">
                  The media synchronization service failed due to a bucket misconfiguration. Please verify your S3 API credentials, endpoint format, and bucket permission rules in your environment. Offline backup mode is active.
                </p>
              </div>
            </div>
            <button 
              onClick={() => syncWithCloudflare(true)}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white hover:border-red-500/30 transition-all select-none whitespace-nowrap active:scale-95 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3 animate-spin-slow" />
              Retry Connection
            </button>
          </motion.div>
        )}
        
        {/* HOMEPAGE VIEW: Exactly 4 Large Interactive Cards */}
        <div className={currentView === 'home' ? "flex-grow flex flex-col justify-center py-4 animate-fade-in overflow-hidden w-full" : "hidden"}>
            <div className="text-center mb-14 mt-6 md:mt-12">
              <motion.h2 
                key={`h2-${currentView}`}
                className="text-3xl sm:text-5xl md:text-5xl lg:text-5xl xl:text-6xl font-sans font-black tracking-tighter text-white uppercase flex flex-col items-center justify-center gap-2 sm:gap-4 select-none leading-none"
                initial={isMobile ? { opacity: 0, y: -30 } : { opacity: 0, y: -20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={isMobile ? { type: "tween", ease: "linear", duration: 0.2 } : { type: "spring", stiffness: 80, damping: 12 }}
              >
                <span 
                  className="text-white text-center tracking-tight"
                >
                  Everything At
                </span>
                <span 
                  className="text-amber-500 text-center tracking-tight"
                >
                  One Destination
                </span>
              </motion.h2>
            </div>

            {/* Grid of 4 Massive, Distinctly Hovered Claymorphism Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-6xl mx-auto w-full px-2 sm:px-4">
              
              {/* Card 1: Movies (Amber) */}
              <motion.div 
                key={`movies-tab-${currentView}`}
                onClick={() => { triggerHaptic('medium'); setCurrentView('movies'); setSearchQuery(''); }}
                className="group relative cursor-pointer clay-card overflow-hidden h-40 sm:h-64 border border-zinc-900 hover:border-amber-500/40 hover:shadow-[0_0_30px_rgba(245,158,11,0.15)] transition-all duration-300 flex flex-col items-center justify-center p-3 sm:p-6 text-center"
                initial={isMobile ? { opacity: 0, x: -50 } : { opacity: 0, y: 40, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                transition={isMobile ? { type: "tween", ease: "linear", duration: 0.2 } : { type: "spring", stiffness: 90, damping: 14, delay: 0.05 }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-zinc-950/90 z-0 opacity-40 group-hover:opacity-60 transition-opacity" />
                <div className="z-10 flex flex-col items-center justify-center gap-2 sm:gap-4">
                  <div className="bg-amber-500/10 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-amber-500/20 text-amber-500 group-hover:scale-110 group-hover:bg-amber-500/20 group-hover:text-amber-400 transition-all duration-300">
                    <Film className="w-8 h-8 sm:w-12 sm:h-12" />
                  </div>
                  <h3 className="text-sm sm:text-xl font-black text-white group-hover:text-amber-500 transition-colors uppercase tracking-wider mt-1 sm:mt-2">
                    Movies
                  </h3>
                </div>
              </motion.div>

              {/* Card 2: Photos (Emerald) */}
              <motion.div 
                key={`photos-tab-${currentView}`}
                onClick={() => { triggerHaptic('medium'); setCurrentView('photos'); setActivePhotoSubView('selected'); setSelectedPhotoFolderNode(null); setSearchQuery(''); }}
                className="group relative cursor-pointer clay-card overflow-hidden h-40 sm:h-64 border border-zinc-900 hover:border-emerald-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] transition-all duration-300 flex flex-col items-center justify-center p-3 sm:p-6 text-center"
                initial={isMobile ? { opacity: 0, x: 50 } : { opacity: 0, y: 40, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                transition={isMobile ? { type: "tween", ease: "linear", duration: 0.2 } : { type: "spring", stiffness: 90, damping: 14, delay: 0.1 }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-zinc-950/90 z-0 opacity-40 group-hover:opacity-60 transition-opacity" />
                <div className="z-10 flex flex-col items-center justify-center gap-2 sm:gap-4">
                  <div className="bg-emerald-500/10 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-emerald-500/20 text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 group-hover:text-emerald-300 transition-all duration-300">
                    <ImageIcon className="w-8 h-8 sm:w-12 sm:h-12" />
                  </div>
                  <h3 className="text-sm sm:text-xl font-black text-white group-hover:text-emerald-400 transition-colors uppercase tracking-wider mt-1 sm:mt-2">
                    Photos
                  </h3>
                </div>
              </motion.div>

              {/* Card 3: Video Cuts (Cyan) */}
              <motion.div 
                key={`cuts-tab-${currentView}`}
                onClick={() => { triggerHaptic('medium'); setCurrentView('cuts'); setActiveVideoSubView('selected'); setSelectedVideoCutsFolderNode(null); setSearchQuery(''); }}
                className="group relative cursor-pointer clay-card overflow-hidden h-40 sm:h-64 border border-zinc-900 hover:border-cyan-500/40 hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] transition-all duration-300 flex flex-col items-center justify-center p-3 sm:p-6 text-center"
                initial={isMobile ? { opacity: 0, x: -50 } : { opacity: 0, y: 40, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                transition={isMobile ? { type: "tween", ease: "linear", duration: 0.2 } : { type: "spring", stiffness: 90, damping: 14, delay: 0.15 }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-zinc-950/90 z-0 opacity-40 group-hover:opacity-60 transition-opacity" />
                <div className="z-10 flex flex-col items-center justify-center gap-2 sm:gap-4">
                  <div className="bg-cyan-500/10 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-cyan-500/20 text-cyan-400 group-hover:scale-110 group-hover:bg-cyan-500/20 group-hover:text-cyan-300 transition-all duration-300">
                    <Video className="w-8 h-8 sm:w-12 sm:h-12" />
                  </div>
                  <h3 className="text-sm sm:text-xl font-black text-white group-hover:text-cyan-400 transition-colors uppercase tracking-wider mt-1 sm:mt-2">
                    Video Cuts
                  </h3>
                </div>
              </motion.div>

              {/* Card 4: Videos (Rose) */}
              <motion.div 
                key={`videos-tab-${currentView}`}
                onClick={() => { triggerHaptic('medium'); setCurrentView('offline'); setActiveOfflineSubView('selected'); setSelectedVideosFolderNode(null); setSearchQuery(''); }}
                className="group relative cursor-pointer clay-card overflow-hidden h-40 sm:h-64 border border-zinc-900 hover:border-rose-500/40 hover:shadow-[0_0_30px_rgba(244,63,94,0.15)] transition-all duration-300 flex flex-col items-center justify-center p-3 sm:p-6 text-center"
                initial={isMobile ? { opacity: 0, x: 50 } : { opacity: 0, y: 40, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                transition={isMobile ? { type: "tween", ease: "linear", duration: 0.2 } : { type: "spring", stiffness: 90, damping: 14, delay: 0.2 }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-rose-500/5 via-transparent to-zinc-950/90 z-0 opacity-40 group-hover:opacity-60 transition-opacity" />
                <div className="z-10 flex flex-col items-center justify-center gap-2 sm:gap-4">
                  <div className="bg-rose-500/10 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-rose-500/20 text-rose-400 group-hover:scale-110 group-hover:bg-rose-500/20 group-hover:text-rose-300 transition-all duration-300">
                    <Layers className="w-8 h-8 sm:w-12 sm:h-12" />
                  </div>
                  <h3 className="text-sm sm:text-xl font-black text-white group-hover:text-rose-400 transition-colors uppercase tracking-wider mt-1 sm:mt-2">
                    Videos
                  </h3>
                </div>
              </motion.div>

            </div>
          </div>

        {/* INSIDE PAGES LAYOUT FRAMEWORK (Simulated New Page for Sections) */}
        <div className={currentView !== 'home' ? "animate-fade-in flex flex-col gap-6 w-full pt-4 sm:pt-6" : "hidden"}>
            
            {(() => {
              const isPhotoIndex = currentView === 'photos' && activePhotoSubView === 'index';
              const isVideoIndex = currentView === 'cuts' && activeVideoSubView === 'index';
              const isOfflineIndex = currentView === 'offline' && activeOfflineSubView === 'index';
              const isShowingIndexPage = isPhotoIndex || isVideoIndex || isOfflineIndex;

              if (isShowingIndexPage) {
                return (
                  <div className="flex flex-col gap-6 w-full">
                    {/* Centered Main Category Heading Name */}
                    <div className="text-center mb-16 mt-2">
                        <h2 className="text-xl sm:text-2xl md:text-3.5xl lg:text-4xl font-sans font-black tracking-tight text-white uppercase">
                          {currentView === 'photos' && (
                            <>
                              <span className="text-emerald-500">Photos</span>
                            </>
                          )}
                          {currentView === 'cuts' && (
                            <>
                              Video <span className="text-cyan-500">Cuts</span>
                            </>
                          )}
                          {currentView === 'offline' && (
                            <>
                              Offline <span className="text-rose-500">Videos</span>
                            </>
                          )}
                        </h2>
                      </div>

                    {/* Sub-Category Large Cards */}
                    {currentView === 'photos' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full px-4 mb-12">
                        {/* Card 1: Movies */}
                        <div 
                          onClick={() => { triggerHaptic('light'); setPhotoSubTab('movies'); setActivePhotoSubView('selected'); setSelectedPhotoFolder(null); }}
                          className="group relative cursor-pointer clay-card overflow-hidden h-64 border border-zinc-900 hover:border-emerald-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] transition-all duration-300 flex flex-col items-center justify-center p-6 text-center"
                        >
                          <img 
                            src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=800" 
                            alt="Movies" 
                            className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-55 group-hover:scale-105 transition-all duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/60 to-zinc-950/95 z-0" />
                          <div className="z-10 flex flex-col items-center justify-center gap-4">
                            <div className="bg-emerald-500/10 backdrop-blur-sm p-5 rounded-3xl border border-emerald-500/20 text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 group-hover:text-emerald-300 transition-all duration-300">
                              <Film className="w-12 h-12" />
                            </div>
                            <h3 className="text-xl font-black text-white group-hover:text-emerald-400 transition-colors uppercase tracking-wider mt-2">
                              Movies
                            </h3>
                          </div>
                        </div>

                        {/* Card 2: Events */}
                        <div 
                          onClick={() => { triggerHaptic('light'); setPhotoSubTab('events'); setActivePhotoSubView('selected'); setSelectedPhotoFolder(null); }}
                          className="group relative cursor-pointer clay-card overflow-hidden h-64 border border-zinc-900 hover:border-emerald-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] transition-all duration-300 flex flex-col items-center justify-center p-6 text-center"
                        >
                          <img 
                            src="https://images.unsplash.com/photo-1596727147705-61a532a659bd?auto=format&fit=crop&q=80&w=800" 
                            alt="Events" 
                            className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-55 group-hover:scale-105 transition-all duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/60 to-zinc-950/95 z-0" />
                          <div className="z-10 flex flex-col items-center justify-center gap-4">
                            <div className="bg-emerald-500/10 backdrop-blur-sm p-5 rounded-3xl border border-emerald-500/20 text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 group-hover:text-emerald-300 transition-all duration-300">
                              <Sparkles className="w-12 h-12" />
                            </div>
                            <h3 className="text-xl font-black text-white group-hover:text-emerald-400 transition-colors uppercase tracking-wider mt-2">
                              Events
                            </h3>
                          </div>
                        </div>

                        {/* Card 3: Offline */}
                        <div 
                          onClick={() => { triggerHaptic('light'); setPhotoSubTab('offline'); setActivePhotoSubView('selected'); setSelectedPhotoFolder(null); }}
                          className="group relative cursor-pointer clay-card overflow-hidden h-64 border border-zinc-900 hover:border-emerald-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] transition-all duration-300 flex flex-col items-center justify-center p-6 text-center"
                        >
                          <img 
                            src="https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&q=80&w=800" 
                            alt="Offline" 
                            className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-55 group-hover:scale-105 transition-all duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/60 to-zinc-950/95 z-0" />
                          <div className="z-10 flex flex-col items-center justify-center gap-4">
                            <div className="bg-emerald-500/10 backdrop-blur-sm p-5 rounded-3xl border border-emerald-500/20 text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 group-hover:text-emerald-300 transition-all duration-300">
                              <Layers className="w-12 h-12" />
                            </div>
                            <h3 className="text-xl font-black text-white group-hover:text-emerald-400 transition-colors uppercase tracking-wider mt-2">
                              Offline
                            </h3>
                          </div>
                        </div>
                      </div>
                    )}

                    {currentView === 'cuts' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto w-full px-4 mb-12">
                        {/* Card 1: Movie Cuts */}
                        <div 
                          onClick={() => { triggerHaptic('light'); setVideoSubTab('cuts'); setActiveVideoSubView('selected'); }}
                          className="group relative cursor-pointer clay-card overflow-hidden h-64 border border-zinc-900 hover:border-cyan-500/40 hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] transition-all duration-300 flex flex-col items-center justify-center p-6 text-center"
                        >
                          <img 
                            src="https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&q=80&w=800" 
                            alt="Movie Cuts" 
                            className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-55 group-hover:scale-105 transition-all duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/60 to-zinc-950/95 z-0" />
                          <div className="z-10 flex flex-col items-center justify-center gap-4">
                            <div className="bg-cyan-500/10 backdrop-blur-sm p-5 rounded-3xl border border-cyan-500/20 text-cyan-400 group-hover:scale-110 group-hover:bg-cyan-500/20 group-hover:text-cyan-300 transition-all duration-300">
                              <Video className="w-12 h-12" />
                            </div>
                            <h3 className="text-xl font-black text-white group-hover:text-cyan-400 transition-colors uppercase tracking-wider mt-2">
                              Movie Cuts
                            </h3>
                          </div>
                        </div>

                        {/* Card 2: Video Songs */}
                        <div 
                          onClick={() => { triggerHaptic('light'); setVideoSubTab('songs'); setActiveVideoSubView('selected'); }}
                          className="group relative cursor-pointer clay-card overflow-hidden h-64 border border-zinc-900 hover:border-cyan-500/40 hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] transition-all duration-300 flex flex-col items-center justify-center p-6 text-center"
                        >
                          <img 
                            src="https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=800" 
                            alt="Video Songs" 
                            className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-55 group-hover:scale-105 transition-all duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/60 to-zinc-950/95 z-0" />
                          <div className="z-10 flex flex-col items-center justify-center gap-4">
                            <div className="bg-cyan-500/10 backdrop-blur-sm p-5 rounded-3xl border border-cyan-500/20 text-cyan-400 group-hover:scale-110 group-hover:bg-cyan-500/20 group-hover:text-cyan-300 transition-all duration-300">
                              <Disc className="w-12 h-12" />
                            </div>
                            <h3 className="text-xl font-black text-white group-hover:text-cyan-400 transition-colors uppercase tracking-wider mt-2">
                              Video Songs
                            </h3>
                          </div>
                        </div>
                      </div>
                    )}

                    {currentView === 'offline' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto w-full px-4 mb-12">
                        {/* Card 1: Events & Adds */}
                        <div 
                          onClick={() => { triggerHaptic('light'); setOfflineSubTab('events'); setActiveOfflineSubView('selected'); }}
                          className="group relative cursor-pointer clay-card overflow-hidden h-64 border border-zinc-900 hover:border-rose-500/40 hover:shadow-[0_0_30px_rgba(244,63,94,0.15)] transition-all duration-300 flex flex-col items-center justify-center p-6 text-center"
                        >
                          <img 
                            src="https://images.unsplash.com/photo-1596727147705-61a532a659bd?auto=format&fit=crop&q=80&w=800" 
                            alt="Events & Adds" 
                            className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-55 group-hover:scale-105 transition-all duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/60 to-zinc-950/95 z-0" />
                          <div className="z-10 flex flex-col items-center justify-center gap-4">
                            <div className="bg-rose-500/10 backdrop-blur-sm p-5 rounded-3xl border border-rose-500/20 text-rose-400 group-hover:scale-110 group-hover:bg-rose-500/20 group-hover:text-rose-300 transition-all duration-300">
                              <Sparkles className="w-12 h-12" />
                            </div>
                            <h3 className="text-xl font-black text-white group-hover:text-rose-400 transition-colors uppercase tracking-wider mt-2">
                              Events & Adds
                            </h3>
                          </div>
                        </div>

                        {/* Card 2: Fans Celebrations */}
                        <div 
                          onClick={() => { triggerHaptic('light'); setOfflineSubTab('fans'); setActiveOfflineSubView('selected'); }}
                          className="group relative cursor-pointer clay-card overflow-hidden h-64 border border-zinc-900 hover:border-rose-500/40 hover:shadow-[0_0_30px_rgba(244,63,94,0.15)] transition-all duration-300 flex flex-col items-center justify-center p-6 text-center"
                        >
                          <img 
                            src="https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&q=80&w=800" 
                            alt="Fans Celebrations" 
                            className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-55 group-hover:scale-105 transition-all duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/60 to-zinc-950/95 z-0" />
                          <div className="z-10 flex flex-col items-center justify-center gap-4">
                            <div className="bg-rose-500/10 backdrop-blur-sm p-5 rounded-3xl border border-rose-500/20 text-rose-400 group-hover:scale-110 group-hover:bg-rose-500/20 group-hover:text-rose-300 transition-all duration-300">
                              <Flame className="w-12 h-12" />
                            </div>
                            <h3 className="text-xl font-black text-white group-hover:text-rose-400 transition-colors uppercase tracking-wider mt-2">
                              Fans Celebrations
                            </h3>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
              );
            }

            // Detailed Category Grid View
              return (
                <div className="flex flex-col gap-4 w-full">
                    {/* Context Navigation & Quick Controls Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-900/80 pb-3">
                      <div className="flex items-stretch gap-3 min-w-0">
                        {/* Desktop-only back button aligned with breadcrumbs & h2 */}
                        <button
                          onClick={handleGoBack}
                          className="hidden md:flex items-center justify-center px-3.5 bg-zinc-950/40 backdrop-blur-md border border-white/10 hover:border-amber-500/40 text-zinc-400 hover:text-amber-400 active:scale-95 transition-all rounded-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] select-none shrink-0 cursor-pointer group"
                          title="Go Back"
                        >
                          <ArrowLeft className="w-3.5 h-3.5 text-amber-500 group-hover:-translate-x-0.5 transition-transform" />
                        </button>

                        <div className="min-w-0 flex flex-col justify-center">
                        <div className="flex items-center flex-wrap gap-1 sm:gap-1.5 text-[10px] sm:text-xs">
                          <button 
                            onClick={() => { setCurrentView('home'); setSearchQuery(''); }}
                            className="font-mono text-zinc-500 uppercase tracking-widest hover:text-white transition-colors"
                          >
                            HOME
                          </button>
                          <span className="text-zinc-700">/</span>
                          
                          <div
                            className="font-mono text-zinc-300 uppercase tracking-widest px-1.5 py-0.5 rounded border border-zinc-800/30 text-[9px] sm:text-[10px]"
                            style={{
                              backgroundColor: 'transparent',
                              backdropFilter: 'blur(4px)',
                            }}
                          >
                            {currentView === 'cuts' ? 'VIDEO CUTS' : currentView === 'offline' ? 'OFFLINE VIDEOS' : currentView.toUpperCase()}
                          </div>

                          {(currentView === 'photos' || currentView === 'cuts' || currentView === 'offline') && (
                            <>
                              <span className="text-zinc-700">/</span>
                              <button
                                onClick={() => {
                                  if (currentView === 'photos') {
                                    setPhotoFolderStack([]);
                                  } else if (currentView === 'cuts') {
                                    setSelectedVideoCutsFolderNode(null);
                                  } else if (currentView === 'offline') {
                                    setSelectedVideosFolderNode(null);
                                  }
                                  setSearchQuery('');
                                }}
                                className={`font-bold uppercase tracking-wider px-1.5 py-0.5 rounded hover:text-white hover:bg-white/10 transition-all text-[9px] sm:text-[10px] ${
                                  currentView === 'photos' ? 'text-emerald-400 border border-emerald-500/20 bg-emerald-500/5' :
                                  currentView === 'cuts' ? 'text-cyan-400 border border-cyan-500/20 bg-cyan-500/5' :
                                  'text-rose-400 border border-rose-500/20 bg-rose-500/5'
                                }`}
                              >
                                {currentView === 'photos' ? photoFirstLevel :
                                 currentView === 'cuts' ? videoCutsFirstLevel :
                                 videosFirstLevel}
                              </button>
                            </>
                          )}

                          {/* Nested paths after categories removed to show only up to category first level (Event) */}
                        </div>
                        <h2 className="hidden sm:block text-[10px] sm:text-xs font-black text-white uppercase tracking-widest mt-0.5">
                          {currentView === 'movies' && 'MOVIES'}
                          {currentView === 'photos' && 'PHOTOS'}
                          {currentView === 'cuts' && 'VIDEO CUTS'}
                          {currentView === 'offline' && 'OFFLINE VIDEOS'}
                          {currentView === 'favorites' && 'FAVORITES'}
                        </h2>
                      </div>
                    </div>

                    {/* Universal Search & Download Action Bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                      
                      {/* Search Input and Rescan row */}
                      <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1">
                        {/* Back Button */}
                        <button
                          onClick={handleGoBack}
                          className={
                            isScrolled 
                              ? "fixed top-[72px] left-4 sm:relative sm:top-auto sm:left-auto md:hidden z-50 flex items-center justify-center p-2.5 bg-zinc-950/95 backdrop-blur-md border border-white/10 hover:border-amber-500/40 text-zinc-400 hover:text-amber-400 active:scale-95 transition-all rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)] select-none shrink-0 cursor-pointer group"
                              : "md:hidden flex items-center justify-center p-2.5 bg-zinc-950/40 backdrop-blur-md border border-white/10 hover:border-amber-500/40 text-zinc-400 hover:text-amber-400 active:scale-95 transition-all rounded-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] select-none shrink-0 cursor-pointer group"
                          }
                          title="Go Back"
                        >
                          <ArrowLeft className="w-3.5 h-3.5 text-amber-500 group-hover:-translate-x-0.5 transition-transform" />
                        </button>

                        {/* Layout placeholder to prevent remaining controls from shifting when the back button is fixed */}
                        {isScrolled && (
                          <div className="w-[36px] h-[36px] md:hidden sm:hidden shrink-0" />
                        )}

                        {/* Rescan & Reload Button */}
                        <button
                          onClick={() => syncWithCloudflare(true)}
                          disabled={isLoading}
                          className={`${selectedMovie ? 'hidden sm:flex' : 'flex'} items-center justify-center gap-1.5 px-2.5 bg-zinc-950/40 backdrop-blur-md border border-white/10 hover:border-amber-500/40 text-zinc-400 hover:text-amber-400 active:scale-95 transition-all rounded-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] disabled:opacity-40 select-none shrink-0 group h-[34px]`}
                          title="Rescan & reload thumbnails and assets from source"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-500' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                          <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline">Rescan</span>
                        </button>

                        {/* Search Input */}
                        <div className={`relative flex-1 md:w-[480px] lg:w-[560px] ${selectedMovie ? 'hidden sm:block' : 'block'}`}>
                          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={searchDraft}
                            onFocus={() => setIsSearchFocused(true)}
                            onBlur={() => {
                              setTimeout(() => setIsSearchFocused(false), 200);
                            }}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSearchDraft(val);
                              if (val.trim() === '') {
                                setSearchQuery('');
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setSearchQuery(searchDraft);
                                setIsSearchFocused(false);
                              }
                            }}
                            placeholder="Search..."
                            className="w-full bg-zinc-950/30 backdrop-blur-md border border-white/10 focus:border-amber-500/50 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-zinc-500 outline-none transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] focus:shadow-[0_0_15px_rgba(245,158,11,0.15),inset_0_1px_1px_rgba(255,255,255,0.05)] h-[34px]"
                          />
                          {searchDraft && (
                            <button 
                              onClick={() => {
                                  setSearchDraft('');
                                  setSearchQuery('');
                              }} 
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Dynamic & Advanced Suggestions Dropdown (Glassmorphism design) */}
                          {isSearchFocused && searchDraft.trim().length > 0 && (() => {
                            const allM = getAllMovies();
                            const query = searchDraft.toLowerCase().trim();
                            const matchedMovies = allM.filter(m => 
                              m.title.toLowerCase().includes(query) || 
                              m.originalTitle.toLowerCase().includes(query)
                            ).slice(0, 5);

                            const matchedSongs = allM.flatMap(m => 
                              (m.songs || []).map(s => ({ ...s, movie: m }))
                            ).filter(s => 
                              s.title.toLowerCase().includes(query) || 
                              s.singers.toLowerCase().includes(query)
                            ).slice(0, 5);

                            if (matchedMovies.length === 0 && matchedSongs.length === 0) {
                              return null;
                            }

                            return (
                              <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-950/60 backdrop-blur-2xl border border-white/10 rounded-xl shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.15),0_12px_40px_rgba(0,0,0,0.7)] max-h-80 overflow-y-auto z-50 divide-y divide-white/5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                {matchedMovies.length > 0 && (
                                  <div className="p-2">
                                    <div className="text-[10px] uppercase font-mono font-black text-amber-500 px-2 py-1 select-none text-left">
                                      Films
                                    </div>
                                    {matchedMovies.map(movie => (
                                      <div
                                        key={`sug-movie-${movie.id}`}
                                        onMouseDown={() => {
                                          setCurrentView('movies');
                                          setSelectedMovie(movie);
                                          setSearchQuery('');
                                          setSearchDraft('');
                                        }}
                                        className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors group"
                                      >
                                        <img 
                                          src={getOptimizedImageUrl(movie.posterUrl, 'low')} 
                                          alt="" 
                                          className="w-8 h-10 object-cover rounded border border-white/10"
                                          referrerPolicy="no-referrer"
                                        />
                                        <div className="flex-1 min-w-0 text-left">
                                          <p className="text-xs font-bold text-zinc-100 group-hover:text-amber-500 transition-colors truncate">
                                            {movie.title}
                                          </p>
                                          <p className="text-[10px] text-zinc-500 font-mono">
                                            {movie.eraCategory}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {matchedSongs.length > 0 && (
                                  <div className="p-2">
                                    <div className="text-[10px] uppercase font-mono font-black text-emerald-500 px-2 py-1 select-none text-left">
                                      Soundtracks & Songs
                                    </div>
                                    {matchedSongs.map(song => (
                                      <div
                                        key={`sug-song-${song.id}`}
                                        onMouseDown={() => {
                                          setCurrentView('movies');
                                          setSelectedMovie(song.movie);
                                          setActiveMovieTab('songs');
                                          handlePlaySong(song);
                                          setSearchQuery('');
                                          setSearchDraft('');
                                        }}
                                        className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors group"
                                      >
                                        <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                          <Music className="w-3.5 h-3.5 text-emerald-400 group-hover:animate-pulse" />
                                        </div>
                                        <div className="flex-1 min-w-0 text-left">
                                          <p className="text-xs font-bold text-zinc-100 group-hover:text-emerald-400 transition-colors truncate">
                                            {song.title}
                                          </p>
                                          <p className="text-[10px] text-zinc-500 truncate">
                                            <span className="text-zinc-600 font-mono">from {song.movie.title}</span>
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Grid View Controls (Cozy, Standard, Compact) with Liquid Glass dropdown design */}
                        {(currentView === 'movies' || currentView === 'photos' || currentView === 'cuts' || currentView === 'offline' || currentView === 'favorites') && (
                          <div className={`relative text-left ${selectedMovie ? 'hidden sm:inline-block' : 'inline-block'}`} id="grid-density-dropdown-container">
                            <button
                              onClick={() => setIsDensityDropdownOpen(!isDensityDropdownOpen)}
                              className="flex items-center gap-1 bg-zinc-950/40 backdrop-blur-md border border-white/10 hover:border-amber-500/50 rounded-xl px-2 shadow-md transition-all duration-300 h-[34px] shrink-0 cursor-pointer text-zinc-300 hover:text-white select-none text-[10px] font-bold tracking-wide"
                              title="Grid Density"
                            >
                              {gridDensity === 'cozy' ? (
                                <LayoutGrid className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                              ) : gridDensity === 'standard' ? (
                                <Grid className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                              ) : (
                                <List className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                              )}
                              <span className="text-[10px] font-black uppercase tracking-wider hidden xs:inline">
                                {gridDensity === 'cozy' ? 'Standard' : gridDensity === 'standard' ? 'Small' : 'Compact'}
                              </span>
                            </button>

                            {isDensityDropdownOpen && (
                              <>
                                {/* Click overlay to close */}
                                <div 
                                  className="fixed inset-0 z-40" 
                                  onClick={() => setIsDensityDropdownOpen(false)} 
                                />
                                <div className="absolute right-0 mt-1.5 w-36 origin-top-right rounded-xl border border-white/10 bg-zinc-950/70 backdrop-blur-xl shadow-xl shadow-black/40 ring-1 ring-black/10 focus:outline-none z-50 p-1 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                                  <button
                                    onClick={() => {
                                      setGridDensity('cozy');
                                      setIsDensityDropdownOpen(false);
                                    }}
                                    className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center gap-2 transition-all duration-200 ${
                                      gridDensity === 'cozy'
                                        ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/10'
                                        : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                                    }`}
                                  >
                                    <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Standard</span>
                                  </button>
                                  
                                  <button
                                    onClick={() => {
                                      setGridDensity('standard');
                                      setIsDensityDropdownOpen(false);
                                    }}
                                    className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center gap-2 transition-all duration-200 ${
                                      gridDensity === 'standard'
                                        ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/10'
                                        : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                                    }`}
                                  >
                                    <Grid className="w-3.5 h-3.5 shrink-0" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Small</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setGridDensity('compact');
                                      setIsDensityDropdownOpen(false);
                                    }}
                                    className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center gap-2 transition-all duration-200 ${
                                      gridDensity === 'compact'
                                        ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/10'
                                        : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                                    }`}
                                  >
                                    <List className="w-3.5 h-3.5 shrink-0" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Compact</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* Movie Sort Controls with Liquid Glass dropdown design (Very small, next to search) */}
                        {currentView === 'movies' && (
                          <div className={`relative items-center gap-1 ${selectedMovie ? 'hidden sm:flex' : 'flex'}`} id="movie-sort-dropdown-container">
                            <button
                              onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                              className="flex items-center gap-1 bg-zinc-950/40 backdrop-blur-md border border-white/10 hover:border-amber-500/50 rounded-xl px-2 shadow-md transition-all duration-300 h-[34px] shrink-0 cursor-pointer group/sort text-zinc-300 hover:text-white select-none text-[10px] font-bold tracking-wide"
                              title="Sort Options"
                            >
                              <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                                {movieSortField}
                              </span>
                              <span className="text-zinc-400 font-mono font-black text-xs">
                                {movieSortOrder === 'asc' ? '↑' : '↓'}
                              </span>
                            </button>

                            {isSortDropdownOpen && (
                              <>
                                {/* Click overlay to close */}
                                <div 
                                  className="fixed inset-0 z-40" 
                                  onClick={() => setIsSortDropdownOpen(false)} 
                                />
                                <div className="absolute right-0 mt-1.5 w-40 origin-top-right rounded-xl border border-white/10 bg-zinc-950/70 backdrop-blur-xl shadow-xl shadow-black/40 ring-1 ring-black/10 focus:outline-none z-50 p-1 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                                  {(['name', 'size', 'length'] as const).map((field) => (
                                    <button
                                      key={field}
                                      onClick={() => {
                                        if (movieSortField === field) {
                                          // Toggle direction if already selected
                                          setMovieSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                                        } else {
                                          setMovieSortField(field);
                                        }
                                        setIsSortDropdownOpen(false);
                                      }}
                                      className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center justify-between transition-all duration-200 ${
                                        movieSortField === field
                                          ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/10'
                                          : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                                      }`}
                                    >
                                      <span className="text-[10px] font-black uppercase tracking-wider">
                                        {field}
                                      </span>
                                      {movieSortField === field && (
                                        <span className="text-[8px] font-black bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 border border-amber-500/20">
                                          {movieSortOrder === 'asc' ? 'ASC ↑' : 'DESC ↓'}
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        {/* Mobile Favorite (now Google Drive folder link) & Rating inside the header row when movie is selected */}
                        {selectedMovie && (
                          <div className="flex sm:hidden items-center gap-2 ml-auto shrink-0">
                            <button
                              onClick={() => {
                                triggerHaptic('medium');
                                window.open('https://drive.google.com/drive/folders/1hpceSs2QqY2neNWWr8wdChrkfskZNT-m?usp=drive_link', '_blank', 'noopener,noreferrer');
                              }}
                              className="flex items-center gap-1 bg-zinc-950/40 backdrop-blur-md border border-white/10 hover:border-amber-500/50 rounded-xl px-2 shadow-md transition-all duration-300 h-[34px] shrink-0 cursor-pointer text-zinc-300 hover:text-white select-none text-[10px] font-bold tracking-wide"
                              title="Open Google Drive Folder"
                            >
                              <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                                DRIVE
                              </span>
                            </button>
                            
                            <div className="bg-zinc-950/60 px-3 py-2 rounded-xl text-xs font-mono text-amber-500 border border-white/10 backdrop-blur-md flex items-center gap-1.5">
                              <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                              <span className="font-bold">{selectedMovie.rating}</span>
                            </div>
                          </div>
                        )}
                      </div>
 


                      {/* Bulk Download Button */}
                      {currentView === 'favorites' && (
                        <button
                          onClick={triggerBulkDownload}
                          className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 border bg-red-500 text-zinc-50 border-red-500 hover:bg-red-400 cursor-pointer shadow-lg shadow-red-500/25 shrink-0"
                          title="Bulk download visible files as ZIP archive"
                        >
                          <Download className="w-4 h-4 animate-bounce" />
                          <span>Bulk Download</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* VIEW - STAGE: MOVIES */}
            <div className={currentView === 'movies' ? "block w-full" : "hidden"}>
              {(() => {
                const movies = getFilteredMovies();
              
              if (selectedMovie) {
                // RENDER IMMERSIVE CINEMATIC MOVIE DETAIL PAGE
                return (
                  <div className="flex flex-col gap-8 pb-10 w-full" id="movie-detail-view">
                    {/* Cinematic Wide Banner Cover */}
                    <div className="relative hidden sm:block h-64 md:h-[400px] rounded-3xl overflow-hidden border border-zinc-900 shadow-2xl">
                      <img 
                        src={getOptimizedImageUrl(selectedMovie.bannerUrl, 'medium')} 
                        alt={selectedMovie.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
                      
                      {/* Google Drive Folder button & Rating Row inside cinematic banner */}
                      <div className="absolute top-6 right-6 flex items-center gap-2 z-20">
                        <button
                          onClick={() => {
                            triggerHaptic('medium');
                            window.open('https://drive.google.com/drive/folders/1hpceSs2QqY2neNWWr8wdChrkfskZNT-m?usp=drive_link', '_blank', 'noopener,noreferrer');
                          }}
                          className="flex items-center gap-1.5 bg-zinc-950/60 backdrop-blur-md border border-white/10 hover:border-amber-500/50 rounded-xl px-3 py-2 shadow-md transition-all duration-300 text-zinc-300 hover:text-white select-none text-xs font-bold tracking-wide cursor-pointer"
                          title="Open Google Drive Folder"
                        >
                          <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                            DRIVE
                          </span>
                        </button>
                        
                        <div className="bg-zinc-950/60 px-3 py-2 rounded-xl text-xs font-mono text-amber-500 border border-white/10 backdrop-blur-md flex items-center gap-1.5">
                          <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                          <span className="font-bold">{selectedMovie.rating}</span>
                        </div>
                      </div>
                      
                      {/* Spotlight Text Overlay */}
                      <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3 items-start">
                        <h1 className="text-xl md:text-5xl font-black text-white uppercase tracking-tight leading-none md:truncate flex-1">
                          {selectedMovie.title}
                        </h1>
                        <span className="text-zinc-300 text-xs font-mono bg-black/60 px-2.5 py-1 rounded-md border border-zinc-800/80 shrink-0">
                          {selectedMovie.runTime} mins
                        </span>
                      </div>
                    </div>

                    {/* Two-column layout: Left column poster/stream, Right column synced audio tracklist & Spotify-type player */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                      
                      {/* Left side column: Poster Card and streaming/download actions */}
                      <div className="lg:col-span-4 flex flex-col gap-6">
                        
                        {/* Beautiful Poster Card with Glass & Claymorphism */}
                        <div className="bg-zinc-900/40 backdrop-blur-md p-4 rounded-3xl border border-zinc-800/50 shadow-[0_12px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.05)]">
                          <img 
                            src={getOptimizedImageUrl(selectedMovie.posterUrl, 'medium')} 
                            alt={selectedMovie.title} 
                            className="w-full aspect-[2/3] object-cover rounded-2xl border border-zinc-800/80 shadow-md"
                            referrerPolicy="no-referrer"
                          />
                        </div>

                        {/* Streaming & Download actions with Glass & Claymorphism */}
                        <div className="bg-zinc-900/40 backdrop-blur-md p-5 border border-zinc-800/50 rounded-2xl flex flex-col gap-4 shadow-[0_12px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.05)]">
                          
                          {selectedMovie.movieUrl ? (
                            <>
                              <button
                                onClick={() => setMovieVideoUrl(selectedMovie.movieUrl)}
                                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-amber-500/15"
                              >
                                <Play className="w-4 h-4 fill-zinc-950" />
                                <span>PLAY NOW</span>
                              </button>

                              <button
                                onClick={() => {
                                  let targetKey = selectedMovie.movieUrl || '';
                                  let targetUrl = selectedMovie.movieUrl || '';
                                  let targetFilename = selectedMovie.title ? `${selectedMovie.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4` : 'movie.mp4';

                                  const isAdhurs = selectedMovie.title?.toLowerCase().includes('adhurs');
                                  if (isAdhurs) {
                                    targetKey = 'Movies/Adhurs (2010).mp4';
                                    targetUrl = 'https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev/Movies/Adhurs%20(2010).mp4';
                                    targetFilename = 'Adhurs (2010).mp4';
                                  } else if (selectedMovie.id) {
                                    targetKey = selectedMovie.id;
                                  }

                                  showToast(`Download started for "${selectedMovie.title}"`, 'success');
                                  triggerSingleDownload(targetUrl, targetFilename, targetKey);
                                }}
                                className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/80 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md select-none"
                              >
                                <Download className="w-4 h-4 text-amber-500" />
                                <span>Download ({selectedMovie.fileSize ? `${(selectedMovie.fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB` : '1.38 GB'})</span>
                              </button>
                            </>
                          ) : (
                            <div className="text-center py-4 bg-zinc-950/40 rounded-xl border border-zinc-900/60 p-4">
                              <Database className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
                              <p className="text-[10px] text-zinc-500 leading-relaxed text-center">
                                S3 direct streaming is unavailable for this catalog file.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right side column: Audio tracklist (soundtrack is enough) */}
                      <div className="lg:col-span-8 flex flex-col gap-6">
                        <div className="bg-zinc-900/40 backdrop-blur-md p-6 border border-zinc-800/50 rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.05)]">
                          <div className="flex items-center justify-between mb-4 border-b border-zinc-800/60 pb-3">
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-wider text-amber-500">Soundtrack</h3>
                            </div>
                          </div>

                          {(() => {
                            const movieSongsList = getMovieAudioSongs(selectedMovie);
                            if (movieSongsList.length === 0) {
                              return (
                                <p className="text-zinc-500 text-xs italic py-4">No soundtrack files found in S3 bucket directory.</p>
                              );
                            }

                            // Place all audio songs sorted alphabetically by name
                            const sortedSongsList = [...movieSongsList].sort((a, b) => a.title.localeCompare(b.title));

                            return (
                              <div className="flex flex-col gap-2.5">
                                {sortedSongsList.map((song: Song, index: number) => {
                                  const isSelected = currentAudioSong?.id === song.id;
                                  const isPlaying = isSelected && isPlayingAudio;
                                  const isItemSelected = isMobile && isSelectMode && selectedItems.some(x => x.id === song.id);
                                  
                                  // 16 bars for a real high-fidelity spectrum visualizer
                                  const totalBars = 16;
                                  
                                  return (
                                    <div 
                                      key={song.id}
                                      onClick={() => {
                                        if (isMobile && isSelectMode) {
                                          toggleSelection(song, 'song');
                                        } else {
                                          handlePlaySong(song);
                                        }
                                      }}
                                      className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer group/track transition-all ${
                                        isSelected 
                                          ? 'liquid-glass-song-selected' 
                                          : 'liquid-glass-song'
                                      } ${isItemSelected ? 'ring-2 ring-amber-500 scale-[0.98]' : ''}`}
                                    >
                                      {/* Left block: Liquid Glass styled Song details */}
                                      <div className="min-w-0 pr-2 flex items-center gap-2 w-[45%] sm:w-1/3 shrink-0">
                                        {/* Selection checkbox indicator inside song row */}
                                        {isMobile && isSelectMode && (
                                          <div className="w-5 h-5 rounded-full flex items-center justify-center border-2 border-zinc-500 bg-black/45 shadow-sm shrink-0">
                                            {isItemSelected && (
                                              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                                            )}
                                          </div>
                                        )}
                                        <div className="flex flex-col min-w-0 w-full">
                                          <h5 className={`text-xs sm:text-sm font-black tracking-wide truncate transition-colors ${
                                            isSelected 
                                              ? 'text-amber-500 drop-shadow-[0_2px_10px_rgba(245,158,11,0.2)]' 
                                              : 'text-zinc-100 group-hover/track:text-white'
                                          }`}>
                                            {song.title}
                                          </h5>
                                        </div>
                                      </div>

                                      {/* Middle block: Realistic 16-Bar High-Fidelity Audio Visualizer */}
                                      <div className="flex flex-1 items-center justify-center px-1 sm:px-6 min-w-0 overflow-hidden">
                                        <div className="h-5 sm:h-6 flex items-end gap-[1.5px] sm:gap-[3px] select-none py-0.5">
                                          {Array.from({ length: totalBars }).map((_, barIdx) => {
                                            // Assign different animation classes cyclically (1 to 5)
                                            const animNum = (barIdx % 5) + 1;
                                            
                                            // Real-looking static heights for frozen/paused state (bell curve shape)
                                            const staticHeights = [
                                              'h-1.5', 'h-2.5', 'h-4', 'h-5', 
                                              'h-4.5', 'h-3.5', 'h-2', 'h-1.5',
                                              'h-2', 'h-3', 'h-4.5', 'h-5',
                                              'h-4', 'h-3', 'h-2', 'h-1'
                                            ];
                                            
                                            // Inactive static wave height
                                            const inactiveHeights = [
                                              'h-1', 'h-1', 'h-1.5', 'h-2',
                                              'h-1.5', 'h-1', 'h-1', 'h-1',
                                              'h-1', 'h-1.5', 'h-2', 'h-1.5',
                                              'h-1', 'h-1', 'h-1', 'h-1'
                                            ];

                                            const currentHeightClass = isSelected 
                                              ? (isPlaying ? '' : staticHeights[barIdx])
                                              : inactiveHeights[barIdx];

                                            return (
                                              <div
                                                key={barIdx}
                                                className={`w-[1.5px] sm:w-[3px] rounded-full transition-all duration-300 ${
                                                  isSelected
                                                    ? isPlaying 
                                                      ? `bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-eq-${animNum}` 
                                                      : 'bg-amber-500/70'
                                                      : 'bg-zinc-800/60 group-hover/track:bg-zinc-600/60'
                                                } ${currentHeightClass}`}
                                                style={{
                                                  // Delay each bar slightly for a sweeping visualizer wave effect
                                                  animationDelay: isPlaying ? `${barIdx * 60}ms` : undefined,
                                                }}
                                              />
                                            );
                                          })}
                                        </div>
                                      </div>

                                      {/* Right block: Duration + Favorite Button */}
                                      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 w-[30%] sm:w-1/4 justify-end">
                                        <span className={`text-[10px] sm:text-xs font-mono font-bold tracking-wider transition-colors ${
                                          isSelected ? 'text-amber-500' : 'text-zinc-500 group-hover/track:text-zinc-300'
                                        }`}>
                                          {exactDurations[song.id] || song.duration || '3:30'}
                                        </span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleFavorite(song.id);
                                          }}
                                          className={`p-1 sm:p-1.5 rounded-lg border transition-all ${
                                            isItemFavorited(song.id)
                                              ? 'bg-red-500/15 border-red-500/20 text-red-500'
                                              : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800'
                                          }`}
                                          title="Add to Favorites"
                                        >
                                          <Heart className={`w-3 sm:w-3.5 h-3 sm:h-3.5 ${isItemFavorited(song.id) ? 'fill-red-500' : ''}`} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                    </div>
                  </div>
                );
              }

            // RENDER CINEMATIC LANDING LISTING PAGE (Spotlight + Portrait Grid)
              const carouselMovies = getCarouselMovies(movies);
              const activeCarouselIndex = carouselIndex < carouselMovies.length ? carouselIndex : 0;
              const featuredMovie = carouselMovies[activeCarouselIndex] || movies[0];

              return (
                <div className="animate-fade-in flex flex-col gap-10">
                  {/* FEATURED CINEMATIC HERO CAROUSEL */}
                  {carouselMovies.length > 0 && !searchQuery && (
                    <div className="relative rounded-3xl overflow-hidden border border-zinc-900/80 shadow-2xl aspect-[16/9] md:aspect-auto md:h-[520px] lg:h-[620px] xl:h-[700px] w-full group select-none bg-zinc-950">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={featuredMovie.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.6, ease: "easeInOut" }}
                          className="absolute inset-0 w-full h-full"
                        >
                          {/* Active Slide Image */}
                          <img 
                            src={getOptimizedImageUrl(featuredMovie.bannerUrl, isMobile ? 'medium' : 'original')} 
                            alt={featuredMovie.title}
                            className="w-full h-full object-cover transition-transform duration-700 ease-in-out transform hover:scale-[1.01]"
                            referrerPolicy="no-referrer"
                          />
                          
                          {/* Mobile-only gradient overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent md:hidden" />
                          
                          {/* Desktop-only dual gradient overlay for ultimate legibility */}
                          <div className="hidden md:block absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent z-[1]" />
                          <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-black/95 via-black/45 to-transparent z-[1]" />
                          
                          {/* Hero content overlay (Mobile) */}
                          <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-col items-start gap-2.5 md:hidden">
                            <h1 className="text-base sm:text-xl font-sans font-black text-white uppercase tracking-tight leading-none text-shadow-md">
                              {featuredMovie.title}
                            </h1>
                            <button
                              onClick={() => setSelectedMovie(featuredMovie)}
                              className="px-2.5 py-0.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-[8px] uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 cursor-pointer"
                            >
                              <Play className="w-2.5 h-2.5 fill-zinc-950" />
                              <span>Watch Now</span>
                            </button>
                          </div>

                          {/* Hero content overlay (Desktop - Beautiful, spacious and extremely premium) */}
                          <div className="hidden md:flex absolute bottom-12 left-12 right-12 z-10 flex-col items-start gap-4 max-w-2xl animate-fade-in">
                            {/* Main Title */}
                            <h1 className="text-4xl lg:text-5xl xl:text-6xl font-sans font-black text-white uppercase tracking-tight leading-tight drop-shadow-lg">
                              {featuredMovie.title}
                            </h1>

                            {/* Cinematic Metadata Row */}
                            <div className="flex items-center gap-4 text-xs font-bold text-zinc-300">
                              <span className="text-amber-400">★ {featuredMovie.rating}/10</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                              <span>{featuredMovie.releaseYear}</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                              <span>{Math.floor(featuredMovie.runTime / 60)}h {featuredMovie.runTime % 60}m</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                              <span className="px-1.5 py-0.5 border border-zinc-700 rounded text-[10px] uppercase text-zinc-400 font-medium">
                                {featuredMovie.language}
                              </span>
                            </div>

                            {/* Primary Action Buttons */}
                            <div className="flex items-center gap-3 mt-2">
                              <button
                                onClick={() => setSelectedMovie(featuredMovie)}
                                className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-2xl text-xs uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5 fill-zinc-950 text-zinc-950" />
                                <span>Watch Now</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      </AnimatePresence>

                      {/* Carousel Arrow Navigation (Left & Right) */}
                      {carouselMovies.length > 1 && (
                        <>
                          <button
                            onClick={() => setCarouselIndex(prev => (prev - 1 + carouselMovies.length) % carouselMovies.length)}
                            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 md:p-3 rounded-full hover:bg-amber-500 hover:text-zinc-950 text-zinc-300 border border-white/10 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 active:scale-90 flex items-center justify-center cursor-pointer shadow-xl z-20"
                            style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0,0,0,0.35)' }}
                            title="Previous Slide"
                          >
                            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                          </button>
                          <button
                            onClick={() => setCarouselIndex(prev => (prev + 1) % carouselMovies.length)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 md:p-3 rounded-full hover:bg-amber-500 hover:text-zinc-950 text-zinc-300 border border-white/10 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 active:scale-90 flex items-center justify-center cursor-pointer shadow-xl z-20"
                            style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0,0,0,0.35)' }}
                            title="Next Slide"
                          >
                            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                          </button>
                        </>
                      )}

                      {/* Slide Indicator Dots */}
                      {carouselMovies.length > 1 && (
                        <div className="absolute bottom-4 right-6 md:bottom-8 md:right-12 flex items-center gap-2 z-10 bg-black/40 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-sm">
                          {carouselMovies.map((m, idx) => (
                            <button
                              key={m.id}
                              onClick={() => setCarouselIndex(idx)}
                              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                                idx === activeCarouselIndex 
                                  ? 'w-6 bg-amber-500' 
                                  : 'w-1.5 bg-zinc-600 hover:bg-zinc-400'
                              }`}
                              title={`Go to slide ${idx + 1}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PORTRAIT POSTER GALLERY GRID */}
                  <div>
                    {movies.length === 0 ? (
                      <div className="text-center py-24 bg-zinc-900/10 border border-zinc-900 rounded-3xl">
                        <Film className="w-12 h-12 text-zinc-700 mx-auto mb-4 animate-pulse" />
                        <h3 className="font-bold text-zinc-300 text-sm">No matching movies in S3 R2 bucket</h3>
                        <p className="text-zinc-600 text-xs mt-1 max-w-sm mx-auto leading-relaxed">
                          Upload movie files to <code className="text-amber-500/80 font-mono">ntrfilmography/Movies/</code> or posters/banners to <code className="text-amber-500/80 font-mono">ntrfilmography/Movie Posters/</code> in your R2 bucket.
                        </p>
                      </div>
                    ) : (
                      <div className={`grid ${
                        isMobile
                          ? (gridDensity === 'cozy' 
                              ? 'grid-cols-2 gap-4' 
                              : gridDensity === 'standard' 
                                ? 'grid-cols-3 gap-3' 
                                : 'grid-cols-4 gap-2')
                          : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6'
                      }`} id="movies-grid">
                        {movies.map((movie) => (
                          <div
                            key={movie.id}
                            onClick={() => setSelectedMovie(movie)}
                            className={`group relative cursor-pointer flex flex-col overflow-hidden border border-zinc-800/40 bg-zinc-900/40 backdrop-blur-md hover:border-amber-500/40 shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-[0_0_24px_rgba(245,158,11,0.25)] transition-all duration-300 active:scale-95 ${
                              isMobile
                                ? (gridDensity === 'cozy' 
                                    ? 'rounded-2xl pt-2 px-2 pb-1.5' 
                                    : gridDensity === 'standard' 
                                      ? 'rounded-xl pt-1 px-1 pb-0.5' 
                                      : 'rounded-lg p-0.5')
                                : 'rounded-2xl pt-2.5 px-2.5 pb-2 sm:pt-3 sm:px-3 sm:pb-2'
                            }`}
                          >
                            {/* Portrait Poster Image Container with Glass highlight and clay inset */}
                            <div className={`relative aspect-[2/3] overflow-hidden bg-zinc-950/60 border border-zinc-900/60 shadow-inner ${
                              isMobile
                                ? (gridDensity === 'cozy' 
                                    ? 'rounded-xl' 
                                    : gridDensity === 'standard' 
                                      ? 'rounded-lg' 
                                      : 'rounded-md')
                                : 'rounded-xl'
                            }`}>
                              <img
                                src={getOptimizedImageUrl(movie.posterUrl, 'low')}
                                alt={movie.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                referrerPolicy="no-referrer"
                                loading="lazy"
                              />
                              
                              {/* Glowing bottom gradient */}
                              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />

                              {/* Hover Play Button Overlay with tactile visual feedback */}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-black/45 backdrop-blur-xs">
                                <div className="w-11 h-11 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center shadow-[0_4px_12px_rgba(245,158,11,0.4),inset_0_2px_4px_rgba(255,255,255,0.4)] border border-amber-400 transform scale-90 group-hover:scale-100 transition-all">
                                  <Play className="w-5 h-5 fill-zinc-950 text-zinc-950 ml-0.5" />
                                </div>
                              </div>
                            </div>

                            {/* Text Metadata */}
                            <div className={`pt-1 pb-0 px-0.5 flex flex-col justify-center items-center gap-0.5 ${
                              isMobile && gridDensity === 'compact' ? 'pt-0.5 pb-0 gap-0' : ''
                            }`}>
                              <p className={`font-black text-white group-hover:text-amber-400 uppercase tracking-wide truncate transition-colors text-center w-full ${
                                isMobile
                                  ? (gridDensity === 'cozy' 
                                      ? 'text-xs' 
                                      : gridDensity === 'standard' 
                                        ? 'text-[10px]' 
                                        : 'text-[8px]')
                                  : 'text-xs sm:text-sm'
                              }`}>
                                {movie.title}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            </div>

            {/* VIEW - STAGE: PHOTOS */}
            <div className={currentView === 'photos' && activePhotoSubView === 'selected' ? "block w-full" : "hidden"}>
              {(() => {
                const activeNode = parsedBucketData.photos.folders[photoFirstLevel] as FolderNode | undefined;

              if (!activeNode) {
                return (
                  <div className="text-center py-16 bg-zinc-900/10 border border-zinc-900 rounded-2xl">
                    <ImageIcon className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                    <h4 className="text-sm font-bold text-zinc-400">No folder found in Photos</h4>
                    <p className="text-xs text-zinc-600 mt-1">Upload files under Photos/ in your R2 bucket to sync</p>
                  </div>
                );
              }

              // Filter subfolders of the active first-level node using searchQuery and sort alphabetically
              const subFolders = (Object.values(activeNode.folders) as FolderNode[]).filter((node: FolderNode) => {
                if (!searchQuery) return true;
                return node.name.toLowerCase().includes(searchQuery.toLowerCase());
              }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

              // When a folder in the stack is selected
              if (photoFolderStack.length > 0) {
                const currentActiveFolder = photoFolderStack[photoFolderStack.length - 1];
                const nestedFolders = Object.values(currentActiveFolder.folders) as FolderNode[];
                const hasSubFolders = nestedFolders.length > 0;

                // Sort and filter subfolders
                const filteredSubFolders = nestedFolders.filter((node: FolderNode) => {
                  if (!searchQuery) return true;
                  return node.name.toLowerCase().includes(searchQuery.toLowerCase());
                }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

                // Filter photos in this folder recursively
                const photosInFolder = getAllFilesRecursive(currentActiveFolder).filter((photo) => {
                  if (!searchQuery) return true;
                  return (
                    photo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    photo.description.toLowerCase().includes(searchQuery.toLowerCase())
                  );
                });

                return (
                  <div id="photos-grid" className="flex flex-col gap-6">
                    {/* Breadcrumbs header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-zinc-950/35 border border-zinc-900/60 p-2 sm:p-2.5 rounded-xl mt-[-12px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => { triggerHaptic('light'); setPhotoFolderStack(prev => prev.slice(0, -1)); }}
                          className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 hover:text-emerald-300 rounded-lg text-[10px] font-bold transition-all shrink-0 h-7 shadow-[0_0_10px_rgba(16,185,129,0.1)] cursor-pointer"
                        >
                          <ArrowLeft className="w-3 h-3 text-emerald-400" />
                          <span>Back</span>
                        </button>
                        {photoFolderStack.map((node, index) => {
                          const isLast = index === photoFolderStack.length - 1;
                          return (
                            <React.Fragment key={`breadcrumb-inline-${index}`}>
                              <span className="text-zinc-700 shrink-0 select-none text-[10px]">/</span>
                              <button
                                onClick={() => {
                                  triggerHaptic('light');
                                  setPhotoFolderStack(photoFolderStack.slice(0, index + 1));
                                }}
                                className={`text-[8.5px] font-extrabold uppercase tracking-widest truncate max-w-[80px] sm:max-w-[120px] md:max-w-[150px] shrink-0 hover:text-white transition-all duration-200 ${
                                  isLast ? 'text-emerald-400/90' : 'text-zinc-400'
                                }`}
                              >
                                {node.name.replace(/_/g, ' ')}
                              </button>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sub-tabs / Sub-folders Grid */}
                    {hasSubFolders && (
                      <div className="flex flex-col gap-3">
                        {photoFolderStack.length > 1 && (
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">folders</span>
                          </div>
                        )}
                        {filteredSubFolders.length === 0 ? (
                          <div className="text-center py-8 bg-zinc-900/5 border border-zinc-900/40 rounded-xl">
                            <ImageIcon className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                            <h4 className="text-xs font-bold text-zinc-500">No matching sub-folders found</h4>
                          </div>
                        ) : (
                          <div className={`grid ${
                            isMobile
                              ? (gridDensity === 'cozy'
                                  ? 'grid-cols-2 gap-4'
                                  : gridDensity === 'standard'
                                    ? 'grid-cols-3 gap-3'
                                    : 'grid-cols-4 gap-2')
                              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6'
                          }`}>
                            {filteredSubFolders.map((node: FolderNode) => {
                              const recFiles = getAllFilesRecursive(node);
                              const count = recFiles.length;
                              
                              // Select portrait thumbnail (height > width) to match 2/3 ratio if possible
                              let thumbnail = '';
                              if (photoFirstLevel === 'Events' || photoFirstLevel.toLowerCase().includes('event')) {
                                thumbnail = getFolderThumbnail(node.name, recFiles.map(f => ({ imageUrl: f.imageUrl || f.videoUrl, dimensions: f.dimensions } as any)), undefined, 'photos');
                              }
                              if (!thumbnail && recFiles.length > 0) {
                                const portraitFile = recFiles.find(f => {
                                  if (f.dimensions) {
                                    const parts = f.dimensions.split('x');
                                    if (parts.length === 2) {
                                      const w = parseInt(parts[0], 10);
                                      const h = parseInt(parts[1], 10);
                                      return h > w;
                                    }
                                  }
                                  return false;
                                });
                                thumbnail = portraitFile ? (portraitFile.imageUrl || portraitFile.videoUrl) : (recFiles[0].imageUrl || recFiles[0].videoUrl);
                              }

                              return (
                                <div
                                  key={`subfolder-tab-${node.name}`}
                                  onClick={() => { triggerHaptic('light'); setPhotoFolderStack(prev => [...prev, node]); }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      triggerHaptic('light');
                                      setPhotoFolderStack(prev => [...prev, node]);
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  className={`relative aspect-[2/3] w-full overflow-hidden border border-zinc-900 bg-zinc-950/40 hover:scale-[1.02] group transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-lg select-none ${
                                    isMobile
                                      ? (gridDensity === 'cozy' 
                                          ? 'rounded-2xl hover:border-emerald-500/40' 
                                          : gridDensity === 'standard' 
                                            ? 'rounded-xl hover:border-emerald-500/30' 
                                            : 'rounded-lg hover:border-emerald-500/20')
                                      : 'rounded-2xl hover:border-emerald-500/40'
                                  }`}
                                >
                                  {thumbnail ? (
                                    <img
                                      src={getOptimizedImageUrl(thumbnail, 'low')}
                                      alt={node.name}
                                      referrerPolicy="no-referrer"
                                      className="absolute inset-0 w-full h-full object-cover object-[center_20%] transition-transform duration-500 group-hover:scale-105"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
                                      <ImageIcon className="w-8 h-8 text-zinc-700 animate-pulse" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent group-hover:via-black/45 transition-all duration-300" />
                                  <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center p-2.5 pb-3 sm:pb-3.5 text-center gap-1 sm:gap-1.5 z-10">
                                    <span className={`font-black text-white group-hover:text-emerald-400 transition-colors uppercase tracking-wider line-clamp-3 leading-snug drop-shadow-lg ${
                                      isMobile
                                        ? (gridDensity === 'cozy' 
                                            ? 'text-xs sm:text-sm md:text-base' 
                                            : gridDensity === 'standard' 
                                              ? 'text-[10px] sm:text-[11px] md:text-xs' 
                                              : 'text-[8px] sm:text-[9px]')
                                        : 'text-xs sm:text-sm md:text-base'
                                    }`}>
                                      {node.name.replace(/_/g, ' ')}
                                    </span>
                                    <div className="flex items-center justify-center">
                                      <span className={`font-semibold shrink-0 bg-black/40 text-zinc-300 border border-white/10 backdrop-blur-[2px] shadow-sm uppercase ${
                                        isMobile
                                          ? (gridDensity === 'cozy'
                                              ? 'text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wide'
                                              : gridDensity === 'standard'
                                                ? 'text-[8px] px-1.5 py-0.5 rounded-md font-bold'
                                                : 'text-[7px] px-1 py-0.5 rounded-sm font-extrabold')
                                          : 'text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wide'
                                      }`}>
                                        {count} Photos
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Photos List */}
                    {(!hasSubFolders || currentActiveFolder.files.length > 0) && (
                      <div className="flex flex-col gap-3">
                        {hasSubFolders && currentActiveFolder.files.length > 0 && (
                          <div className="flex items-center justify-between px-1 border-t border-zinc-900/50 pt-4 mt-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">photos</span>
                          </div>
                        )}
                        
                        {(() => {
                          const displayPhotos = hasSubFolders ? currentActiveFolder.files : photosInFolder;
                          
                          if (displayPhotos.length === 0) {
                            if (!hasSubFolders) {
                              return (
                                <div className="text-center py-16 bg-zinc-900/10 border border-zinc-900 rounded-2xl">
                                  <ImageIcon className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                                  <h4 className="text-sm font-bold text-zinc-400">No photos found in this folder</h4>
                                </div>
                              );
                            }
                            return null;
                          }

                          return (
                            /* Beautiful Uncropped Masonry Column Layout */
                            <div className={
                              isMobile
                                ? (gridDensity === 'cozy'
                                    ? 'columns-2 gap-4 space-y-4'
                                    : gridDensity === 'standard'
                                      ? 'columns-3 gap-3 space-y-3'
                                      : 'columns-4 gap-2 space-y-2')
                                : 'columns-4 gap-4 space-y-4'
                            }>
                              {displayPhotos.map((photo: any) => {
                                const isSelected = isMobile && isSelectMode && selectedItems.some(x => x.id === photo.id);
                                return (
                                  <div 
                                    key={photo.id}
                                    onClick={() => {
                                      if (isMobile && isSelectMode) {
                                        toggleSelection(photo, 'photo');
                                      } else {
                                        setActiveMediaItem(photo);
                                        setActiveMediaList(displayPhotos);
                                      }
                                    }}
                                    className={`break-inside-avoid relative inline-block w-full rounded-2xl overflow-hidden border border-zinc-900 bg-zinc-950/80 hover:border-emerald-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 cursor-pointer shadow-lg group mb-2 sm:mb-3 ${
                                      isSelected ? 'ring-2 ring-amber-500 scale-[0.96]' : ''
                                    }`}
                                  >
                                    <img 
                                      src={getOptimizedImageUrl(photo.imageUrl, 'low')} 
                                      alt={photo.title} 
                                      referrerPolicy="no-referrer"
                                      className="w-full h-auto object-contain transition-transform duration-500 group-hover:scale-105"
                                      loading="lazy"
                                    />

                                    {/* Selection indicator circle checkbox */}
                                    {isMobile && isSelectMode && (
                                      <div className="absolute top-2 right-2 z-30 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white bg-black/50 shadow-md">
                                        {isSelected && (
                                          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              }

              // Otherwise show list of sub-folders (second-level folders)
              return (
                <div id="photos-grid" className="flex flex-col gap-6">
                  
                  {/* Dynamic sub-tabs (First-level folder selection) */}
                  <div className="w-full overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 pb-3 md:pb-4 border-b border-zinc-900/60 flex items-center scroll-smooth">
                    <div className="flex flex-nowrap md:flex-wrap items-center gap-2.5 min-w-max">
                      {sortCategoryKeys(Object.keys(parsedBucketData.photos.folders)).map((folderName) => {
                        const isSelected = folderName === photoFirstLevel;
                        return (
                          <button
                            key={folderName}
                            onClick={() => {
                              setPhotoFirstLevel(folderName);
                              setSelectedPhotoFolderNode(null);
                            }}
                            className={`px-4 py-1.5 md:px-5 md:py-2.5 rounded-xl text-[11px] md:text-xs font-black uppercase tracking-wider transition-all duration-300 border ${
                              isSelected
                                ? 'bg-emerald-500 text-zinc-950 border-emerald-500 shadow-md'
                                : 'bg-zinc-950/40 text-zinc-400 border-zinc-900 hover:text-white hover:border-zinc-800'
                            }`}
                          >
                            {folderName.replace(/_/g, ' ')}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {subFolders.length === 0 && activeNode.files.length === 0 ? (
                    <div className="text-center py-16 bg-zinc-900/10 border border-zinc-900 rounded-2xl">
                      <ImageIcon className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                      <h4 className="text-sm font-bold text-zinc-400">No folders found in {photoFirstLevel}</h4>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {subFolders.length > 0 && (
                        <div className={`grid ${
                          isMobile
                            ? (gridDensity === 'cozy'
                                ? 'grid-cols-2 gap-4'
                                : gridDensity === 'standard'
                                  ? 'grid-cols-3 gap-3'
                                  : 'grid-cols-4 gap-2')
                            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6'
                        }`}>
                          {(() => {
                            const assignedUrls = new Set<string>();
                            return (subFolders as FolderNode[]).map((node: FolderNode) => {
                              const count = getAllFilesRecursive(node).length;
                              const recFiles = getAllFilesRecursive(node);
                              const thumbnail = getFolderThumbnail(node.name, recFiles.map(f => ({ imageUrl: f.imageUrl || f.videoUrl, dimensions: f.dimensions } as any)), assignedUrls, 'photos');

                              return (
                                <div
                                  key={`folder-tab-${photoSubTab}-${node.name}`}
                                  onClick={() => { triggerHaptic('light'); setSelectedPhotoFolderNode(node); }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      triggerHaptic('light');
                                      setSelectedPhotoFolderNode(node);
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  className={`relative aspect-[2/3] w-full overflow-hidden border border-zinc-900 bg-zinc-950/40 hover:scale-[1.02] group transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-lg select-none ${
                                    isMobile
                                      ? (gridDensity === 'cozy' 
                                          ? 'rounded-2xl hover:border-emerald-500/40' 
                                          : gridDensity === 'standard' 
                                            ? 'rounded-xl hover:border-emerald-500/30' 
                                            : 'rounded-lg hover:border-emerald-500/20')
                                      : 'rounded-2xl hover:border-emerald-500/40'
                                  }`}
                                >
                                  <img
                                    src={getOptimizedImageUrl(thumbnail, 'low')}
                                    alt={node.name}
                                    referrerPolicy="no-referrer"
                                    className="absolute inset-0 w-full h-full object-cover object-[center_20%] transition-transform duration-500 group-hover:scale-105"
                                    loading="lazy"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent group-hover:via-black/45 transition-all duration-300" />
                                  <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center p-2.5 pb-3 sm:pb-3.5 text-center gap-1 sm:gap-1.5 z-10">
                                    <span className={`font-black text-white group-hover:text-emerald-400 transition-colors uppercase tracking-wider line-clamp-3 leading-snug drop-shadow-lg ${
                                      isMobile
                                        ? (gridDensity === 'cozy' 
                                            ? 'text-xs sm:text-sm md:text-base' 
                                            : gridDensity === 'standard' 
                                              ? 'text-[10px] sm:text-[11px] md:text-xs' 
                                              : 'text-[8px] sm:text-[9px]')
                                        : 'text-xs sm:text-sm md:text-base'
                                    }`}>
                                      {node.name.replace(/_/g, ' ')}
                                    </span>
                                    <div className="flex items-center justify-center">
                                      <span className={`font-semibold shrink-0 bg-black/40 text-zinc-300 border border-white/10 backdrop-blur-[2px] shadow-sm uppercase ${
                                        isMobile
                                          ? (gridDensity === 'cozy'
                                              ? 'text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wide'
                                              : gridDensity === 'standard'
                                                ? 'text-[8px] px-1.5 py-0.5 rounded-md font-bold'
                                                : 'text-[7px] px-1 py-0.5 rounded-sm font-extrabold')
                                          : 'text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wide'
                                      }`}>
                                        {count} Photos
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}

                      {activeNode.files.length > 0 && (
                        <div className="flex flex-col gap-3">
                          {subFolders.length > 0 && (
                            <div className="flex items-center justify-between px-1 border-t border-zinc-900/50 pt-4 mt-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">photos</span>
                            </div>
                          )}
                          <div className={
                            isMobile
                              ? (gridDensity === 'cozy'
                                  ? 'columns-2 gap-4 space-y-4'
                                  : gridDensity === 'standard'
                                    ? 'columns-3 gap-3 space-y-3'
                                    : 'columns-4 gap-2 space-y-2')
                              : 'columns-4 gap-4 space-y-4'
                          }>
                            {activeNode.files.map((photo: any) => {
                              const isSelected = isMobile && isSelectMode && selectedItems.some(x => x.id === photo.id);
                              return (
                                <div 
                                  key={photo.id}
                                  onClick={() => {
                                    if (isMobile && isSelectMode) {
                                      toggleSelection(photo, 'photo');
                                    } else {
                                      setActiveMediaItem(photo);
                                      setActiveMediaList(activeNode.files);
                                    }
                                  }}
                                  className={`break-inside-avoid relative inline-block w-full rounded-2xl overflow-hidden border border-zinc-900 bg-zinc-950/80 hover:border-emerald-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 cursor-pointer shadow-lg group mb-2 sm:mb-3 ${
                                    isSelected ? 'ring-2 ring-amber-500 scale-[0.96]' : ''
                                  }`}
                                >
                                  <img 
                                    src={getOptimizedImageUrl(photo.imageUrl, 'low')} 
                                    alt={photo.title} 
                                    referrerPolicy="no-referrer"
                                    className="w-full h-auto object-contain transition-transform duration-500 group-hover:scale-105"
                                    loading="lazy"
                                  />
                                  {isMobile && isSelectMode && (
                                    <div className="absolute top-2 right-2 z-30 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white bg-black/50 shadow-md">
                                      {isSelected && (
                                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            </div>

            {/* VIEW - STAGE: VIDEO CUTS */}
            <div className={currentView === 'cuts' && activeVideoSubView === 'selected' ? "block w-full" : "hidden"}>
              {(() => {
                const activeNode = parsedBucketData.videoCuts.folders[videoCutsFirstLevel] as FolderNode | undefined;

              if (!activeNode) {
                return (
                  <div className="text-center py-16 bg-zinc-900/10 border border-zinc-900 rounded-2xl">
                    <Video className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                    <h4 className="text-sm font-bold text-zinc-400">No folder found in Video Cuts</h4>
                    <p className="text-xs text-zinc-600 mt-1">Upload files under VideoCuts/ in your R2 bucket to sync</p>
                  </div>
                );
              }

              // Check if the current first level folder has nested folders
              const hasSubFolders = Object.keys(activeNode.folders).length > 0;

              // If nested folder is selected
              if (selectedVideoCutsFolderNode) {
                const videosInFolder = getAllFilesRecursive(selectedVideoCutsFolderNode as FolderNode).filter((v) => {
                  if (!searchQuery) return true;
                  return (
                    v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    v.description.toLowerCase().includes(searchQuery.toLowerCase())
                  );
                });

                return (
                  <div id="cuts-grid" className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-zinc-950/35 border border-zinc-900/60 p-2 sm:p-2.5 rounded-xl mt-[-12px]">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSelectedVideoCutsFolderNode(null)}
                          className="flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded-lg text-[10px] font-bold transition-all shrink-0 h-7"
                        >
                          <ArrowLeft className="w-3 h-3" />
                          <span>All Folders</span>
                        </button>
                        <span className="text-zinc-700 shrink-0 select-none text-[10px]">/</span>
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-cyan-400 truncate max-w-[140px] sm:max-w-[200px] md:max-w-[300px] shrink-0">
                          {selectedVideoCutsFolderNode.name.replace(/_/g, ' ')}
                        </h4>
                        <span className="text-[9px] font-mono text-zinc-400 bg-zinc-900/50 border border-zinc-800/80 px-1.5 py-0.5 rounded-md shrink-0 select-none h-5 flex items-center justify-center">
                          {videosInFolder.length} Videos
                        </span>
                      </div>
                    </div>

                    {videosInFolder.length === 0 ? (
                      <div className="text-center py-16 bg-zinc-900/10 border border-zinc-900 rounded-2xl">
                        <Video className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                        <h4 className="text-sm font-bold text-zinc-400">No videos found under this folder</h4>
                      </div>
                    ) : (
                      renderVideosGrid(videosInFolder, 'cyan', true)
                    )}
                  </div>
                );
              }

              // Otherwise show folder tabs if they exist, or direct files
              return (
                <div id="cuts-grid" className="flex flex-col gap-6">
                  
                  {/* Dynamic first level folders tabs inside Video Cuts */}
                  <div className="w-full overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 pb-3 md:pb-4 border-b border-zinc-900/60 flex items-center scroll-smooth">
                    <div className="flex flex-nowrap md:flex-wrap items-center gap-2.5 min-w-max">
                      {sortCategoryKeys(Object.keys(parsedBucketData.videoCuts.folders)).map((folderName) => {
                        const isSelected = folderName === videoCutsFirstLevel;
                        return (
                          <button
                            key={folderName}
                            onClick={() => {
                              setVideoCutsFirstLevel(folderName);
                              setSelectedVideoCutsFolderNode(null);
                            }}
                            className={`px-4 py-1.5 md:px-5 md:py-2.5 rounded-xl text-[11px] md:text-xs font-black uppercase tracking-wider transition-all duration-300 border ${
                              isSelected
                                ? 'bg-cyan-500 text-zinc-950 border-cyan-500 shadow-md'
                                : 'bg-zinc-950/40 text-zinc-400 border-zinc-900 hover:text-white hover:border-zinc-800'
                            }`}
                          >
                            {folderName.replace(/_/g, ' ')}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(() => {
                    const subFolders = (Object.values(activeNode.folders) as FolderNode[]).filter((node: FolderNode) => {
                      if (!searchQuery) return true;
                      return node.name.toLowerCase().includes(searchQuery.toLowerCase());
                    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

                    const directVideos = activeNode.files.filter((v) => {
                      if (!searchQuery) return true;
                      return (
                        v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        v.description.toLowerCase().includes(searchQuery.toLowerCase())
                      );
                    });

                    const isSongsFolder = videoCutsFirstLevel.toLowerCase().includes('song');

                    if (subFolders.length === 0 && directVideos.length === 0) {
                      return (
                        <div className="text-center py-16 bg-zinc-900/10 border border-zinc-900 rounded-2xl">
                          <Video className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                          <h4 className="text-sm font-bold text-zinc-400">No content found matching search</h4>
                        </div>
                      );
                    }

                    return (
                      <div className="flex flex-col gap-8">
                        {subFolders.length > 0 && (
                          <div className="flex flex-col gap-4">
                            {directVideos.length > 0 && (
                              <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Folders</h3>
                            )}
                            <div className={`grid ${
                              isSongsFolder
                                ? (isMobile
                                    ? (gridDensity === 'cozy'
                                        ? 'grid-cols-1 gap-5 md:gap-6'
                                        : gridDensity === 'standard'
                                          ? 'grid-cols-2 gap-4'
                                          : 'grid-cols-3 gap-3')
                                        : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8')
                                : (isMobile
                                    ? (gridDensity === 'cozy'
                                        ? 'grid-cols-2 gap-4'
                                        : gridDensity === 'standard'
                                          ? 'grid-cols-3 gap-3'
                                          : 'grid-cols-4 gap-2')
                                        : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6')
                            }`}>
                              {(() => {
                                const assignedUrls = new Set<string>();
                                return (subFolders as FolderNode[]).map((node: FolderNode) => {
                                  const count = getAllFilesRecursive(node).length;
                                  const recFiles = getAllFilesRecursive(node);
                                  const thumbnail = isSongsFolder
                                    ? getVideoFolderThumbnail(node.name, recFiles.map(f => ({ imageUrl: f.imageUrl || f.videoUrl } as any)), assignedUrls)
                                    : getFolderThumbnail(node.name, recFiles.map(f => ({ imageUrl: f.imageUrl || f.videoUrl } as any)), assignedUrls, 'videocuts');
                                  return (
                                    <div
                                      key={`folder-tab-${videoCutsFirstLevel}-${node.name}`}
                                      onClick={() => { triggerHaptic('light'); setSelectedVideoCutsFolderNode(node); }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          triggerHaptic('light');
                                          setSelectedVideoCutsFolderNode(node);
                                        }
                                      }}
                                      role="button"
                                      tabIndex={0}
                                      className={`relative ${isSongsFolder ? 'aspect-[16/9]' : 'aspect-[2/3]'} w-full overflow-hidden border border-zinc-900 bg-zinc-950/40 hover:scale-[1.02] group transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50 shadow-lg select-none ${
                                        isMobile
                                          ? (gridDensity === 'cozy' 
                                              ? 'rounded-2xl hover:border-cyan-500/40' 
                                              : gridDensity === 'standard' 
                                                ? 'rounded-xl hover:border-cyan-500/30' 
                                                : 'rounded-lg hover:border-cyan-500/20')
                                          : 'rounded-2xl hover:border-cyan-500/40'
                                      }`}
                                    >
                                      <img
                                        src={getOptimizedImageUrl(thumbnail, 'low')}
                                        alt={node.name}
                                        referrerPolicy="no-referrer"
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        loading="lazy"
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent group-hover:via-black/45 transition-all duration-300" />
                                      {isSongsFolder ? (
                                        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 px-3 py-2.5 bg-gradient-to-t from-black/95 via-black/50 to-transparent z-10 w-full">
                                          <span className={`font-black text-white group-hover:text-cyan-400 transition-colors uppercase tracking-wider truncate text-left drop-shadow-lg flex-1 ${
                                            isMobile
                                              ? (gridDensity === 'cozy' 
                                                  ? 'text-[10px] sm:text-xs md:text-sm' 
                                                  : gridDensity === 'standard' 
                                                    ? 'text-[8px] sm:text-[9px] md:text-xs' 
                                                    : 'text-[7px] sm:text-[8px]')
                                                : 'text-[11px] sm:text-xs md:text-sm'
                                          }`}>
                                            {node.name.replace(/_/g, ' ')}
                                          </span>
                                          <span className={`font-semibold shrink-0 bg-black/60 text-zinc-300 border border-white/10 backdrop-blur-[2px] shadow-sm uppercase ${
                                            isMobile
                                              ? (gridDensity === 'cozy'
                                                  ? 'text-[8px] px-1.5 py-0.5 rounded-full font-semibold tracking-wide'
                                                  : gridDensity === 'standard'
                                                    ? 'text-[7px] px-1 py-0.5 rounded-md font-bold'
                                                    : 'text-[6px] px-1 py-0.5 rounded-sm font-extrabold')
                                                : 'text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wide'
                                          }`}>
                                            {count} Videos
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center p-2.5 pb-3 sm:pb-3.5 text-center gap-1 sm:gap-1.5 z-10">
                                          <span className={`font-black text-white group-hover:text-cyan-400 transition-colors uppercase tracking-wider line-clamp-3 leading-snug drop-shadow-lg ${
                                            isMobile
                                              ? (gridDensity === 'cozy' 
                                                  ? 'text-xs sm:text-sm md:text-base' 
                                                  : gridDensity === 'standard' 
                                                    ? 'text-[10px] sm:text-[11px] md:text-xs' 
                                                    : 'text-[8px] sm:text-[9px]')
                                                : 'text-xs sm:text-sm md:text-base'
                                          }`}>
                                            {node.name.replace(/_/g, ' ')}
                                          </span>
                                          <div className="flex items-center justify-center">
                                            <span className={`font-semibold shrink-0 bg-black/40 text-zinc-300 border border-white/10 backdrop-blur-[2px] shadow-sm uppercase ${
                                              isMobile
                                                ? (gridDensity === 'cozy'
                                                    ? 'text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wide'
                                                    : gridDensity === 'standard'
                                                      ? 'text-[8px] px-1.5 py-0.5 rounded-md font-bold'
                                                      : 'text-[7px] px-1 py-0.5 rounded-sm font-extrabold')
                                                  : 'text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wide'
                                            }`}>
                                              {count} Videos
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        )}

                        {directVideos.length > 0 && (
                          <div className="flex flex-col gap-4">
                            {subFolders.length > 0 && (
                              <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1 border-t border-zinc-900/50 pt-4">Videos</h3>
                            )}
                            {renderVideosGrid(directVideos, 'cyan', true)}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
            </div>

            {/* VIEW - STAGE: OFFLINE VIDEOS */}
            <div className={currentView === 'offline' && activeOfflineSubView === 'selected' ? "block w-full" : "hidden"}>
              {(() => {
                const activeNode = parsedBucketData.videos.folders[videosFirstLevel] as FolderNode | undefined;

              if (!activeNode) {
                return (
                  <div className="text-center py-16 bg-zinc-900/10 border border-zinc-900 rounded-2xl">
                    <Layers className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                    <h4 className="text-sm font-bold text-zinc-400">No folder found in Videos</h4>
                    <p className="text-xs text-zinc-600 mt-1">Upload files under Videos/ in your R2 bucket to sync</p>
                  </div>
                );
              }

              // Check if the current first level folder has nested folders
              const hasSubFolders = Object.keys(activeNode.folders).length > 0;

              // If nested folder is selected
              if (selectedVideosFolderNode) {
                const videosInFolder = getAllFilesRecursive(selectedVideosFolderNode as FolderNode).filter((v) => {
                  if (!searchQuery) return true;
                  return (
                    v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    v.description.toLowerCase().includes(searchQuery.toLowerCase())
                  );
                });

                return (
                  <div id="offline-grid" className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-zinc-950/35 border border-zinc-900/60 p-2 sm:p-2.5 rounded-xl mt-[-12px]">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSelectedVideosFolderNode(null)}
                          className="flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded-lg text-[10px] font-bold transition-all shrink-0 h-7"
                        >
                          <ArrowLeft className="w-3 h-3" />
                          <span>All Folders</span>
                        </button>
                        <span className="text-zinc-700 shrink-0 select-none text-[10px]">/</span>
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-rose-400 truncate max-w-[140px] sm:max-w-[200px] md:max-w-[300px] shrink-0">
                          {selectedVideosFolderNode.name.replace(/_/g, ' ')}
                        </h4>
                        <span className="text-[9px] font-mono text-zinc-400 bg-zinc-900/50 border border-zinc-800/80 px-1.5 py-0.5 rounded-md shrink-0 select-none h-5 flex items-center justify-center">
                          {videosInFolder.length} Videos
                        </span>
                      </div>
                    </div>

                    {videosInFolder.length === 0 ? (
                      <div className="text-center py-16 bg-zinc-900/10 border border-zinc-900 rounded-2xl">
                        <Layers className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                        <h4 className="text-sm font-bold text-zinc-400">No videos found under this folder</h4>
                      </div>
                    ) : (
                      renderVideosGrid(videosInFolder, 'rose')
                    )}
                  </div>
                );
              }

              // Otherwise show folder tabs if they exist, or direct files
              return (
                <div id="offline-grid" className="flex flex-col gap-6">
                  
                  {/* Dynamic first level folders tabs inside Videos */}
                  <div className="w-full overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 pb-3 md:pb-4 border-b border-zinc-900/60 flex items-center scroll-smooth">
                    <div className="flex flex-nowrap md:flex-wrap items-center gap-2.5 min-w-max">
                      {sortCategoryKeys(Object.keys(parsedBucketData.videos.folders)).map((folderName) => {
                        const isSelected = folderName === videosFirstLevel;
                        return (
                          <button
                            key={folderName}
                            onClick={() => {
                              setVideosFirstLevel(folderName);
                              setSelectedVideosFolderNode(null);
                            }}
                            className={`px-4 py-1.5 md:px-5 md:py-2.5 rounded-xl text-[11px] md:text-xs font-black uppercase tracking-wider transition-all duration-300 border ${
                              isSelected
                                ? 'bg-rose-500 text-zinc-950 border-rose-500 shadow-md'
                                : 'bg-zinc-950/40 text-zinc-400 border-zinc-900 hover:text-white hover:border-zinc-800'
                            }`}
                          >
                            {folderName.replace(/_/g, ' ')}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(() => {
                    const subFolders = (Object.values(activeNode.folders) as FolderNode[]).filter((node: FolderNode) => {
                      if (!searchQuery) return true;
                      return node.name.toLowerCase().includes(searchQuery.toLowerCase());
                    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

                    const directVideos = activeNode.files.filter((v) => {
                      if (!searchQuery) return true;
                      return (
                        v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        v.description.toLowerCase().includes(searchQuery.toLowerCase())
                      );
                    });

                    if (subFolders.length === 0 && directVideos.length === 0) {
                      return (
                        <div className="text-center py-16 bg-zinc-900/10 border border-zinc-900 rounded-2xl">
                          <Layers className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                          <h4 className="text-sm font-bold text-zinc-400">No content found matching search</h4>
                        </div>
                      );
                    }

                    return (
                      <div className="flex flex-col gap-8">
                        {subFolders.length > 0 && (
                          <div className="flex flex-col gap-4">
                            {directVideos.length > 0 && (
                              <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Folders</h3>
                            )}
                            <div className={`grid ${
                              isMobile
                                ? (gridDensity === 'cozy'
                                    ? 'grid-cols-2 gap-4'
                                    : gridDensity === 'standard'
                                      ? 'grid-cols-3 gap-3'
                                      : 'grid-cols-4 gap-2')
                                : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6'
                            }`}>
                              {(() => {
                                const assignedUrls = new Set<string>();
                                return (subFolders as FolderNode[]).map((node: FolderNode) => {
                                  const count = getAllFilesRecursive(node).length;
                                  const recFiles = getAllFilesRecursive(node);
                                  const thumbnail = getFolderThumbnail(node.name, recFiles.map(f => ({ imageUrl: f.imageUrl || f.videoUrl } as any)), assignedUrls, 'videos');
                                  const isCelebrationTab = videosFirstLevel.toLowerCase() === 'celebrations';
                                  const videoFile = isCelebrationTab ? recFiles.find(f => f.videoUrl) : null;
                                  const videoThumbUrl = videoFile?.videoUrl;
                                  return (
                                    <div
                                      key={`folder-tab-${offlineSubTab}-${node.name}`}
                                      onClick={() => { triggerHaptic('light'); setSelectedVideosFolderNode(node); }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          triggerHaptic('light');
                                          setSelectedVideosFolderNode(node);
                                        }
                                      }}
                                      role="button"
                                      tabIndex={0}
                                      className={`relative aspect-[2/3] w-full overflow-hidden border border-zinc-900 bg-zinc-950/40 hover:scale-[1.02] group transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500/50 shadow-lg select-none ${
                                        isMobile
                                          ? (gridDensity === 'cozy' 
                                              ? 'rounded-2xl hover:border-rose-500/40' 
                                              : gridDensity === 'standard' 
                                                ? 'rounded-xl hover:border-rose-500/30' 
                                                : 'rounded-lg hover:border-rose-500/20')
                                          : 'rounded-2xl hover:border-rose-500/40'
                                      }`}
                                    >
                                      {isCelebrationTab && videoThumbUrl ? (
                                        <video
                                          src={`${videoThumbUrl}#t=1.0`}
                                          preload="metadata"
                                          muted
                                          playsInline
                                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                      ) : (
                                        <img
                                          src={getOptimizedImageUrl(thumbnail, 'low')}
                                          alt={node.name}
                                          referrerPolicy="no-referrer"
                                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                          loading="lazy"
                                        />
                                      )}
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent group-hover:via-black/45 transition-all duration-300" />
                                      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center p-2.5 pb-3 sm:pb-3.5 text-center gap-1 sm:gap-1.5 z-10">
                                        <span className={`font-black text-white group-hover:text-rose-400 transition-colors uppercase tracking-wider line-clamp-3 leading-snug drop-shadow-lg ${
                                          isMobile
                                            ? (gridDensity === 'cozy' 
                                                ? 'text-xs sm:text-sm md:text-base' 
                                                : gridDensity === 'standard' 
                                                  ? 'text-[10px] sm:text-[11px] md:text-xs' 
                                                  : 'text-[8px] sm:text-[9px]')
                                            : 'text-xs sm:text-sm md:text-base'
                                        }`}>
                                          {node.name.replace(/_/g, ' ')}
                                        </span>
                                        <div className="flex items-center justify-center">
                                          <span className={`font-semibold shrink-0 bg-black/40 text-zinc-300 border border-white/10 backdrop-blur-[2px] shadow-sm uppercase ${
                                            isMobile
                                              ? (gridDensity === 'cozy'
                                                  ? 'text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wide'
                                                  : gridDensity === 'standard'
                                                    ? 'text-[8px] px-1.5 py-0.5 rounded-md font-bold'
                                                    : 'text-[7px] px-1 py-0.5 rounded-sm font-extrabold')
                                              : 'text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wide'
                                          }`}>
                                            {count} Videos
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        )}

                        {directVideos.length > 0 && (
                          <div className="flex flex-col gap-4">
                            {subFolders.length > 0 && (
                              <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1 border-t border-zinc-900/50 pt-4">Videos</h3>
                            )}
                            {renderVideosGrid(directVideos, 'rose')}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
            </div>

            {/* VIEW - STAGE: FAVORITES ARCHIVE */}
            <div className={currentView === 'favorites' ? "block w-full" : "hidden"}>
              <div id="favorites-grid" className="flex flex-col gap-4">


                {getAllFavorites().length === 0 ? (
                  <div className="text-center py-20 bg-zinc-900/20 border border-zinc-900 rounded-3xl max-w-md mx-auto w-full">
                    <HeartCrack className="w-12 h-12 text-zinc-600 mx-auto mb-4 animate-bounce" />
                    <h3 className="font-bold text-zinc-300 text-sm">Your Favorites is Empty</h3>
                    <p className="text-zinc-500 text-xs mt-1 px-4 leading-relaxed">
                      Browse movies, photos, and video cuts across sections and click the Heart icon to store them here for quick access.
                    </p>
                    <button
                      onClick={() => setCurrentView('home')}
                      className="mt-6 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                    >
                      Browse Media
                    </button>
                  </div>
                ) : (
                  <div className={`grid ${
                    gridDensity === 'cozy'
                      ? 'grid-cols-2 gap-4 sm:gap-6'
                      : gridDensity === 'standard'
                        ? 'grid-cols-3 gap-3 sm:gap-4'
                        : 'grid-cols-4 gap-2 sm:gap-3'
                  }`}>
                    {getAllFavorites().map(({ type, item }) => (
                      <div 
                        key={item.id}
                        className="group clay-card overflow-hidden hover:border-red-500/40 transition-all duration-300 flex flex-col justify-between"
                      >
                        <div 
                          onClick={() => {
                            if (type === 'song') {
                              handlePlaySong(item);
                            } else {
                              setActiveMediaItem(item);
                              setActiveMediaList(getAllFavorites().map(f => f.item));
                            }
                          }}
                          className="h-48 relative bg-zinc-900 flex items-center justify-center overflow-hidden cursor-pointer"
                        >
                          {type === 'photo' ? (
                            <img src={getOptimizedImageUrl(item.imageUrl, 'low')} alt={item.title} referrerPolicy="no-referrer" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : type === 'movie' ? (
                            <img src={getOptimizedImageUrl(item.posterUrl, 'low')} alt={item.title} referrerPolicy="no-referrer" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : type === 'song' ? (
                            <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-950/20 flex flex-col items-center justify-center p-6 text-center group">
                              <div className={`w-16 h-16 rounded-full bg-zinc-950 border-2 border-zinc-800 flex items-center justify-center shadow-2xl relative transition-all duration-500 ${currentAudioSong?.id === item.id && isPlayingAudio ? 'animate-spin [animation-duration:8s]' : 'group-hover:scale-105'}`}>
                                <Music className="w-6 h-6 text-amber-500" />
                                <div className="absolute inset-0 m-auto w-4 h-4 rounded-full bg-zinc-900 border border-zinc-700" />
                              </div>
                              {currentAudioSong?.id === item.id && isPlayingAudio && (
                                <div className="mt-4 flex items-center gap-[3px] h-3">
                                  <div className="w-[3px] h-3 bg-amber-500 rounded-full animate-pulse" />
                                  <div className="w-[3px] h-2 bg-amber-500 rounded-full animate-pulse [animation-delay:150ms]" />
                                  <div className="w-[3px] h-3 bg-amber-500 rounded-full animate-pulse [animation-delay:300ms]" />
                                  <div className="w-[3px] h-1.5 bg-amber-500 rounded-full animate-pulse [animation-delay:450ms]" />
                                </div>
                              )}
                              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-3">
                                {item.movieTitle || 'Soundtrack'}
                              </span>
                            </div>
                          ) : (
                            <>
                               {(item.videoUrl && item.videoUrl.startsWith('http')) ? (
                                <div className="absolute inset-0 bg-zinc-900 flex flex-col items-center justify-center p-4 text-center">
                                  <Video className="w-8 h-8 text-red-500/40 mb-2" />
                                  <span className="text-xs font-mono text-zinc-500 truncate max-w-full">Direct Stream</span>
                                </div>
                              ) : (
                                <img src={item.videoUrl ? `https://img.youtube.com/vi/${item.videoUrl}/0.jpg` : null} alt={item.title} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105" />
                              )}
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <div className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg">
                                  <Play className="w-4 h-4 fill-white ml-0.5" />
                                </div>
                              </div>
                            </>
                          )}
                          
                          <div className="absolute top-3 left-3 z-10 bg-red-500 text-zinc-50 text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wider uppercase shadow-md select-none">
                            {type}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(item.id);
                            }}
                            className="absolute top-3 right-3 z-10 p-2 sm:p-2.5 rounded-full bg-black/70 hover:bg-black/90 text-rose-500 hover:text-rose-400 border border-zinc-800/60 hover:border-rose-500/50 hover:scale-110 active:scale-95 transition-all duration-300 shadow-xl cursor-pointer group backdrop-blur-sm"
                            title="Unlike & Remove"
                            aria-label="Unlike & Remove"
                          >
                            <Heart className="w-4.5 h-4.5 fill-current transition-transform duration-200" />
                          </button>
                        </div>

                        <div className="p-4">
                          <h4 className="text-sm font-bold text-zinc-100 group-hover:text-red-400 transition-colors truncate">
                            {item.title}
                          </h4>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

      </main>

      {/* BULK DOWNLOAD PROGRESS MODAL */}
      {isBulkDownloading && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center animate-scale-up">
            <div className="relative mb-6">
              <Loader2 className="w-16 h-16 text-amber-500 animate-spin" />
              <FileDown className="w-6 h-6 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>

            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">Compiling Bulk ZIP Archive</h3>
            <p className="text-xs text-zinc-400 max-w-sm mb-6 leading-relaxed">
              We are packaging and zipping your visible cloud assets into a single clean bundle. The download will start automatically.
            </p>

            <div className="w-full bg-zinc-950 border border-zinc-900 rounded-full h-3.5 mb-2 overflow-hidden p-0.5">
              <div 
                className="bg-amber-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${(bulkDownloadProgress.current / bulkDownloadProgress.total) * 100}%` }}
              />
            </div>

            <div className="flex justify-between w-full text-[10px] font-mono text-zinc-500 mb-4">
              <span>{bulkDownloadProgress.filename}</span>
              <span>{bulkDownloadProgress.current} / {bulkDownloadProgress.total} Files</span>
            </div>
            
            <button
              onClick={() => setIsBulkDownloading(false)}
              className="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl border border-zinc-800 transition-all mt-2"
            >
              Cancel Bulk Download
            </button>
          </div>
        </div>
      )}

      {/* Real HTML5 Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
      />

      {/* Global Embedded Mini Music Player inside Sticky Bar if song is loaded */}
      {currentAudioSong && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-xs z-40 bg-zinc-900/90 border border-amber-500/30 backdrop-blur-md rounded-xl p-2.5 shadow-2xl flex items-center gap-3 animate-slide-in">
          <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 animate-spin shrink-0" style={{ animationDuration: isPlayingAudio ? '4s' : '0s' }}>
            <Disc className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h5 className="text-[11px] font-bold text-white truncate">{currentAudioSong.title}</h5>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={() => setIsPlayingAudio(!isPlayingAudio)}
              className="px-2.5 py-1 rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-all font-bold text-[9px] uppercase tracking-wide cursor-pointer"
            >
              {isPlayingAudio ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => setCurrentAudioSong(null)}
              className="p-1 rounded-md bg-zinc-950 hover:bg-zinc-850 text-zinc-500 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Selection Mode Floating Bar */}
      {isSelectMode && selectedItems.length > 0 && (
        <div className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-xs z-40 bg-zinc-950/95 border border-amber-500/40 backdrop-blur-md rounded-xl p-3 shadow-2xl flex items-center justify-between gap-3 animate-slide-in">
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Multi-Select</span>
            <span className="text-[11px] font-black text-amber-500 truncate">{selectedItems.length} Selected</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleBulkDownloadSelected}
              className="px-2.5 py-1 rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-all font-bold text-[9px] uppercase tracking-wide cursor-pointer flex items-center gap-1 shadow-md shadow-amber-500/10"
              title="Bulk Download Selected Items"
            >
              <Download className="w-3 h-3" />
              <span>ZIP</span>
            </button>
            <button
              onClick={handleBulkUnfavoriteSelected}
              className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all font-bold text-[9px] uppercase tracking-wide cursor-pointer flex items-center gap-1 border border-red-500/20"
              title="Remove Selected from Favorites"
            >
              <Heart className="w-3 h-3" />
              <span>Fav</span>
            </button>
            {selectedItems.length > 3 && (
              <button
                onClick={() => {
                  triggerHaptic('medium');
                  setSelectedItems([]);
                }}
                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all font-bold text-[9px] uppercase tracking-wide cursor-pointer flex items-center border border-zinc-700/50"
                title="Clear Selection"
              >
                <span>Clear</span>
              </button>
            )}
            <button
              onClick={() => {
                setIsSelectMode(false);
                setSelectedItems([]);
              }}
              className="p-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
              title="Cancel Selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Cloudflare R2 Full Movie Stream Player Overlay */}
      {movieVideoUrl && (
        <MovieVideoPlayer 
          videoUrl={movieVideoUrl}
          title={selectedMovie?.title || 'R2 Stream'}
          onClose={() => setMovieVideoUrl(null)}
        />
      )}



      {/* Media Viewer Lightbox modal overlays */}
      {activeMediaItem && (() => {
        let onNext: (() => void) | undefined;
        let onPrev: (() => void) | undefined;

        const isPhoto = 'imageUrl' in activeMediaItem && !('type' in activeMediaItem);
        const currentList = activeMediaList && activeMediaList.length > 0 
          ? activeMediaList 
          : (isPhoto ? getActiveGalleryPhotos() : []);

        const currentIndex = currentList.findIndex(p => p.id === activeMediaItem.id);
        if (currentIndex !== -1 && currentList.length > 1) {
          onPrev = () => {
            const prevIndex = (currentIndex - 1 + currentList.length) % currentList.length;
            setActiveMediaItem(currentList[prevIndex]);
          };
          onNext = () => {
            const nextIndex = (currentIndex + 1) % currentList.length;
            setActiveMediaItem(currentList[nextIndex]);
          };
        }

        return (
          <MediaViewer 
            item={activeMediaItem}
            onClose={() => window.history.back()}
            isFavorited={isItemFavorited(activeMediaItem.id)}
            onToggleFavorite={() => toggleFavorite(activeMediaItem.id)}
            relatedItems={currentList}
            onNext={onNext}
            onPrev={onPrev}
            onDownload={triggerSingleDownload}
          />
        );
      })()}

      {/* Custom Ratings Editor Modal (Beautiful Glassmorphic Design) */}
      {isRatingsModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-zinc-950/95 border border-zinc-800/80 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setIsRatingsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-3">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              <h2 className="text-lg font-black uppercase tracking-wide text-white font-sans">
                Manage Movie Ratings
              </h2>
            </div>

            <p className="text-zinc-400 text-xs leading-relaxed mb-5">
              Customize the ratings displayed for each movie in your app. These ratings are saved locally and will update throughout the interface instantly.
            </p>

            <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1">
              {allMovies.map((movie) => {
                const displayRating = movie.rating;
                return (
                  <div 
                    key={movie.id} 
                    className="flex items-center justify-between gap-4 p-3 bg-zinc-900/50 border border-zinc-800/40 rounded-2xl hover:bg-zinc-900 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img 
                        src={getOptimizedImageUrl(movie.posterUrl, 'low')} 
                        alt={movie.title}
                        className="w-10 h-14 object-cover rounded-lg border border-zinc-800 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-zinc-100 truncate">{movie.title}</h4>
                        <p className="text-[10px] text-zinc-400 font-medium">{movie.releaseYear} • {movie.eraCategory}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-amber-400">★</span>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        step="0.1"
                        value={customRatings[movie.id] !== undefined ? customRatings[movie.id] : movie.rating}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            const newRatings = { ...customRatings, [movie.id]: val };
                            setCustomRatings(newRatings);
                            localStorage.setItem('ntr_custom_ratings_v1', JSON.stringify(newRatings));
                          } else if (e.target.value === '') {
                            const newRatings = { ...customRatings };
                            delete newRatings[movie.id];
                            setCustomRatings(newRatings);
                            localStorage.setItem('ntr_custom_ratings_v1', JSON.stringify(newRatings));
                          }
                        }}
                        className="w-16 bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1.5 text-center text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all"
                      />
                      <span className="text-xs text-zinc-500 font-bold">/10</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to reset all ratings to default?')) {
                    setCustomRatings({});
                    localStorage.removeItem('ntr_custom_ratings_v1');
                    showToast('All movie ratings have been reset to default values.', 'success');
                  }
                }}
                className="px-4 py-2 bg-red-950/30 hover:bg-red-950/60 border border-red-500/20 hover:border-red-500/40 text-red-400 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Reset All
              </button>
              <button
                onClick={() => {
                  setIsRatingsModalOpen(false);
                  showToast('Ratings saved successfully!', 'success');
                }}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer shadow-lg shadow-amber-500/10"
              >
                Close & Save
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Dynamic Floating Notification Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-50 p-3.5 sm:p-4 rounded-2xl flex items-center justify-between gap-4 shadow-2xl border transition-all duration-300 animate-slide-in ${
          toast.type === 'error' 
            ? 'bg-red-950/95 border-red-500/30 text-red-200' 
            : toast.type === 'success' 
            ? 'bg-emerald-950/95 border-emerald-500/30 text-emerald-200' 
            : 'bg-zinc-900/95 border-amber-500/30 text-amber-200'
        }`}>
          <div className="text-xs font-bold leading-relaxed">{toast.message}</div>
          <div className="flex items-center gap-2 shrink-0">
            {toast.undoAction && (
              <button
                onClick={() => {
                  toast.undoAction?.();
                  setToast(null);
                }}
                className="px-2.5 py-1 text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-400 hover:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 hover:border-amber-500/40 rounded-lg transition-all duration-200 cursor-pointer shadow-sm select-none"
              >
                Undo
              </button>
            )}
            <button 
              onClick={() => setToast(null)}
              className="p-1 rounded bg-zinc-950/40 hover:bg-zinc-950 text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
      </motion.div>
    </div>
  );
}
