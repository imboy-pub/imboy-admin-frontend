#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$ROOT_DIR/imboy-admin-frontend"

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

load_env_file() {
  local file_path="$1"
  [[ -f "$file_path" ]] || return 0

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    local line
    line="$(trim "$raw_line")"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue

    # 纯 bash 字符串匹配，兼容 macOS BSD 和 Linux GNU
    [[ "$line" == *=* ]] || continue

    local key value
    key="$(trim "${line%%=*}")"
    value="$(trim "${line#*=}")"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    [[ -n "$key" ]] || continue
    export "$key=$value"
  done < "$file_path"
}

resolve_manifest_path() {
  local raw_path="${IMBOY_TEST_SCENARIO_MANIFEST:-${IMBOY_ADMIN_E2E_SCENARIO_MANIFEST:-}}"
  if [[ -z "$raw_path" ]]; then
    return 0
  fi

  if [[ "$raw_path" = /* ]]; then
    printf '%s\n' "$raw_path"
    return 0
  fi

  local candidate
  for candidate in "$PWD/$raw_path" "$APP_DIR/$raw_path" "$ROOT_DIR/$raw_path"; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  printf '%s\n' "$APP_DIR/$raw_path"
}

load_env_file "$APP_DIR/.env.e2e"

[[ -n "${IMBOY_ADMIN_E2E_ACCOUNT:-}" ]] || { echo "❌ 未设置 IMBOY_ADMIN_E2E_ACCOUNT"; exit 1; }

MANIFEST_PATH="$(resolve_manifest_path)"
if [[ -n "$MANIFEST_PATH" ]]; then
  if [[ ! -f "$MANIFEST_PATH" ]]; then
    echo "Scenario manifest not found: $MANIFEST_PATH" >&2
    exit 2
  fi
  export IMBOY_TEST_SCENARIO_MANIFEST="$MANIFEST_PATH"
  echo "Using Playwright scenario manifest: $IMBOY_TEST_SCENARIO_MANIFEST"
fi

cd "$APP_DIR"

if [[ $# -gt 0 ]]; then
  bunx playwright test "$@"
else
  bunx playwright test
fi
