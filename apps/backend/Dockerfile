# syntax=docker/dockerfile:1

# Stage 1: Alpine base
FROM node:24-alpine AS alpine
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@latest --activate

# Stage 2: Prune workspace for 'kvault-backend'
FROM alpine AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
# Note: package.json name is kvault-backend
RUN turbo prune kvault-backend --docker

# Stage 3: Install dependencies
FROM alpine AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Stage 4: Build
FROM alpine AS builder
WORKDIR /app
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=kvault-backend...

# Stage 5: Production dependencies isolation
FROM alpine AS prod-installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# Only install production dependencies to keep the image small
RUN pnpm install --prod --frozen-lockfile

# Stage 6: Runner
FROM alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs && \
    chown -R nestjs:nodejs /app

USER nestjs

ENV NODE_ENV=production
ENV PORT=3001

# Copy production dependencies
COPY --from=prod-installer /app/node_modules ./node_modules
COPY --from=prod-installer /app/apps/backend/node_modules ./apps/backend/node_modules

# Copy compiled code from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json

EXPOSE 3001

CMD ["node", "apps/backend/dist/src/main.js"]
