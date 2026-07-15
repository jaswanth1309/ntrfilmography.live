import { Movie, Photo, Video, TimelineMilestone } from '../types';

export const MOVIES: Movie[] = [
  {
    id: 'm2',
    title: 'RRR',
    originalTitle: 'రౌద్రం రణం రుధిరం',
    slug: 'rrr',
    releaseYear: 2022,
    releaseDate: '2022-03-25',
    runTime: 187,
    language: 'Telugu',
    story: 'A fictional story about two legendary revolutionaries, Alluri Sitarama Raju (Ram Charan) and Komaram Bheem (N. T. Rama Rao Jr.), and their journey away from home before they started fighting for their country in the 1920s. Bheem is a tribal leader on a mission to rescue an innocent girl abducted by British Governor Scott. Raju is a ruthless police officer serving the Crown with a deep hidden agenda. Their paths cross in a breathtaking rescue of a boy, forging an unbreakable bond of friendship that will test their ultimate loyalties.',
    trivia: [
      'The song "Naatu Naatu" became a global sensation and won the Academy Award (Oscar) for Best Original Song in 2023.',
      'Jr. NTR’s entry scene running with wild tigers, wolves, and leopards is considered one of the most iconic hero introduction sequences in Indian cinema.',
      'Both lead actors underwent intensive physical training, performing most of their high-octane stunts themselves.'
    ],
    boxOfficeCollections: '1387.00', // In Crores
    budget: '550.00',
    rating: 9.2,
    posterUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&q=80&w=400',
    bannerUrl: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&q=80&w=1200',
    trailerUrl: 'https://www.youtube.com/embed/NgBoMJy386M',
    eraCategory: 'Action-Drama',
    status: 'Released',
    starringType: 'Junior',
    cast: [
      { id: 'c5', personName: 'N. T. Rama Rao Jr.', characterName: 'Komaram Bheem', billingOrder: 1 },
      { id: 'c6', personName: 'Ram Charan', characterName: 'Alluri Sitarama Raju', billingOrder: 2 },
      { id: 'c7', personName: 'Alia Bhatt', characterName: 'Sita', billingOrder: 3 },
      { id: 'c8', personName: 'Ajay Devgn', characterName: 'Venkat Rama Raju', billingOrder: 4 }
    ],
    crew: [
      { id: 'cr4', personName: 'S. S. Rajamouli', job: 'Director', department: 'Directing' },
      { id: 'cr5', personName: 'D. V. V. Danayya', job: 'Producer', department: 'Production' },
      { id: 'cr6', personName: 'M. M. Keeravani', job: 'Composer', department: 'Music' }
    ],
    songs: [
      { id: 's3', title: 'Naatu Naatu', singers: 'Rahul Sipligunj, Kaala Bhairava', lyricist: 'Chandrabose', duration: '3:35' },
      { id: 's4', title: 'Komuram Bheemudo', singers: 'Kaala Bhairava', lyricist: 'Suddala Ashok Teja', duration: '5:02' }
    ],
    awards: [
      { id: 'aw2', awardName: 'Academy Awards (Oscars)', category: 'Best Original Song ("Naatu Naatu")', year: 2023, isWinner: true },
      { id: 'aw3', awardName: 'Golden Globe Awards', category: 'Best Original Song ("Naatu Naatu")', year: 2023, isWinner: true }
    ]
  },
  {
    id: 'm4',
    title: 'Devara: Part 1',
    originalTitle: 'దేవర',
    slug: 'devara',
    releaseYear: 2024,
    releaseDate: '2024-09-27',
    runTime: 178,
    language: 'Telugu',
    story: 'Set in a coastal region, Devara tells a high-voltage saga of sea-smuggling, family honor, and absolute fear. Devara (N. T. Rama Rao Jr.), a fearless man who protects his people from ocean piracy, goes on a crusading rampage when he discovers that their smuggling goods are actually firearms used against innocent people. He sets an terrifying oath to execute anyone who dares to smuggles weapons across the sea, spawning an era of blood, red waves, and unyielding fear.',
    trivia: [
      'Jr. NTR played a dual role as both Devara (the father) and Varadha (the soft-spoken son).',
      'The soundtrack, composed by Anirudh Ravichander, shattered multiple music records within hours of its release.',
      'The maritime action sequences were shot in special massive underwater tanks with state-of-the-art VFX.'
    ],
    boxOfficeCollections: '515.00',
    budget: '300.00',
    rating: 8.9,
    posterUrl: 'https://images.unsplash.com/photo-1509281373149-e957c6296406?auto=format&fit=crop&q=80&w=400',
    bannerUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1200',
    trailerUrl: 'https://www.youtube.com/embed/nS8X9N7g2nQ',
    eraCategory: 'Action-Drama',
    status: 'Released',
    starringType: 'Junior',
    cast: [
      { id: 'c12', personName: 'N. T. Rama Rao Jr.', characterName: 'Devara / Varadha', billingOrder: 1 },
      { id: 'c13', personName: 'Saif Ali Khan', characterName: 'Bhaira', billingOrder: 2 },
      { id: 'c14', personName: 'Janhvi Kapoor', characterName: 'Thangam', billingOrder: 3 }
    ],
    crew: [
      { id: 'cr10', personName: 'Koratala Siva', job: 'Director', department: 'Directing' },
      { id: 'cr11', personName: 'Sudhakar Mikkilineni', job: 'Producer', department: 'Production' },
      { id: 'cr12', personName: 'Anirudh Ravichander', job: 'Composer', department: 'Music' }
    ],
    songs: [
      { id: 's7', title: 'Fear Song', singers: 'Anirudh Ravichander', lyricist: 'Ramajogayya Sastry', duration: '3:15' },
      { id: 's8', title: 'Chuttamalle', singers: 'Shilpa Rao', lyricist: 'Ramajogayya Sastry', duration: '3:45' }
    ],
    awards: [
      { id: 'aw5', awardName: 'IIFA Utsavam', category: 'Best Actor Male (Telugu) - Nominated', year: 2025, isWinner: false }
    ]
  },
  {
    id: 'm6',
    title: 'Aravinda Sametha Veera Raghava',
    originalTitle: 'అరవింద సమేత వీర రాఘవ',
    slug: 'aravinda-sametha',
    releaseYear: 2018,
    releaseDate: '2018-10-11',
    runTime: 162,
    language: 'Telugu',
    story: 'Veera Raghava (N. T. Rama Rao Jr.) returns from London only to lose his father in a bloody factional clash in the Rayalaseema region. Deciding that the endless blood-feud is destroying generations, he leaves his village and vows to bring peace to the rival factions. He meets Aravinda (Pooja Hegde), a psychology student, who helps him understand the importance of conflict resolution. He must protect his people and convince the enemy leader Basi Reddy (Jagapathi Babu) to drop weapons without resorting to further bloodshed.',
    trivia: [
      'Jr. NTR gave a critically acclaimed, exceptionally nuanced performance focusing on peace rather than mass violence.',
      'The movie was highly appreciated for showing Rayalaseema factionalism from a progressive, pacifying standpoint.',
      'He shot the movie under severe personal grief, just days after losing his father Nandamuri Harikrishna in a tragic accident.'
    ],
    boxOfficeCollections: '165.00',
    budget: '80.00',
    rating: 8.8,
    posterUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&q=80&w=400',
    bannerUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&q=80&w=1200',
    trailerUrl: 'https://www.youtube.com/embed/XqGj-xHbyi8',
    eraCategory: 'Action-Drama',
    status: 'Released',
    starringType: 'Junior',
    cast: [
      { id: 'c18', personName: 'N. T. Rama Rao Jr.', characterName: 'Veera Raghava', billingOrder: 1 },
      { id: 'c19', personName: 'Pooja Hegde', characterName: 'Aravinda', billingOrder: 2 },
      { id: 'c20', personName: 'Jagapathi Babu', characterName: 'Basi Reddy', billingOrder: 3 }
    ],
    crew: [
      { id: 'cr16', personName: 'Trivikram Srinivas', job: 'Director', department: 'Directing' },
      { id: 'cr17', personName: 'S. Radha Krishna', job: 'Producer', department: 'Production' },
      { id: 'cr18', personName: 'S. Thaman', job: 'Composer', department: 'Music' }
    ],
    songs: [
      { id: 's11', title: 'Anaganaganaga', singers: 'Armaan Malik', lyricist: 'Sirivennela Seetharama Sastry', duration: '4:20' },
      { id: 's12', title: 'Yeda Poyado', singers: 'Nikhita Srivalli, Kailash Kher', lyricist: 'Sirivennela Seetharama Sastry', duration: '5:05' }
    ],
    awards: [
      { id: 'aw7', awardName: 'SIIMA Awards', category: 'Best Actor (Critics Choice)', year: 2019, isWinner: true }
    ]
  }
];

export const PHOTOS: Photo[] = [
  {
    id: 'p5',
    movieId: 'm4',
    movieTitle: 'Devara: Part 1',
    title: 'Devara Boat entry',
    description: 'Devara jumping on a smuggling ship with dual sickle swords.',
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=800',
    category: 'Stills',
    fileSize: '2.4 MB',
    dimensions: '4096x2160'
  },
  {
    id: 'p6',
    movieId: 'm4',
    movieTitle: 'Devara: Part 1',
    title: 'Offscreen Smile',
    description: 'Jr. NTR laughing with director Koratala Siva between takes.',
    imageUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&q=80&w=800',
    category: 'Offscreen',
    fileSize: '1.5 MB',
    dimensions: '2048x1365'
  }
];

export const VIDEOS: Video[] = [
  {
    id: 'v1',
    movieId: 'm2',
    movieTitle: 'RRR',
    title: 'Naatu Naatu Full Video Song',
    description: 'The Golden Globe and Oscar-winning dance routine with dynamic energy.',
    videoUrl: 'sAz7XFisqK4',
    category: 'BehindTheScenes',
    duration: '4:35',
    views: '240M'
  },
  {
    id: 'v2',
    movieId: 'm4',
    movieTitle: 'Devara: Part 1',
    title: 'Fear Song Lyric Video',
    description: 'Anirudh Ravichander’s heart-pumping musical tribute to Devara.',
    videoUrl: '3GZsc_WzN2o',
    category: 'Teaser',
    duration: '3:20',
    views: '85M'
  },
  {
    id: 'v3',
    movieId: 'm2',
    movieTitle: 'RRR',
    title: 'Bheem Tiger Entry Scene',
    description: 'Unleashing beasts inside the British Palace courtyard.',
    videoUrl: 'NgBoMJy386M',
    category: 'Cut',
    duration: '6:15',
    views: '45M'
  }
];

export const TIMELINE: TimelineMilestone[] = [
  {
    id: 't1',
    year: 1923,
    title: 'The Birth of a Legend',
    description: 'Nandamuri Taraka Rama Rao was born in Nimmakuru, Andhra Pradesh. His humble origins would shape his deep connection to ordinary villagers.',
    category: 'Personal'
  },
  {
    id: 't2',
    year: 1949,
    title: 'Cinematic Debut in Mana Desam',
    description: 'Debut in Telugu cinema in a minor role as a police inspector. Soon gained acclaim for his dedication and discipline.',
    category: 'Cinematic'
  },
  {
    id: 't3',
    year: 1957,
    title: 'Mayabazar and Divine Status',
    description: 'Portrayed Lord Krishna in Mayabazar, creating a deep mythological impression. Devotees began worshiping his portrait in their prayer rooms.',
    category: 'Cinematic'
  },
  {
    id: 't4',
    year: 1982,
    title: 'Telugu Desam Party (TDP) Founding',
    description: 'Founded the TDP political party to restore "Telugu self-respect" (Telugu Vari Atma Gauravam), launching a historic Chaitanya Ratham chariot tour across AP.',
    category: 'Political'
  },
  {
    id: 't5',
    year: 1983,
    title: 'Historic Sweep as Chief Minister',
    description: 'Elected Chief Minister of Andhra Pradesh with a landslide victory within 9 months of founding the party, introducing revolutionary welfare schemes like ₹2 per kg rice.',
    category: 'Political'
  },
  {
    id: 't6',
    year: 1983,
    title: 'Birth of Jr. NTR (NTR Jr)',
    description: 'Nandamuri Taraka Rama Rao Jr. was born to Harikrishna, carrying forward the great name and cinematic genius of his grandfather.',
    category: 'Personal'
  },
  {
    id: 't7',
    year: 2001,
    title: 'Jr. NTR’s Breakthrough with Student No. 1',
    description: 'Tarak debuted as a lead and struck massive commercial gold with Student No. 1 under director S. S. Rajamouli, beginning a historic partnership.',
    category: 'Cinematic'
  },
  {
    id: 't8',
    year: 2022,
    title: 'RRR and Global Acclaim',
    description: 'Tarak starred as Komaram Bheem in Rajamouli\'s RRR, garnering global critical acclaim, Oscar winning triumphs, and representing Telugu pride globally.',
    category: 'Cinematic'
  }
];
