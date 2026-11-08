#!/bin/sh
set -eu

# 按字面替换 API origin；空值去掉占位符，保留同源 /api/adm。
# Replace the API origin literally; empty means same-origin /api/adm.
escaped_host=$(printf '%s' "${IMBOY_API_HOST:-}" | sed 's/[\\&|]/\\&/g')
find /usr/share/nginx/html -type f \( -name '*.js' -o -name '*.html' \) \
  -exec sed -i "s|__IMBOY_API_HOST__|$escaped_host|g" {} +

exec nginx -g 'daemon off;'
