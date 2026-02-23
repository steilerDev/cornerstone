# =============================================================================
# Cornerstone - Multi-stage Docker build
# =============================================================================
# Stage 1: Install dependencies and build (DHI dev image with npm + build tools)
# Stage 2: Production runtime (DHI minimal image, no npm/build tools/shell)
# =============================================================================
# Standard build:
#   docker build -t cornerstone .
# Behind a proxy with CA cert:
#   docker build \
#     --build-arg HTTP_PROXY=$HTTP_PROXY --build-arg HTTPS_PROXY=$HTTPS_PROXY \
#     --secret id=proxy-ca,src=$SSL_CERT_FILE -t cornerstone .
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM dhi.io/node:24-alpine3.23-dev AS builder

WORKDIR /app

# Proxy build args — pass --build-arg HTTP_PROXY=... if behind a proxy
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy

# Install proxy CA cert if provided, and build tools for better-sqlite3
RUN --mount=type=secret,id=proxy-ca \
    if [ -f /run/secrets/proxy-ca ]; then \
      cat /run/secrets/proxy-ca >> /etc/ssl/certs/ca-certificates.crt && \
      npm config set cafile /etc/ssl/certs/ca-certificates.crt; \
    fi && \
    apk update && apk add --no-cache build-base python3

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
COPY docs/package.json docs/

# Install all dependencies (including devDependencies for build).
# Native addons (better-sqlite3) auto-detect musl libc and compile from
# source when no matching prebuild is available — no --build-from-source needed.
RUN --mount=type=cache,target=/root/.npm npm ci

# Stamp the release version into package.json (set at build time by CI;
# defaults to 0.0.0-dev for local builds). This keeps the version visible
# in the running container without committing it back to the repo.
ARG APP_VERSION=0.0.0-dev
RUN npm pkg set "version=${APP_VERSION}"

# Copy source code
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY server/ server/
COPY client/ client/

# Build shared types, then client (Webpack), then server (tsc)
RUN npm run build

# Remove devDependencies, preserve built artifacts and compiled native addons
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Stage 2: Production (no shell — exec form only)
# ---------------------------------------------------------------------------
FROM dhi.io/node:24-alpine3.23 AS production

# Create data directory (WORKDIR creates intermediate dirs without needing shell)
WORKDIR /app/data
WORKDIR /app

# Copy runtime libraries needed by native addons (better-sqlite3 requires libgcc/libstdc++)
COPY --from=builder /usr/lib/libgcc_s.so.1 /usr/lib/
COPY --from=builder /usr/lib/libstdc++.so.6* /usr/lib/

# Copy package files (needed for workspace resolution)
COPY package.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
COPY docs/package.json docs/

# Copy production node_modules from builder (npm hoists most deps to root,
# but some may remain in workspace-specific node_modules due to version constraints)
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/server/node_modules/ server/node_modules/

# Copy built artifacts from builder
COPY --from=builder /app/shared/dist/ shared/dist/
COPY --from=builder /app/server/dist/ server/dist/
COPY --from=builder /app/client/dist/ client/dist/

# Copy SQL migration files (tsc does not copy non-TS assets)
COPY --from=builder /app/server/src/db/migrations/ server/dist/db/migrations/

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

# Health check — exec form required (DHI production image has no /bin/sh)
# Uses /api/health/ready which verifies DB access and password hashing round-trip
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3000/api/health/ready').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"]

# Start the server
CMD ["node", "server/dist/server.js"]
