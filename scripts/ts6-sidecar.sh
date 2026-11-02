#!/usr/bin/env bash
# TypeScript 7 / 6 side-by-side（官方建议方案，见 typescript@7发布公告）：
# - 根 `typescript` = 7.0.2：供 tsc typecheck / build（原生编译器）。
# - 别名 `typescript6` = typescript@6.0.3：TS7 已不再随包提供完整编译器 JS API，
#   typescript-eslint / knip 等 lint 工具链仍依赖 TS6 JS API，
#   通过嵌套 node_modules 符号链接让它们解析到 typescript6。
# bun install（含 CI 的 --frozen-lockfile）会执行本 postinstall。
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules/typescript6 ]; then
  echo "ts6-sidecar: node_modules/typescript6 not found, skipping (依赖未安装?)" >&2
  exit 0
fi

for pkg in typescript-eslint @typescript-eslint knip ts-api-utils; do
  if [ -d "node_modules/$pkg" ]; then
    mkdir -p "node_modules/$pkg/node_modules"
    ln -sfn ../../typescript6 "node_modules/$pkg/node_modules/typescript"
  fi
done
