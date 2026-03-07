#!/usr/bin/env bash
set -euo pipefail

# Change this to your own owner/repo when forking (must match package.json "repository")
REPO="${AF_REPO:-miltonparedes/agentfiles}"
INSTALL_DIR="${HOME}/.local/bin"
BIN_NAME="af"

# Parse --version flag
VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) if [[ -z "${2:-}" ]]; then echo "Error: --version requires a value"; exit 1; fi; VERSION="$2"; shift 2 ;;
    --version=*) VERSION="${1#*=}"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)  os="linux" ;;
    Darwin) os="darwin" ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
  esac

  echo "${os}-${arch}"
}

get_download_url() {
  local platform="$1"
  local asset="af-${platform}"
  local release_url

  if [[ -n "$VERSION" ]]; then
    release_url="https://github.com/${REPO}/releases/download/${VERSION}/${asset}"
  else
    local api_url="https://api.github.com/repos/${REPO}/releases/latest"
    local tag
    tag="$(curl -fsSL "$api_url" | grep '"tag_name"' | head -1 | cut -d'"' -f4)"
    if [[ -z "$tag" ]]; then
      echo "Failed to fetch latest release tag" >&2
      exit 1
    fi
    release_url="https://github.com/${REPO}/releases/download/${tag}/${asset}"
  fi

  echo "$release_url"
}

main() {
  local platform url

  platform="$(detect_platform)"
  echo "Detected platform: ${platform}"

  url="$(get_download_url "$platform")"
  echo "Downloading ${BIN_NAME} from ${url}..."

  mkdir -p "$INSTALL_DIR"
  curl -fsSL -o "${INSTALL_DIR}/${BIN_NAME}" "$url"
  chmod +x "${INSTALL_DIR}/${BIN_NAME}"

  echo "Installed ${BIN_NAME} to ${INSTALL_DIR}/${BIN_NAME}"

  # Check PATH
  case ":$PATH:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      echo ""
      echo "WARNING: ${INSTALL_DIR} is not in your PATH. Add it:"
      echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
      ;;
  esac

  echo ""
  echo "Run 'af --version' to verify the installation."
}

main
