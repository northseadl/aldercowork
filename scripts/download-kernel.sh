#!/usr/bin/env bash
# Download OpenCode kernel binary for the current platform.
# Places it in src-tauri/binaries/ with Tauri sidecar naming convention.
#
# Usage:
#   ./scripts/download-kernel.sh                # latest release
#   ./scripts/download-kernel.sh v0.1.0         # specific version

set -euo pipefail

REPO="sst/opencode"
VERSION="${1:-}"
BINARIES_DIR="$(cd "$(dirname "$0")/../apps/desktop/src-tauri/binaries" 2>/dev/null && pwd || echo "$(pwd)/binaries")"
mkdir -p "$BINARIES_DIR"

# Determine target triple
detect_target() {
  local os arch target

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)
      case "$arch" in
        arm64)  target="aarch64-apple-darwin" ;;
        x86_64) target="x86_64-apple-darwin" ;;
        *)      echo "Unsupported macOS arch: $arch" >&2; exit 1 ;;
      esac
      ;;
    Linux)
      case "$arch" in
        x86_64)  target="x86_64-unknown-linux-gnu" ;;
        aarch64) target="aarch64-unknown-linux-gnu" ;;
        *)       echo "Unsupported Linux arch: $arch" >&2; exit 1 ;;
      esac
      ;;
    MINGW*|MSYS*|CYGWIN*)
      target="x86_64-pc-windows-msvc"
      ;;
    *)
      echo "Unsupported OS: $os" >&2; exit 1
      ;;
  esac

  echo "$target"
}

# Map target to GitHub release asset search tokens
asset_tokens() {
  local target="$1"
  # OpenCode uses: darwin/linux/windows + x64/arm64 (not x86_64/aarch64)
  case "$target" in
    aarch64-apple-darwin)       echo "darwin arm64" ;;
    x86_64-apple-darwin)        echo "darwin x64" ;;
    x86_64-unknown-linux-gnu)   echo "linux x64" ;;
    aarch64-unknown-linux-gnu)  echo "linux arm64" ;;
    x86_64-pc-windows-msvc)     echo "windows x64" ;;
  esac
}

# Allow override for cross-compilation (CI: TARGET_OVERRIDE=x86_64-apple-darwin)
if [ -n "${TARGET_OVERRIDE:-}" ]; then
  TARGET="$TARGET_OVERRIDE"
else
  TARGET="$(detect_target)"
fi
TOKENS="$(asset_tokens "$TARGET")"
TOKEN1="$(echo "$TOKENS" | awk '{print $1}')"
TOKEN2="$(echo "$TOKENS" | awk '{print $2}')"

echo "==> Platform: $TARGET"
echo "==> Searching for: $TOKEN1 + $TOKEN2"

# Fetch release info
if [ -n "$VERSION" ]; then
  RELEASE_URL="https://api.github.com/repos/${REPO}/releases/tags/${VERSION}"
else
  RELEASE_URL="https://api.github.com/repos/${REPO}/releases/latest"
fi

echo "==> Fetching release from $RELEASE_URL"

CURL_ARGS=(-sL -H "Accept: application/vnd.github+json" -H "User-Agent: aldercowork-kernel-downloader")
if [ -n "${GITHUB_TOKEN:-}" ]; then
  CURL_ARGS+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

RELEASE_JSON="$(curl "${CURL_ARGS[@]}" "$RELEASE_URL")"

TAG="$(echo "$RELEASE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null || true)"
if [ -z "$TAG" ]; then
  echo "ERROR: Could not determine release tag. API response:" >&2
  echo "$RELEASE_JSON" | head -20 >&2
  exit 1
fi

echo "==> Release: $TAG"

# Find matching asset
DOWNLOAD_URL="$(echo "$RELEASE_JSON" | python3 -c "
import sys, json
release = json.load(sys.stdin)
assets = release.get('assets', [])
token1, token2 = '${TOKEN1}', '${TOKEN2}'

candidates = []
for a in assets:
    name = a['name'].lower()
    # Skip checksums, SBOMs
    if 'checksum' in name or 'sbom' in name:
        continue
    # Must be an archive
    if not (name.endswith('.tar.gz') or name.endswith('.zip')):
        continue
    if token1 in name and token2 in name:
        candidates.append(a)

if not candidates:
    # Try aarch64 alias
    for a in assets:
        name = a['name'].lower()
        if 'checksum' in name or 'sbom' in name:
            continue
        if not (name.endswith('.tar.gz') or name.endswith('.zip')):
            continue
        if token1 in name and ('aarch64' in name if token2 == 'arm64' else 'amd64' in name if token2 == 'x86_64' else False):
            candidates.append(a)

if candidates:
    # Prefer .tar.gz over .zip
    best = sorted(candidates, key=lambda a: (0 if a['name'].endswith('.tar.gz') else 1))[0]
    print(best['browser_download_url'])
else:
    print('')
")"

if [ -z "$DOWNLOAD_URL" ]; then
  echo "ERROR: No matching asset found for $TARGET" >&2
  echo "Available assets:" >&2
  echo "$RELEASE_JSON" | python3 -c "
import sys, json
for a in json.load(sys.stdin).get('assets', []):
    print(f'  - {a[\"name\"]}')
" 2>/dev/null || true
  exit 1
fi

echo "==> Downloading: $DOWNLOAD_URL"

# Download to temp
TMPDIR_DL="$(mktemp -d)"
ARCHIVE_NAME="$(basename "$DOWNLOAD_URL")"
ARCHIVE_PATH="${TMPDIR_DL}/${ARCHIVE_NAME}"

curl -sL -o "$ARCHIVE_PATH" "$DOWNLOAD_URL"
echo "==> Downloaded: $(du -h "$ARCHIVE_PATH" | awk '{print $1}')"

# Extract
EXTRACT_DIR="${TMPDIR_DL}/extracted"
mkdir -p "$EXTRACT_DIR"

if [[ "$ARCHIVE_NAME" == *.tar.gz ]]; then
  tar -xzf "$ARCHIVE_PATH" -C "$EXTRACT_DIR"
elif [[ "$ARCHIVE_NAME" == *.zip ]]; then
  unzip -qo "$ARCHIVE_PATH" -d "$EXTRACT_DIR"
fi

# Find the binary
BINARY_NAME="opencode"
[[ "$TARGET" == *windows* ]] && BINARY_NAME="opencode.exe"

FOUND_BINARY="$(find "$EXTRACT_DIR" -name "$BINARY_NAME" -type f 2>/dev/null | head -1)"
if [ -z "$FOUND_BINARY" ]; then
  echo "ERROR: Could not find '$BINARY_NAME' in archive" >&2
  find "$EXTRACT_DIR" -type f >&2
  exit 1
fi

# Place with Tauri sidecar naming
SIDECAR_NAME="opencode-${TARGET}"
[[ "$TARGET" == *windows* ]] && SIDECAR_NAME="opencode-${TARGET}.exe"

DEST="${BINARIES_DIR}/${SIDECAR_NAME}"
cp "$FOUND_BINARY" "$DEST"
chmod +x "$DEST"

# Clean up
rm -rf "$TMPDIR_DL"

echo "==> Installed: $DEST"
echo "==> Binary size: $(du -h "$DEST" | awk '{print $1}')"
echo "==> Done!"
