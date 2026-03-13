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

echo "Checking admin-role backend readiness against: ${BASE_URL}"
echo
print_row "CHECK" "METHOD" "PATH" "HTTP" "STATUS"
print_row "-----" "------" "----" "----" "------"

run_check auth_current "Auth current route" "GET" "/current"

run_check admin_list_primary "Admin list (primary)" "GET" "/admin/list?page=1&size=1&status=-1"
run_check admin_list_fallback "Admin list (fallback)" "GET" "/admins/list?page=1&size=1&status=-1"

run_check admin_create_primary "Admin create (primary)" "POST" "/admin/create" '{"account":"probe_admin","pwd":"probe_123456","role_id":2,"status":1}'
run_check admin_create_fallback "Admin create (fallback)" "POST" "/admins/create" '{"account":"probe_admin","pwd":"probe_123456","role_id":2,"status":1}'

run_check admin_assign_primary "Admin role assign (primary)" "PUT" "/admin/assign_role" '{"admin_id":"1","role_id":2}'
run_check admin_assign_primary_post "Admin role assign (primary-post)" "POST" "/admin/assign_role" '{"admin_id":"1","role_id":2}'
run_check admin_assign_alt1_put "Admin role assign (alt1-put)" "PUT" "/admin/role/update" '{"admin_id":"1","role_id":2}'
run_check admin_assign_alt1_post "Admin role assign (alt1-post)" "POST" "/admin/role/update" '{"admin_id":"1","role_id":2}'
run_check admin_assign_alt2_put "Admin role assign (alt2-put)" "PUT" "/admins/assign-role" '{"admin_id":"1","role_id":2}'
run_check admin_assign_alt2_post "Admin role assign (alt2-post)" "POST" "/admins/assign-role" '{"admin_id":"1","role_id":2}'

run_check role_list_primary "Role list (primary)" "GET" "/role/list"
run_check role_list_fallback "Role list (fallback)" "GET" "/roles/list"

run_check role_create_primary "Role create (primary)" "POST" "/role/create" '{"name":"probe_role","description":"probe","permissions":["reports:read"],"status":1}'
run_check role_create_fallback "Role create (fallback)" "POST" "/roles/create" '{"name":"probe_role","description":"probe","permissions":["reports:read"],"status":1}'

run_check role_perm_primary_put "Role permission save (primary-put)" "PUT" "/role/permissions/save" '{"role_id":2,"permissions":["reports:read"]}'
run_check role_perm_primary_post "Role permission save (primary-post)" "POST" "/role/permissions/save" '{"role_id":2,"permissions":["reports:read"]}'
run_check role_perm_alt1_put "Role permission save (alt1-put)" "PUT" "/role/permission/update" '{"role_id":2,"permissions":["reports:read"]}'
run_check role_perm_alt1_post "Role permission save (alt1-post)" "POST" "/role/permission/update" '{"role_id":2,"permissions":["reports:read"]}'
run_check role_perm_alt2_put "Role permission save (alt2-put)" "PUT" "/roles/permissions/save" '{"role_id":2,"permissions":["reports:read"]}'
run_check role_perm_alt2_post "Role permission save (alt2-post)" "POST" "/roles/permissions/save" '{"role_id":2,"permissions":["reports:read"]}'

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

auth_missing=1
if is_ready auth_current; then auth_missing=0; fi

admin_list_missing=1
if is_ready admin_list_primary || is_ready admin_list_fallback; then admin_list_missing=0; fi

admin_create_missing=1
if is_ready admin_create_primary || is_ready admin_create_fallback; then admin_create_missing=0; fi

admin_assign_missing=1
if is_ready admin_assign_primary || \
   is_ready admin_assign_primary_post || \
   is_ready admin_assign_alt1_put || \
   is_ready admin_assign_alt1_post || \
   is_ready admin_assign_alt2_put || \
   is_ready admin_assign_alt2_post; then
  admin_assign_missing=0
fi

role_list_missing=1
if is_ready role_list_primary || is_ready role_list_fallback; then role_list_missing=0; fi

role_create_missing=1
if is_ready role_create_primary || is_ready role_create_fallback; then role_create_missing=0; fi

role_perm_save_missing=1
if is_ready role_perm_primary_put || \
   is_ready role_perm_primary_post || \
   is_ready role_perm_alt1_put || \
   is_ready role_perm_alt1_post || \
   is_ready role_perm_alt2_put || \
   is_ready role_perm_alt2_post; then
  role_perm_save_missing=0
fi

cap_eval "auth:current" "$auth_missing" "GET /current"
cap_eval "admin:list" "$admin_list_missing" "admin:list primary OR fallback"
cap_eval "admin:create" "$admin_create_missing" "admin:create primary OR fallback"
cap_eval "admin:assign_role" "$admin_assign_missing" "assign primary/alt + PUT/POST"
cap_eval "role:list" "$role_list_missing" "role:list primary OR fallback"
cap_eval "role:create" "$role_create_missing" "role:create primary OR fallback"
cap_eval "role:save_permissions" "$role_perm_save_missing" "save primary/alt + PUT/POST"

echo
echo "Summary: TOTAL=${TOTAL} READY=${READY} MISSING=${MISSING} UNKNOWN=${UNKNOWN} UNREACHABLE=${UNREACHABLE}"
echo "Capability summary: TOTAL=7 MISSING=${capability_fail}"

if [ "$STRICT_MODE" -eq 1 ] && [ "$capability_fail" -gt 0 ]; then
  echo "Strict mode failed: one or more admin-role capabilities are not READY."
  exit 1
fi

if [ "$STRICT_MODE" -eq 1 ]; then
  echo "Strict mode passed: all admin-role capabilities are READY."
fi
