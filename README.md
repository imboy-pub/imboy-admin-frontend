# imboy-admin-frontend

ImBoy 管理后台前端（React + TypeScript + Vite + Bun）。

## Related Decisions / 相关 ADR

- [2026-03-15-admin-feature-module-boundaries](docs/adr/2026-03-15-admin-feature-module-boundaries.md)

## Related Docs / 相关文档

- [Admin Module Map](docs/module_map.md)

## Migration Status / 迁移状态（2026-03-29 — 闭环）

> Workspace Modular + Plugin Architecture 迁移已全部完成（Task 0-17）。

- Stable public entries: `src/modules/identity/public.ts`, `src/modules/social_graph/public.ts`, `src/modules/groups/public.ts`, `src/modules/channels/public.ts`, `src/modules/messages/public.ts`, `src/modules/moments/public.ts`, `src/modules/ops_governance/public.ts`.
- Module-owned API implementations: `src/modules/identity/api/{auth,users,roles}.ts`, `src/modules/social_graph/api/{tags,collects}.ts`, `src/modules/channels/api/public.ts`, `src/modules/groups/api/public.ts`, `src/modules/messages/api/public.ts`, `src/modules/moments/api/public.ts`, `src/modules/ops_governance/api/{reports,feedback,versions,ddl}.ts`.
- Production extension points: `src/modules/dashboard/registry/dashboardPanelRegistry.ts`, `src/modules/reports/registry/reportPanelRegistry.ts`.
- Boundary gate: `eslint.config.js` no-restricted-imports rule.
- Regression: 75 tests passed / 0 failed, `bun run build` 2.78s, `eslint` 0 errors.

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
bun run test:e2e:list
bun run test:e2e
bun run build
```

## Playwright 浏览器 E2E

已补 Playwright 骨架，首批覆盖：

- 登录并进入仪表盘
- 举报中心目标切换 + 单条处理 + 批量处理
- 管理员中心创建管理员 + 分配角色
- 角色权限页创建角色 + 保存权限
- 频道消息治理页基础加载 + 置顶 + 删除

运行前准备：

1. 启动本地后端与前端。
2. 在仓库根目录准备统一场景清单，例如：

```bash
cp testing/fixtures/three-end-first-batch.example.json testing/fixtures/three-end-first-batch.local.json
```

3. 在 `imboy-admin-frontend` 下准备 `.env.e2e`，可直接参考 `.env.e2e.example`。
4. 将 `IMBOY_TEST_SCENARIO_MANIFEST` 指向你的本地场景清单。
5. 安装浏览器二进制：

```bash
bun run test:e2e:install
```

推荐先做 preflight：

```bash
node ../testing/scripts/check_scenario_manifest.mjs --strict ../testing/fixtures/three-end-first-batch.local.json
node ../testing/scripts/check_playwright_fixture_readiness.mjs --strict ../testing/fixtures/three-end-first-batch.local.json
```

推荐入口：

```bash
bash scripts/run_playwright_e2e_gate.sh
```

仅做配置解析与用例枚举：

```bash
PLAYWRIGHT_DISABLE_WEBSERVER=1 bun run test:e2e:list
```

需要注意：

- `scripts/run_playwright_e2e_gate.sh` 会自动加载 `imboy-admin-frontend/.env.e2e`，并在真正执行 Playwright 前先做 manifest 校验；未设置 `IMBOY_ADMIN_E2E_SKIP_BACKEND_CHECKS=1` 时，还会自动做后端 readiness 与 fixture readiness 预检。
- `playwright.config.ts` 会自动读取 `imboy-admin-frontend/.env.e2e`，命令行显式传入的环境变量优先级更高。
- 管理后台登录验证码在 `local/dev/test` 环境支持固定验证码 `1234`，用于浏览器自动化；生产环境不生效。
- 普通登录用例使用 `IMBOY_ADMIN_E2E_ACCOUNT` / `IMBOY_ADMIN_E2E_PASSWORD`。
- 管理员与角色页建议使用超级管理员账号，可单独提供 `IMBOY_ADMIN_E2E_SUPER_ACCOUNT` / `IMBOY_ADMIN_E2E_SUPER_PASSWORD`。
- 举报中心和频道消息治理页依赖共享场景清单中的固定工单 / 固定消息数据。
- `reportId` / `reportIds` / `channelId` / `pinMessageId` / `deleteMessageId` 应填写管理后台 UI 或 `/adm` 接口返回的 ID，而不是默认假设数据库自增主键。
- `testing/fixtures/three-end-first-batch.example.json` 现在只保留结构占位值，复制成 `.local.json` 并替换为真实 ID 后再跑。
- `IMBOY_ADMIN_E2E_CHANNEL_ID` 仍可作为频道 ID 的兜底变量，但推荐统一写进场景清单。

## Architecture Gates / 架构门禁

- 模块边界 lint：`bun run lint`
- 生产构建验证：`bun run build`
- 约束规则：模块外代码优先从 `src/modules/<domain>` 公开入口导入，不能继续直连已建 barrel 的 `src/pages/*`、`src/services/api/*` 或 `src/modules/<domain>/*` 内部路径

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
