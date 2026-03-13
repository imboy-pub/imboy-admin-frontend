#!/usr/bin/env bash
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
  printf "%-40s %-6s %-42s %-8s %-10s\n" "$1" "$2" "$3" "$4" "$5"
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
  printf "%-30s %-10s %-38s\n" "$1" "$2" "$3"
}

echo "Checking report backend readiness against: ${BASE_URL}"
echo
print_row "CHECK" "METHOD" "PATH" "HTTP" "STATUS"
print_row "-----" "------" "----" "----" "------"

run_check auth_current "Auth current route" "GET" "/current"

run_check generic_list "Unified report list" "GET" "/report/list?page=1&size=1&status=-1&target_type=group"
run_check generic_resolve "Unified report resolve" "POST" "/report/resolve" '{"report_id":1,"target_type":"group","result":1,"note":"probe"}'
run_check generic_batch "Unified report batch resolve" "POST" "/report/batch_resolve" '{"report_ids":[1,2],"target_type":"group","result":1,"note":"probe"}'

run_check group_list "Group report list fallback" "GET" "/group/report/list?page=1&size=1&status=-1"
run_check group_resolve "Group report resolve fallback" "POST" "/group/report/resolve" '{"report_id":1,"result":1,"note":"probe"}'
run_check group_batch "Group report batch fallback" "POST" "/group/report/batch_resolve" '{"report_ids":[1,2],"result":1,"note":"probe"}'

run_check channel_list "Channel report list fallback" "GET" "/channel/report/list?page=1&size=1&status=-1"
run_check channel_resolve "Channel report resolve fallback" "POST" "/channel/report/resolve" '{"report_id":1,"result":1,"note":"probe"}'
run_check channel_batch "Channel report batch fallback" "POST" "/channel/report/batch_resolve" '{"report_ids":[1,2],"result":1,"note":"probe"}'

run_check user_list "User report list fallback" "GET" "/user/report/list?page=1&size=1&status=-1"
run_check user_resolve "User report resolve fallback" "POST" "/user/report/resolve" '{"report_id":1,"result":1,"note":"probe"}'
run_check user_batch "User report batch fallback" "POST" "/user/report/batch_resolve" '{"report_ids":[1,2],"result":1,"note":"probe"}'

run_check app_report_create "App report create route" "POST" "/report/create" '{"target_type":"group","target_id":88,"reason":"probe","description":"probe"}'

echo
echo "Capability matrix (frontend runtime requirement):"
print_capability "CAPABILITY" "STATUS" "RULE"
print_capability "----------" "------" "----"

capability_fail=0

cap_eval() {
  local name="$1"
  local ok="$2"
  local rule="$3"
  local status="READY"
  if [ "$ok" -ne 0 ]; then
    status="MISSING"
    capability_fail=$((capability_fail + 1))
  fi
  print_capability "$name" "$status" "$rule"
}

group_list_missing=1
if is_ready generic_list || is_ready group_list; then group_list_missing=0; fi
group_resolve_missing=1
if is_ready generic_resolve || is_ready group_resolve; then group_resolve_missing=0; fi
group_batch_missing=1
if is_ready generic_batch || is_ready group_batch; then group_batch_missing=0; fi

channel_list_missing=1
if is_ready generic_list || is_ready channel_list; then channel_list_missing=0; fi
channel_resolve_missing=1
if is_ready generic_resolve || is_ready channel_resolve; then channel_resolve_missing=0; fi
channel_batch_missing=1
if is_ready generic_batch || is_ready channel_batch; then channel_batch_missing=0; fi

user_list_missing=1
if is_ready generic_list || is_ready user_list; then user_list_missing=0; fi
user_resolve_missing=1
if is_ready generic_resolve || is_ready user_resolve; then user_resolve_missing=0; fi
user_batch_missing=1
if is_ready generic_batch || is_ready user_batch; then user_batch_missing=0; fi

app_create_missing=1
if is_ready app_report_create; then app_create_missing=0; fi

cap_eval "group:list" "$group_list_missing" "unified:list OR group:list"
cap_eval "group:resolve" "$group_resolve_missing" "unified:resolve OR group:resolve"
cap_eval "group:batch" "$group_batch_missing" "unified:batch OR group:batch"
cap_eval "channel:list" "$channel_list_missing" "unified:list OR channel:list"
cap_eval "channel:resolve" "$channel_resolve_missing" "unified:resolve OR channel:resolve"
cap_eval "channel:batch" "$channel_batch_missing" "unified:batch OR channel:batch"
cap_eval "user:list" "$user_list_missing" "unified:list OR user:list"
cap_eval "user:resolve" "$user_resolve_missing" "unified:resolve OR user:resolve"
cap_eval "user:batch" "$user_batch_missing" "unified:batch OR user:batch"
cap_eval "app:create" "$app_create_missing" "report:create"

echo
echo "Summary: TOTAL=${TOTAL} READY=${READY} MISSING=${MISSING} UNKNOWN=${UNKNOWN} UNREACHABLE=${UNREACHABLE}"
echo "Capability summary: TOTAL=10 MISSING=${capability_fail}"

if [ "$STRICT_MODE" -eq 1 ] && [ "$capability_fail" -gt 0 ]; then
  echo "Strict mode failed: one or more 3-end report capabilities are not READY."
  exit 1
fi

if [ "$STRICT_MODE" -eq 1 ]; then
  echo "Strict mode passed: all 3-end report capabilities are READY."
fi
