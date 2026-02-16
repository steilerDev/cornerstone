#!/usr/bin/env bash
# Start the Claude Code sandbox using .sandbox/Dockerfile.
# Builds the custom template image, then launches it via docker sandbox.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

IMAGE_NAME="cornerstone-sandbox:latest"

echo "Building sandbox template image ..."
docker build -t "$IMAGE_NAME" -f "$PROJECT_DIR/.sandbox/Dockerfile" "$PROJECT_DIR/.sandbox"

echo "Launching sandbox ..."
docker sandbox run -t "$IMAGE_NAME" claude "$PROJECT_DIR"

# After creating a new sandbox, we need to run the following to authenticate:
# docker sandbox exec -it claude-cornerstone gh auth login
# docker sandbox exec -it claude-cornerstone gh auth refresh -s project,read:project
# docker sandbox exec -it claude-cornerstone docker login -u steilerdev
# docker sandbox exec -it claude-cornerstone docker login -u steilerdev dhi.io