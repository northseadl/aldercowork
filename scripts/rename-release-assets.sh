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
# 1. Find release by tag
# ---------------------------------------------------------------------------
RELEASE_JSON=$(gh api "repos/${REPO}/releases/tags/${TAG}" 2>/dev/null || true)
if [ -z "$RELEASE_JSON" ] || echo "$RELEASE_JSON" | grep -q '"message"'; then
  fail "找不到 tag ${TAG} 对应的 Release"
fi

RELEASE_ID=$(echo "$RELEASE_JSON" | jq -r '.id')
info "Release ID: ${RELEASE_ID} (tag: ${TAG})"

# ---------------------------------------------------------------------------
# 2. Define rename mapping
# ---------------------------------------------------------------------------
declare -A RENAME_MAP=(
  ["AlderCowork_${VERSION}_aarch64.dmg"]="AlderCowork_${TAG}_macOS_Apple-Silicon.dmg"
  ["AlderCowork_${VERSION}_x64.dmg"]="AlderCowork_${TAG}_macOS_Intel.dmg"
  ["AlderCowork_${VERSION}_x64-setup.nsis.zip"]="AlderCowork_${TAG}_Windows_Setup.zip"
)

# Track the windows rename for latest.json patching
WINDOWS_OLD_NAME="AlderCowork_${VERSION}_x64-setup.nsis.zip"
WINDOWS_NEW_NAME="AlderCowork_${TAG}_Windows_Setup.zip"

# ---------------------------------------------------------------------------
# 3. Rename assets via GitHub API
# ---------------------------------------------------------------------------
ASSETS_JSON=$(gh api "repos/${REPO}/releases/${RELEASE_ID}/assets" --paginate 2>/dev/null)

for old_name in "${!RENAME_MAP[@]}"; do
  new_name="${RENAME_MAP[$old_name]}"

  ASSET_ID=$(echo "$ASSETS_JSON" | jq -r ".[] | select(.name == \"${old_name}\") | .id")

  if [ -z "$ASSET_ID" ] || [ "$ASSET_ID" = "null" ]; then
    echo "⏭️  未找到 ${old_name}，跳过"
    continue
  fi

  echo "🔄 ${old_name} → ${new_name} (asset_id: ${ASSET_ID})"
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

  # Replace the old Windows filename with the new one in the URL
  sed -i.bak "s|${WINDOWS_OLD_NAME}|${WINDOWS_NEW_NAME}|g" "$TMPFILE"
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
