# K-Vault Project Guidelines

K-Vault is a self-hosted YouTube-style video streaming platform. Videos are uploaded to Google Drive, transcoded to HLS by a local worker, and streamed back via the NestJS backend.

## Architecture

| App            | Port | Tech                                           |
| -------------- | ---- | ---------------------------------------------- |
| `apps/backend` | 3001 | NestJS 11, TypeORM, BullMQ, Google Drive       |
| `apps/web`     | 3000 | Next.js 16 App Router, Tailwind CSS v4, hls.js |
| `apps/worker`  | —    | BullMQ worker, FFmpeg, googleapis, raw `pg`    |

**Shared packages** (imported as `@repo/...`): `@repo/ui`, `@repo/eslint-config`, `@repo/typescript-config`

**Storage**: Google Drive (all video files). **Queue**: Upstash Redis via BullMQ (queue name: `transcode`). **DB**: Neon Postgres.

## Build & Dev Commands

```sh
# Root — runs all apps in parallel via Turborepo
pnpm dev          # start all (backend :3001, web :3000, worker)
pnpm build        # build all
pnpm lint         # lint all
pnpm format       # prettier --write

# Per-app (cd into the app first, or use turbo --filter)
pnpm dev          # backend: nest start --watch
pnpm dev          # web: next dev --port 3000
pnpm dev          # worker: ts-node src/main.ts
pnpm dev:watch    # worker: nodemon auto-restart

# Backend tests
pnpm test         # Jest unit tests
pnpm test:e2e     # e2e suite
```

## Key Conventions

### Backend (NestJS)

- **Global prefix `/api`** — every endpoint is under `/api`. Frontend requests must include it explicitly (e.g. `axios.get('/api/videos')`).
- **Validation**: `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` — always use DTOs with class-validator decorators.
- **TypeORM `synchronize: true`** in non-production. Schema changes require a backend restart to apply — never expect changes to apply without restart.
- TypeORM entities use camelCase properties mapped to snake_case column names via `name:` option (e.g. `rawDriveFileId` → `raw_drive_file_id`).

### Worker

- Plain TypeScript — no NestJS DI. Uses `ts-node` directly in dev.
- DB access via raw `pg` Pool (not TypeORM) with direct SQL queries in `src/db.ts`.
- FFmpeg codec: **`h264_videotoolbox`** (Apple Silicon hardware encoder). Change to `libx264` on non-Apple platforms.
- Upstash Redis URL requires **password-only auth** (no username). A custom `parseRedisUrl()` exists in `src/main.ts` — do not replace with `new URL()` which corrupts Upstash passwords containing special chars.

### Google Drive

- **Do not use the googleapis SDK for resumable uploads** — it doesn't expose the `Location` header. Use raw `axios.post` to `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable` instead (see `google-drive.adapter.ts`).
- Use `drive.files.generateIds()` to pre-allocate file IDs before initiating a resumable session.
- All HLS files for a video live in a **per-video subfolder** named `{videoId}` inside the configured Drive parent folder. The folder's Drive ID is stored in `hls_folder_drive_id` on the `videos` table.

### Environment Variables

Backend requires (validated on startup via `src/config/env.validation.ts`):

```
DATABASE_URL        # Neon Postgres connection string
REDIS_URL           # Upstash Redis URL (rediss://:password@host:port)
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
DRIVE_FOLDER_ID     # Root Drive folder for uploads
CORS_ORIGIN         # e.g. http://localhost:3000
```

Worker loads `.env` via `dotenv/config` — needs the same Drive/Redis/DB vars.

## Data Flow

1. **Upload**: Browser → `POST /api/videos` (create record) → `POST /api/storage/initiate-upload` (get Drive resumable URL) → Browser PUTs directly to Drive session URL → `PATCH /api/videos/:id` (save `rawDriveFileId`) → job pushed to `transcode` queue.
2. **Transcode**: Worker picks up job → downloads raw file from Drive → FFmpeg HLS transcode → creates `{videoId}/` subfolder in Drive → moves raw file into it → uploads `.ts` segments + `playlist.m3u8` → saves chunk records + `hls_folder_drive_id` to DB → marks video `ready`.
3. **Stream**: `GET /api/stream/:videoId/playlist.m3u8` → backend fetches playlist from Drive, rewrites `.ts` URLs to `/api/stream/chunk/{driveFileId}` → player requests each chunk → backend proxies from Drive.

## File Map

| Path                                               | Responsibility                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/backend/src/storage/google-drive.adapter.ts` | Drive auth, resumable upload initiation (raw axios), file/folder CRUD |
| `apps/backend/src/video/video.service.ts`          | Video CRUD, delete (folder + chunk records)                           |
| `apps/backend/src/stream/stream.service.ts`        | Playlist rewrite, chunk proxy                                         |
| `apps/backend/src/video/entities/video.entity.ts`  | DB schema for `videos` table                                          |
| `apps/worker/src/drive.ts`                         | Worker-side Drive helpers: download, upload, createFolder, moveFile   |
| `apps/worker/src/ffmpeg.ts`                        | FFmpeg HLS transcode wrapper                                          |
| `apps/worker/src/db.ts`                            | Raw SQL helpers for worker → DB writes                                |
| `apps/web/lib/api.ts`                              | Axios API client (base URL = `NEXT_PUBLIC_API_URL/api`)               |

## Coding Standards & Engineering Principles

1. SOLID Principles Implementation
   S (Single Responsibility): Each class/function must have one, and only one, reason to change.

Controllers: Handle routing, request validation, and calling services only.

Services: Contain core business logic.

Adapters/Providers: Encapsulate third-party communication (e.g., Google Drive API).

O (Open/Closed): Software entities should be open for extension but closed for modification. Favor Interfaces or Abstract Classes.

Example: Define a StorageProvider interface to allow switching from Google Drive to S3 without modifying VideoService.

L (Liskov Substitution): Subclasses must be substitutable for their base classes without altering the correctness of the program.

I (Interface Segregation): Do not force a class to implement methods it does not use. Keep interfaces granular and focused.

D (Dependency Inversion): Always inject dependencies via Constructor Injection (NestJS DI). Never use the new keyword to instantiate dependencies inside a class.

2. Pragmatic Rules (DRY, KISS, YAGNI)
   DRY (Don't Repeat Yourself):

If logic appears twice, extract it into a helper or a shared method.

Shared logic between backend and worker must reside in @repo/shared.

KISS (Keep It Simple, Stupid): Prioritize readability over "clever" code.

Avoid nesting if/else statements beyond 3 levels.

Favor Early Returns to reduce cognitive load.

YAGNI (You Ain't Gonna Need It): Do not implement features or handling for "future possibilities." Focus strictly on the current task requirements.

3. Design Patterns for K-Vault
   Adapter Pattern: Wrap external SDKs (Google Drive, FFmpeg) within Adapter classes to decouple the core logic and enable easy Mocking in unit tests.

Strategy Pattern: Use when multiple algorithms or implementations exist for the same task (e.g., selecting different FFmpeg encoders based on the host OS).

Repository Pattern: Encapsulate complex TypeORM queries into dedicated repository files instead of scattering them across services.

Factory Pattern: Use for creating complex objects or structured Job data for BullMQ.

4. Code Quality & Clean Code
   Method Length: Functions should ideally not exceed 30 lines. If a function is longer, decompose it into smaller, private helpers.

Naming Conventions:

Variables/Functions: camelCase.

Classes/Interfaces: PascalCase.

Constants: UPPER_SNAKE_CASE.

Function Names: Must start with a verb (e.g., getPlaylist, transcodeVideo, initiateUpload).

Error Handling: Avoid excessive try-catch blocks. Allow exceptions to bubble up and be handled centrally by the Global Exception Filter in the backend. Use custom HttpException classes for specific error cases.
