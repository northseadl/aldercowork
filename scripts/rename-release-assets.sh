#!/usr/bin/env bash
# =============================================================================
# rename-release-assets.sh — 重命名 Release 产物为用户友好名称
# =============================================================================
# 将 Tauri 默认产物名映射为人类可读格式:
#   AlderCowork_X.Y.Z_aarch64.dmg        → AlderCowork_vX.Y.Z_macOS_Apple-Silicon.dmg
#   AlderCowork_X.Y.Z_x64.dmg            → AlderCowork_vX.Y.Z_macOS_Intel.dmg
#   AlderCowork_X.Y.Z_x64-setup.nsis.zip → AlderCowork_vX.Y.Z_Windows_Setup.zip
#
# Also patches latest.json to reflect renamed Windows artifact URL.
#
# Usage: TAG=v0.1.1 GITHUB_TOKEN=xxx ./scripts/rename-release-assets.sh
# =============================================================================
set -euo pipefail

TAG="${TAG:?TAG env required (e.g. v0.1.1)}"
GITHUB_TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN env required}"
REPO="${REPO:-northseadl/aldercowork}"

VERSION="${TAG#v}"  # v0.1.1 → 0.1.1

info()  { echo "::notice::$*"; }
fail()  { echo "::error::$*"; exit 1; }

# ---------------------------------------------------------------------------
# 1. Find release by tag (including drafts — /releases/tags/ excludes drafts!)
# ---------------------------------------------------------------------------
RELEASE_JSON=$(gh api "repos/${REPO}/releases" --paginate --jq ".[] | select(.tag_name == \"${TAG}\")" 2>/dev/null || true)
if [ -z "$RELEASE_JSON" ] || echo "$RELEASE_JSON" | grep -q '"message"'; then
  fail "找不到 tag ${TAG} 对应的 Release（含 draft）"
fi

RELEASE_ID=$(echo "$RELEASE_JSON" | jq -r '.id')
info "Release ID: ${RELEASE_ID} (tag: ${TAG})"

# ---------------------------------------------------------------------------
# 2. Define rename mapping (paired arrays — bash 3 compatible)
# ---------------------------------------------------------------------------
OLD_NAMES=(
  "AlderCowork_${VERSION}_aarch64.dmg"
  "AlderCowork_${VERSION}_x64.dmg"
  "AlderCowork_${VERSION}_x64-setup.nsis.zip"
  "AlderCowork_${VERSION}_x64-setup.exe"
)
NEW_NAMES=(
  "AlderCowork_${TAG}_macOS_Apple-Silicon.dmg"
  "AlderCowork_${TAG}_macOS_Intel.dmg"
  "AlderCowork_${TAG}_Windows_Setup.zip"
  "AlderCowork_${TAG}_Windows_Setup.exe"
)

# ---------------------------------------------------------------------------
# 3. Rename assets via GitHub API
# ---------------------------------------------------------------------------
ASSETS_JSON=$(gh api "repos/${REPO}/releases/${RELEASE_ID}/assets" --paginate 2>/dev/null)

for i in "${!OLD_NAMES[@]}"; do
  old_name="${OLD_NAMES[$i]}"
  new_name="${NEW_NAMES[$i]}"

  ASSET_ID=$(echo "$ASSETS_JSON" | jq -r ".[] | select(.name == \"${old_name}\") | .id")

  if [ -z "$ASSET_ID" ] || [ "$ASSET_ID" = "null" ]; then
    echo "[skip] ${old_name} not found"
    continue
  fi

  echo "[rename] ${old_name} -> ${new_name} (asset_id: ${ASSET_ID})"
  gh api "repos/${REPO}/releases/assets/${ASSET_ID}" \
    --method PATCH \
    --field name="${new_name}" \
    --silent
done

# ---------------------------------------------------------------------------
# 4. Patch latest.json — update Windows artifact URL
# ---------------------------------------------------------------------------
LATEST_JSON_ASSET_ID=$(echo "$ASSETS_JSON" | jq -r '.[] | select(.name == "latest.json") | .id')

if [ -n "$LATEST_JSON_ASSET_ID" ] && [ "$LATEST_JSON_ASSET_ID" != "null" ]; then
  info "修补 latest.json 中的 Windows 下载 URL"

  # Download current latest.json
  TMPFILE=$(mktemp)
  gh api "repos/${REPO}/releases/assets/${LATEST_JSON_ASSET_ID}" \
    -H "Accept: application/octet-stream" > "$TMPFILE" 2>/dev/null

  # Replace old Windows filenames with new ones in the URL (covers both .exe and .nsis.zip)
  sed -i.bak "s|AlderCowork_${VERSION}_x64-setup.nsis.zip|AlderCowork_${TAG}_Windows_Setup.zip|g" "$TMPFILE"
  sed -i.bak "s|AlderCowork_${VERSION}_x64-setup.exe|AlderCowork_${TAG}_Windows_Setup.exe|g" "$TMPFILE"
  rm -f "${TMPFILE}.bak"

  # Delete old latest.json asset
  gh api "repos/${REPO}/releases/assets/${LATEST_JSON_ASSET_ID}" \
    --method DELETE --silent 2>/dev/null

  # Upload updated latest.json
  gh release upload "${TAG}" "${TMPFILE}#latest.json" --repo "${REPO}" --clobber 2>/dev/null \
    || gh api "repos/${REPO}/releases/${RELEASE_ID}/assets?name=latest.json" \
         --method POST \
         -H "Content-Type: application/json" \
         --input "$TMPFILE" 2>/dev/null

  rm -f "$TMPFILE"
  info "latest.json 已更新 ✓"
fi

info "产物重命名完成 ✓"
