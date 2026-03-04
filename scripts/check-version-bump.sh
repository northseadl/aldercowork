#!/usr/bin/env bash
# =============================================================================
# check-version-bump.sh — 版本号门禁
# =============================================================================
# Validates version tag increments against SemVer policy:
#   - Patch bump (0.1.0 → 0.1.1): ALLOWED automatically
#   - Minor bump (0.1.x → 0.2.0): REQUIRES ALLOW_MAJOR_BUMP=1
#   - Major bump (0.x.y → 1.0.0): REQUIRES ALLOW_MAJOR_BUMP=1
#
# Usage:
#   ./scripts/check-version-bump.sh v0.1.1        # validate specific tag
#   ./scripts/check-version-bump.sh               # validate from pushed refs (stdin)
#
# Env:
#   ALLOW_MAJOR_BUMP=1  — bypass major/minor restriction
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { echo -e "${GREEN}[version-gate]${RESET} $*"; }
warn()  { echo -e "${YELLOW}[version-gate]${RESET} $*"; }
fail()  { echo -e "${RED}[version-gate]${RESET} $*"; exit 1; }

# Parse semver: extract major.minor.patch from vX.Y.Z
parse_semver() {
  local ver="${1#v}"  # strip leading 'v'
  local major minor patch
  IFS='.' read -r major minor patch <<< "$ver"

  # Validate all parts are numeric
  if ! [[ "$major" =~ ^[0-9]+$ ]] || ! [[ "$minor" =~ ^[0-9]+$ ]] || ! [[ "$patch" =~ ^[0-9]+$ ]]; then
    fail "无法解析版本号: ${BOLD}$1${RESET} (期望格式: vX.Y.Z)"
  fi

  echo "$major $minor $patch"
}

# Get the latest existing tag (excluding the new one being pushed)
get_latest_tag() {
  local exclude="${1:-}"
  local tags
  tags=$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-version:refname 2>/dev/null || true)

  if [ -n "$exclude" ]; then
    tags=$(echo "$tags" | grep -v "^${exclude}$" || true)
  fi

  echo "$tags" | head -1
}

# Main validation logic
validate_bump() {
  local new_tag="$1"
  local latest_tag

  latest_tag=$(get_latest_tag "$new_tag")

  if [ -z "$latest_tag" ]; then
    info "首个版本 tag: ${BOLD}$new_tag${RESET} — 跳过增量检查"
    return 0
  fi

  info "版本比较: ${BOLD}$latest_tag${RESET} → ${BOLD}$new_tag${RESET}"

  local old_parts new_parts
  old_parts=($(parse_semver "$latest_tag"))
  new_parts=($(parse_semver "$new_tag"))

  local old_major="${old_parts[0]}" old_minor="${old_parts[1]}" old_patch="${old_parts[2]}"
  local new_major="${new_parts[0]}" new_minor="${new_parts[1]}" new_patch="${new_parts[2]}"

  # Determine bump type
  if [ "$new_major" -gt "$old_major" ]; then
    local bump_type="MAJOR"
  elif [ "$new_minor" -gt "$old_minor" ] && [ "$new_major" -eq "$old_major" ]; then
    local bump_type="MINOR"
  elif [ "$new_patch" -gt "$old_patch" ] && [ "$new_minor" -eq "$old_minor" ] && [ "$new_major" -eq "$old_major" ]; then
    local bump_type="PATCH"
  elif [ "$new_major" -eq "$old_major" ] && [ "$new_minor" -eq "$old_minor" ] && [ "$new_patch" -eq "$old_patch" ]; then
    fail "版本号未变更: ${BOLD}$latest_tag${RESET} == ${BOLD}$new_tag${RESET}"
  else
    fail "版本号不可降级: ${BOLD}$latest_tag${RESET} → ${BOLD}$new_tag${RESET}"
  fi

  info "检测到 ${BOLD}$bump_type${RESET} 版本变更"

  # Gate: only PATCH is auto-allowed
  if [ "$bump_type" = "PATCH" ]; then
    info "PATCH 变更 — 自动放行 ✓"
    return 0
  fi

  # MAJOR or MINOR requires explicit approval
  if [ "${ALLOW_MAJOR_BUMP:-}" = "1" ]; then
    warn "ALLOW_MAJOR_BUMP=1 — 人工确认已提供，放行 ${BOLD}$bump_type${RESET} 变更"
    return 0
  fi

  fail "${BOLD}$bump_type${RESET} 版本变更需要人工确认！
  当前版本: ${BOLD}$latest_tag${RESET}
  目标版本: ${BOLD}$new_tag${RESET}

  如确认大版本变更，请设置环境变量:
    ${BOLD}ALLOW_MAJOR_BUMP=1${RESET} git push origin $new_tag

  或在 CI 中通过 workflow_dispatch 手动触发并传入参数。"
}

# Entry point: tag passed as argument, or read from stdin (pre-push hook)
if [ "${1:-}" != "" ]; then
  # Direct invocation with tag name
  validate_bump "$1"
else
  # Called from pre-push: read pushed refs from stdin
  while read -r local_ref local_oid remote_ref remote_oid; do
    if echo "$remote_ref" | grep -qE '^refs/tags/v[0-9]'; then
      tag_name=$(echo "$remote_ref" | sed 's|refs/tags/||')
      validate_bump "$tag_name"
    fi
  done
fi
