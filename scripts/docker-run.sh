#!/usr/bin/env bash
# Run the Cornerstone production Docker container.
set -euo pipefail

IMAGE_NAME="${1:-cornerstone}"
CONTAINER_NAME="${2:-cornerstone}"
PORT="${PORT:-3000}"

docker run --rm \
  --name "$CONTAINER_NAME" \
  -p "$PORT:3000" \
  -v cornerstone-data:/app/data \
  "$IMAGE_NAME"
