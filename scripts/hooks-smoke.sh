#!/usr/bin/env bash
# =============================================================================
# hooks-smoke.sh — quick, read-only sanity checks for local git hooks
# =============================================================================
# This script does NOT modify git history or the working tree.
#
# Usage:
#   bash scripts/hooks-smoke.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
RESET='\033[0m'

info() { echo -e "${GREEN}[hooks-smoke]${RESET} $*"; }
warn() { echo -e "${YELLOW}[hooks-smoke]${RESET} $*"; }
fail() { echo -e "${RED}[hooks-smoke]${RESET} $*"; exit 1; }

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

HOOK_PRE_PUSH="${REPO_ROOT}/.githooks/pre-push"
HOOK_PRE_COMMIT="${REPO_ROOT}/.githooks/pre-commit"
HOOK_COMMIT_MSG="${REPO_ROOT}/.githooks/commit-msg"

info "bash -n …"
bash -n "$HOOK_PRE_PUSH" "$HOOK_PRE_COMMIT" "$HOOK_COMMIT_MSG"
bash -n "${REPO_ROOT}/scripts/check-version-bump.sh"
bash -n "${REPO_ROOT}/scripts/sync-version-from-tag.sh"
info "bash -n ✓"

info "pre-commit runtime (bypassed)…"
ALLOW_DIRECT_COMMIT=1 SKIP_SECRET_SCAN=1 SKIP_RUST_CHECK=1 SKIP_TS_CHECK=1 "$HOOK_PRE_COMMIT" >/dev/null
info "pre-commit runtime ✓"

info "pre-push branch fast-forward (develop)…"
head_oid=$(git rev-parse HEAD)
prev_oid=$(git rev-parse HEAD^ 2>/dev/null || echo "")
if [ -n "$prev_oid" ]; then
  echo "refs/heads/develop $head_oid refs/heads/develop $prev_oid" | "$HOOK_PRE_PUSH" >/dev/null
  info "fast-forward ✓"

  info "pre-push branch non-fast-forward (develop)…"
  if echo "refs/heads/develop $prev_oid refs/heads/develop $head_oid" | "$HOOK_PRE_PUSH" >/dev/null 2>&1; then
    fail "expected non-fast-forward to fail, but it passed"
  fi
  info "non-fast-forward blocked ✓"
else
  warn "当前分支无 HEAD^，跳过 non-fast-forward 用例"
fi

zero_oid="0000000000000000000000000000000000000000"

tag_for_test=$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-version:refname | head -1 || true)
tag_for_alt=$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=version:refname | head -1 || true)

if [ -n "$tag_for_test" ]; then
  info "pre-push tag deletion skip (${tag_for_test})…"
  local_tag_oid=$(git rev-parse "${tag_for_test}^{tag}" 2>/dev/null || git rev-parse "$tag_for_test")
  echo "refs/tags/${tag_for_test} $zero_oid refs/tags/${tag_for_test} $local_tag_oid" | "$HOOK_PRE_PUSH" >/dev/null
  info "tag deletion skip ✓"

  info "pre-push tag push gate (${tag_for_test})…"
  echo "refs/tags/${tag_for_test} $local_tag_oid refs/tags/${tag_for_test} $zero_oid" | "$HOOK_PRE_PUSH" >/dev/null
  info "tag gate ✓"

  if [ -n "$tag_for_alt" ] && [ "$tag_for_alt" != "$tag_for_test" ]; then
    info "pre-push tag rewrite blocked (${tag_for_test})…"
    remote_oid=$(git rev-parse "${tag_for_alt}^{tag}" 2>/dev/null || git rev-parse "$tag_for_alt")
    if echo "refs/tags/${tag_for_test} $local_tag_oid refs/tags/${tag_for_test} $remote_oid" | "$HOOK_PRE_PUSH" >/dev/null 2>&1; then
      fail "expected tag rewrite to fail, but it passed"
    fi
    info "tag rewrite blocked ✓"
  else
    warn "tag 数量不足，跳过 tag rewrite 用例"
  fi
else
  warn "未找到 vX.Y.Z tag，跳过 tag 用例"
fi

info "all hook smokes ✓"
