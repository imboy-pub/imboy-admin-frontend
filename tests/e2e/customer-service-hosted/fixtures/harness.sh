#!/usr/bin/env bash
# CP-ASSET-02 — hosted Widget 真实四域 harness（幂等，本地 scratch 专用）。
#
# 用途：一键拉起/校验 hosted E2E 的本地环境（除 backend 节点外全部自动），
# 供 CI 可选 job 与本机重复运行。全部流量打到 127.0.0.1，禁止任何外网/生产。
#
# 前置（外部提供，本脚本只检查）：
#   1) docker 容器 imboy_pg18（PostgreSQL 18）在跑；
#   2) imboy backend 节点已在 9805 端口运行（scratch 库；启动方式见 README）。
#
# 本脚本做的事（按序）：
#   a. 建 scratch 库（可经 CP12_E2E_PG_DB 覆盖，默认 imboy_cp12_e2e02）+ 扩展；
#   b. 校验迁移 head（backend 节点启动时 auto-migrate；本脚本只校验）；
#   c. 应用种子 fixtures/seed-installations.sql；
#   d. 坐席绑定：passport/signup + login（合成坐席）并把 uid 绑进成员行；
#   e. 构建 dist-widget（bun run build:widget）；
#   f. 生成自签测试证书 + 宿主页 + nginx 四域拓扑（18443/18080）并启动。
#
# 环境变量：CP12_E2E_PG_DB / CP12_E2E_PG_CONTAINER / CP12_E2E_PG_USER /
#           CP12_E2E_BACKEND / CP12_E2E_SEAT_ACCOUNT / CP12_E2E_SEAT_PASSWORD
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"          # 仓根（imboyadmin integration）
HERE="$(cd "$(dirname "$0")" && pwd)"                # tests/e2e/customer-service-hosted
PG_CONTAINER="${CP12_E2E_PG_CONTAINER:-imboy_pg18}"
PG_USER="${CP12_E2E_PG_USER:-imboy_user}"
PG_DB="${CP12_E2E_PG_DB:-imboy_cp12_e2e02}"
BE="${CP12_E2E_BACKEND:-http://127.0.0.1:9805}"
SEAT_ACCOUNT="${CP12_E2E_SEAT_ACCOUNT:-19900000001}"
SEAT_PASSWORD="${CP12_E2E_SEAT_PASSWORD:-Cp12E2e2026}"
WORKDIR="$(mktemp -d /tmp/cp12-hosted-harness.XXXXXX)"

log() { printf '[harness] %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "缺少命令: $1" >&2; exit 2; }; }
need docker; need nginx; need openssl; need bun; need curl; need python3

# ---- 0. 前置检查 -----------------------------------------------------------
docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER" || { echo "docker 容器 $PG_CONTAINER 未运行" >&2; exit 3; }
curl -sf -o /dev/null "$BE/" || { echo "backend $BE 不可达（请先按 README 启动 scratch 后端节点）" >&2; exit 3; }
log "前置 OK（pg=$PG_CONTAINER backend=$BE）"

# ---- a. scratch 库 + 扩展 ---------------------------------------------------
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" | grep -q 1 || \
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c "CREATE DATABASE $PG_DB OWNER $PG_USER;" >/dev/null
for ext in pgcrypto timescaledb pg_jieba postgis vector; do
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "CREATE EXTENSION IF NOT EXISTS $ext;" >/dev/null 2>&1 || true
done
log "scratch 库就绪：$PG_DB"

# ---- b. 迁移 head 校验（backend auto-migrate 后应 >= 1 行且 dirty=f）---------
HEADROW=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT version || '|' || dirty FROM schema_migrations ORDER BY applied_at DESC LIMIT 1" 2>/dev/null || true)
[ -n "$HEADROW" ] || { echo "schema_migrations 为空：请确认 backend 已用该库完成 auto-migrate" >&2; exit 3; }
case "$HEADROW" in *'|f') ;; *) echo "迁移处于 dirty 状态：$HEADROW" >&2; exit 3;; esac
log "迁移 head：$HEADROW"

# ---- c. 种子 -----------------------------------------------------------------
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 \
  -f - < "$HERE/fixtures/seed-installations.sql" >/dev/null
log "种子已应用"

# ---- d. 坐席绑定（合成坐席，仅本地 scratch）------------------------------------
MASTER_CODE="${CP12_E2E_MASTER_CODE:-abc12345}"
SU=$(curl -s -X POST "$BE/api/v1/passport/signup" -H 'content-type: application/json' \
  -d "{\"type\":\"mobile\",\"account\":\"$SEAT_ACCOUNT\",\"code\":\"$MASTER_CODE\",\"pwd\":\"$SEAT_PASSWORD\",\"rsa_encrypt\":\"0\",\"nickname\":\"cp12-seat\",\"sys_version\":\"cp12-hosted\"}")
echo "$SU" | grep -q '"code":0' || { echo "signup 失败: $SU（提示：backend 需配置 {verification_master_code, <<\"$MASTER_CODE\">>}，见 README）" >&2; exit 3; }
LOGIN=$(curl -s -X POST "$BE/api/v1/passport/login" -H 'content-type: application/json' \
  -d "{\"type\":\"mobile\",\"account\":\"$SEAT_ACCOUNT\",\"pwd\":\"$SEAT_PASSWORD\",\"rsa_encrypt\":\"0\",\"sys_version\":\"cp12-hosted\"}")
UID2=$(echo "$LOGIN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["payload"]["uid"])')
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" \
  -c "UPDATE organization_member SET user_id=$UID2 WHERE organization_id=700200000000000001;" \
  -c "UPDATE organization_business_identity_assignment SET user_id=$UID2 WHERE id=700700000000000001;" \
  -c "UPDATE organization SET owner_id=$UID2 WHERE id=700200000000000001;" \
  -c "UPDATE workspace SET owner_id=$UID2 WHERE id=700300000000000001;" \
  -c "UPDATE organization_business_identity SET created_by_user_id=$UID2 WHERE id=700500000000000001;" \
  -c "UPDATE customer_service_seat SET created_by_user_id=$UID2 WHERE organization_id=700200000000000001;" >/dev/null
log "坐席绑定完成（uid=$UID2）"

# ---- e. 构建 dist-widget ------------------------------------------------------
( cd "$ROOT" && bun run build:widget >/dev/null )
log "dist-widget 已构建"

# ---- f. nginx 四域拓扑（18443 TLS + 18080 静态）--------------------------------
mkdir -p "$WORKDIR/shop" "$WORKDIR/shop2" "$WORKDIR/logs" "$WORKDIR/temp"
openssl req -x509 -newkey rsa:2048 -keyout "$WORKDIR/privkey.pem" -out "$WORKDIR/fullchain.pem" \
  -days 2 -nodes -subj "/CN=*.test" -addext "subjectAltName=DNS:shop.test,DNS:cs.test,DNS:api.test,DNS:admin.test,DNS:*.test" >/dev/null 2>&1

cat > "$WORKDIR/shop/index.html" <<HTML
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>E2E Shop 宿主页</title></head>
<body>
<h1>shop.test — E2E host page</h1>
<!-- 冻结合同 S1：最小 snippet，唯一 data-* 属性 = data-widget-id -->
<script async src="https://cs.test:18443/v1/loader.js" data-widget-id="702000000000000001"></script>
</body></html>
HTML
cat > "$WORKDIR/shop2/index.html" <<HTML
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>E2E EVIL host page (origin not allowed)</title></head>
<body>
<h1>shop2.test — evil origin host</h1>
<script async src="https://cs.test:18443/v1/loader.js" data-widget-id="702000000000000001"></script>
</body></html>
HTML

cat > "$WORKDIR/nginx.conf" <<NGINX
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
    server {
        listen 18080;
        server_name _;
        root $ROOT/dist-widget;
        index index.html;
        location = /loader.js { add_header Cache-Control "no-cache, must-revalidate" always; try_files /loader.js =404; }
        location = /v1/loader.js { add_header Cache-Control "no-cache, must-revalidate" always; try_files /loader.js =404; }
        location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable" always; try_files \$uri =404; }
        location /widget-assets/ { add_header Cache-Control "no-cache, must-revalidate" always; try_files \$uri =404; }
        location = /widget/index.html { add_header Cache-Control "no-store" always; }
        location / { add_header Cache-Control "no-store" always; try_files \$uri =404; }
    }
    server {
        listen 18443 ssl;
        http2 on;
        server_name cs.test;
        ssl_certificate $WORKDIR/fullchain.pem;
        ssl_certificate_key $WORKDIR/privkey.pem;
        client_max_body_size 50m;
        location ~ ^/api/v1/cs/widget/sessions/[0-9A-Za-z_-]+/events\$ {
            proxy_pass $BE;
            proxy_http_version 1.1;
            proxy_set_header Host \$http_host;
            proxy_buffering off; proxy_cache off;
            proxy_read_timeout 3600s; proxy_send_timeout 3600s;
        }
        location ^~ /w/ { proxy_pass $BE; proxy_http_version 1.1; proxy_set_header Host \$http_host; }
        location /api/v1/cs/widget/ { proxy_pass $BE; proxy_http_version 1.1; proxy_set_header Host \$http_host; }
        location = /v1/loader.js { proxy_pass http://127.0.0.1:18080; }
        location ^~ /assets/ { proxy_pass http://127.0.0.1:18080; }
        location ^~ /widget/ { proxy_pass http://127.0.0.1:18080; }
        location ^~ /widget-assets/ { proxy_pass http://127.0.0.1:18080; }
        location = /health.txt { proxy_pass http://127.0.0.1:18080; }
        location = /manifest.json { proxy_pass http://127.0.0.1:18080; }
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
    }
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
}
NGINX

NGINX_PID=$(cat "$WORKDIR/nginx.pid" 2>/dev/null || true)
if [ -n "$NGINX_PID" ] && kill -0 "$NGINX_PID" 2>/dev/null; then
  nginx -s reload -c "$WORKDIR/nginx.conf" 2>/dev/null || true
else
  # 旧实例（上一次 harness 残留）先按 conf 停掉，保证幂等
  if [ -f "$WORKDIR/nginx.pid" ]; then nginx -s quit -c "$WORKDIR/nginx.conf" 2>/dev/null || true; sleep 1; fi
  nginx -c "$WORKDIR/nginx.conf"
fi
sleep 1
curl -sk -o /dev/null --resolve cs.test:18443:127.0.0.1 "https://cs.test:18443/v1/loader.js" \
  || { echo "nginx 拓扑冒烟失败" >&2; exit 3; }
log "nginx 四域拓扑就绪（conf=$WORKDIR/nginx.conf）"
log "完成。运行：bunx playwright test -c playwright.customer-service-hosted.config.ts"
