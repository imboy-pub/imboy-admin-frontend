#!/usr/bin/env bash
# UX 后端就绪检查 / UX backend readiness gate
#
# 检查管理后台 UX 链路依赖的后端端点是否就绪：
#   - GET/PUT /admin/config/feedback-workflow（反馈工作流配置读写）
#   - POST /admin/ux/events（UX 埋点批量上报，uxTelemetryReporter 5s 批量 POST）
#
# 分类口径（与同族 check_*_backend_readiness.sh 一致）：
#   READY=端点存在（200/201/204/400/401/403——鉴权拒绝也算端点存在）
#   MISSING=404/405/501；UNREACHABLE=连接失败；UNKNOWN=其他
# --strict 时任一 capability 未 READY 即 exit 1（CI 门用）。
set -euo pipefail

BASE_URL="${IMBOY_ADMIN_BASE_URL:-http://localhost:8082/adm}"
COOKIE="${IMBOY_ADMIN_COOKIE:-}"
STRICT_MODE=0

for arg in "$@"; do
  case "$arg" in
    --strict) STRICT_MODE=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--strict]" >&2
      exit 2
      ;;
  esac
done

READY=0
MISSING=0
UNKNOWN=0
UNREACHABLE=0
TOTAL=0

print_row() {
  printf "%-42s %-6s %-54s %-8s %-10s\n" "$1" "$2" "$3" "$4" "$5"
}

request_http_code() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  local url="${BASE_URL}${path}"
  local -a curl_args
  curl_args=(-sS -o /dev/null -w '%{http_code}' --max-time 8 -X "$method" "$url")

  if [ -n "$COOKIE" ]; then
    curl_args+=(-H "Cookie: ${COOKIE}")
  fi

  if [ "$method" = "POST" ] || [ "$method" = "PUT" ]; then
    curl_args+=(-H 'Content-Type: application/json')
  fi

  if [ -n "$body" ]; then
    curl_args+=(-d "$body")
  fi

  local raw_code
  raw_code="$(curl "${curl_args[@]}" 2>/dev/null || true)"
  raw_code="${raw_code: -3}"
  if ! [[ "$raw_code" =~ ^[0-9]{3}$ ]]; then
    raw_code="000"
  fi
  echo "$raw_code"
}

classify_status() {
  local http_code="$1"
  if [ "$http_code" = "000" ]; then
    echo "UNREACHABLE"
    return
  fi
  case "$http_code" in
    200|201|204|400|401|403) echo "READY" ;;
    404|405|501) echo "MISSING" ;;
    *) echo "UNKNOWN" ;;
  esac
}

run_check() {
  local key="$1"
  local label="$2"
  local method="$3"
  local path="$4"
  local body="${5:-}"

  local http_code
  http_code="$(request_http_code "$method" "$path" "$body")"
  local status
  status="$(classify_status "$http_code")"

  eval "${key}_http='${http_code}'"
  eval "${key}_status='${status}'"

  TOTAL=$((TOTAL + 1))
  case "$status" in
    READY) READY=$((READY + 1)) ;;
    MISSING) MISSING=$((MISSING + 1)) ;;
    UNKNOWN) UNKNOWN=$((UNKNOWN + 1)) ;;
    UNREACHABLE) UNREACHABLE=$((UNREACHABLE + 1)) ;;
  esac

  print_row "$label" "$method" "$path" "$http_code" "$status"
}

is_ready() {
  local key="$1"
  local status
  eval "status=\${${key}_status:-UNKNOWN}"
  [ "$status" = "READY" ]
}

print_capability() {
  printf "%-36s %-10s %-46s\n" "$1" "$2" "$3"
}

echo "Checking UX backend readiness against: ${BASE_URL}"
echo
print_row "CHECK" "METHOD" "PATH" "HTTP" "STATUS"
print_row "-----" "------" "----" "----" "------"

run_check auth_current "Auth current route" "GET" "/current"

run_check feedback_cfg_get "Feedback workflow config (read)" "GET" "/admin/config/feedback-workflow"
run_check feedback_cfg_put "Feedback workflow config (save)" "PUT" "/admin/config/feedback-workflow" '{"sla_hours":24}'

run_check ux_events_post "UX events ingest (batch)" "POST" "/admin/ux/events" '{"events":[]}'

echo
echo "Capability matrix (frontend runtime requirement):"
print_capability "CAPABILITY" "STATUS" "RULE"
print_capability "----------" "------" "----"

capability_fail=0

cap_eval() {
  local name="$1"
  local missing="$2"
  local rule="$3"
  local status="READY"
  if [ "$missing" -ne 0 ]; then
    status="MISSING"
    capability_fail=$((capability_fail + 1))
  fi
  print_capability "$name" "$status" "$rule"
}

feedback_cfg_missing=0
is_ready feedback_cfg_get || feedback_cfg_missing=1
ux_events_missing=0
is_ready ux_events_post || ux_events_missing=1

cap_eval "auth:current" "$([ "$(eval echo \${auth_current_status:-UNKNOWN})" = "READY" ] && echo 0 || echo 1)" "GET /current"
cap_eval "ux:feedback-config" "$feedback_cfg_missing" "GET ready (PUT 提示缺失仅警告)"
cap_eval "ux:events-ingest" "$ux_events_missing" "POST /admin/ux/events"

echo
echo "Summary: TOTAL=${TOTAL} READY=${READY} MISSING=${MISSING} UNKNOWN=${UNKNOWN} UNREACHABLE=${UNREACHABLE}"
echo "Capability summary: TOTAL=3 MISSING=${capability_fail}"

if [ "$STRICT_MODE" -eq 1 ] && [ "$capability_fail" -gt 0 ]; then
  echo "Strict mode failed: one or more UX capabilities are not READY."
  exit 1
fi

if [ "$STRICT_MODE" -eq 1 ]; then
  echo "Strict mode passed: all UX capabilities are READY."
fi
