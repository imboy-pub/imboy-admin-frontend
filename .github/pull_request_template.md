# Pull Request — imboy-admin-frontend (React Admin)

> 关联：`.claude/plans/quality-loop.md` v1.3 T4.5 / v1.1 §304 三仓各一份

## 摘要 / Summary

<!-- 一句话说明本 PR 解决什么问题 -->

## 改动类型 / Type of Change

- [ ] 🐛 Bug fix（非破坏性）
- [ ] ✨ Feature（新增功能）
- [ ] 🎨 UI / 🎬 Animation
- [ ] 💥 Breaking change（API 契约 / data shape 不兼容）
- [ ] 📝 Docs / 🌐 i18n
- [ ] 🔧 Refactor（不改行为）
- [ ] ⚡ Performance
- [ ] ✅ Tests / 🧪 CI

## 自检清单 / Self-Review

### 编码规范

- [ ] 遵守 [imboy-admin-frontend/CLAUDE.md](CLAUDE.md) 项目规范
- [ ] **TSID 字段使用 `EntityId`（= `string`）类型，不直接写 `string`**，禁 `Number(id)` / `parseInt(id)`
- [ ] axios `transformResponse` 已配 `safeParseBigIntJson`（client.ts），无需手动处理 16+ 位整数
- [ ] 分页 UI 用 `DataTablePagination`（默认 `size:10`，搜索/筛选变化时重置 `page=1`）
- [ ] 模块边界守护：`@/modules/<domain>/public.dart` 唯一入口，禁直接 import 模块内部

### 质量门（自动跑，但请提前自查）

- [ ] `bun run lint` 通过 / 无新增 issue（ratchet 上限 10）
- [ ] `bun run typecheck` 通过 / TS errors ≤ 31（ratchet）
- [ ] `bun run deadcode` (knip) 不增（ratchet 35）
- [ ] `bun run test` 全绿（测试文件隔离运行）
- [ ] `bun run test:e2e` (Playwright) 关键 flow 通过

### 契约变更（如适用）

- [ ] imboy 端 `api/openapi.yaml` 或 `proto/*.proto` 变更后 → 跑过 `bash imboy/api/codegen/typescript.sh` 同步
- [ ] 生成代码 commit 到 `src/api/_gen/`（受 eslint exclude 保护）
- [ ] **Breaking change** → 已与 imboy / imboyapp 同步发版

### 文档双语规则（强制）

- [ ] 新增 / 改动 Markdown → 同时提供 zh-CN（权威） + en
  - 短文档 → 同节并排（方式 A）
  - 长文档 → `README.md` + `README.en.md`（方式 B），顶部加语言切换链接
- [ ] commit message 前缀 `docs(bilingual):`
- [ ] 例外（仅中文）：`.claude/plan/*` / `.claude/memory/*` / 内部会议纪要

### 安全

- [ ] 无 hardcoded credentials（gitleaks ratchet 40，含自定义 admin-tsid-numeric-misuse 规则）
- [ ] 用户输入经 zod / 类型守卫
- [ ] 无 `console.log` 残留

### 包管理 (bun)

- [ ] 新增依赖跑过 `bun install --frozen-lockfile`
- [ ] 锁文件 `bun.lockb` 提交
- [ ] devDependency 与 dependency 区分清楚

## 关联 / Related

- Issue: #
- 主计划任务: <!-- 如 T2.5 / T3.6 -->
- 相关 PR (imboy / imboyapp): <!-- 跨仓改动需链接 -->

## 测试计划 / Test Plan

<!-- 影响范围 / Playwright E2E 覆盖 / 真实数据回归 -->

## CI 触发的检查

本 PR 会自动跑（详见 `.github/workflows/`）：
- `quality.yml` → react-lint (eslint + tsc + knip) + secrets-scan
- `sonar.yml` → SonarCloud 扫描（含 coverage trend + Quality Gate）
- `ci.yml` → 业务 CI

合并前所有上述 status check 必须 ✅。
