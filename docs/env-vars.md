# 环境变量参考 / Environment Variables

> **最后更新 / Last updated**: 2026-09-30
> 语言 / Languages: 简体中文（权威） | [English](./env-vars.en.md)
> 真源 / Sources of truth: `package.json`、`src/vite-env.d.ts`、`import.meta.env` 实际读取处、`.env.development` / `.env.production` / `.env.e2e.example`。
> 本文档为提取稿，冲突时以代码与 env 文件为准。

---

## 一、构建时变量（Vite，`VITE_` 前缀）

加载来源：`.env.development`（`bun run dev`）、`.env.production`（`bun run build`）。
两个文件均**提交到仓库**，值不含敏感信息；运行时敏感配置一律由后端持有。
类型声明见 `src/vite-env.d.ts`。

### 基础配置

| 变量 | 必填 | 默认/示例 | 读取处 | 说明 |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | 否（有代码默认值） | `/api/adm`；生产 `__IMBOY_API_HOST__/api/adm`（部署期占位符替换） | `src/services/api/client.ts`、`src/services/api/systemHealth.ts`、`src/modules/messages/api/public.ts` | 后端管理 API 基址 |
| `VITE_SIDEBAR_CONFIG_URL` | 否（但 dev 强烈建议设） | 代码兜底 `/sidebar-menu.json` | `src/services/api/adminConfig.ts` | 侧边栏菜单配置端点。⚠️ dev 必须指向真实后端 `/api/adm/admin/config/sidebar`，否则菜单 ≠ 生产（曾整组丢失「企业管理」，EADM-07 教训）；`.env.development` 已设正确值 |
| `VITE_UX_EVENT_REPORT_URL` | 否 | `.env` 中设为 `/api/adm/admin/ux/events` | `src/services/api/uxTelemetryReporter.ts` | UX 埋点上报端点 |
| `VITE_FEEDBACK_WORKFLOW_CONFIG_URL` | 否 | `.env` 中设为 `/admin/config/feedback-workflow` | `src/services/api/feedbackWorkflowConfig.ts` | 反馈工作流配置读取端点 |
| `VITE_CS_WIDGET_ORIGIN` | 仅生产（客服挂件） | `https://cs.imboy.pub` | `src/modules/customer_service/widgetConfig.ts` | 客服坐席挂件的宿主来源，`build:widget` 场景使用 |

### 端点覆盖（全部可选，代码内置默认值）

以下变量仅在需要把管理端点指到非默认路径时设置，均经 `resolveEndpoint(env, DEFAULT_*)` 处理：

| 变量 | 读取处 |
|---|---|
| `VITE_ROLE_LIST_ENDPOINT` / `VITE_ROLE_CREATE_ENDPOINT` / `VITE_ROLE_PERMISSION_SAVE_ENDPOINT` / `VITE_ROLE_DISABLE_ENDPOINT` / `VITE_ROLE_DELETE_ENDPOINT` | `src/modules/identity/api/roles.ts` |
| `VITE_ADMIN_LIST_ENDPOINT` / `VITE_ADMIN_CREATE_ENDPOINT` / `VITE_ADMIN_DISABLE_ENDPOINT` / `VITE_ADMIN_ASSIGN_ROLE_ENDPOINT` | `src/services/api/admins.ts` |

### ⚠️ 已声明但代码未读取（过时项）

| 变量 | 状态 |
|---|---|
| `VITE_APP_NAME` | 仅存在于 `.env.*` 与 `src/vite-env.d.ts` 类型声明，代码无读取处 |
| `VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL` | 同上（只有读取端 `..._CONFIG_URL` 被消费） |

清理属代码变更，本文档仅如实记录；修改 `.env` 前先确认上表读取处。

> 复核 2026-09-30：全仓 grep 复核，两变量仍无代码读取处（仅 `.env.*`、`src/vite-env.d.ts` 类型声明及文档引用；`VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL` 另见 `docs/api-contracts/feedback_workflow_api_contract.md` 提及，清理时须同步）。

---

## 二、E2E 测试变量（Playwright，`IMBOY_ADMIN_E2E_*` / `IMBOY_*`）

模板：复制 `.env.e2e.example` 为 `.env.e2e` 后填写（`.env.e2e` 已 gitignore，不入仓）。

### 必填（跑 `bun run test:e2e` 前）

| 变量 | 示例值 | 说明 |
|---|---|---|
| `IMBOY_ADMIN_E2E_ACCOUNT` / `IMBOY_ADMIN_E2E_PASSWORD` | `admin` / `password` | 管理员登录凭据（指向真实后端） |
| `IMBOY_ADMIN_E2E_SUPER_ACCOUNT` / `IMBOY_ADMIN_E2E_SUPER_PASSWORD` | `admin` / `password` | 超管凭据（角色/权限类用例） |
| `IMBOY_ADMIN_BASE_URL` | `http://127.0.0.1:9800/api/adm` | 被测后端管理 API 基址 |

### 按场景可选

| 变量 | 说明 |
|---|---|
| `IMBOY_ADMIN_E2E_BASE_URL` | 被测前端地址，默认 `http://127.0.0.1:8082`；`test:e2e:prod` 也用它覆盖目标 |
| `IMBOY_ADMIN_E2E_PORT` | E2E 本地服务端口 |
| `IMBOY_ADMIN_E2E_READONLY_ACCOUNT` / `_READONLY_PASSWORD` | 只读管理员（只读权限回归用） |
| `IMBOY_ADMIN_E2E_CAPTCHA` | 验证码旁路值，固定 `1234`；后端需 `{captcha_test_mode, true}` 或 `IMBOY_CAPTCHA_BYPASS=1234`（见 `.env.e2e.example` 头注） |
| `IMBOY_ADMIN_E2E_CHANNEL_ID` | 频道类用例目标频道 ID |
| `IMBOY_ADMIN_E2E_NEW_ADMIN_PREFIX` / `_NEW_ADMIN_PASSWORD` | 新建管理员用例的前缀/密码 |
| `IMBOY_ADMIN_E2E_CREATE_ADMIN_ROLE_NAME` / `_ASSIGN_ROLE_NAME` | 角色用例目标角色名 |
| `IMBOY_ADMIN_E2E_NEW_ROLE_PREFIX` / `_NEW_ROLE_DESCRIPTION` / `_ROLE_PERMISSION_KEY` | 新建角色用例参数 |
| `IMBOY_ADMIN_E2E_ORG_SEED_NAME` / `_EADM_ORG_ID` / `_EADM_WS_ID` | 企业域（EADM）用例种子数据 |
| `IMBOY_ADMIN_E2E_PLUGIN_LOCATION_PATH` / `_OWNER_SEARCH_KEYWORD` / `_SEED_INVITEE_ID` / `_SCENARIO_MANIFEST` | 插件/搜索/场景清单类用例参数 |
| `IMBOY_TEST_SCENARIO_MANIFEST` | 场景清单 JSON 路径（默认 `tests/e2e/fixtures/three-end-first-batch.local.json`，见 example） |
| `IMBOY_E2E_REAL_BACKEND` | 声明用例需真实后端（无后端/凭据的 spec 会自动 skip） |

> 后端侧脚本（`scripts/` 下诊断工具）还读取 `IMBOY_REPO_DIR`、`IMBOY_ADMIN_COOKIE` 等，属运维用途，不在开发必配范围。

---

## 三、检查清单

- [ ] 本地开发：无需新建 env 文件，`.env.development` 已含可用默认值
- [ ] E2E：`cp .env.e2e.example .env.e2e` 并填入本地后端凭据
- [ ] 生产构建：确认 `.env.production` 的 `__IMBOY_API_HOST__` 占位符由部署流程替换（见 `Dockerfile`）
- [ ] 新增 `VITE_*` 变量：同步更新 `src/vite-env.d.ts` 类型声明 + 本文档
