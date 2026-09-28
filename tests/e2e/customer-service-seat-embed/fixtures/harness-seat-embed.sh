#!/usr/bin/env bash
# SC-E2E — seat console embed 真实五域 harness（幂等，本地 scratch 专用）。
#
# 参数化变体：镜像 tests/e2e/customer-service-hosted/fixtures/harness.sh 的做法，
# 环境命名 CP12_* → SC153_*，scratch 库默认 sc153_e2e，backend 端口 9801，
# 域名 shop.test / cs.test / evil.test / shop2.test / admin.test（TLS 18443）。
#
# 域名映射（唯一映射，全程一致）：
#   生产 https://cs.imboy.pub  →  本地 https://cs.test:18443（cs 网关 vhost）
#   生产 https://<mall-admin>  →  本地 https://shop.test:18443 / shop2.test:18443
#   负例宿主                   →  本地 https://evil.test:18443
#   Admin SPA                  →  本地 https://admin.test:18443
#
# cs.test vhost 实现 SC-OPS 合同（plan §5.4）：
#   /seat/*                     → backend（动态 frame；CSP frame-ancestors 由 backend 按允许 origin 下发）
#   /api/v1/cs/*                → backend（含 seat SSE regex location，buffering/cache off）
#   /api/v1/passport/qr_login/* → backend
#   /api/v1/enterprise/conversations/* → backend
#   /api/v1/enterprise/organizations/* → backend
#   /seat-assets/* /assets/ /v1/loader.js /widget* → dist-widget 静态（18080 静态面）
#   其余 /api/v1/* 一律不代理（fail-closed 落静态 404）
#
# 用法：
#   bash fixtures/harness-seat-embed.sh [--print-config-only]
#     --print-config-only  只渲染 nginx.conf 到 stdout（exit 0），不触碰
#                          docker/PG/backend/nginx/bun —— 供静态合同测试断言。
#
# 前置（外部提供，本脚本只检查）：
#   1) docker 容器 imboy_pg18（PostgreSQL 18）在跑；
#   2) imboy backend 节点已在 9801 运行（scratch 库 sc153_e2e；auto-migrate 到
#      head —— 含 00000153 customer_service_seat_console；启动方式见 README）；
#   3) （A08 用）Admin 治理面超管已首启（/api/adm/setup/init，captcha 1234 为
#      local 合同测试码）—— 与 P2 同口径由 run 环境提供；脚本只探测并告警。
#
# 环境变量：SC153_E2E_PG_DB / SC153_E2E_PG_CONTAINER / SC153_E2E_PG_USER /
#           SC153_E2E_BACKEND / SC153_E2E_MASTER_CODE / SC153_E2E_SEAT_ACCOUNT /
#           SC153_E2E_SEAT_PASSWORD / SC153_E2E_ORG_ID / SC153_E2E_WORKSPACE_ID /
#           SC153_E2E_CONSOLE_PUBLIC_ID / SC153_E2E_WIDGET_ID / SC153_E2E_CS_ORIGIN /
#           SC153_E2E_SKIP_ADMIN_BUILD
set -euo pipefail

# SC-INT DEF-SC153-05：fixtures 在仓根下 4 级（tests/e2e/<case>/fixtures），
# 上溯必须 4 级；3 级落在 tests/，静态 root 渲染成 tests/dist-widget（不存在，
# 静态面全 404；构建步骤因 bun 向上找 package.json 而侥幸成功，掩盖了该错）。
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"    # 仓根（imboyadmin worktree）
HERE="$(cd "$(dirname "$0")" && pwd)"                # tests/e2e/customer-service-seat-embed/fixtures
PG_CONTAINER="${SC153_E2E_PG_CONTAINER:-imboy_pg18}"
PG_USER="${SC153_E2E_PG_USER:-imboy_user}"
PG_DB="${SC153_E2E_PG_DB:-sc153_e2e}"
BE="${SC153_E2E_BACKEND:-http://127.0.0.1:9801}"
MASTER_CODE="${SC153_E2E_MASTER_CODE:-abc12345}"
SEAT_ACCOUNT="${SC153_E2E_SEAT_ACCOUNT:-19900000002}"
SEAT_PASSWORD="${SC153_E2E_SEAT_PASSWORD:-Sc153E2e2026}"
ORG_ID="${SC153_E2E_ORG_ID:-1603940848519155}"
WORKSPACE_ID="${SC153_E2E_WORKSPACE_ID:-1603940848519156}"
PUBLIC_ID="${SC153_E2E_CONSOLE_PUBLIC_ID:-7003004002001001}"
WIDGET_PUBLIC_ID="${SC153_E2E_WIDGET_ID:-702000000000000101}"
CS_ORIGIN="${SC153_E2E_CS_ORIGIN:-https://cs.test:18443}"
ADMIN_DIST="$ROOT/dist"
STATIC_ROOT="$ROOT/dist-widget"

log() { printf '[sc153-harness] %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "缺少命令: $1" >&2; exit 2; }; }

# ---------------------------------------------------------------------------
# 渲染 nginx.conf（唯一真源；两种模式共用，保证静态合同测的就是运行时用的）。
# 参数：$1=WORKDIR $2=BE $3=ADMIN_DIST $4=STATIC_ROOT
# ---------------------------------------------------------------------------
render_nginx_conf() {
  local WORKDIR="$1" BE="$2" ADMIN_DIST="$3" STATIC_ROOT="$4"
  cat <<NGINX
# SC-E2E 本地五域拓扑（18443 TLS + 18080 dist-widget 静态面）——由
# fixtures/harness-seat-embed.sh 渲染。cs.test vhost 逐条实现 SC-OPS 合同
# （plan §5.4）；生产等价模板为 imboy 仓 deploy/nginx/templates/cs-widget.conf.template
# （本 conf 为其 seat 增量的本地等价物；镜像内 upstream 名在本地换成 127.0.0.1:9801）。
pid $WORKDIR/nginx.pid;
error_log $WORKDIR/logs/error.log warn;
worker_processes 2;
events { worker_connections 512; }
http {
    include /opt/homebrew/etc/nginx/mime.types;
    default_type application/octet-stream;
    access_log off;
    client_body_temp_path $WORKDIR/temp/client;
    proxy_temp_path $WORKDIR/temp/proxy;
    sendfile on;
    server_tokens off;

    # ---- 18080：dist-widget 静态面（本地等价 imboy_widget 容器内 nginx）------
    # 缓存头全部在本 server 下发（合同：网关不覆写、不叠加缓存头）：
    #   loader/seat-assets 稳定别名 no-cache must-revalidate；/assets/ immutable；
    #   frame 壳与未知路径 no-store（fail-closed）。
    server {
        listen 18080;
        server_name _;
        root $STATIC_ROOT;
        index index.html;
        location = /loader.js { add_header Cache-Control "no-cache, must-revalidate" always; try_files /loader.js =404; }
        location = /v1/loader.js { add_header Cache-Control "no-cache, must-revalidate" always; try_files /loader.js =404; }
        location /seat-assets/ { add_header Cache-Control "no-cache, must-revalidate" always; try_files \$uri =404; }
        location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable" always; try_files \$uri =404; }
        location = /widget/index.html { add_header Cache-Control "no-store" always; }
        location / { add_header Cache-Control "no-store" always; try_files \$uri =404; }
    }

    # ---- cs.test：seat 网关 vhost（= 生产 cs.imboy.pub 本地等价）-------------
    server {
        listen 18443 ssl;
        http2 on;
        server_name cs.test;
        ssl_certificate $WORKDIR/fullchain.pem;
        ssl_certificate_key $WORKDIR/privkey.pem;
        client_max_body_size 50m;

        # ── SSE 长连接 ×2（regex location 优先于下方前缀 location）────────────
        # Widget SSE（既有行为必须回归不变）+ Seat SSE
        # （GET /api/v1/cs/organizations/:org/seats/me/events）。两者都必须关闭
        # buffering/cache，读超时对齐 3600s。
        location ~ ^/api/v1/cs/widget/sessions/[0-9A-Za-z_-]+/events\$ {
            proxy_pass $BE;
            proxy_http_version 1.1;
            proxy_set_header Host \$http_host;
            proxy_buffering off; proxy_cache off;
            proxy_read_timeout 3600s; proxy_send_timeout 3600s;
        }
        location ~ ^/api/v1/cs/organizations/[0-9A-Za-z_-]+/seats/me/events\$ {
            proxy_pass $BE;
            proxy_http_version 1.1;
            proxy_set_header Host \$http_host;
            proxy_buffering off; proxy_cache off;
            proxy_read_timeout 3600s; proxy_send_timeout 3600s;
        }

        # ── 动态 frame：GET /seat/:public_seat_console_id → backend ──────────
        # 404（非法/缺失/不存在/revoked 统一）与 CSP frame-ancestors 由 backend
        # 按 console allowed_origins 逐请求下发；网关零注入 XFO/CSP（多 CSP 头
        # 浏览器取交集，静态网关 CSP 只会破坏嵌入或形同虚设）。
        location ^~ /seat/ {
            proxy_pass $BE;
            proxy_http_version 1.1;
            proxy_set_header Host \$http_host;
            proxy_read_timeout 300s; proxy_send_timeout 300s;
        }

        # ── 动态 frame：GET /w/:public_widget_id → backend ───────────────────
        # SC-INT DEF-SC153-06：访客链路（hosted loader snippet 的 iframe src）
        # 走既有 /w/ 面 —— 生产模板（cs-widget.conf.template ^~ /w/）与 P2
        # hosted harness 都有，本 conf 初版漏带导致 /w/ 落 catch-all 静态 404、
        # A04/A05/A09 访客会话链全断。与 /seat/ 同边界：XFO/CSP 由 backend 逐
        # 请求下发，网关零注入。
        location ^~ /w/ {
            proxy_pass $BE;
            proxy_http_version 1.1;
            proxy_set_header Host \$http_host;
            proxy_read_timeout 300s; proxy_send_timeout 300s;
        }

        # ── 四组 Seat 客户端同源 API（精确白名单；不存在全量 /api/v1/ 代理）──
        location /api/v1/cs/ { proxy_pass $BE; proxy_http_version 1.1; proxy_set_header Host \$http_host; }
        location /api/v1/passport/qr_login/ { proxy_pass $BE; proxy_http_version 1.1; proxy_set_header Host \$http_host; }
        location /api/v1/enterprise/conversations/ { proxy_pass $BE; proxy_http_version 1.1; proxy_set_header Host \$http_host; }
        location /api/v1/enterprise/organizations/ { proxy_pass $BE; proxy_http_version 1.1; proxy_set_header Host \$http_host; }

        # ── 静态产物 → 18080（缓存头由静态面下发，网关不覆写）────────────────
        location = /v1/loader.js { proxy_pass http://127.0.0.1:18080; }
        location ^~ /seat-assets/ { proxy_pass http://127.0.0.1:18080; }
        location ^~ /assets/ { proxy_pass http://127.0.0.1:18080; }
        location ^~ /widget/ { proxy_pass http://127.0.0.1:18080; }
        location ^~ /widget-assets/ { proxy_pass http://127.0.0.1:18080; }
        location = /health.txt { proxy_pass http://127.0.0.1:18080; }
        location = /manifest.json { proxy_pass http://127.0.0.1:18080; }

        # 其余路径 fail-closed 落静态 404（含未列入白名单的 /api/v1/* —— 无
        # 全量 API 代理，网关不放大攻击面）。
        location / { proxy_pass http://127.0.0.1:18080; proxy_set_header Host \$http_host; }

        # 安全响应头刻意最小集（与生产 cs-widget.conf.template 同边界）：
        # 不加 X-Frame-Options、不加 Content-Security-Policy（由 backend 逐路径
        # /逐 console 下发）；HSTS/nosniff/Referrer-Policy 属收紧。
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
    }

    # ---- shop.test：合法宿主（iframe snippet 挂载点 + 访客页）----------------
    server {
        listen 18443 ssl;
        http2 on;
        server_name shop.test;
        ssl_certificate $WORKDIR/fullchain.pem;
        ssl_certificate_key $WORKDIR/privkey.pem;
        root $WORKDIR/shop;
        location = /favicon.ico { return 204; }
        location / { try_files \$uri \$uri/ =404; }
    }

    # ---- shop2.test：第二合法宿主（A06 origin 轮换目标）----------------------
    server {
        listen 18443 ssl;
        http2 on;
        server_name shop2.test;
        ssl_certificate $WORKDIR/fullchain.pem;
        ssl_certificate_key $WORKDIR/privkey.pem;
        root $WORKDIR/shop2;
        location = /favicon.ico { return 204; }
        location / { try_files \$uri \$uri/ =404; }
    }

    # ---- evil.test：负例宿主（origin 永不在 allowed_origins）-----------------
    server {
        listen 18443 ssl;
        http2 on;
        server_name evil.test;
        ssl_certificate $WORKDIR/fullchain.pem;
        ssl_certificate_key $WORKDIR/privkey.pem;
        root $WORKDIR/evil;
        location = /favicon.ico { return 204; }
        location / { try_files \$uri \$uri/ =404; }
    }

    # ---- admin.test：Admin SPA dist（/api/adm 反代 backend；其余 SPA fallback）
    server {
        listen 18443 ssl;
        http2 on;
        server_name admin.test;
        ssl_certificate $WORKDIR/fullchain.pem;
        ssl_certificate_key $WORKDIR/privkey.pem;
        root $ADMIN_DIST;
        client_max_body_size 50m;
        location /api/ { proxy_pass $BE; proxy_http_version 1.1; proxy_set_header Host \$http_host; }
        location = /favicon.ico { return 204; }
        location / { try_files \$uri /index.html; }
    }
}
NGINX
}

# ---------------------------------------------------------------------------
# 宿主页占位符替换（唯一真源；写入与 --render-page 两种模式共用）。
# 参数：$1 = 模板文件路径（stdout 输出替换结果）。
# ---------------------------------------------------------------------------
render_page() {
  sed -e "s|__SC153_CS_ORIGIN__|$CS_ORIGIN|g" \
      -e "s|__SC153_PUBLIC_ID__|$PUBLIC_ID|g" \
      -e "s|__SC153_WIDGET_ID__|$WIDGET_PUBLIC_ID|g" \
      "$1"
}

# ---------------------------------------------------------------------------
# --print-config-only：只渲染配置（稳定路径，输出逐字节确定），零副作用。
# --render-page <fixture>：只渲染宿主页占位符（零副作用；静态合同测试的
#   替换 oracle —— 断言的就是 harness 运行时真正写出的页面文本）。
# ---------------------------------------------------------------------------
if [ "${1:-}" = "--print-config-only" ]; then
  need bash
  render_nginx_conf "/tmp/sc153-seat-embed-harness" "$BE" "/tmp/sc153-seat-embed-harness/dist" "/tmp/sc153-seat-embed-harness/dist-widget"
  exit 0
fi
if [ "${1:-}" = "--render-page" ]; then
  need bash
  render_page "$HERE/$2"
  exit 0
fi

need docker; need nginx; need openssl; need bun; need curl; need python3

# ---- 0. 前置检查 -----------------------------------------------------------
docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER" || { echo "docker 容器 $PG_CONTAINER 未运行" >&2; exit 3; }
curl -sf -o /dev/null "$BE/" || { echo "backend $BE 不可达（请先按 README 启动 scratch 后端节点）" >&2; exit 3; }
log "前置 OK（pg=$PG_CONTAINER backend=$BE）"

# Admin 首启探测（A08 前置；与 P2 同口径由 run 环境提供，脚本不代创建 ——
# setup/init 密码走 RSA-OAEP 页内加密，不在 bash 里复刻）。
SETUP_STATUS=$(curl -s "$BE/api/adm/setup/status" 2>/dev/null || true)
if ! echo "$SETUP_STATUS" | grep -q '"initialized": *true\|"initialized":true'; then
  log "警告：Admin 治理面疑似未首启（$SETUP_STATUS）——A08 需先经 /api/adm/setup/init 建超管"
fi

# ---- a. scratch 库 + 扩展（已存在则跳过创建）---------------------------------
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" | grep -q 1 || \
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c "CREATE DATABASE $PG_DB OWNER $PG_USER;" >/dev/null
for ext in pgcrypto timescaledb pg_jieba postgis vector; do
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "CREATE EXTENSION IF NOT EXISTS $ext;" >/dev/null 2>&1 || true
done
log "scratch 库就绪：$PG_DB"

# ---- b. 迁移 head 校验（须含 00000153 customer_service_seat_console）---------
HEADROW=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT version || '|' || dirty FROM schema_migrations ORDER BY applied_at DESC LIMIT 1" 2>/dev/null || true)
[ -n "$HEADROW" ] || { echo "schema_migrations 为空：请确认 backend 已用该库完成 auto-migrate" >&2; exit 3; }
# dirty 经 `||` 拼接已被 PG 铸成 text 全词（"false"/"true"，不是 t/f）；
# SC-INT DEF-SC153-02：原模式 *'|f' 永不匹配，活体运行必然误报 dirty。
case "$HEADROW" in *'|f'|*'|false') ;; *) echo "迁移处于 dirty 状态：$HEADROW" >&2; exit 3;; esac
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT to_regclass('public.customer_service_seat_console')" | grep -q customer_service_seat_console || {
  echo "customer_service_seat_console 表不存在：scratch backend 未迁移到 00000153（SC-INT 后才可执行）" >&2; exit 3;
}
log "迁移 head：$HEADROW（seat_console 表就位）"

# ---- c. 种子（默认 id 可经环境覆盖：sed 精确替换三个可变 id）------------------
WORKDIR="$(mktemp -d /tmp/sc153-seat-embed-harness.XXXXXX)"
SEED_TMP="$WORKDIR/seed-seat-console.sql"
sed -e "s/1603940848519155/$ORG_ID/g" \
    -e "s/1603940848519156/$WORKSPACE_ID/g" \
    -e "s/7003004002001001/$PUBLIC_ID/g" \
    "$HERE/seed-seat-console.sql" > "$SEED_TMP"
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 \
  -f - < "$SEED_TMP" >/dev/null
log "种子已应用（org=$ORG_ID ws=$WORKSPACE_ID console=$PUBLIC_ID）"

# ---- d. 坐席绑定（合成坐席，仅本地 scratch）------------------------------------
SU=$(curl -s -X POST "$BE/api/v1/passport/signup" -H 'content-type: application/json' \
  -d "{\"type\":\"mobile\",\"account\":\"$SEAT_ACCOUNT\",\"code\":\"$MASTER_CODE\",\"pwd\":\"$SEAT_PASSWORD\",\"rsa_encrypt\":\"0\",\"nickname\":\"sc153-seat\",\"sys_version\":\"sc153-embed\"}")
# SC-INT DEF-SC153-04：重跑幂等——账号已存在（code 1 + 手机号已经被占用）不算
# 失败，直接走下方 login 验证凭据；其余失败照旧 fail-closed。
echo "$SU" | grep -q '"code":0' || echo "$SU" | grep -q '已经被占用' || {
  echo "signup 失败: $SU（提示：backend 需配置 {verification_master_code, <<\"$MASTER_CODE\">>}，见 README）" >&2; exit 3; }
LOGIN=$(curl -s -X POST "$BE/api/v1/passport/login" -H 'content-type: application/json' \
  -d "{\"type\":\"mobile\",\"account\":\"$SEAT_ACCOUNT\",\"pwd\":\"$SEAT_PASSWORD\",\"rsa_encrypt\":\"0\",\"sys_version\":\"sc153-embed\"}")
UID2=$(echo "$LOGIN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["payload"]["uid"])')
IDENTITY_ID=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT id FROM organization_business_identity WHERE organization_id=$ORG_ID AND function_key='customer_service' LIMIT 1" | tr -d '[:space:]')
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" \
  -c "UPDATE organization_member SET user_id=$UID2 WHERE organization_id=$ORG_ID;" \
  -c "UPDATE organization_business_identity_assignment SET user_id=$UID2 WHERE id=1603940848519161;" \
  -c "UPDATE organization SET owner_id=$UID2 WHERE id=$ORG_ID;" \
  -c "UPDATE workspace SET owner_id=$UID2 WHERE id=$WORKSPACE_ID;" \
  -c "UPDATE organization_business_identity SET created_by_user_id=$UID2 WHERE id=$IDENTITY_ID;" \
  -c "UPDATE customer_service_seat SET created_by_user_id=$UID2 WHERE organization_id=$ORG_ID;" \
  -c "UPDATE customer_service_seat_console SET created_by_user_id=$UID2 WHERE id=$PUBLIC_ID;" >/dev/null
log "坐席绑定完成（uid=$UID2 identity=$IDENTITY_ID account=$SEAT_ACCOUNT）"

# ---- e. 构建 dist-widget（含 mode=seat seat-assets 稳定别名）+ Admin SPA dist --
( cd "$ROOT" && bun run build:widget >/dev/null )
log "dist-widget 已构建"
if [ "${SC153_E2E_SKIP_ADMIN_BUILD:-0}" != "1" ]; then
  ( cd "$ROOT" && bun run build >/dev/null )
  # SC-INT DEF-SC153-07：__IMBOY_API_HOST__ 是部署期占位符（docker 入口 sed），
  # harness 直发 dist 不会经过那条管道；残留占位符让 CSP connect-src 整条失效，
  # Admin SPA 全部 API 被浏览器拦截 → 登录按钮永久禁用（A08 实测）。admin.test
  # 对 /api/ 是同源代理，本地语义等价 = 去掉占位符只留 'self'（与开发态
  # IMBOY_DEV_CSP_API_HOST 缺省行为一致）。
  sed -i '' 's/ __IMBOY_API_HOST__//' "$ADMIN_DIST/index.html"
  log "Admin SPA dist 已构建（admin.test 面；SC153_E2E_SKIP_ADMIN_BUILD=1 可跳过）"
fi

# ---- f. 宿主页 / 访客页（同一份 snippet；只替换 CS origin 与 public id）--------
mkdir -p "$WORKDIR/shop" "$WORKDIR/shop2" "$WORKDIR/evil" "$WORKDIR/logs" "$WORKDIR/temp"
render_page "$HERE/host-shop.html" > "$WORKDIR/shop/index.html"
render_page "$HERE/host-visitor.html" > "$WORKDIR/shop/visitor.html"
render_page "$HERE/host-shop2.html" > "$WORKDIR/shop2/index.html"
render_page "$HERE/host-evil.html" > "$WORKDIR/evil/index.html"
log "宿主页就绪（shop/shop2/evil + shop/visitor.html）"

# ---- g. 证书 + nginx 五域拓扑（18443 TLS + 18080 静态）-------------------------
openssl req -x509 -newkey rsa:2048 -keyout "$WORKDIR/privkey.pem" -out "$WORKDIR/fullchain.pem" \
  -days 2 -nodes -subj "/CN=*.test" \
  -addext "subjectAltName=DNS:shop.test,DNS:shop2.test,DNS:cs.test,DNS:evil.test,DNS:admin.test,DNS:*.test" >/dev/null 2>&1

render_nginx_conf "$WORKDIR" "$BE" "$ADMIN_DIST" "$STATIC_ROOT" > "$WORKDIR/nginx.conf"

NGINX_PID=$(cat "$WORKDIR/nginx.pid" 2>/dev/null || true)
if [ -n "$NGINX_PID" ] && kill -0 "$NGINX_PID" 2>/dev/null; then
  nginx -s reload -c "$WORKDIR/nginx.conf" 2>/dev/null || true
else
  # 旧实例（上一次 harness 残留）先按 conf 停掉，保证幂等
  if [ -f "$WORKDIR/nginx.pid" ]; then nginx -s quit -c "$WORKDIR/nginx.conf" 2>/dev/null || true; sleep 1; fi
  nginx -c "$WORKDIR/nginx.conf"
fi
sleep 1

# ---- h. 冒烟：cs 网关静态面 + seat frame 面真实可达 ------------------------------
# -f 必须带上（DEF-SC153-05 一并修）：无 -f 时 404 响应也算 curl 成功，
# 冒烟对静态面故障完全不设防。
curl -skf -o /dev/null --resolve cs.test:18443:127.0.0.1 "https://cs.test:18443/v1/loader.js" \
  || { echo "nginx 拓扑冒烟失败（loader 静态面）" >&2; exit 3; }
SEAT_CODE=$(curl -sk -o /dev/null -w '%{http_code}' --resolve cs.test:18443:127.0.0.1 "https://cs.test:18443/seat/$PUBLIC_ID")
if [ "$SEAT_CODE" != "200" ]; then
  echo "seat frame 冒烟失败：GET /seat/$PUBLIC_ID → HTTP $SEAT_CODE（预期 200；404 = backend seat 路由缺位或 console 状态异常）" >&2
  exit 3
fi
log "nginx 五域拓扑就绪（conf=$WORKDIR/nginx.conf；seat frame HTTP 200）"
log "完成。运行：bunx playwright test --config=playwright.customer-service-seat-embed.config.ts"
