# K-Vault System Architecture & Codebase Context

## 1. Executive Summary
K-Vault is a scalable video/media processing and streaming platform. The project is organized as a **Monorepo** managed by **Turborepo** (`turbo.json`) and **pnpm** workspaces, separating concerns into a Next.js frontend, a NestJS core backend API, and a dedicated worker node for compute-heavy video transcoding. 

## 2. Infrastructure & Services
The local development environment is orchestrated via `docker-compose.yml` and consists of the following backing services:
- **PostgreSQL (15)**: Primary relational database storing user, video metadata, and system state.
- **Redis (7)**: Message broker and queue management, facilitating communication between the `backend` and the `worker` for asynchronous tasks (e.g., video processing jobs).
- **Minio (S3 Compatible)**: Object storage for saving uploaded raw videos and transcoded video chunks (HLS segments).

## 3. Directory Structure & Workspaces

### `apps/web` (Frontend Client)
- **Framework:** Next.js 16 (App Router), React 19.
- **Styling & UI:** Tailwind CSS v4, `shadcn/ui`, `@base-ui/react`, and `lucide-react`.
- **Media Player:** `@vidstack/react` combined with `hls.js` for adaptive bitrate HTTP Live Streaming.
- **Auth:** `next-auth` integrated with Auth0.
- **Role:** Providing the user interface, video player, and upload capabilities. Talks directly to the backend API (`NEXT_PUBLIC_API_URL=http://localhost:3001/api`).

### `apps/backend` (Core API)
- **Framework:** NestJS.
- **Modules (`src/`):**
  - `auth`: Handles JWT parsing from Auth0, role-based access control.
  - `video` & `stream`: Core business logic for serving streams, managing video entities.
  - `storage`: S3/Minio integration for file uploads and fetching chunks.
  - `queue`: Dispatching transcode jobs to Redis queues.
  - `database`: DB ORM integration (Postgres connection).
- **Role:** The central gateway governing business rules, serving the Next.js frontend, and delegating heavy processing to the message queue.

### `apps/worker` (Transcode Engine)
- **Framework:** Node.js + TypeScript (Standalone background daemon).
- **Key Capabilities:**
  - `transcode`: Integrates heavily with `ffmpeg` (Hardware GPU acceleration via QuickSync `/dev/dri`).
  - `storage`: Manages direct pulling/pushing of media files to S3/Google Drive.
- **Role:** Listens to Redis for new video upload events, downloads the raw files, runs FFmpeg to shard videos into HLS chunks (.ts/.m3u8), and uploads results back to object storage. Updates Postgres asynchronously upon job completion.

### `packages/*`
- **`@repo/ui`**: Shared UI components/design system.
- **`@repo/eslint-config`**, **`@repo/typescript-config`**: Shared linting and TS bases to ensure uniform code quality across the monorepo.

## 4. System Data Flow
1. **Upload Phase:** 
   - User uploads a video via `apps/web`.
   - `apps/backend` receives the file, stores raw media to Minio (S3), and saves a `Video` record in Postgres with status `pending`.
   - `apps/backend` pushes a "transcode" job to the Redis queues.
2. **Processing Phase:** 
   - `apps/worker` consumes the transcode job from Redis.
   - It pulls the raw file from Minio.
   - `ffmpeg` transcodes the video into multiple resolutions/bitrates (HLS format).
   - `worker` uploads the chunks (`.ts`) and manifests (`.m3u8`) back to Minio.
   - `worker` updates the Postgres record to `ready`.
3. **Streaming Phase:**
   - User clicks a video in `apps/web`.
   - `apps/web` player (`vidstack` + `hls.js`) requests the `.m3u8` playlist via `apps/backend` (or directly from signed Minio URLs).
   - Video streams dynamically resolving chunks.

## 5. Coding Principles & Guidelines (For AI Context)
- **Strictly Type-Safe:** Follow TypeScript strict modes. 
- **Modularity:** Ensure NestJS modules are highly decoupled. Do not cross-import services unnecessarily.
- **Robust Error Handling:** Worker tasks must have retry mechanisms and dead-letter queue handling.
- **Secret Management:** Secrets are injected via `.env` and `docker-compose`. Never hardcode keys like `S3_SECRET_KEY` or `AUTH0` credentials.

---
> *Note for AI Agents: Refer to this document at the start of any conversation to regain deep context of the K-Vault architecture.*
