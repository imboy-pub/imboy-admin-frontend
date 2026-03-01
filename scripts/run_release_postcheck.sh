#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${IMBOY_ADMIN_BASE_URL:-http://localhost:8082/adm}"
COOKIE_HEADER="${IMBOY_ADMIN_COOKIE:-}"
DB_DSN="${IMBOY_UX_DB_DSN:-}"
WITH_CONFIG_SAVE=1

RUN_READINESS=1
RUN_LOGIN_SMOKE=1
RUN_UX_BASELINE=1

function usage() {
  cat <<'EOF'
Usage:
  scripts/run_release_postcheck.sh [options]

Options:
  --base-url <url>         Backend base URL (default: $IMBOY_ADMIN_BASE_URL or http://localhost:8082/adm)
  --cookie <cookie>        Logged-in Cookie header value (or set IMBOY_ADMIN_COOKIE)
  --db-dsn <dsn>           PostgreSQL DSN for UX funnel baseline (or set IMBOY_UX_DB_DSN)
  --no-config-save         Skip PUT/POST route probe in login smoke
  --skip-readiness         Skip strict readiness check
  --skip-login-smoke       Skip login-state smoke check
  --skip-ux-baseline       Skip UX SQL baseline check
  -h, --help               Show this help

Examples:
  IMBOY_ADMIN_BASE_URL='http://localhost:8082/adm' \
  IMBOY_ADMIN_COOKIE='k1=v1; k2=v2' \
  IMBOY_UX_DB_DSN='postgresql://user:pass@host:5432/db' \
  bash scripts/run_release_postcheck.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --cookie)
      COOKIE_HEADER="$2"
      shift 2
      ;;
    --db-dsn)
      DB_DSN="$2"
      shift 2
      ;;
    --no-config-save)
      WITH_CONFIG_SAVE=0
      shift
      ;;
    --skip-readiness)
      RUN_READINESS=0
      shift
      ;;
    --skip-login-smoke)
      RUN_LOGIN_SMOKE=0
      shift
      ;;
    --skip-ux-baseline)
      RUN_UX_BASELINE=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

PASS=0
FAIL=0
WARN=0

function mark_pass() {
  PASS=$((PASS + 1))
}

function mark_fail() {
  FAIL=$((FAIL + 1))
}

function mark_warn() {
  WARN=$((WARN + 1))
}

echo "Release postcheck started"
echo "BASE_URL: $BASE_URL"
echo

if [[ "$RUN_READINESS" -eq 1 ]]; then
  echo "[1/3] Strict readiness check..."
  if IMBOY_ADMIN_BASE_URL="$BASE_URL" bash "$ROOT_DIR/scripts/check_ux_backend_readiness.sh" --strict; then
    echo "-> readiness PASS"
    mark_pass
  else
    echo "-> readiness FAIL"
    mark_fail
  fi
  echo
else
  echo "[1/3] Strict readiness check skipped."
  mark_warn
  echo
fi

if [[ "$RUN_LOGIN_SMOKE" -eq 1 ]]; then
  echo "[2/3] Login-state smoke check..."
  if [[ -z "$COOKIE_HEADER" ]]; then
    echo "-> login smoke WARN (missing cookie, skipped)"
    mark_warn
  else
    LOGIN_ARGS=(
      --base-url "$BASE_URL"
      --cookie "$COOKIE_HEADER"
    )
    if [[ "$WITH_CONFIG_SAVE" -eq 1 ]]; then
      LOGIN_ARGS+=(--with-config-save)
    fi
    if bash "$ROOT_DIR/scripts/run_login_smoke_acceptance.sh" "${LOGIN_ARGS[@]}"; then
      echo "-> login smoke PASS"
      mark_pass
    else
      echo "-> login smoke FAIL"
      mark_fail
    fi
  fi
  echo
else
  echo "[2/3] Login-state smoke check skipped."
  mark_warn
  echo
fi

if [[ "$RUN_UX_BASELINE" -eq 1 ]]; then
  echo "[3/3] UX funnel baseline check..."
  if [[ -z "$DB_DSN" ]]; then
    echo "-> ux baseline WARN (missing db dsn, skipped)"
    mark_warn
  else
    if IMBOY_UX_DB_DSN="$DB_DSN" bash "$ROOT_DIR/scripts/run_ux_funnel_baseline.sh"; then
      echo "-> ux baseline PASS"
      mark_pass
    else
      echo "-> ux baseline FAIL"
      mark_fail
    fi
  fi
  echo
else
  echo "[3/3] UX funnel baseline check skipped."
  mark_warn
  echo
fi

echo "Postcheck summary: PASS=$PASS FAIL=$FAIL WARN=$WARN"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
