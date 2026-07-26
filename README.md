# NTR Filmography

A web application for exploring the filmography, media, and discography of actor Jr. NTR (Nandamuri Taraka Rama Rao). The app displays movie listings, posters, high-resolution photo galleries, video cuts, trailers, and audio soundtracks stored in Cloudflare R2.

## Features

- Filmography browser filtered by movie, release year, and category
- Photo gallery with full-resolution lightbox viewer
- Video cut player and audio player for soundtracks
- Bulk media download as ZIP files
- Local caching with IndexedDB and Cache Storage to speed up asset loading
- Server proxy for streaming R2 objects and handling Range header requests

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- Hono
- Cloudflare R2
- Motion
- JSZip
- Lucide React

## Project Structure

```
├── public/                # Static assets, web manifest, and headers
├── src/
│   ├── components/        # UI components (MediaViewer, MovieVideoPlayer, LazyVideo, etc.)
│   ├── data/              # Static metadata and mock data fallbacks
│   ├── server/            # Hono API routes for fetching R2 media and proxy downloads
│   ├── utils/             # Media caching logic and file helper functions
│   ├── App.tsx            # Main application layout and state logic
│   ├── index.css          # Tailwind imports and global styles
│   ├── main.tsx           # Entry point
│   └── types.ts           # Type definitions
├── functions/             # Cloudflare Pages functions entry point
├── server.ts              # Node development and production server using Hono
└── package.json           # Scripts and dependencies
```

## How It Works

- Frontend: A React single-page app that handles movie filtering, gallery views, media playback, and client-side ZIP generation for downloads.
- Backend: Hono routes (`src/server/api.ts`) handle asset listing, media metadata responses, and proxying video/image streams from Cloudflare R2.
- Storage: Media files are stored in a Cloudflare R2 bucket. The backend queries prefixes and returns file data to the client.
- Caching: The app saves R2 metadata in IndexedDB and uses the browser Cache Storage API to cache loaded images and videos.
- Downloads: Bulk downloads use JSZip in the browser to bundle selected images or videos without sending zip creation workloads to the server.

## Running Locally

1. Clone the repository:
   ```bash
   git clone <https://github.com/jaswanth1309/ntrfilmography.live.git>
   cd ntrfilmography
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```
   Access the app at `http://localhost:3000`.

## Environment Variables

| Variable | Description |
| --- | --- |
| `CLOUDFLARE_R2_ENDPOINT` | Endpoint for the Cloudflare R2 bucket |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 access key ID |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `CLOUDFLARE_R2_BUCKET_NAME` | R2 bucket name |
| `CLOUDFLARE_R2_PUBLIC_URL` | Public URL for serving R2 assets directly |
| `ADMIN_RESCAN_TOKEN` | Token for triggering manual R2 bucket rescans |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `VITE_API_BASE_URL` | Base URL for backend API calls if host differs |

## Build

To build the client and server for production:

```bash
npm run build
```

This generates:
- `dist/`: Static frontend assets compiled by Vite
- `dist/server.cjs`: Bundled Node server compiled with esbuild

To start the production server:

```bash
npm start
```

## Deployment

The project can be deployed in two ways:

- Cloudflare Pages: Deploy the `dist/` folder to Cloudflare Pages and attach the Hono worker function under `functions/api/[[path]].ts` with an R2 binding named `MY_BUCKET`.
- Node Server: Run `npm run build` and start the server using `npm start` (`node dist/server.cjs`).

## Notes

- If no Cloudflare R2 bucket is bound in local development, the backend automatically uses fallback mock data so the UI remains functional.
- The server supports Range headers on media streaming routes to handle video seeking properly.
- IndexedDB stores compressed R2 metadata to keep initial payload sizes small on repeat visits.

## License

This project is maintained as a personal project.
