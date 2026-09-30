# IMBoy 管理后台

IMBoy 的 Web 管理后台，基于 React、TypeScript、Vite 和 Bun，提供用户、群组、消息、频道、举报及系统配置等管理功能。

## 本地启动

### 1. 准备环境

- Bun
- 已启动的 IMBoy 后端（默认 `http://127.0.0.1:9800`）

### 2. 安装并运行

```bash
bun install
bun run dev
```

浏览器打开 `http://127.0.0.1:8082`。开发服务器会把 `/api/adm`、`/api/v1`（客服挂件开发用）、`/brand` 和 `/metrics` 请求代理到本地后端。

三端统一术语与 API 对齐以后端仓为权威：[术语表](https://github.com/imboy-pub/imboy/blob/main/docs/glossary.md) · [三端 API 对齐](https://github.com/imboy-pub/imboy/blob/main/docs/api-contracts/three-platform-alignment.md)。

需要修改开发环境时，编辑 `.env.development`，不要把真实账号或密钥提交到仓库。

## 常用命令

快速入口（详见下方完整表）：`bun run dev` / `bun run lint` / `bun run typecheck` / `bun run test` / `bun run build` / `bun run check`。

<!-- AUTO-GENERATED: START (source: package.json scripts; 生成工具: AI doc-sync) -->

| 命令 | 实际执行 | 说明 |
|---|---|---|
| `bun install` | — | 安装依赖（改依赖后用 `--frozen-lockfile` 校验锁文件） |
| `bun run dev` | `vite` | 开发服务器（默认 `http://127.0.0.1:8082`，代理 `/api/adm`、`/api/v1`、`/brand`、`/metrics` 到本地后端） |
| `bun run build` | `tsc -b && vite build` | 生产构建 |
| `bun run build:widget` | `vite build --mode widget && vite build --mode widget-loader && vite build --mode seat && bun scripts/widget-manifest.mts` | 客服挂件三段构建 + 生成 manifest |
| `bun run verify:widget` | `bun scripts/widget-verify.mts` | 挂件产物校验 |
| `bun run verify:widget-pairing` | `bun scripts/check-widget-asset-pairing.mts` | 挂件资产配对校验 |
| `bun run preview` | `vite preview` | 预览生产构建产物 |
| `bun run test` | `bun test --isolate` | 单元测试（必须 `--isolate`：隔离测试文件，避免共享 DOM/Mock 污染，勿裸跑 `bun test`） |
| `bun run test:e2e` | `playwright test` | Playwright 端到端测试 |
| `bun run test:e2e:prod` | `playwright test --config=playwright.prod-check.config.ts` | 生产环境健康检查（谨慎执行） |
| `bun run test:e2e:customer-service:real` | `playwright test --config=playwright.customer-service-real.config.ts` | 客服坐席 E2E（真实后端） |
| `bun run test:e2e:customer-service:p2` | `playwright test --config=playwright.customer-service-p2.config.ts` | 客服坐席 E2E（P2） |
| `bun run test:e2e:headed` | `playwright test --headed` | 有头模式运行 E2E |
| `bun run test:e2e:ui` | `playwright test --ui` | Playwright UI 模式 |
| `bun run test:e2e:list` | `playwright test --list` | 列出全部 E2E 用例 |
| `bun run test:e2e:install` | `playwright install chromium` | 安装 E2E 浏览器 |
| `bun run lint` | `eslint .` | ESLint 检查（含模块边界规则） |
| `bun run lint:fix` | `eslint . --fix` | ESLint 自动修复 |
| `bun run typecheck` | `tsc --noEmit -p tsconfig.app.json` | TypeScript 类型检查 |
| `bun run deadcode` | `knip` | 死代码检测 |
| `bun run check` | `eslint . && tsc --noEmit -p tsconfig.app.json && knip` | 提交前组合检查（lint + typecheck + deadcode） |

<!-- AUTO-GENERATED: END -->

运行浏览器端到端测试：

```bash
cp .env.e2e.example .env.e2e
# 编辑 .env.e2e，填入本地测试环境
bun run test:e2e:install
bun run test:e2e
# 生产健康检查（默认指向 https://prodadm.imboy.pub，可用 IMBOY_ADMIN_E2E_BASE_URL 覆盖；谨慎执行）
IMBOY_ADMIN_E2E_BASE_URL=https://your-admin.example.com bun run test:e2e:prod
```

## 代码入口

```text
src/pages/        页面
src/components/   通用组件
src/hooks/        自定义 Hooks
src/lib/          工具函数
src/modules/      业务模块及其 API
src/services/     HTTP 客户端和历史共享服务
src/stores/       Zustand 状态
src/types/        TypeScript 类型
src/test/         测试工具
tests/e2e/        Playwright 端到端测试
```

## 开发前记住

- 新业务 API 放在 `src/modules/*/api`，模块外通过公开入口导入。
- 64 位 TSID 使用 `EntityId`，不要转成 `number`。
- 列表页统一使用 `DataTablePagination`，筛选变化后重置到第 1 页。
- 提交前至少运行 `bun run lint`、`bun run test` 和 `bun run build`。

## 继续阅读

- [项目约定](./CLAUDE.md)
- [环境变量参考](./docs/env-vars.md)
- [贡献指南](./CONTRIBUTING.md)
- [运维手册](./RUNBOOK.md)
- [设计规范](./DESIGN.md)
- [模块地图](./docs/module_map.md)
- [管理员与角色接口](./docs/api-contracts/admin_role_backend_api_contract.md)
- [举报中心三端契约](./docs/api-contracts/report_center_3end_api_contract.md)

## 许可证

**Business Source License 1.1（BSL 1.1）** —— 源码公开，四年后自动转为 MPL 2.0。

- **可以**：复制、修改、再分发；非生产用途免费；生产环境中的组织内部使用、单客户私有部署、集成进自有产品，均在 [LICENSE](./LICENSE) 的 Additional Use Grant 范围内免费。
- **需要商业授权**：向第三方提供多租户托管服务（SaaS），或提供与官方付费版竞争的付费产品或服务。

本仓是 IMBoy 三端中的管理后台。三端许可并不相同：`imboy`（后端）与 `imboy-admin-frontend`（本仓）为 BSL 1.1，`imboy-flutter`（移动客户端）为木兰宽松许可证第 2 版。

2026-09-14 之前发布的版本按[木兰宽松许可证第 2 版](./docs/legal/MulanPSL-2.0.txt)授权，不受本次变更影响；该文件作为历史授权文本保留。

商业授权与商标使用请联系维护者。
