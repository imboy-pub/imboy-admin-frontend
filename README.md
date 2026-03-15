# imboy-admin-frontend

ImBoy 管理后台前端（React + TypeScript + Vite + Bun）。

## Related Decisions / 相关 ADR

- [2026-03-15-admin-feature-module-boundaries](docs/adr/2026-03-15-admin-feature-module-boundaries.md)

## Related Docs / 相关文档

- [Admin Module Map](docs/module_map.md)

## 技术栈

- React 19
- TypeScript 5
- Vite 7
- Bun（依赖安装与测试）
- TanStack Query / TanStack Table
- Zustand
- React Hook Form + Zod

## 本地开发

```bash
bun install
bun run dev
```

默认开发地址：`http://localhost:8082`

Vite 代理配置见 `vite.config.ts`，默认将 `/adm` 代理到 `http://localhost:9800`。

## 环境变量

开发环境：`.env.development`

生产环境：`.env.production`

关键变量：

- `VITE_API_BASE_URL`
- `VITE_APP_NAME`
- `VITE_SIDEBAR_CONFIG_URL`（可选，菜单/RBAC 配置接口；失败时自动回退 `public/sidebar-menu.json`）
- `VITE_UX_EVENT_REPORT_URL`（可选，UX 埋点上报接口，默认 `/adm/admin/ux/events`，批量载荷格式：`{ "events": [...] }`）
- `VITE_FEEDBACK_WORKFLOW_CONFIG_URL`（可选，反馈模板/SLA 配置接口，默认 `/adm/admin/config/feedback-workflow`）
- `VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL`（可选，反馈模板/SLA 保存接口，默认 `/adm/admin/config/feedback-workflow`，优先尝试 `PUT`，回退 `POST`）
- `VITE_ADMIN_LIST_ENDPOINT`（可选，管理员列表接口，支持逗号分隔多候选端点）
- `VITE_ADMIN_CREATE_ENDPOINT`（可选，新增管理员接口，支持逗号分隔多候选端点）
- `VITE_ADMIN_ASSIGN_ROLE_ENDPOINT`（可选，管理员角色分配接口，支持逗号分隔多候选端点）
- `VITE_ROLE_LIST_ENDPOINT`（可选，角色列表接口，支持逗号分隔多候选端点）
- `VITE_ROLE_CREATE_ENDPOINT`（可选，新增角色接口，支持逗号分隔多候选端点）
- `VITE_ROLE_PERMISSION_SAVE_ENDPOINT`（可选，角色权限保存接口，支持逗号分隔多候选端点）

## 常用命令

```bash
bun run dev
bun run lint
bun run test
bun run build
```

后端接口就绪检查（默认检查 `http://127.0.0.1:9800/adm`）：

```bash
bash scripts/check_report_backend_readiness.sh
bash scripts/check_admin_role_backend_readiness.sh

# 自定义后端地址
IMBOY_ADMIN_BASE_URL='http://127.0.0.1:9800/adm' bash scripts/check_report_backend_readiness.sh
IMBOY_ADMIN_BASE_URL='http://127.0.0.1:9800/adm' bash scripts/check_admin_role_backend_readiness.sh

# fail-fast gate mode
bash scripts/check_report_backend_readiness.sh --strict
bash scripts/check_admin_role_backend_readiness.sh --strict
```

说明：反馈工作流配置接口当前没有独立的 readiness 脚本，建议结合 `bun test src/services/api/feedbackWorkflowConfig.test.ts` 与页面联调一起验证。

## 鉴权模型

- 会话基于 Cookie（`withCredentials: true`）
- 受保护路由入口：`src/components/auth/ProtectedRoute.tsx`
- API 层 401 处理采用事件通知（`imboy:auth-expired`），由路由守卫统一执行登出与跳转

## CI

GitHub Actions：`.github/workflows/ci.yml`

流水线默认执行：

- `bun install --frozen-lockfile`
- `bun run lint`
- `bun run test`
- `bun run build`

可选后端联调门禁：

- 配置仓库变量 `IMBOY_ADMIN_BASE_URL` 后，CI 会执行：
  - `bash scripts/check_report_backend_readiness.sh --strict`
  - `bash scripts/check_admin_role_backend_readiness.sh --strict`
- 任一关键端点不是 `READY`（含 `MISSING/UNKNOWN/UNREACHABLE`）将直接失败。

## 目录约定

- 页面：`src/pages`
- 组件：`src/components`
- API：`src/services/api`
- 状态：`src/stores`
- 类型：`src/types`

## 联调建议

- 后端本地启动后，先访问登录页检查 Cookie 下发。
- 若接口返回 401，前端会发出 `imboy:auth-expired` 事件，由 `ProtectedRoute` 收敛处理。
- 若发生跨域问题，优先检查后端 CORS 白名单与 `Origin` 是否匹配。

## 联调文档

- [反馈模板与 SLA 配置契约](docs/feedback_workflow_api_contract.md)
- [朋友圈举报批量处理契约](docs/moment_report_batch_resolve_api_contract.md)
- [管理员与角色联调清单](docs/admin_role_backend_api_contract.md)
