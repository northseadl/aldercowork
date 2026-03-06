#!/usr/bin/env bash

if [ "${ALDER_HOOK_COMMON_SH_LOADED:-0}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi
ALDER_HOOK_COMMON_SH_LOADED=1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
RESET='\033[0m'

HOOK_NAME="${HOOK_NAME:-hook}"
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

STAGED_FILES=()
PUSHED_REFS=()

info() { echo -e "${GREEN}[${HOOK_NAME}]${RESET} $*"; }
warn() { echo -e "${YELLOW}[${HOOK_NAME}]${RESET} $*"; }
fail() { echo -e "${RED}[${HOOK_NAME}]${RESET} $*"; exit 1; }

setup_repo_root() {
  cd "$REPO_ROOT"
}

env_flag_enabled() {
  local name="$1"
  [ "${!name:-}" = "1" ]
}

load_staged_files() {
  STAGED_FILES=()
  while IFS= read -r -d '' file; do
    STAGED_FILES+=("$file")
  done < <(git diff --cached --name-only -z --diff-filter=ACM 2>/dev/null || true)
}

staged_files_match_any() {
  local file pattern
  for file in "${STAGED_FILES[@]}"; do
    for pattern in "$@"; do
      case "$file" in
        $pattern) return 0 ;;
      esac
    done
  done
  return 1
}

load_pushed_refs() {
  PUSHED_REFS=()
  while IFS= read -r line; do
    PUSHED_REFS+=("$line")
  done
}

is_all_zero_oid() {
  local oid="${1:-}"
  echo "$oid" | grep -qE '^[0]{40}$'
}

