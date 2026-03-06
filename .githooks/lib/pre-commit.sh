#!/usr/bin/env bash

if [ "${ALDER_PRE_COMMIT_LIB_LOADED:-0}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi
ALDER_PRE_COMMIT_LIB_LOADED=1

SECRET_PATTERNS=(
  'sk-[a-zA-Z0-9]{20,}'
  'AKIA[0-9A-Z]{16}'
  'ghp_[a-zA-Z0-9]{36}'
  'gho_[a-zA-Z0-9]{36}'
  'glpat-[a-zA-Z0-9\-]{20,}'
  'xoxb-[0-9]{10,}'
  'PRIVATE[_ ]KEY'
  'BEGIN RSA PRIVATE KEY'
  'BEGIN OPENSSH PRIVATE KEY'
)

should_skip_secret_scan_file() {
  local file="$1"
  case "$file" in
    *.lock|pnpm-lock.yaml|Cargo.lock|*.png|*.ico|*.icns)
      return 0
      ;;
  esac
  return 1
}

should_skip_secret_pattern_for_file() {
  local pattern="$1"
  local file="$2"

  case "$file" in
    .githooks/pre-commit|.githooks/lib/pre-commit.sh|scripts/hooks-smoke.sh)
      case "$pattern" in
        'PRIVATE[_ ]KEY'|'BEGIN RSA PRIVATE KEY'|'BEGIN OPENSSH PRIVATE KEY')
          return 0
          ;;
      esac
      ;;
    .github/workflows/*.yml|.github/workflows/*.yaml)
      if [ "$pattern" = 'PRIVATE[_ ]KEY' ]; then
        return 0
      fi
      ;;
  esac

  return 1
}

run_secret_scan() {
  local pattern file

  if env_flag_enabled SKIP_SECRET_SCAN; then
    warn "SKIP_SECRET_SCAN=1 — 跳过密钥扫描"
    return 0
  fi

  if [ "${#STAGED_FILES[@]}" -eq 0 ]; then
    return 0
  fi

  for pattern in "${SECRET_PATTERNS[@]}"; do
    local matches=()

    for file in "${STAGED_FILES[@]}"; do
      if should_skip_secret_scan_file "$file"; then
        continue
      fi
      if should_skip_secret_pattern_for_file "$pattern" "$file"; then
        continue
      fi

      if git show ":$file" 2>/dev/null | grep -qiE "$pattern"; then
        matches+=("$file")
      fi
    done

    if [ "${#matches[@]}" -gt 0 ]; then
      local match_list
      match_list=$(printf '  - %s\n' "${matches[@]}")
      fail "检测到疑似密钥泄漏！匹配模式: ${BOLD}$pattern${RESET}
文件:
$match_list
请检查并移除敏感信息后再提交。如果是误报，使用 ${BOLD}git commit --no-verify${RESET} 绕过。"
    fi
  done
}
