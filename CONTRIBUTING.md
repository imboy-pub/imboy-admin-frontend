# 贡献指南 / Contributing

> **最后更新 / Last updated**: 2026-09-30
>（权威语言为简体中文 · [English](./CONTRIBUTING.en.md) · 双语规则见 [CLAUDE.md](./CLAUDE.md)）

## 开发环境

| 工具 | 版本 | 说明 |
|---|---|---|
| bun | **1.3.6**（CI 锚定值，见 `.github/workflows/ci.yml` 的 `BUN_VERSION`） | 包管理 / 测试 / 脚本运行时；本仓**不使用** npm/yarn/pnpm |
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
   - 质量门：lint（ratchet ≤10）、typecheck（ratchet ≤31）、knip（ratchet ≤35）、单测全绿、E2E 关键流
   - 契约变更：跨仓（imboy / imboyapp）同步发版要求
   - 安全：无硬编码凭据（gitleaks）、无 `console.log` 残留
4. CI（`.github/workflows/`）：`quality.yml`（lint+tsc+knip+secrets）、`sonar.yml`、`ci.yml`、`admin-e2e.yml`；合并前全部 status check 须通过。
