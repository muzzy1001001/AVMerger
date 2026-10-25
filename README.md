# AV Merger

A real local React + Vite / Express media merger. Drop a video and a separate audio track, rename, merge, preview, and download MP4. Uploads and processing stay on this computer; no cloud service, database, or external fonts are needed.

## Quick start on this Windows computer

Open PowerShell:

```powershell
cd C:\Users\xtian\Desktop\codings\AV-Merger
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Open **http://127.0.0.1:5173**. Leave the terminal running. Ctrl+C stops the app.

The launcher finds the portable Node.js under .tools and installs dependencies only if missing.

For a single server serving the compiled application:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1 -Production
```

Open **http://127.0.0.1:3001**.

## Standard Node.js setup

With Node.js 22.12+ on PATH:

```powershell
npm install
npm run dev
# Or:
npm run build
npm start
# Validation:
npm run check
npm test
```

The lockfile records exact dependency versions. Use npm ci for a clean repeatable install. Portable tools and installed dependencies are ignored by Git.

## FFmpeg / FFprobe

The app discovers optional FFMPEG_PATH / FFPROBE_PATH environment settings first, system PATH next, project-local .tools/*/bin binaries next, then the bundled Windows npm binaries. Windows dependencies include packaged fallback executables; their versions differ and the FFmpeg fallback is older. Prefer a current FFmpeg installation for newer codecs.

To install a current Windows release manually:

1. Download the **release essentials ZIP** from https://www.gyan.dev/ffmpeg/builds/ (linked by https://ffmpeg.org/download.html).
2. Extract it, e.g. to C:\ffmpeg.
3. Copy .env.example to .env at the project root.
4. Set FFMPEG_PATH=C:/ffmpeg/bin/ffmpeg.exe and FFPROBE_PATH=C:/ffmpeg/bin/ffprobe.exe (adjust to the extracted location).
5. Restart the app. The warning banner disappears when both tools are available.

Alternatively add the bin directory to Windows PATH and restart PowerShell. On other platforms install FFmpeg using your OS package manager. The Windows binary dependencies will need to be removed or made optional for a non-Windows installation.

## Use

1. Drop a video into Video source and a separate audio file into Audio track, or use Browse files.
2. Wait for upload and FFprobe validation. File cards show codec, duration, size and video resolution. Replace or remove as needed.
3. Choose the output name. Invalid Windows filename characters are replaced automatically.
4. Auto preserves MP4-compatible video and audio streams; incompatible audio becomes AAC and incompatible video becomes H.264. Preserve video refuses video that needs conversion. H.264 mode explicitly re-encodes for browser compatibility.
5. Click Merge Video & Audio. Progress comes from FFmpeg through Server-Sent Events, with status polling if SSE disconnects. Cancel stops the FFmpeg process.
6. Preview and Download MP4. Merge another starts fresh. Session history keeps previous completed downloads available. Delete asks for confirmation.

The uploaded audio replaces the original audio. The result ends at the shorter stream; a warning highlights significant duration differences. H.264 conversion uses CRF 18 and preserves resolution except that odd dimensions are padded by one pixel when needed for yuv420p. Compatible streams are copied without generation loss. Some copied codecs, including HEVC or MP3 in MP4, may not play in every browser: download and use a suitable player, or choose H.264 mode.

## Four workspaces

The page contains four independent workspaces. Each has its own video, audio, output name, quality settings, progress, preview, download and recent jobs. Use the numbered links to jump between workspaces without losing selections. Processing concurrency is controlled separately by MAX_CONCURRENT_JOBS (default 2); set it to 4 in .env if you want to allow four simultaneous merges and have sufficient CPU and disk space.

## Configuration

Copy .env.example to .env. Defaults: localhost only, API port 3001, 4 GiB per file, 2-hour retention, 2 simultaneous merges. MAX_UPLOAD_MB applies separately to each upload. Use local storage with ample free space. Uploads are disk-based; the app checks available space but an upload or conversion can still exhaust the disk if other programs consume space.

If you change PORT, update the frontend Vite proxy target too. HOST should normally remain 127.0.0.1. This is a local, single-user tool without accounts or authentication; exposing it to a network requires additional access control.

## Storage and lifecycle

Each upload and output has a UUID directory. Original names are metadata only; spawned tools receive argument arrays with shell execution disabled. Jobs reference their source uploads; cleanup does not remove inputs used by retained jobs. Output streams and downloads hold a reader count that prevents deletion while active.

Abandoned uploads and finished jobs expire after RETENTION_HOURS and are swept every minute. Files left after a restart are reclaimed by directory age after retention; jobs are kept in memory and cannot be resumed after server restart. Download before stopping the server. Interrupted multipart uploads are cleaned up by Multer and upload-error cleanup; a restart sweep handles orphan directories. Cleanup never targets paths outside backend/uploads and backend/outputs.

## API

- GET /api/health — tool availability and public limits
- POST /api/upload?kind=video|audio — multipart field file; returns upload ID and metadata
- POST /api/merge — JSON {videoId,audioId,filename,mode}; mode: auto | copy | encode
- GET /api/jobs/:id — status, progress, output metadata
- GET /api/jobs/:id/events — Server-Sent Events
- POST /api/jobs/:id/cancel — cancel and wait for process exit
- GET /api/jobs/:id/download — MP4 attachment
- GET /api/jobs/:id/preview — byte-range MP4 streaming
- DELETE /api/jobs/:id — cancel if necessary and delete files (409 while streaming)

## Checks

npm run test:e2e runs desktop and mobile browser checks using an installed Microsoft Edge browser, including preview playback and a real download. Screenshots are saved in .qa/. The test suite starts and stops its own server; port 3001 must be free.

The retention test protects active downloads and checks stale-orphan cleanup.

npm test generates real media with FFmpeg in the OS temporary directory, runs an isolated API on port 3198, and checks MP4+MP3, MP4+M4A, MKV+AAC, WAV conversion, VP9 conversion, sources with/without original audio, shorter duration, stream synchronization timestamps, copied packet hashes, selected audio replacement, decoding, download/range preview, invalid uploads, duplicate requests, SSE, cancellation, deletion and upload-size limits. It also checks filename safety and codec selection.

The upload-size test uses a 33 MiB file against a 32 MiB configured limit. Multi-gigabyte files are supported by disk storage but are not exhaustively exercised by the automated suite. Tests verify timestamps and decode validity, not human-perceived lip sync.

## Layout

frontend/src/components contains upload UI; hooks contains job subscription logic; services contains API helpers. backend/routes, controllers, services and middleware separate routing, request handling, processing and errors. .env is loaded from the project root.

Built using the official [Vite guide](https://vite.dev/guide/), [Multer disk upload API](https://expressjs.com/en/resources/middleware/multer/) and [FFmpeg CLI documentation](https://www.ffmpeg.org/ffmpeg.html).
