# 贡献指南 / Contributing

> **最后更新 / Last updated**: 2026-10-12
>（权威语言为简体中文 · [English](./CONTRIBUTING.en.md) · 双语规则见 [CLAUDE.md](./CLAUDE.md)）

## 开发环境

| 工具 | 版本 | 说明 |
|---|---|---|
| bun | **1.3.14**（CI 锚定值，见 `.github/workflows/ci.yml` 的 `BUN_VERSION`） | 包管理 / 测试 / 脚本运行时；本仓**不使用** npm/yarn/pnpm |
| Node | 仓库未声明（`package.json` 无 `engines` 字段） | 无独立要求；Playwright 使用自带运行时。如本机装有 Node，建议当前 LTS |
| 后端 | 本地 imboy 后端，默认 `http://127.0.0.1:9800` | 多数功能页与 E2E 需要真实后端 |

```bash
bun install
bun run dev        # http://127.0.0.1:8082，/api/adm 等代理到本地后端
```

## 命令速查

<!-- AUTO-GENERATED: START (source: package.json scripts; 完整表见 README.md) -->

| 命令 | 说明 |
|---|---|
| `bun run dev` | 开发服务器 |
| `bun run build` | 生产构建（`tsc -b && vite build`） |
| `bun run build:widget` | 客服挂件构建（widget + widget-loader + seat + manifest） |
| `bun run test` | 单元测试（= `bun test --isolate`，**勿裸跑 `bun test`**） |
| `bun run test:e2e` | Playwright 端到端测试 |
| `bun run lint` / `lint:fix` | ESLint 检查 / 自动修复 |
| `bun run typecheck` | TypeScript 类型检查 |
| `bun run deadcode` | knip 死代码检测 |
| `bun run licenses:generate` / `licenses:check` | 第三方依赖许可证清单生成 / 同步校验 |
| `bun run check` | lint + typecheck + deadcode 组合门 |

<!-- AUTO-GENERATED: END -->

完整命令表（含 E2E 各配置变体、挂件校验）：[README.md 常用命令](./README.md#常用命令)。

## 测试流程

### 单元测试

```bash
bun run test
```

- 实际执行 `bun test --isolate`。`--isolate` 必须保留：bun 默认所有测试文件共享同一全局对象与模块表，跨文件 mock/DOM 泄漏会造成 "Found multiple elements" 等假失败（实证：裸 `bun test` 有假红，`--isolate` 全绿）。
- 单测只扫描 `src/`（`bunfig.toml` 的 `[test] root`），Playwright 规格在 `tests/e2e/`，互不干扰。

### E2E（Playwright）

```bash
cp .env.e2e.example .env.e2e      # 填入本地后端凭据（.env.e2e 已 gitignore）
bun run test:e2e:install          # 首次：安装 chromium
bun run test:e2e
```

- 环境变量清单见 [docs/env-vars.md](./docs/env-vars.md)。
- 无后端/凭据的 spec 自动 skip；`test:e2e:prod` 是生产健康检查，谨慎执行。

### Git 钩子（lefthook）

| 阶段 | 检查 |
|---|---|
| `pre-commit` | 对 staged 的 `src/**` 跑 `bunx eslint --max-warnings=0`；gitleaks 密钥扫描 |
| `pre-push` | `bun run lint` + `bun run test`（与 CI 口径一致；e2e 留给 CI） |

新 clone 后需配置 push 上游，否则 pre-push 会以 "no matching push files" 静默跳过（见 `lefthook.yml` 头注）。

## 代码风格

配置真源：[eslint.config.js](./eslint.config.js)。要点：

- 基座：`@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`（Vite 预设）。
- 未使用变量：以 `_` 前缀豁免（参数、catch、解构均适用）。
- **模块边界（重点）**：页面/组件/store 禁止深入导入 `@/modules/<domain>/内部路径`，只能从 `@/modules/<domain>` 公开入口导入；`@/services/api/*` 领域文件同理被收口到对应 module。动态 `import()` 受同等约束（`no-restricted-syntax` 补位）。
- `src/pages|components|stores` 禁止从 `services/api/responseAdapter` 导入 `getApiPayload`，payload 解析收敛到 service 层。
- pre-commit 以 `--max-warnings=0` 执行，零警告容忍。

类型与架构约定（TSID/`EntityId`、分页规范、payload-first）见 [CLAUDE.md](./CLAUDE.md)。

## 提交与 PR

1. commit message 遵循约定式前缀（`feat:` / `fix:` / `test:` / `docs:` / `chore:` 等，可参考 `git log`）。
2. 提交前自查：`bun run check`（lint + typecheck + knip）与 `bun run test` 全绿。
3. PR 描述使用模板 [.github/pull_request_template.md](./.github/pull_request_template.md)，其自检清单涵盖：
   - 规范项：`EntityId`、`DataTablePagination`、模块边界、双语文档规则
   - 质量门：lint（ratchet ≤37）、typecheck（ratchet ≤31）、knip（ratchet ≤35）、单测全绿、E2E 关键流
   - 契约变更：跨仓（imboy / imboyapp）同步发版要求
   - 安全：无硬编码凭据（gitleaks）、无 `console.log` 残留
4. CI（`.github/workflows/`）：`quality.yml`（lint+tsc+knip+secrets）、`ci.yml`、`admin-e2e.yml`、`widget-pairing.yml`（跨仓挂件资产配对门）；合并前全部 status check 须通过。

## 自动安全扫描

[Security Scan](./.github/workflows/security-scan.yml) 在推送到 `main` / `dev`、以这两个分支为目标的 PR，以及手动触发时运行。其他分支仅 push 不触发；开 PR 后会随 PR 更新扫描。扫描当前检出的完整工作区，不是只检查新增问题，也不扫描完整 Git 历史。

- Semgrep CE 使用 `p/security-audit`、`p/secrets`、`p/owasp-top-ten`；所有规则级别进入报告，`HIGH` / `CRITICAL` 及旧格式 `ERROR` 级发现使检查失败。Semgrep 规则级别不等同于 CVSS 高危评分。
- Trivy 显式启用 `vuln,misconfig,secret`，扫描依赖、受支持的配置及密钥；报告并阻断 `HIGH,CRITICAL`，包含开发依赖和暂无修复版本的漏洞。
- 两个扫描 job 独立运行；安装失败、规则/数据库下载错误、扫描器致命错误或报告上传失败都使检查失败。汇总检查名称固定为 `security-scan`。
- Trivy 扫描步骤固定 `exit-code: "0"`，仅分离扫描执行状态；发现不会在该步骤提前终止。`Verify Trivy report` 在非取消情况下检查扫描步骤确已成功，以及固定版本的 SARIF 结构、规则对应关系、严重性和位置。执行失败、报告缺失或未知/损坏格式以退出码 2 失败；独立 `Enforce Trivy findings` 再按 `FINDINGS_EXIT_CODE` 阻断发现。Semgrep 也先检查扫描步骤的真实 outcome，执行错误不能按正常发现处理。
- 两份原始 SARIF 只使用独立 category 上传到 **Security → Code scanning**；PR 分析也显示在对应 PR 检查中。原始 JSON/SARIF 可能包含源码或密钥片段，因此不上传普通 Actions artifact，也不提交进仓库。
- 每个扫描器另外生成一份字段白名单脱敏清单，以独立 Actions artifact 保留 14 天；名称包含 run ID 和 attempt。清单仅保留规则 ID、分类、严重性、文件/行号，依赖项另含包名、已安装版本和修复版本；不含原始 message、源码片段或密钥匹配内容。清单记录扫描器版本、仓库、实际检出的 `GITHUB_SHA`、run ID/attempt，只有本次成功执行并完成报告检查后生成的清单才上传。发现门禁失败仍会上传有效清单，原始报告继续仅在 Code scanning 查看。
- 保留既有 Gitleaks、测试和质量门。使用普通 `pull_request`，不需要业务密钥或 Semgrep 账号，不运行应用安装/构建脚本。

Semgrep 的 `warn` / `warning` 级解析、规则匹配或超时诊断不单独阻断，但摘要会明确显示数量、类型和“部分文件或规则未完成分析”。其他级别（含未知级别）的诊断、报告无效或零文件扫描均失败。绿色只表示配置的门禁通过，不保证所有源码路径都被完整分析；不得把覆盖告警当成零问题。

### 接入与维护

工作流默认 `FINDINGS_EXIT_CODE: "1"`。存量发现也会让检查失败。若维护者明确选择观察期，可在评审后的变更中设为 `"0"`；仅发现问题不再阻断，扫描器执行/报告错误仍失败。这不自动提供“只拦新增”的基线能力，也不改变既有 Gitleaks 门。

首次运行后，在目标分支保护或 ruleset 中把 **`security-scan`** 加入必需检查，才会强制阻止失败 PR 合并；仅合入 YAML 不会修改仓库设置。先确认三项 job 实际执行及 SARIF 可见，再启用必需检查。若 Code scanning 上传被权限或仓库功能设置拒绝，应修正配置，不能以忽略错误代替成功。

Dependabot/fork 的普通 PR 可上传 SARIF。若 Dependabot authored 的 squash merge 使 `push` 运行只有只读 token，上传可能返回 403；由有权限维护者发起新的 `workflow_dispatch` 获取该提交的报告，并评估后续合并方式。不要为解决此问题改用 `pull_request_target` 执行 PR 代码或忽略上传错误。

外部 Actions 固定到完整提交 SHA，注释保留版本；既有 Dependabot 的 `github-actions` 更新继续适用。Semgrep/Trivy 引擎版本固定在 workflow 中，需要随升级验证。Semgrep Registry 规则和 Trivy 漏洞数据库随上游更新，因此即使代码不变，发现也可能变化。误报或例外应逐项记录理由并审阅，不用排除整个业务目录压低数量。

### 本仓覆盖边界

Semgrep 针对适用的 JavaScript/TypeScript/React 及配置规则运行；Trivy 读取已提交的文本 `bun.lock`，并通过 `TRIVY_INCLUDE_DEV_DEPS` 包含 Vite、测试和其他构建依赖。无需为了扫描改换包管理器或增加另一种锁文件。锁文件匹配不能替代对 `vendor/` 本地 tarball 实际内容的审查，也不覆盖运行时服务/API 行为。

参考：[Semgrep CE 语言](https://semgrep.dev/docs/semgrep-ce-languages)、[Trivy Bun 支持与开发依赖](https://trivy.dev/docs/latest/coverage/language/nodejs/)。
