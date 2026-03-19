# syntax=docker/dockerfile:1

# ============================================
# Poker Tournament Server - Production Image
# ============================================

FROM node:22-alpine AS base

# Install security updates
RUN apk update && apk upgrade --no-cache

# ---- Dependencies ----
FROM base AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# ---- Builder ----
FROM base AS builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript
RUN npm run build

# ---- Production ----
FROM base AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S poker -u 1001 -G nodejs

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy runtime config files
COPY tournaments.config.js ./
COPY tables.config.js ./

# Copy public assets
COPY public ./public

# Copy bot templates (for reference/documentation)
COPY bots ./bots

# Create data directory for SQLite
RUN mkdir -p /app/data /app/logs && \
    chown -R poker:nodejs /app/data /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV DB_PATH=/app/data/poker.db
ENV LOG_DIR=/app/logs

# Switch to non-root user
USER poker

# Expose the server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node --experimental-sqlite -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run the server with experimental sqlite support
CMD ["node", "--experimental-sqlite", "dist/server.js", "3000"]
