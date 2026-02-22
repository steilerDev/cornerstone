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

USER agent
