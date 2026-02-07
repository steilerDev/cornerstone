#!/usr/bin/env bash
# Start the Claude Code sandbox using .sandbox/Dockerfile.
# Builds the custom template image, then launches it via docker sandbox.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

IMAGE_NAME="cornerstone-sandbox"

echo "Building sandbox template image ..."
docker build -t "$IMAGE_NAME" -f "$PROJECT_DIR/.sandbox/Dockerfile" "$PROJECT_DIR/.sandbox"

echo "Launching sandbox ..."
docker sandbox run --load-local-template -t "$IMAGE_NAME" claude "$PROJECT_DIR"
