#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$ROOT_DIR/imboy-admin-frontend"
CHECK_ENV_SCRIPT="$ROOT_DIR/testing/scripts/check_integration_env.sh"
CHECK_REPORT_SCRIPT="$APP_DIR/scripts/check_report_backend_readiness.sh"
CHECK_ADMIN_ROLE_SCRIPT="$APP_DIR/scripts/check_admin_role_backend_readiness.sh"
CHECK_MANIFEST_SCRIPT="$ROOT_DIR/testing/scripts/check_scenario_manifest.mjs"
CHECK_FIXTURE_SCRIPT="$ROOT_DIR/testing/scripts/check_playwright_fixture_readiness.mjs"

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

    local separator_index
    separator_index="$(expr index "$line" '=')"
    [[ "$separator_index" -gt 0 ]] || continue

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

MANIFEST_PATH="$(resolve_manifest_path)"
if [[ -n "$MANIFEST_PATH" ]]; then
  if [[ ! -f "$MANIFEST_PATH" ]]; then
    echo "Scenario manifest not found: $MANIFEST_PATH" >&2
    exit 2
  fi
  export IMBOY_TEST_SCENARIO_MANIFEST="$MANIFEST_PATH"
  echo "Using Playwright scenario manifest: $IMBOY_TEST_SCENARIO_MANIFEST"
fi

node "$CHECK_MANIFEST_SCRIPT" --strict "${IMBOY_TEST_SCENARIO_MANIFEST:-}"

if [[ "${IMBOY_ADMIN_E2E_SKIP_BACKEND_CHECKS:-0}" != "1" ]]; then
  bash "$CHECK_ENV_SCRIPT" --strict
  bash "$CHECK_REPORT_SCRIPT" --strict
  bash "$CHECK_ADMIN_ROLE_SCRIPT" --strict
  node "$CHECK_FIXTURE_SCRIPT" --strict "${IMBOY_TEST_SCENARIO_MANIFEST:-}"
fi

cd "$APP_DIR"

if [[ $# -gt 0 ]]; then
  bunx playwright test "$@"
else
  bunx playwright test
fi
