# =============================================================================
# Cornerstone - Multi-stage Docker build
# =============================================================================
# Stage 1 (app-builder): Runs on the BUILD HOST's native arch to avoid
#   QEMU emulation. Installs pure-JS deps and builds everything that produces
#   platform-independent output: shared types (tsc), client (webpack), and
#   server (tsc). No native addons needed — better-sqlite3 is skipped via
#   --ignore-scripts.
# Stage 2 (deps): Runs on the TARGET arch to install production deps with
#   native addons. better-sqlite3 v12+ ships prebuilt binaries for
#   linuxmusl-arm64, so no compilation tools are needed — prebuild-install
#   downloads the correct binary during postinstall.
# Stage 3 (production): Minimal runtime image, no npm/build tools/shell.
# =============================================================================
# Standard build: docker build -t cornerstone .
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: App builder (native arch — no QEMU)
# ---------------------------------------------------------------------------
# $BUILDPLATFORM resolves to the Docker host's native architecture (e.g.
# linux/amd64 on GitHub Actions), so webpack and tsc run without QEMU
# emulation. All build output is platform-independent JS/CSS/HTML.
FROM --platform=$BUILDPLATFORM dhi.io/node:24-alpine3.23-dev AS app-builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# Install all dependencies, skipping postinstall scripts. This avoids
# compiling better-sqlite3 (the only native addon) — it's not needed for
# any build step (tsc/webpack produce platform-independent output).
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

# Stamp the release version into package.json (webpack's DefinePlugin reads
# this to embed __APP_VERSION__ in the client bundle).
ARG APP_VERSION=0.0.0-dev
RUN npm pkg set "version=${APP_VERSION}"

# Copy all source (shared, client, server)
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY client/ client/
COPY server/ server/

# Build everything: shared types (tsc) → client (webpack) → server (tsc)
# All output is platform-independent JS — safe to run on build host's arch.
RUN npm run build -w shared && npm run build -w client && npm run build -w server

# ---------------------------------------------------------------------------
# Stage 2: Production dependencies (target arch)
# ---------------------------------------------------------------------------
# Runs on target platform so prebuild-install downloads the correct
# architecture's prebuilt binary for better-sqlite3. No build tools needed —
# the prebuild is fetched from GitHub Releases, not compiled.
FROM dhi.io/node:24-alpine3.23-dev AS deps

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
COPY docs/package.json docs/

# Install production dependencies only. better-sqlite3's postinstall
# (prebuild-install) downloads the matching prebuilt .node binary for the
# target platform — no compilation, no build-base/python3 needed.
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# Create backups directory (for copying into production stage)
RUN mkdir -p /backups

# ---------------------------------------------------------------------------
# Stage 3: Production (no shell — exec form only)
# ---------------------------------------------------------------------------
FROM dhi.io/node:24-alpine3.23 AS production

# Create data directory (WORKDIR creates intermediate dirs without needing shell)
WORKDIR /app/data
WORKDIR /app

# Copy runtime libraries needed by native addons (better-sqlite3 requires libgcc/libstdc++)
COPY --from=deps /usr/lib/libgcc_s.so.1 /usr/lib/
COPY --from=deps /usr/lib/libstdc++.so.6* /usr/lib/

# Copy package files (needed for workspace resolution)
COPY package.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
COPY docs/package.json docs/

# Copy production node_modules from deps (npm hoists most deps to root,
# but some may remain in workspace-specific node_modules due to version constraints)
COPY --from=deps /app/node_modules/ node_modules/
COPY --from=deps /app/server/node_modules/ server/node_modules/

# Copy built artifacts from app-builder
COPY --from=app-builder /app/shared/dist/ shared/dist/
COPY --from=app-builder /app/server/dist/ server/dist/
COPY --from=app-builder /app/client/dist/ client/dist/

# Copy SQL migration files (tsc does not copy non-TS assets)
COPY --from=app-builder /app/server/src/db/migrations/ server/dist/db/migrations/

# Create backups directory with correct ownership
COPY --from=deps --chown=node:node /backups /backups

# Expose server port
EXPOSE 3000

# SQLite data volume
VOLUME ["/app/data"]

# Backups volume
VOLUME ["/backups"]

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL=/app/data/cornerstone.db
ENV LOG_LEVEL=info
ENV CURRENCY=EUR

# Health check — exec form required (DHI production image has no /bin/sh)
# Uses /api/health/ready which verifies DB access and password hashing round-trip
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3000/api/health/ready').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"]

# Start the server
CMD ["node", "server/dist/server.js"]
