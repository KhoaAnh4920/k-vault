# syntax=docker/dockerfile:1

# Stage 1: Debian base for FFmpeg & HW acceleration support
FROM node:24-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# Stage 2: Prune workspace for 'kvault-worker'
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
# Note: package.json name is kvault-worker
RUN turbo prune kvault-worker --docker

# Stage 3: Install dependencies
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Stage 4: Build
FROM base AS builder
WORKDIR /app
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=kvault-worker...

# Stage 5: Production dependencies isolation
FROM base AS prod-installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --prod --frozen-lockfile

# Stage 6: Runner (with FFmpeg & Intel/VAAPI drivers)
FROM base AS runner
WORKDIR /app

# Install native FFmpeg
# We conditionally install Intel VAAPI drivers ONLY if building on x86_64 architecture (like the N100)
# This prevents crashes when building on ARM64 (Apple Silicon MacBooks)
RUN apt-get update && apt-get install -y ffmpeg && \
    if [ "$(uname -m)" = "x86_64" ]; then \
        apt-get install -y intel-media-va-driver vainfo || true; \
    fi && \
    rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker && \
    # Add worker to video group so it has permissions to access /dev/dri (card0, renderD128)
    usermod -aG video worker && \
    chown -R worker:nodejs /app

USER worker

ENV NODE_ENV=production

# By setting custom paths, the worker will use native Debian FFmpeg with hardware acceleration 
# Instead of tracking the @ffmpeg-installer static binaries
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

# Copy production dependencies
COPY --from=prod-installer /app/node_modules ./node_modules
COPY --from=prod-installer /app/apps/worker/node_modules ./apps/worker/node_modules

# Copy compiled code from builder
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json

CMD ["node", "apps/worker/dist/main.js"]
