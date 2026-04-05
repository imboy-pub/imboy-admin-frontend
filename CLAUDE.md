# IMBoy Admin Frontend - AI 上下文文档

> **最后更新**: 2026-04-04
> **技术栈**: React 19.2 + TypeScript + Vite + Radix UI + Zustand + TanStack Query/Table
> **包管理**: bun
> **测试**: bun test (单元) + Playwright (E2E)

---

## 项目结构

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

### ID 类型处理 — TSID 迁移注意事项

**关键风险**: JavaScript `Number` 类型精度为 **2^53** (9,007,199,254,740,992)，而后端 TSID 最大值为 **2^63-1** (9,223,372,036,854,775,807)。直接用 `number` 类型接收 TSID **会丢失精度**。

**解决方案** (按优先级):

1. **后端以字符串传输** (推荐): API 响应中 TSID 字段为 JSON string，前端统一用 `string` 类型
   ```typescript
   // ✅ 推荐：后端返回字符串，前端直接用 string
   interface User {
     id: string;  // TSID as string: "1234567890123456789"
   }
   ```

2. **前端 BigInt 处理** (备选): 使用自定义 JSON 解析器处理大数
   ```typescript
   // ⚠️ 备选：需要自定义 JSON 解析，复杂度较高
   // axios 需配置 transformResponse 使用 json-bigint 库
   ```

**迁移过渡期**:
- 新接口: ID 字段为 TSID 数字，后端以字符串形式返回
- 旧接口: ID 字段保持 hashids 编码字符串 (如 `"522dzx"`)
- 类型定义中使用 `string` 统一处理，无需区分 TSID 还是 hashids

```typescript
// src/types/common.ts
/** TSID 或 hashids 编码的 ID，统一用 string 传输避免精度丢失 */
export type EntityId = string;
```

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
