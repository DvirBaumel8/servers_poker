# syntax=docker/dockerfile:1

# ============================================
# Poker Tournament Server - Production Image
# ============================================

FROM node:22-alpine AS base

# ---- Dependencies ----
FROM base AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies — npm cache persists across builds via BuildKit cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ---- Builder ----
FROM base AS builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript
RUN --mount=type=cache,target=/root/.npm \
    npm run build

# Prune devDependencies in place — no install scripts run, just package removal
RUN --mount=type=cache,target=/root/.npm \
    npm prune --omit=dev

# ---- Production ----
FROM base AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S poker -u 1001 -G nodejs

# Copy pruned node_modules and built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Create logs directory
RUN mkdir -p /app/logs && \
    chown -R poker:nodejs /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
# Default empty — override via render.yaml or docker run -e NODE_OPTIONS=...
# Example for memory-constrained deployments: --max-old-space-size=400
ENV NODE_OPTIONS=""

# Switch to non-root user
USER poker

# Expose the server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run DB migrations then start the NestJS server
CMD ["sh", "-c", "node dist/src/migrations/run.js && node dist/src/main.js"]
