// Application Type Definitions

export interface Person {
  id: string;
  name: string;
  roleType: 'Actor' | 'Director' | 'Composer' | 'Producer' | 'Lyricist';
  biography: string;
  birthDate: string;
  deathDate?: string;
  profileImageUrl: string;
}

export interface CastMember {
  id: string;
  personName: string;
  characterName: string;
  billingOrder: number;
  profileImageUrl?: string;
}

export interface CrewMember {
  id: string;
  personName: string;
  job: string; // Director, Screenplay, Composer, Cinematographer
  department: string;
  profileImageUrl?: string;
}

export interface Song {
  id: string;
  title: string;
  singers: string;
  lyricist: string;
  duration: string; // e.g. "3:45"
  youtubeUrl?: string;
  audioUrl?: string;
}

export interface Award {
  id: string;
  awardName: string; // e.g. Nandi Awards, Filmfare Awards South
  category: string; // e.g. Best Actor, Best Film
  year: number;
  isWinner: boolean;
}

export interface Movie {
  id: string;
  title: string;
  originalTitle: string;
  slug: string;
  releaseYear: number;
  releaseDate: string;
  runTime: number; // in minutes
  language: string;
  story: string;
  trivia: string[];
  boxOfficeCollections: string; // in Crores
  budget: string; // in Crores
  rating: number; // out of 10
  posterUrl: string;
  bannerUrl: string;
  trailerUrl: string; // Youtube Embed ID or URL
  eraCategory: 'Mythological' | 'Social' | 'Folklore' | 'Historical' | 'Action-Drama';
  status: 'Released' | 'Upcoming';
  starringType: 'Senior' | 'Junior' | 'Combined'; // Senior NTR vs Jr. NTR
  cast: CastMember[];
  crew: CrewMember[];
  songs: Song[];
  awards: Award[];
  fileSize?: number;
}

export interface Photo {
  id: string;
  movieId?: string;
  movieTitle?: string;
  title: string;
  description: string;
  imageUrl: string;
  category: 'Stills' | 'Offscreen' | 'Events' | 'Vintage';
  fileSize: string;
  dimensions: string;
}

export interface Video {
  id: string;
  movieId?: string;
  movieTitle?: string;
  title: string;
  description: string;
  videoUrl: string; // Youtube ID
  category: 'Trailer' | 'Teaser' | 'Cut' | 'BehindTheScenes';
  duration: string;
  views: string;
}

export interface TimelineMilestone {
  id: string;
  year: number;
  title: string;
  description: string;
  category: 'Cinematic' | 'Political' | 'Personal';
  imageUrl?: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  itemIds: { [key: string]: boolean }; // Map of item ID -> true
}

export interface FavoriteItem {
  id: string;
  type: 'movie' | 'photo' | 'song' | 'video' | 'cut';
  title: string;
  imageUrl?: string;
  metadata?: string; // Movie release year, song singers, video views, etc.
  key?: string; // Cloudflare R2 key for downloading
}
