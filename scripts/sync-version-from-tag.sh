#!/usr/bin/env bash
# =============================================================================
# sync-version-from-tag.sh — Sync desktop version files to a release tag
# =============================================================================
# Updates (working tree):
#   - apps/desktop/package.json
#   - apps/desktop/src-tauri/tauri.conf.json
#   - apps/desktop/src-tauri/Cargo.toml  ([package].version)
#
# Usage:
#   bash scripts/sync-version-from-tag.sh v1.2.3
#   bash scripts/sync-version-from-tag.sh 1.2.3
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
RESET='\033[0m'

info() { echo -e "${GREEN}[sync-version]${RESET} $*"; }
warn() { echo -e "${YELLOW}[sync-version]${RESET} $*"; }
fail() { echo -e "${RED}[sync-version]${RESET} $*"; exit 1; }

TAG_OR_VERSION="${1:-}"
if [ -z "$TAG_OR_VERSION" ]; then
  fail "Usage: bash scripts/sync-version-from-tag.sh vX.Y.Z"
fi

VERSION="${TAG_OR_VERSION#v}"
if ! [[ "$VERSION" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then
  fail "无效版本号: ${BOLD}${TAG_OR_VERSION}${RESET}（期望 vX.Y.Z 或 X.Y.Z）"
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$REPO_ROOT"

TAURI_CONF="apps/desktop/src-tauri/tauri.conf.json"
CARGO_TOML="apps/desktop/src-tauri/Cargo.toml"
PKG_JSON="apps/desktop/package.json"

[ -f "$TAURI_CONF" ] || fail "文件不存在: $TAURI_CONF"
[ -f "$CARGO_TOML" ] || fail "文件不存在: $CARGO_TOML"
[ -f "$PKG_JSON" ] || fail "文件不存在: $PKG_JSON"

info "Syncing version: ${BOLD}${VERSION}${RESET}"

# tauri.conf.json
sed -i.bak "s/\\\"version\\\": \\\"[^\\\"]*\\\"/\\\"version\\\": \\\"$VERSION\\\"/" "$TAURI_CONF"
rm -f "${TAURI_CONF}.bak"

# Cargo.toml — only touch [package].version
if ! awk -v ver="$VERSION" '
  BEGIN { in_pkg = 0; done = 0 }
  /^\[package\]/ { in_pkg = 1; print; next }
  /^\[/ { if (in_pkg) in_pkg = 0 }
  in_pkg && !done && $0 ~ /^version[[:space:]]*=/ {
    sub(/version[[:space:]]*=[[:space:]]*"[^"]*"/, "version = \"" ver "\"")
    done = 1
    print
    next
  }
  { print }
  END { if (!done) exit 2 }
' "$CARGO_TOML" > "${CARGO_TOML}.tmp"; then
  rc=$?
  rm -f "${CARGO_TOML}.tmp" || true
  if [ "$rc" -eq 2 ]; then
    fail "未在 ${CARGO_TOML} 的 [package] 区段找到 version = \"...\""
  fi
  fail "更新 Cargo.toml 失败（awk rc=$rc）"
fi
mv "${CARGO_TOML}.tmp" "$CARGO_TOML"

# package.json
sed -i.bak "s/\\\"version\\\": \\\"[^\\\"]*\\\"/\\\"version\\\": \\\"$VERSION\\\"/" "$PKG_JSON"
rm -f "${PKG_JSON}.bak"

info "✓ Version synced"
info "tauri.conf.json:"
grep -n "\"version\"" "$TAURI_CONF" || true
info "Cargo.toml:"
awk 'NR<=12 { print }' "$CARGO_TOML"
info "package.json:"
grep -n "\"version\"" "$PKG_JSON" || true

warn "Next: git add + commit the version bump before tagging."
