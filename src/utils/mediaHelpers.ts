import { PHOTOS } from '../data/mockData';

// Application aliases and helpers for fuzzy movie name matching and indexing

// Dynamic filename formatter to convert "rrr_roar_action.jpg" -> "Rrr Roar Action"
export const formatFileName = (key: string): string => {
  const fileName = key.split('/').pop() || '';
  const withoutExt = fileName.replace(/\.[^/.]+$/, "");
  return withoutExt
    .replace(/[_-]/g, " ")
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Helper to get lowercase word tokens for fuzzy matching of media files and thumbnails
export const getBaseName = (key: string): string => {
  const fileName = key.split('/').pop() || '';
  let withoutExt = fileName.replace(/\s*\(\d{4}\)/g, "").replace(/\.[^/.]+$/, "");
  // Remove trailing portrait/landscape suffix (like " P" or " L")
  withoutExt = withoutExt.replace(/\s+[pPlL]$/, "").replace(/_[pPlL]$/, "");
  const withoutYear = withoutExt.replace(/\b\d{4}\b/g, "");
  return withoutYear.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().replace(/\s+/g, ' ');
};

export const MOVIE_ALIASES: { [key: string]: string[] } = {
  'nannaku prematho': ['nkp', 'np', 'nannaku', 'prematho', 'nannakuprematho', 'nkp.jpg', 'nkp.png', 'nkp.jpeg'],
  'janatha garage': ['jg', 'janata', 'garage', 'janatagarage', 'janathagarage', 'jg.jpg', 'jg.png'],
  'aravinda sametha veera raghava': ['asvr', 'aravinda', 'sametha', 'veera raghava', 'aravindasametha', 'veeraraghava', 'aravindha sametha veera raghava', 'aravindha sametha', 'aravindhasametha', 'aravinda sametha', 'asvr.jpg', 'asvr.png', 'asvr.jpeg'],
  'jai lava kusa': ['jlk', 'jai', 'lava', 'kusa', 'jailavakusa', 'jlk.jpg', 'jlk.png', 'jlk.jpeg'],
  'daana veera soora karna': ['dvsk', 'dks', 'karna', 'daana veera', 'daanaveerasoorakarna'],
  'pathala bhairavi': ['pb', 'pathala', 'bhairavi', 'pathalabhairavi'],
  'mayabazar': ['mb', 'maya', 'bazar', 'mayabazaar'],
  'devara: part 1': ['devara', 'devara1', 'devarapart1', 'devara.jpg', 'devara.png'],
  'brindavanam': ['brindhavanam', 'brindavanam', 'brinda', 'bv', 'bnd', 'brnd', 'brindavanam.jpg'],
  'naaga': ['naga', 'naaga', 'naaga.png', 'naga.png', 'naaga.mp4', 'naga.mp4'],
  'oosaravelli': ['oosaravalli', 'oosaravelli', 'oosaravalli.png', 'oosaravelli.png', 'oosaravelli.mp4', 'oosaravelli.mp4', 'oosaravelli', 'oosaravalli']
};

// Fuzzy word matcher: matches if either contains the other, phonetic overlaps, space-removed strings match, aliases match, or single words overlap.
export const matchesMovie = (key1: string, key2: string): boolean => {
  const b1 = key1.toLowerCase();
  const b2 = key2.toLowerCase();
  if (
    ((b1.includes('asvr') || b1.includes('aravinda') || b1.includes('aravindha')) && (b2.includes('asvr') || b2.includes('aravinda') || b2.includes('aravindha'))) ||
    ((b1.includes('jlk') || b1.includes('jai lava') || b1.includes('lava kusa') || b1.includes('jailavakusa')) && (b2.includes('jlk') || b2.includes('jai lava') || b2.includes('lava kusa') || b2.includes('jailavakusa'))) ||
    ((b1.includes('naaga') || b1.includes('naga')) && (b2.includes('naaga') || b2.includes('naga')))
  ) {
    return true;
  }

  const base1 = getBaseName(key1);
  const base2 = getBaseName(key2);
  if (!base1 || !base2) return false;

  // Exact word boundary checks or very short checks (such as "ai") to prevent false substring matches
  if (base1 === "ai" || base2 === "ai") {
    return base1 === base2;
  }

  // 1. Direct equivalence (exact match)
  if (base1 === base2) return true;

  // 2. Phonetic normalized matching (exact match after removing 'h' characters)
  const norm1 = base1.replace(/h/g, '');
  const norm2 = base2.replace(/h/g, '');
  if (norm1 === norm2) return true;

  // 3. Space-removed equivalence (exact match after removing spaces)
  const noSpace1 = base1.replace(/\s+/g, '');
  const noSpace2 = base2.replace(/\s+/g, '');
  const normNoSpace1 = norm1.replace(/\s+/g, '');
  const normNoSpace2 = norm2.replace(/\s+/g, '');
  if (noSpace1 === noSpace2) return true;
  if (normNoSpace1 === normNoSpace2) return true;

  // 4. Checking explicit aliases and acronym matches
  for (const [title, aliases] of Object.entries(MOVIE_ALIASES)) {
    const tBase = getBaseName(title);
    const tNorm = tBase.replace(/h/g, '');
    const tNoSpace = tBase.replace(/\s+/g, '');
    const tNormNoSpace = tNorm.replace(/\s+/g, '');
    
    const isKey1Match = base1 === tBase || norm1 === tNorm || noSpace1 === tNoSpace || normNoSpace1 === tNormNoSpace ||
                         aliases.includes(base1) || aliases.includes(norm1) || aliases.includes(noSpace1) || aliases.includes(normNoSpace1);
    const isKey2Match = base2 === tBase || norm2 === tNorm || noSpace2 === tNoSpace || normNoSpace2 === tNormNoSpace ||
                         aliases.includes(base2) || aliases.includes(norm2) || aliases.includes(noSpace2) || aliases.includes(normNoSpace2);
    
    if (isKey1Match && isKey2Match) return true;
  }

  // 5. Initials / Acronym Match (e.g. jg -> Janatha Garage)
  const initialsOf = (str: string) => str.split(/\s+/).map(w => w[0]).join('');
  const i1 = initialsOf(base1);
  const i2 = initialsOf(base2);
  if (i1.length >= 2 && (i1 === base2 || i1 === norm2)) return true;
  if (i2.length >= 2 && (i2 === base1 || i2 === norm1)) return true;

  return false;
};

export function sortCategoryKeys(keys: string[]): string[] {
  const getRank = (key: string): number => {
    const k = key.toLowerCase();
    if (k.includes('movie')) return 1;
    if (k.includes('event')) return 2;
    if (k.includes('offline') || k.includes('offscreen')) return 3;
    return 4;
  };

  return [...keys].sort((a, b) => {
    const rankA = getRank(a);
    const rankB = getRank(b);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.localeCompare(b);
  });
}

export interface FolderNode {
  name: string;
  path: string;
  files: any[];
  folders: Record<string, FolderNode>;
}

export function buildFolderTree(files: any[], prefixPath: string): FolderNode {
  const root: FolderNode = {
    name: "Root",
    path: prefixPath,
    files: [],
    folders: {}
  };

  files.forEach((file: any) => {
    let cleanKey = file.key;
    if (cleanKey.toLowerCase().startsWith("ntrfilmography/")) {
      cleanKey = cleanKey.slice("ntrfilmography/".length);
    }

    const lowerKey = cleanKey.toLowerCase();
    const lowerPrefix = prefixPath.toLowerCase();

    if (!lowerKey.startsWith(lowerPrefix)) {
      return;
    }

    const relativePath = cleanKey.slice(prefixPath.length);
    const parts = relativePath.split("/").filter(p => p.length > 0);

    if (parts.length === 0) return;

    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      if (!current.folders[folderName]) {
        current.folders[folderName] = {
          name: folderName,
          path: current.path + folderName + "/",
          files: [],
          folders: {}
        };
      }
      current = current.folders[folderName];
    }

    const filename = parts[parts.length - 1];
    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(filename);
    const isVideo = /\.(mp4|mkv|mov|avi|webm)$/i.test(filename);
    
    if (isImage || isVideo) {
      const publicUrl = "https://pub-4b8805119f7f49ae848fa1aaa57dd6d0.r2.dev";
      const encodedKey = file.key.split('/').map(encodeURIComponent).join('/');
      const computedUrl = `${publicUrl}/${encodedKey}`;

      current.files.push({
        id: file.key,
        key: file.key,
        title: filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
        description: `Synced live from Cloudflare R2 bucket: ${file.key}`,
        imageUrl: isImage ? (file.url || computedUrl) : undefined,
        videoUrl: isVideo ? (file.url || computedUrl) : undefined,
        fileSize: file.size ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : "Auto",
        dimensions: isImage ? "Image" : "Video",
        duration: "Stream",
        views: "0"
      });
    }
  });

  return root;
}

export function getAllFilesRecursive(node: FolderNode): any[] {
  let files = [...node.files];
  Object.values(node.folders).forEach((child) => {
    files.push(...getAllFilesRecursive(child));
  });
  return files;
}

export function findFolderNodeByPath(rootNode: FolderNode, path: string): FolderNode | null {
  if (rootNode.path === path) return rootNode;
  for (const child of Object.values(rootNode.folders)) {
    const found = findFolderNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

export const getMockBucketFiles = (): any[] => {
  const mockFiles: any[] = [];
  
  PHOTOS.forEach((photo) => {
    const cat = photo.category === "Events" ? "Events" : photo.category === "Offscreen" ? "Offline" : "Movies";
    const folder = photo.category === "Events" ? "Audio Launches" : photo.category === "Offscreen" ? "General" : (photo.id.startsWith("mock-") ? "Aadi" : "Adhurs");
    mockFiles.push({
      key: `ntrfilmography/Photos/${cat}/${folder}/${photo.title}.jpg`,
      url: photo.imageUrl,
      size: 1.5 * 1024 * 1024,
      lastModified: new Date().toISOString()
    });
  });

  mockFiles.push(
    {
      key: "ntrfilmography/VideoCuts/Birthday Edits/Naatu Naatu Video.mp4",
      url: "https://www.w3schools.com/html/mov_bbb.mp4",
      size: 15 * 1024 * 1024,
      lastModified: new Date().toISOString()
    },
    {
      key: "ntrfilmography/VideoCuts/Fan Edits/Devara Teaser Edit.mp4",
      url: "https://www.w3schools.com/html/movie.mp4",
      size: 25 * 1024 * 1024,
      lastModified: new Date().toISOString()
    },
    {
      key: "ntrfilmography/Videos/Events/NTR Jr at SIIMA 2019.mp4",
      url: "https://www.w3schools.com/html/mov_bbb.mp4",
      size: 45 * 1024 * 1024,
      lastModified: new Date().toISOString()
    },
    {
      key: "ntrfilmography/Videos/Fans Celebrations/Mass Rally in Hyderabad.mp4",
      url: "https://www.w3schools.com/html/movie.mp4",
      size: 30 * 1024 * 1024,
      lastModified: new Date().toISOString()
    }
  );

  return mockFiles;
};

export const idbMediaCache = {
  dbName: 'ntr_r2_db',
  storeName: 'media_cache',
  
  getDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not supported'));
        return;
      }
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        try {
          request.result.createObjectStore(this.storeName);
        } catch (e) {
          // Store might already exist
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async get(key: string): Promise<any> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async set(key: string, value: any): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async delete(key: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};

export function compressR2Data(data: any): { b: string; f: any } {
  let publicUrlBase = '';
  
  const findBase = (item: any) => {
    if (item && item.url && item.key) {
      const idx = item.url.lastIndexOf('/' + item.key);
      if (idx !== -1) {
        publicUrlBase = item.url.substring(0, idx);
        return true;
      }
    }
    return false;
  };

  const scan = (obj: any): boolean => {
    if (!obj) return false;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (findBase(item)) return true;
        if (scan(item)) return true;
      }
    } else if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (scan(obj[key])) return true;
      }
    }
    return false;
  };

  scan(data);

  const compressFile = (file: any) => {
    if (!file) return null;
    const time = file.lastModified ? new Date(file.lastModified).getTime() : 0;
    return {
      k: file.key,
      s: file.size,
      m: time
    };
  };

  const compressList = (list: any[]) => {
    if (!Array.isArray(list)) return [];
    return list.map(compressFile).filter(Boolean);
  };

  const compressMap = (map: any) => {
    if (!map || typeof map !== 'object') return {};
    const res: any = {};
    for (const key of Object.keys(map)) {
      if (Array.isArray(map[key])) {
        res[key] = compressList(map[key]);
      } else if (map[key] && typeof map[key] === 'object') {
        res[key] = compressMap(map[key]);
      }
    }
    return res;
  };

  const compressed: any = {
    photos: compressMap(data.photos),
    videoCuts: compressMap(data.videoCuts),
    offlineVideos: compressMap(data.offlineVideos),
    movies: compressList(data.movies),
    thumbnailsP: compressList(data.thumbnailsP),
    thumbnailsL: compressList(data.thumbnailsL),
    photosMovieThumbnails: compressList(data.photosMovieThumbnails),
    photosEventThumbnails: compressList(data.photosEventThumbnails || []),
    videosEventThumbnails: compressList(data.videosEventThumbnails || []),
    audio: compressList(data.audio || []),
    bucketFiles: compressList(data.bucketFiles || [])
  };

  return {
    b: publicUrlBase,
    f: compressed
  };
}

export function decompressR2Data(compressed: { b: string; f: any }): any {
  const base = compressed.b || '';
  const data = compressed.f;

  const decompressFile = (file: any) => {
    if (!file) return null;
    return {
      key: file.k,
      url: base ? `${base}/${file.k}` : '',
      size: file.s,
      lastModified: file.m ? new Date(file.m).toISOString() : ''
    };
  };

  const decompressList = (list: any[]) => {
    if (!Array.isArray(list)) return [];
    return list.map(decompressFile).filter(Boolean);
  };

  const decompressMap = (map: any) => {
    if (!map || typeof map !== 'object') return {};
    const res: any = {};
    for (const key of Object.keys(map)) {
      if (Array.isArray(map[key])) {
        res[key] = decompressList(map[key]);
      } else if (map[key] && typeof map[key] === 'object') {
        res[key] = decompressMap(map[key]);
      }
    }
    return res;
  };

  return {
    photos: decompressMap(data.photos),
    videoCuts: decompressMap(data.videoCuts),
    offlineVideos: decompressMap(data.offlineVideos),
    movies: decompressList(data.movies),
    thumbnailsP: decompressList(data.thumbnailsP),
    thumbnailsL: decompressList(data.thumbnailsL),
    photosMovieThumbnails: decompressList(data.photosMovieThumbnails),
    photosEventThumbnails: decompressList(data.photosEventThumbnails || []),
    videosEventThumbnails: decompressList(data.videosEventThumbnails || []),
    audio: decompressList(data.audio || []),
    bucketFiles: decompressList(data.bucketFiles || [])
  };
}
