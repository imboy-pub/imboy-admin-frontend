# IMBoy 管理后台 Docker 镜像 / Admin Frontend Docker Image
# 多阶段构建：Bun 构建 + Nginx 服务
# Multi-stage build: Bun build + Nginx serve
#
# 构建 / Build:
#   docker build \
#     --build-arg VITE_API_BASE_URL=https://api.yourdomain.com/adm \
#     -t imboy/imboy-admin:1.0.0-rc.1 .
#
# 运行 / Run:
#   docker run -p 80:80 imboy/imboy-admin:1.0.0-rc.1

# ─────────────────────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1-slim AS builder

WORKDIR /build

# 构建参数（运行时不可变，需在 build 时传入）
# Build arg: cannot be changed at runtime — must be passed at build time
ARG VITE_API_BASE_URL=https://api.example.com/adm
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

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

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
