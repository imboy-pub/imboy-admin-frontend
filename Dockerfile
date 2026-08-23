# IMBoy 管理后台 Docker 镜像 / Admin Frontend Docker Image
# 多阶段构建：Bun 构建 + Nginx 服务
# Multi-stage build: Bun build + Nginx serve
#
# 构建 / Build（发布链由 imboy 仓 release.yml build-admin-candidate 推送
# ghcr.io/imboy-pub/imboy-admin:<version>；本地手动构建示例）:
#   docker build -t ghcr.io/imboy-pub/imboy-admin:<version> .
#
# 运行 / Run（IMBOY_API_HOST 注入后端地址，未设置时回落同源 /api/adm）:
#   docker run -p 80:80 -e IMBOY_API_HOST=https://api.example.com \
#     ghcr.io/imboy-pub/imboy-admin:<version>

# ─────────────────────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1-slim AS builder

WORKDIR /build

# 安装依赖（利用层缓存）/ Install dependencies (layer cache)
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile

# 复制源码并构建 / Copy source and build
COPY . .
RUN bun run build

# ─────────────────────────────────────────────────────────────
# Stage 2: Runtime (Nginx)
# ─────────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

# 删除默认配置 / Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# 写入 SPA 配置（history 路由回退）/ SPA config with history fallback
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    # gzip\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;\n\
    # 静态资源强缓存 / Static assets: long cache\n\
    location ~* \\.(js|css|woff2?|ttf|eot|svg|png|jpg|webp|ico)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
    # SPA 路由回退 / SPA history fallback\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    # 健康检查 / Health check\n\
    location /health {\n\
        return 200 "ok";\n\
        add_header Content-Type text/plain;\n\
    }\n\
}\n' > /etc/nginx/conf.d/imboy-admin.conf

# 复制构建产物 / Copy build artifacts
COPY --from=builder /build/dist /usr/share/nginx/html

# 运行时配置注入：构建时用占位符 __IMBOY_API_HOST__ 代替硬编码域名，
# 容器启动时 sed 替换为 IMBOY_API_HOST 环境变量（compose 传入
# https://${API_DOMAIN}）。未设置时回落到同源相对路径 /api/adm。
# Vite 构建时 import.meta.env 已静态替换，运行时 env 无效——必须替换产物文件。
# 替换 JS + HTML（含 CSP connect-src 的域名白名单）。
RUN printf '#!/bin/sh\nset -eu\nHOST="${IMBOY_API_HOST:-}"\nif [ -n "$HOST" ]; then\n  find /usr/share/nginx/html \\( -name "*.js" -o -name "*.html" \\) -exec sed -i "s|__IMBOY_API_HOST__|'"'"'$HOST'"'"'|g" {} +\nfi\nexec nginx -g "daemon off;"\n' > /docker-entrypoint-imboy.sh && chmod +x /docker-entrypoint-imboy.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1

ENTRYPOINT ["/docker-entrypoint-imboy.sh"]
