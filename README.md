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
| `bun run licenses:generate` | `bun scripts/generate-third-party-licenses.mts` | 生成第三方依赖许可证清单（`docs/third-party-licenses.md`） |
| `bun run licenses:check` | `bun scripts/generate-third-party-licenses.mts --check` | 校验许可证清单与依赖是否同步 |
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

### 跨仓静态契约 / Cross-repository static contract

`src/modules/enterprise_business/api/crossRepoContract.test.ts` 保留 7 项检查：4 项字段矩阵与 Admin 白名单检查，3 项后端 SQL 真源绑定。后端目录默认是本仓同级 `../imboy`，也可用 `IMBOY_REPO_DIR` 指定（相对路径从运行命令的目录解析）。不需要启动 Erlang 服务或数据库。

The existing suite contains 7 tests: 4 field-matrix/Admin allowlist checks and 3 backend SQL source checks. The backend defaults to sibling `../imboy`; override it with `IMBOY_REPO_DIR` (relative to the command's working directory). No running backend or database is required.

```bash
# 从管理后台根目录执行 / Run from the admin repository root
IMBOY_REPO_DIR=/path/to/imboy IMBOY_CROSS_REPO_REQUIRED=1 \
  bun run test src/modules/enterprise_business/api/crossRepoContract.test.ts
```

普通本地运行未设置严格标志、且找不到 SQL 真源时，会输出 `ENV_MISSING`、查找路径和补齐方式：4 项执行，3 项明确跳过。`IMBOY_CROSS_REPO_REQUIRED=1` 时缺源直接失败；显式指定错误路径不会回退到别的后端目录。

Without required mode, a local run missing the SQL source reports `ENV_MISSING`, the attempted path and remediation: 4 tests run and 3 skip. With `IMBOY_CROSS_REPO_REQUIRED=1`, missing sources fail. An explicit path never silently falls back to another checkout.

现有 `Admin Frontend CI` 的 `lint-and-build` 在独立目录仅检出所需后端 SQL 文件，并在整个 job 启用严格模式。定向门禁解析 Bun JUnit 报告中的实际测试项，必须恰好 `7 pass / 0 fail / 0 skip`；数量不足、任何跳过、测试失败或报告缺失都失败。Actions 摘要记录数量、跳过原因、请求的 backend ref、两仓实际 SHA；上游失败会注明未执行，无法生成报告则注明数量不可确认。JUnit 文件作为 artifact 保留。随后完整单测仍执行这 7 项，原覆盖率阈值保持不变。

The existing `lint-and-build` job checks out only the required backend SQL file and enables required mode for the whole job. Its focused gate reads actual test cases from Bun's JUnit report and requires exactly `7 pass / 0 fail / 0 skip`. Missing cases, skips, failures or a missing report fail the gate. The Actions summary records counts, skip reasons, the requested backend ref and both checked-out SHAs; upstream failures are reported as not run, while missing reports have unknown counts. JUnit is retained as an artifact. The full unit suite still runs these tests with unchanged coverage thresholds.

| 场景 / Scenario | 后端版本 / Backend version | 证据含义 / Evidence |
| --- | --- | --- |
| 普通 PR、push；手动运行不填 `backend_sha` / Regular PR, push; manual run without `backend_sha` | `imboy-pub/imboy` 的 `main`，记录实际 SHA / `main`, recording resolved SHA | 当前 main 兼容性 / Compatibility with current main |
| 手动选择管理后台分支，并填写 `backend_sha` / Manual run on the selected admin branch with `backend_sha` | 配套 PR 的完整 40 位提交 SHA；不接受分支名或 PR ref / Exact 40-character companion commit SHA; no branch or PR ref | 固定组合的补充验证 / Additional validation of that exact pair |

配套 SHA 验证使用独立检查名 `lint-and-build (paired backend SHA)`，不能替代普通 PR 对后端 `main` 的 `lint-and-build` 检查。后端 PR 更新后须使用新 SHA 重验；后端合并后重跑 main 组合。不存在或不可访问的 SHA 会使 checkout 失败，不回退到 main。普通 PR 的 Admin SHA 是 Actions 实际测试的合并提交，不冒充 PR head。后端 `main` 单独变化不会触发本仓工作流；需要在本仓手动重跑。

Paired-SHA validation uses the distinct check name `lint-and-build (paired backend SHA)` and does not replace the regular PR/main `lint-and-build` check. Revalidate a new backend PR SHA after updates and rerun against main after merge. An unavailable SHA fails checkout without falling back to main. For regular PR runs, the recorded Admin SHA is the tested merge checkout, not the PR head. Backend-only main changes do not trigger this repository's workflow; rerun it manually when needed.

覆盖边界：SQL 全文件列名文本包含性、Admin 实时白名单、人工冻结的 Flutter 字段矩阵。通过不代表当前 Flutter 源码一致，也不证明特定 SELECT 投影、真实 API/数据库行为或三端 E2E。

Scope: column-name presence in the SQL file, live Admin allowlists and a frozen Flutter field matrix. Passing does not validate current Flutter source, a specific SELECT projection, live API/database behavior or three-client E2E.

### Docker 镜像验证 / Docker image validation

`Admin Frontend CI` 的 `docker-images` 接在 `lint-and-build` 之后，复用其实际测试的前后端完整 SHA。它用 `linux/amd64` 构建并加载本仓的 `Dockerfile` 和 `Dockerfile.widget`，不登录镜像仓、不推送、不触发 Release。Admin builder 与 Widget 构建都固定 Bun `1.3.14`；Docker 日志记录实际 Bun 版本及解析的基础镜像。Admin 必须在宿主安装依赖之前构建，避免 `COPY . .` 带入宿主 `node_modules` 覆盖容器内的 frozen install。

The `docker-images` job follows `lint-and-build` and reuses its exact frontend/backend SHAs. It builds and loads the real `Dockerfile` and `Dockerfile.widget` for `linux/amd64`, without registry login, push or Release. Both builds use Bun `1.3.14`; Docker logs record the actual builder version and resolved base images. Admin builds before host dependency installation so `COPY . .` cannot overwrite the builder's frozen dependencies with host `node_modules`.

Widget 复用现有的前后端资产配对、`build:widget` 和 `verify:widget`；manifest 的 `source_head` 必须等于本次 checkout。`scripts/check_docker_images.sh` 启动实际镜像：Admin 检查健康页、SPA 回退及 HTML/打包 JS 的 origin 替换（显式 origin 与默认同源）；Widget 检查 UID 101、只读根文件系统、manifest 全部文件的 HTTP 字节及 `/v1/loader.js` 别名。失败会阻断 job。Actions 摘要记录实际源码 SHA 与本地镜像 ID；本地 ID 不是 Registry digest，通过也不代表四镜像 Golden 或匿名拉取门已完成。

Widget reuses both repositories' asset-pairing checks, `build:widget` and `verify:widget`, requiring the manifest's `source_head` to equal the checkout. `scripts/check_docker_images.sh` starts the real images: Admin checks health, SPA fallback and origin replacement in HTML/bundled JS (explicit and same-origin); Widget checks UID 101, a read-only root filesystem, HTTP bytes for every manifest file and the `/v1/loader.js` alias. Failures block the job. The Actions summary records tested SHAs and local image IDs, which are not registry digests or evidence of four-image Golden/anonymous-pull acceptance.

安装器与入口脚本的离线回归 / Offline installer and entrypoint regressions:

```bash
python3 -B -m unittest discover -s scripts -p 'test_*.py' -v
```

Quality Gate 的 gitleaks 安装复用 Backend 的 `8.30.1` 官方固定 SHA256、有限重试及超时；下载/校验/解压失败均阻断扫描。原扫描范围、退出码校验与 40 条基线保持不变。

The Quality Gate installer uses the backend's gitleaks `8.30.1` official checksum, bounded retries and timeouts. Download, checksum or extraction failures stop the scan; scan scope, exit-code validation and the existing 40-finding ceiling remain unchanged.

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
- [举报中心正式接口 / Canonical report center API](../imboy/api/openapi-adm.yaml) · [APP 举报提交 / App report submission](../imboy/api/paths/api/v1/report/create.yaml)
- [朋友圈举报批量处理正式契约 / Canonical moment report batch contract](../imboy/api/paths/adm/v1/moment/report_batch_resolve.yaml)

## 许可证

**Business Source License 1.1（BSL 1.1）** —— 源码公开，四年后自动转为 MPL 2.0。

- **可以**：复制、修改、再分发；非生产用途免费；生产环境中的组织内部使用、单客户私有部署、集成进自有产品，均在 [LICENSE](./LICENSE) 的 Additional Use Grant 范围内免费。
- **需要商业授权**：向第三方提供多租户托管服务（SaaS），或提供与官方付费版竞争的付费产品或服务。

本仓是 IMBoy 三端中的管理后台。三端许可并不相同：`imboy`（后端）与 `imboy-admin-frontend`（本仓）为 BSL 1.1，`imboy-flutter`（移动客户端）为木兰宽松许可证第 2 版。

2026-09-14 之前发布的版本按[木兰宽松许可证第 2 版](./docs/legal/MulanPSL-2.0.txt)授权，不受本次变更影响；该文件作为历史授权文本保留。

商业授权与商标使用请联系维护者。
