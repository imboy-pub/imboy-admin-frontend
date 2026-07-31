> [imboy.pub 根目录](../CLAUDE.md) > **imboy-admin-frontend（React 管理后台）**

# IMBoy Admin Frontend - AI 上下文文档 / AI Context Document

> **最后更新 / Last updated**: 2026-04-11
> **技术栈 / Stack**: React 19.2 + TypeScript + Vite + Radix UI + Zustand + TanStack Query/Table
> **包管理 / Package manager**: bun
> **测试 / Testing**: bun test (unit) + Playwright (E2E)

---

## 文档双语规则 (MANDATORY)

> 见根级 [CLAUDE.md](../CLAUDE.md#双语文档规则--bilingual-documentation-rule-mandatory)

---

## 项目结构 / Project Structure

```
imboy-admin-frontend/
├── src/
│   ├── components/    # 通用 UI 组件
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
│       ├── common.ts
│       ├── group.ts
│       ├── logoutApplication.ts
│       ├── message.ts
│       ├── systemHealth.ts
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

后端 API 以 **JSON integer** 返回 TSID。`axios` 的 `transformResponse` 中注册了 `safeParseBigIntJson`（`src/lib/safeParseBigIntJson.ts`），在 JSON 解析阶段把**会丢失精度的整数**自动转为 `string`，前端代码无感知。

实现要点（**不要改回正则**）：

- **带状态的线性扫描**，逐字符跟踪是否位于字符串字面量内（含 `\"` 转义处理），只对**结构区**的数字加引号。
- **判据是 `Number.isSafeInteger`**，不是位数。

两条都是踩过坑之后定下来的：

```typescript
// ❌ 历史实现（已废弃）：正则无法表达「当前位置在不在字符串内」
const safeText = trimmed.replace(/(?<=[:,[\s])(-?\d{16,})(?=[,\]}\s])/g, '"$1"')

// 后顾与前瞻都含 \s，于是字符串**值内部**的长数字也被加引号：
//   {"remark":"备注 1838294017982464000, 完"}
//     -> {"remark":"备注 "1838294017982464000", 完"}   // JSON.parse 抛错
// 而审计日志正文 / 消息内容 / 用户反馈里出现 TSID 是常态。抛错后 client.ts
// catch 住返回原始字符串，被判定为 HTML 放行，最终 requireApiPayload 抛
// "Missing payload" —— 表现为整页白屏。
//
// 另：MAX_SAFE_INTEGER = 9007199254740991 本身就是 16 位，按「≥16 位」一刀切
// 会把 16 位的微秒时间戳（如 1785000000000000）转成 string，下游
// new Date(number) 与算术全部失效。
```

回归用例见 `src/lib/safeParseBigIntJson.test.ts`（16 个，含字符串内长数字、转义引号、安全边界 ±1）。

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
- 详见：`imboy/docs/api/tsid-field-convention.md`

### 命令参考

> 见 [README.md](./README.md) — 常用命令章节。

---

## 变更记录

### 2026-06-11
- URL state 迁移进度：18/18（T17 step3 完成）
  - 全部列表页已从本地 `useState(page/size/filters)` 迁移到 `useListQueryState`
  - 迁移范围：announcements / logs / settings(DDL/Version/PushToken) / storage / groups(11页) / plugin_management

### 2026-05-28
- 添加面包屑导航（链接到根级 CLAUDE.md）

### 2026-04-04
- 创建 CLAUDE.md
- 记录 TSID 迁移的 JavaScript 精度风险和解决方案
- 记录分页规范
