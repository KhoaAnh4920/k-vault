# syntax=docker/dockerfile:1

# Stage 1: Alpine base
FROM node:24-alpine AS alpine
RUN apk add --no-cache libc6-compat
# Setup corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Stage 2: Prune workspace for 'web'
FROM alpine AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
# Prune creates a sparse workspace with ONLY what 'web' needs
RUN turbo prune web --docker

# Stage 3: Install dependencies
FROM alpine AS installer
WORKDIR /app
# First copy over only the pnpm-lock.yaml and isolated package.json files
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# Install all dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile

# Stage 4: Build
FROM alpine AS builder
WORKDIR /app
# Copy over node_modules
COPY --from=installer /app/ .
# Copy the actual source code of the pruned workspace
COPY --from=pruner /app/out/full/ .

# IMPORTANT: Next.js evaluates NEXT_PUBLIC vars at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-"http://localhost:3001/api"}

# Next.js telemetry disable
ENV NEXT_TELEMETRY_DISABLED=1
# Run the build
RUN pnpm turbo run build --filter=web...

# Stage 5: Runner
FROM alpine AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app

USER nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy the standalone output
COPY --from=builder /app/apps/web/public ./apps/web/public
# The standalone build includes hoisted dependencies in the root
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
