#!/usr/bin/env bash

if [ "${ALDER_PRE_PUSH_LIB_LOADED:-0}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi
ALDER_PRE_PUSH_LIB_LOADED=1

PROTECTED_BRANCHES=(main develop)

is_non_fast_forward_update() {
  local new_oid="${1:-}"
  local old_oid="${2:-}"

  if is_all_zero_oid "$new_oid" || is_all_zero_oid "$old_oid"; then
    return 1
  fi

  if git merge-base --is-ancestor "$old_oid" "$new_oid" 2>/dev/null; then
    return 1
  fi
  return 0
}

extract_json_version() {
  sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -1
}

extract_cargo_package_version() {
  awk '
    BEGIN { in_pkg = 0 }
    /^\[package\]/ { in_pkg = 1; next }
    /^\[/ { if (in_pkg) exit; next }
    in_pkg && $0 ~ /^version[[:space:]]*=/ {
      line = $0
      sub(/^[^"]*"/, "", line)
      sub(/".*$/, "", line)
      if (line != "") { print line; exit }
    }
  '
}

validate_version_files_match_tag() {
  local tag_name="$1"
  local tag_version="$2"
  local target_oid="$3"
  local commit

  commit=$(git rev-parse "${target_oid}^{commit}" 2>/dev/null || true)
  if [ -z "$commit" ]; then
    fail "无法解析 tag push 的目标 commit: ${BOLD}${tag_name}${RESET} (oid=${target_oid})"
  fi

  local pkg_json tauri_conf cargo_toml
  pkg_json=$(git show "${commit}:apps/desktop/package.json" 2>/dev/null || true)
  tauri_conf=$(git show "${commit}:apps/desktop/src-tauri/tauri.conf.json" 2>/dev/null || true)
  cargo_toml=$(git show "${commit}:apps/desktop/src-tauri/Cargo.toml" 2>/dev/null || true)

  local pkg_ver tauri_ver cargo_ver
  pkg_ver=$(printf '%s' "$pkg_json" | extract_json_version)
  tauri_ver=$(printf '%s' "$tauri_conf" | extract_json_version)
  cargo_ver=$(printf '%s' "$cargo_toml" | extract_cargo_package_version)

  if [ "$pkg_ver" != "$tag_version" ] || [ "$tauri_ver" != "$tag_version" ] || [ "$cargo_ver" != "$tag_version" ]; then
    fail "$(cat <<EOF
版本文件未与 tag 对齐（禁止在 hook 中自动改历史）。

tag: ${BOLD}${tag_name}${RESET} → expected ${BOLD}${tag_version}${RESET}

实际（tag push target commit=${commit}）:
  apps/desktop/package.json: ${pkg_ver:-<missing>}
  apps/desktop/src-tauri/tauri.conf.json: ${tauri_ver:-<missing>}
  apps/desktop/src-tauri/Cargo.toml: ${cargo_ver:-<missing>}

修复方式（参考 CI 的 Sync version from tag 步骤）:
  bash scripts/sync-version-from-tag.sh "${tag_name}"

  git add apps/desktop/package.json apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/Cargo.toml
  git commit -m "chore(release): v${tag_version}"
  git tag -f -a "${tag_name}" -m "${tag_name}"
  git push -f origin "${tag_name}"
EOF
)"
  fi
}
