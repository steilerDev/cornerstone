FROM docker/sandbox-templates:claude-code
USER root

# Build tools for native modules (better-sqlite3 / node-gyp)
RUN apt-get update && apt-get install -y \
    curl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Node.js 24 LTS via NodeSource (replaces pre-installed Node 20)
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install gwq for git worktree management
ARG GWQ_VERSION=v0.6.0
RUN ARCH="$(dpkg --print-architecture)" && \
    if [ "$ARCH" = "amd64" ]; then GWQ_ARCH="amd64"; \
    elif [ "$ARCH" = "arm64" ]; then GWQ_ARCH="arm64"; \
    else echo "Unsupported arch: $ARCH" && exit 1; fi && \
    curl -fsSL "https://github.com/d-kuro/gwq/releases/download/${GWQ_VERSION}/gwq_linux_${GWQ_ARCH}.tar.gz" \
    | tar -xz -C /usr/local/bin gwq && \
    chmod +x /usr/local/bin gwq

USER agent
