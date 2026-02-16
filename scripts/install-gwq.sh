#!/usr/bin/env bash
# Fallback installer for gwq in existing sandboxes where the Dockerfile
# wasn't rebuilt or the download was blocked at build time.
# Downloads gwq to ~/.local/bin/ and adds it to PATH via the persistent env file.
set -euo pipefail

GWQ_VERSION="${GWQ_VERSION:-v0.6.0}"
INSTALL_DIR="${HOME}/.local/bin"
PERSISTENT_ENV="/etc/sandbox-persistent.sh"

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  GWQ_ARCH="amd64" ;;
  aarch64) GWQ_ARCH="arm64" ;;
  *)       echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

# Check if already installed
if command -v gwq &>/dev/null; then
  echo "gwq is already installed: $(gwq --version)"
  exit 0
fi

echo "Installing gwq ${GWQ_VERSION} (${GWQ_ARCH}) to ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"

curl -fsSL "https://github.com/d-kuro/gwq/releases/download/${GWQ_VERSION}/gwq_linux_${GWQ_ARCH}.tar.gz" \
  | tar -xz -C "$INSTALL_DIR" gwq

chmod +x "${INSTALL_DIR}/gwq"

# Add to PATH via persistent env file if not already there
if [ -f "$PERSISTENT_ENV" ]; then
  if ! grep -q '\.local/bin' "$PERSISTENT_ENV" 2>/dev/null; then
    echo "export PATH=\"\${HOME}/.local/bin:\${PATH}\"" >> "$PERSISTENT_ENV"
    echo "Added ~/.local/bin to PATH in ${PERSISTENT_ENV}"
  fi
else
  echo "Warning: ${PERSISTENT_ENV} not found. Add ~/.local/bin to your PATH manually." >&2
fi

# Make available in current session
export PATH="${INSTALL_DIR}:${PATH}"
echo "gwq installed successfully: $(gwq --version)"
