# IMBoy Admin Frontend - AI 上下文文档 / AI Context Document

> **最后更新 / Last updated**: 2026-04-11
> **技术栈 / Stack**: React 19.2 + TypeScript + Vite + Radix UI + Zustand + TanStack Query/Table
> **包管理 / Package manager**: bun
> **测试 / Testing**: bun test (unit) + Playwright (E2E)

---

## 📘 文档双语强制规则 / Bilingual Documentation Rule (MANDATORY)

> **适用范围 / Scope**：本项目（imboy-admin-frontend 管理后台）所有新增 / 修改的 Markdown 文档（README、CHANGELOG、docs/**、src/**/*.md、.github/**、CONTRIBUTING、release notes 等）必须遵守本规则。
> All new or modified Markdown docs in this project (imboy-admin-frontend) — README, CHANGELOG, docs/**, src/**/*.md, .github/**, CONTRIBUTING, release notes, etc. — MUST follow this rule.

### 1. 强制双语 / Bilingual mandatory

- 面向用户 / 贡献者 / 运维的文档必须同时提供 **简体中文 + English** 两种语言。
- User / contributor / ops-facing docs MUST provide both **Simplified Chinese** and **English**.

### 2. 组织方式（二选一）/ Organization (pick one)

- **方式 A — 单文件并排 / Pattern A — Side-by-side**
  每个小节按 `中文 / English` 同节并排或上下段落对照。适合短文档（README hero 段、CHANGELOG 条目、issue/PR 模板、组件注释）。
  Each section uses `中文 / English` side-by-side or stacked paragraphs. Use for short docs (README hero, CHANGELOG entries, issue/PR templates, component notes).

- **方式 B — 文件后缀分离 / Pattern B — Separate files by suffix**
  `README.md`（中文权威）+ `README.en.md`（英文镜像）；两个文件顶部互加语言切换链接 `[English](README.en.md) | 简体中文`。适合长文档（architecture、模块边界规则、E2E 测试指南、国际化方案）。
  `README.md` (Chinese authoritative) + `README.en.md` (English mirror); both files have a language switcher at the top. Use for long docs (architecture, module boundary rules, E2E test guide, i18n strategy).

### 3. 权威语言 / Source of truth

- **简体中文为权威版本**；英文版基于中文翻译。**中文先改，英文在同一次 PR 内同步跟进**，禁止出现只改中文不改英文或反之。
- **Simplified Chinese is the source of truth**; English mirrors Chinese. **Update Chinese first, sync English in the same PR**. Never ship one language without the other.

### 4. 代码块与命令行原样保留 / Code and CLI verbatim

- TypeScript / TSX 代码、bun / pnpm 命令、`package.json` 片段、ESLint / Vite 配置、错误堆栈不翻译。
- TypeScript / TSX code, bun / pnpm commands, `package.json` snippets, ESLint / Vite configs, error stacks are NOT translated.

### 5. 术语一致性 / Terminology consistency

- 关键术语首次出现时给出对照：`首启向导 (First-run Setup Wizard)`、`会话 (Conversation)`、`模块边界 (Module Boundary)`、`权限矩阵 (Permission Matrix)`、`分页 (Pagination)`、`路由守卫 (Route Guard)`、`仪表盘 (Dashboard)`、`E2E 测试 (End-to-end Test)`。
- Key terms come with a translation pair on first occurrence.

### 6. 应用内 i18n 与文档双语的区别 / App i18n vs Doc bilingual

- 本规则只约束**开发 / 运维 Markdown 文档**；应用内文案由 React i18n 方案负责（见 `src/lib/i18n/`），二者互不替代。
- This rule only covers **developer / ops Markdown docs**; in-app strings are driven by the React i18n layer (`src/lib/i18n/`). The two do not replace each other.

### 7. 例外（可仅保留中文）/ Exceptions (Chinese-only allowed)

- `.claude/plan/*`、`.claude/memory/*`、内部会议纪要、个人研发笔记
- `.claude/plan/*`, `.claude/memory/*`, internal meeting notes, personal dev notes

### 8. AI 编码代理契约 / AI Coding Agent Contract

当 AI 代理（Claude Code / Cursor / Copilot）收到「写文档 / 改文档 / 新建 .md」类任务时：
1. **默认双语输出**，无需用户额外提示。
2. 修改已有单语文档时，**主动补齐**缺失的语言。
3. 新建文档时，短文档走方式 A，长文档走方式 B。
4. Commit message 前缀 `docs(bilingual):`。

When an AI agent (Claude Code / Cursor / Copilot) is asked to write, modify, or create Markdown docs:
1. **Default to bilingual output**, no extra user prompt needed.
2. When editing an existing single-language doc, **proactively add** the missing language.
3. For new docs, use Pattern A (short) or Pattern B (long) as appropriate.
4. Use `docs(bilingual):` commit message prefix.

---

## 项目结构 / Project Structure

```
imboy-admin-frontend/
├── src/
│   ├── components/    # 通用 UI 组件
│   ├── contexts/      # React Context
│   ├── hooks/         # 自定义 Hooks
│   ├── lib/           # 工具函数
│   ├── modules/       # 业务模块
│   ├── pages/         # 页面组件
│   ├── services/      # API 服务层
│   │   └── api/       # API 请求封装
│   ├── stores/        # Zustand 状态管理
│   ├── test/          # 测试文件
│   └── types/         # TypeScript 类型定义
│       ├── admin.ts
│       ├── api.ts
│       ├── group.ts
│       ├── logoutApplication.ts
│       ├── message.ts
│       └── user.ts
├── package.json
└── vite.config.ts
```

---

## 关键规范

### 分页规则

所有管理列表页分页 UI 必须与 `/users` 页面保持一致：
- 统一使用 `DataTablePagination` 组件
- 必须传入 `onPageSizeChange`，启用「每页条数」切换
- 默认分页大小: `size = 10`
- 搜索/筛选/每页条数变化时，`page` 重置为 `1`

### ID 类型处理 — TSID 约定

**关键风险**: JavaScript `Number` 类型精度为 **2^53** (9,007,199,254,740,992)，而后端 TSID 最大值为 **2^63-1** (9,223,372,036,854,775,807)。直接用 `number` 类型接收 TSID **会丢失精度**。

**已实现的解决方案**（`src/services/api/client.ts`）:

后端 API 以 **JSON integer** 返回 TSID。`axios` 的 `transformResponse` 中注册了 `safeParseBigIntJson`，在 JSON 解析阶段将 **16 位及以上整数**自动转为 `string`，前端代码无感知。

```typescript
// client.ts — 已配置，无需手动处理
const safeText = trimmed.replace(
  /(?<=[:,[\s])(-?\d{16,})(?=[,\]}\s])/g,
  '"$1"'
)
```

**TypeScript 类型规范**:

```typescript
// src/types/common.ts
/**
 * TSID 实体 ID。后端以 JSON integer 传输，safeParseBigIntJson 转为 string。
 * 统一使用此类型，不直接写 string。
 */
export type EntityId = string

// ✅ 正确：使用 EntityId 类型别名
interface User {
  id: EntityId        // TSID 字段
  account: string     // 非 TSID 字段直接用 string
}

// ❌ 错误：直接写 string（失去语义）
interface User {
  id: string          // 看不出是否是 TSID
}
```

**规则**:
- 所有 TSID 字段必须使用 `EntityId`，不直接写 `string`
- 不要用 `Number(id)` 或 `parseInt(id)` 处理 TSID
- 详见：`imboy/doc/api/tsid-field-convention.md`

### 命令参考

```bash
# 开发
bun run dev

# 构建
bun run build       # tsc -b && vite build

# 测试
bun test            # 单元测试
bun run test:e2e    # Playwright E2E

# 代码检查
bun run lint        # eslint
```

---

## 变更记录

### 2026-04-04
- 创建 CLAUDE.md
- 记录 TSID 迁移的 JavaScript 精度风险和解决方案
- 记录分页规范
