#!/usr/bin/env bash
# Build the Cornerstone production Docker image.
# Automatically detects proxy settings and CA cert if present.
set -euo pipefail

IMAGE_NAME="${1:-cornerstone}"

BUILD_ARGS=()

# Forward proxy settings if present
[ -n "${HTTP_PROXY:-}" ]  && BUILD_ARGS+=(--build-arg "HTTP_PROXY=$HTTP_PROXY")
[ -n "${HTTPS_PROXY:-}" ] && BUILD_ARGS+=(--build-arg "HTTPS_PROXY=$HTTPS_PROXY")

# Mount CA cert as BuildKit secret if SSL_CERT_FILE is set
[ -n "${SSL_CERT_FILE:-}" ] && [ -f "$SSL_CERT_FILE" ] && \
  BUILD_ARGS+=(--secret "id=proxy-ca,src=$SSL_CERT_FILE")

echo "Building $IMAGE_NAME ..."
docker build "${BUILD_ARGS[@]}" -t "$IMAGE_NAME" "$(dirname "$0")/.."
echo "Done — run with:  docker run -p 3000:3000 -v cornerstone-data:/app/data $IMAGE_NAME"
