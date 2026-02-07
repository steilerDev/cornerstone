# =============================================================================
# Cornerstone - Multi-stage Docker build
# =============================================================================
# Stage 1: Install dependencies and build
# Stage 2: Production runtime (minimal image)
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY server/ server/
COPY client/ client/

# Build shared types, then client (Vite), then server (tsc)
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Production
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S cornerstone && \
    adduser -S cornerstone -u 1001 -G cornerstone

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci --omit=dev && npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/shared/dist/ shared/dist/
COPY --from=builder /app/server/dist/ server/dist/
COPY --from=builder /app/client/dist/ client/dist/

# Create data directory for SQLite (to be mounted as a volume)
RUN mkdir -p /app/data && chown cornerstone:cornerstone /app/data

# Switch to non-root user
USER cornerstone

# Expose server port
EXPOSE 3000

# SQLite data volume
VOLUME ["/app/data"]

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL=/app/data/cornerstone.db
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the server
# Node.js 20+ handles signals properly as PID 1 when using --experimental-detect-module
CMD ["node", "server/dist/server.js"]
