# ImBoy Admin — Design System

> 本文档是 ImBoy 管理后台（`imboyadmin`）的视觉与交互设计规范。
> **AI Coding Agent 阅读此文档后，生成的 UI 应自动符合下述规范。**
>
> 最后更新：2026-06-30
> 风格方向：**数据优先的管理后台（Clean SaaS Admin）**
> 技术栈：React 19.2 + TypeScript + Tailwind v4 + Radix UI + Lucide React

---

## 0. 目录

1. 设计哲学（Principles）
2. 色彩系统（Colors）
3. 字体系统（Typography）
4. 间距与栅格（Spacing & Grid）
5. 圆角与阴影（Radius & Shadow）
6. 动效系统（Motion）
7. 图标系统（Iconography）
8. 组件规范（Components）
9. 暗色模式（Dark Mode）
10. 可访问性（Accessibility）
11. AI Agent 使用指引（For Coding Agents）

---

## 1. 设计哲学 | Principles

ImBoy Admin 是供运营/管理员使用的**内部管理后台**，设计目标是**让操作者能高效完成数据查询、审核、配置任务，减少认知负担**。

### 核心原则

1. **Density（信息密度）** — 管理后台不是消费产品，需要在一屏内呈现足够多的信息；避免过度留白。
2. **Predictability（可预期）** — 相同类型的操作（列表页/详情页/表单页）保持统一的布局模式，减少学习成本。
3. **Feedback（反馈）** — 异步操作必须有 loading 状态；破坏性操作必须有二次确认；成功/失败必须有 Toast。
4. **Accessibility（无障碍）** — 全键盘可操作；屏幕阅读器友好（Radix UI 已内置大部分语义）。
5. **Dark-mode First** — 所有新组件必须同时支持浅色和深色模式。

### 禁用项（Banned）

- 硬编码 hex 颜色值（必须用 CSS 变量或 Tailwind token）
- 在破坏性操作（删除、封禁、强制下线）前不弹确认框
- 表格行操作按钮使用非标准颜色（删除用 `destructive`，其余用 `ghost`/`outline`）
- 在 `PageHeader` 外自行实现页面标题区域
- 不带 `aria-label` 的纯图标按钮

---

## 2. 色彩系统 | Colors

### 2.1 CSS 语义 Token（`src/index.css`）

所有颜色通过 HSL CSS 变量定义，禁止直接写 `#hex`。

#### 浅色模式

| Token | HSL 值 | 近似 hex | 用途 |
|-------|--------|---------|------|
| `--background` | `0 0% 100%` | `#FFFFFF` | 页面底色 |
| `--foreground` | `222.2 84% 4.9%` | `#09090B` | 主文字色 |
| `--card` | `0 0% 100%` | `#FFFFFF` | 卡片背景 |
| `--card-foreground` | `222.2 84% 4.9%` | `#09090B` | 卡片文字 |
| `--primary` | `215 78% 52%` | `#2474E5` | **品牌蓝，主按钮，选中态** |
| `--primary-foreground` | `210 40% 98%` | `#F8FAFC` | 主按钮文字（白） |
| `--secondary` | `210 40% 96.1%` | `#F1F5F9` | 次要按钮/标签背景 |
| `--secondary-foreground` | `222.2 47.4% 11.2%` | `#1E293B` | 次要按钮文字 |
| `--muted` | `210 40% 96.1%` | `#F1F5F9` | 禁用/次级区域背景 |
| `--muted-foreground` | `215.4 16.3% 46.9%` | `#64748B` | 次级文字/占位文字 |
| `--accent` | `210 40% 96.1%` | `#F1F5F9` | 悬停高亮背景 |
| `--destructive` | `0 84.2% 60.2%` | `#EF4444` | 删除/封禁/危险操作 |
| `--destructive-foreground` | `210 40% 98%` | `#F8FAFC` | 危险按钮文字 |
| `--border` | `214.3 31.8% 91.4%` | `#E2E8F0` | 边框/分隔线 |
| `--input` | `214.3 31.8% 91.4%` | `#E2E8F0` | 输入框边框 |
| `--ring` | `215 78% 52%` | `#2474E5` | 焦点环（与 primary 一致） |

> ⚠️ **修正说明**：原 `index.css` 中 `--primary: 221.2 83.2% 53.3%`（≈ `#3B82F6` Tailwind 默认蓝）与品牌色 `#2474E5` 存在偏差。应将 `--primary` 修正为 `215 78% 52%`。

#### Sidebar 专属 Token

| Token | 浅色值 | 暗色值 | 用途 |
|-------|--------|--------|------|
| `--sidebar-background` | `0 0% 98%` | `240 5.9% 10%` | 侧边栏背景 |
| `--sidebar-foreground` | `240 5.3% 26.1%` | `240 4.8% 95.9%` | 侧边栏文字 |
| `--sidebar-primary` | `240 5.9% 10%` | `224.3 76.3% 48%` | 选中菜单项 |
| `--sidebar-accent` | `240 4.8% 95.9%` | `240 3.7% 15.9%` | 悬停菜单项 |
| `--sidebar-border` | `220 13% 91%` | `240 3.7% 15.9%` | 侧边栏分隔线 |

### 2.2 语义色使用规则

| 场景 | 使用 Token | 禁止 |
|------|-----------|------|
| 主操作按钮（保存、确认、创建） | `bg-primary text-primary-foreground` | 不写 `bg-blue-500` |
| 删除/封禁/强制退出等破坏性操作 | `bg-destructive text-destructive-foreground` | 不写 `bg-red-500` |
| 次要按钮 | `variant="outline"` 或 `variant="secondary"` | — |
| 仅图标的幽灵按钮（表格行操作） | `variant="ghost"` | — |
| 状态徽章：正常 | `bg-green-100 text-green-800` | — |
| 状态徽章：禁用 | `bg-red-100 text-red-800` | — |
| 状态徽章：待处理/警告 | `bg-yellow-100 text-yellow-800` | — |
| 次级文字/时间戳/描述 | `text-muted-foreground` | 不写 `text-gray-500` |
| 分隔线/边框 | `border-border` | 不写 `border-gray-200` |

### 2.3 趋势色（StatsCard）

```
正向趋势（↑）：text-green-600
负向趋势（↓）：text-red-600
中性：text-muted-foreground
```

---

## 3. 字体系统 | Typography

### 3.1 字体栈

Tailwind 默认系统字体栈，无需额外声明：
```
font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", ...
```

管理后台不引入自定义字体（减少加载体积）。

### 3.2 字号规范

使用 Tailwind 文字大小类，不写 `style={{ fontSize: 14 }}`。

| 用途 | 类名 | 字号 | 字重 |
|------|------|------|------|
| 页面主标题（PageHeader） | `text-3xl font-bold` | 30px | 700 |
| 页面副标题/描述 | `text-base text-muted-foreground` | 16px | 400 |
| 卡片标题（CardTitle） | `text-sm font-medium` | 14px | 500 |
| KPI 数值（StatsCard） | `text-2xl font-bold` | 24px | 700 |
| 表格列头 | `text-sm font-medium` | 14px | 500 |
| 表格单元格 | `text-sm` | 14px | 400 |
| 辅助文字/描述 | `text-xs text-muted-foreground` | 12px | 400 |
| 按钮文字 | `text-sm font-medium` | 14px | 500 |
| Sidebar 菜单项 | `text-sm` | 14px | 400 |
| 徽章（Badge） | `text-xs font-medium` | 12px | 500 |

### 3.3 字重规则

- `font-bold`（700）：页面标题、KPI 数值
- `font-semibold`（600）：区块标题、强调文字
- `font-medium`（500）：按钮、表格列头、卡片标题
- `font-normal`（400）：正文、表格内容、描述
- 禁止使用 `font-thin` / `font-light`（管理后台字号偏小，细字重可读性差）

### 3.4 等宽数字

统计数值（用户数、消息数、金额）使用 `tabular-nums`（CSS `font-variant-numeric: tabular-nums`）保持对齐：

```tsx
<span className="tabular-nums font-bold">{count.toLocaleString()}</span>
```

---

## 4. 间距与栅格 | Spacing & Grid

### 4.1 页面布局结构

```
┌────────────────────────────────────────────────────┐
│  Sidebar (fixed, 240px / collapsed 64px)           │
│  ┌──────────────────────────────────────────────┐  │
│  │  Header (fixed, h-16 = 64px)                │  │
│  │──────────────────────────────────────────────│  │
│  │  Main Content                                │  │
│  │  padding: p-6 (24px 四周)                   │  │
│  │  ┌────────────────────────────────────────┐  │  │
│  │  │  PageHeader (mb-6)                     │  │  │
│  │  │  Content (表格 / 表单 / 卡片网格)       │  │  │
│  │  └────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

### 4.2 间距约定

| 场景 | 类名 | 值 |
|------|------|---|
| 页面内边距 | `p-6` | 24px |
| PageHeader 底部间距 | `mb-6` | 24px |
| 卡片/区块之间间距 | `gap-4` 或 `space-y-4` | 16px |
| 表单字段间距 | `space-y-4` 或 `space-y-6` | 16–24px |
| 行内元素间距（图标+文字） | `gap-2` | 8px |
| 按钮组间距 | `gap-2` | 8px |
| StatsCard 网格 | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` | — |

### 4.3 响应式断点（Tailwind 默认）

| 断点 | 最小宽度 | 主要用途 |
|------|---------|---------|
| `sm` | 640px | 卡片从单列变双列 |
| `md` | 768px | 侧边栏从抽屉变固定 |
| `lg` | 1024px | KPI 卡片变四列 |
| `xl` | 1280px | 表格列显示更多 |

管理后台主要场景是桌面端（≥1024px），移动端保持基本可用即可。

---

## 5. 圆角与阴影 | Radius & Shadow

### 5.1 圆角

全局圆角基准由 `--radius: 0.5rem (8px)` 控制。Tailwind 映射：

| Token | 值 | 用途 |
|-------|----|------|
| `rounded-sm` | 2px | 极小（Badge 内小标签） |
| `rounded` | 4px | 输入框内部小元素 |
| `rounded-md` | 6px | 按钮、输入框（Radix 默认） |
| `rounded-lg` | 8px | Card、Dialog（`--radius`） |
| `rounded-xl` | 12px | 较大容器（EntityDrawer 等） |
| `rounded-full` | 9999px | 头像、圆形按钮、Badge 数字 |

### 5.2 阴影

管理后台使用**克制的阴影**，主要依赖边框分隔：

| 场景 | 类名 | 说明 |
|------|------|------|
| 卡片（默认） | `shadow-sm` | 极淡阴影 + `border` |
| 下拉菜单/Popover | `shadow-md` | Radix 自动处理 |
| Dialog / Modal | `shadow-lg` | Radix 自动处理 |
| 侧边栏（展开） | `shadow-lg md:shadow-none` | 移动端抽屉有阴影 |
| TopBar | 无阴影，用 `border-b` 分隔 | — |

---

## 6. 动效系统 | Motion

### 6.1 Duration Token（CSS 变量，待在 `index.css` 补充）

```css
:root {
  --duration-fast:   150ms;   /* 按钮 hover、Badge 显现 */
  --duration-normal: 200ms;   /* 页面切换淡入、下拉展开 */
  --duration-slow:   300ms;   /* Modal 升起、侧边栏收缩 */
}
```

当前已有 `animate-fade-in`（200ms）；新动画统一用以上 token，不写魔法数字。

### 6.2 Easing

```css
:root {
  --ease-default:    cubic-bezier(0.16, 1, 0.3, 1);   /* 大多数 UI 动画 */
  --ease-in:         cubic-bezier(0.4, 0, 1, 1);       /* 离场 */
  --ease-out:        cubic-bezier(0, 0, 0.2, 1);       /* 入场 */
}
```

### 6.3 已有动画类

| 类名 | 效果 | 使用场景 |
|------|------|---------|
| `animate-fade-in` | `opacity 0→1 + translateY 4px→0`，200ms | 页面切换、列表加载完成 |

在 `AdminLayout` 或页面根元素加 `animate-fade-in` 即可实现页切换过渡。

### 6.4 规则

- 所有 duration > 0ms 的动画都要尊重 `prefers-reduced-motion`（Tailwind 已内置 `motion-reduce:` 前缀）
- 表格行 hover 用 Tailwind `hover:bg-accent/50 transition-colors duration-150`，不写自定义 keyframe

---

## 7. 图标系统 | Iconography

### 7.1 图标库

**全站统一使用 [Lucide React](https://lucide.dev/)**，禁止混入其他图标库。

```tsx
import { Users, ShieldAlert, RefreshCw } from 'lucide-react'
```

### 7.2 尺寸规范

| 场景 | 尺寸类 | px |
|------|--------|----|
| 表格行操作按钮 | `h-4 w-4` | 16px |
| 卡片右上角装饰图标（StatsCard） | `h-4 w-4` | 16px |
| Sidebar 菜单图标 | `h-5 w-5` | 20px |
| Header 操作图标 | `h-5 w-5` | 20px |
| 空状态插图级图标 | `h-12 w-12` | 48px |
| PageHeader 内图标（如有） | `h-6 w-6` | 24px |

### 7.3 图标色

- 默认（内容区）：`text-muted-foreground`
- 激活/选中：`text-primary`
- 危险操作：`text-destructive`
- 成功状态：`text-green-600`
- 警告：`text-yellow-600`
- Sidebar 选中：`text-sidebar-primary-foreground`

### 7.4 纯图标按钮必须有 `aria-label`

```tsx
// ✅ 正确
<Button variant="ghost" size="icon" aria-label="刷新数据">
  <RefreshCw className="h-4 w-4" />
</Button>

// ❌ 错误：缺少 aria-label
<Button variant="ghost" size="icon">
  <RefreshCw className="h-4 w-4" />
</Button>
```

---

## 8. 组件规范 | Components

### 8.1 布局组件

#### `AdminLayout`
全局布局容器，包含 Sidebar + Header + 主内容区。新增页面不需要重写布局，直接在路由中使用。

#### `Sidebar`
- 展开宽度：240px；收起宽度：64px
- 菜单项：图标 + 文字，收起时仅图标 + Tooltip
- 选中态：`bg-sidebar-primary text-sidebar-primary-foreground`
- 支持收藏（星标）和关键词搜索过滤
- 未读红点：`useSidebarBadges()` 驱动

#### `Header`
- 高度：`h-16`（64px）
- 左：汉堡菜单（移动端）
- 中：全局搜索（用户/群组/频道 + 命令跳转，`/` 快捷键触发）
- 右：通知面板 + 暗色切换 + 管理员信息

### 8.2 页面结构标准模式

每个管理页面遵循以下结构：

```tsx
export function XxxPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="XXX 管理"
        description="管理所有 XXX"
        actions={<Button><Plus className="h-4 w-4 mr-2" />新建</Button>}
      />
      {/* 筛选栏（可选） */}
      <FilterBar ... />
      {/* 数据表格 */}
      <DataTable table={table} loading={isLoading} />
      {/* 分页 */}
      <DataTablePagination table={table} onPageSizeChange={...} />
    </div>
  )
}
```

### 8.3 `PageHeader`

```tsx
<PageHeader
  title="用户管理"          // text-3xl font-bold
  description="管理注册用户" // text-muted-foreground
  actions={<Button>...</Button>}
/>
```

- 标题 `text-3xl font-bold text-gray-900`（待改为 `text-foreground`）
- 描述 `text-gray-600`（待改为 `text-muted-foreground`）
- Actions 区靠右，`flex items-center gap-2`

> ⚠️ 当前 PageHeader 写死了 `text-gray-900` / `text-gray-600`，暗色下显示异常，待修正为语义 token。

### 8.4 `DataTable` + `DataTablePagination`

- 表格列头：`text-sm font-medium`，支持排序（点击列头切换 `↑` / `↓`）
- 行 hover：`hover:bg-accent/50`
- 行 `onRowClick` 点击进入详情（光标变 `cursor-pointer`）
- 行操作按钮：`variant="ghost" size="icon"`，危险操作 `className="text-destructive"`
- 分页：统一使用 `DataTablePagination`，默认 `size=10`，filter/sort 变化时重置 `page=1`

### 8.5 `StatsCard`

KPI 卡片，用于 Dashboard 等统计概览：

```tsx
<StatsCard
  title="注册用户"
  value={12345}
  icon={Users}
  trend={{ value: 12.5, label: '较上月' }}
/>
```

- 布局：`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`
- 数值：`text-2xl font-bold tabular-nums`
- 趋势：正值 `text-green-600`，负值 `text-red-600`

### 8.6 `StatusBadge`

```tsx
// 默认：1=正常(success)  0=禁用(error)  -1=已删除(secondary)
<StatusBadge status={user.status} />

// 自定义
<StatusBadge
  status={order.status}
  labels={{ pending: '待处理', done: '已完成' }}
  variants={{ pending: 'warning', done: 'success' }}
/>
```

### 8.7 `ConfirmDialog`

**破坏性操作前必须使用**，不允许绕过直接执行：

```tsx
<ConfirmDialog
  title="确认封禁用户？"
  description="封禁后该用户将无法登录，此操作可撤销。"
  confirmText="确认封禁"
  variant="destructive"
  onConfirm={handleBan}
/>
```

### 8.8 `EmptyState` / `LoadingState` / `ErrorState`

列表页三种状态，统一使用，不自行实现：

```tsx
if (isLoading) return <LoadingState />
if (error) return <ErrorState onRetry={refetch} />
if (!data?.length) return <EmptyState message="暂无用户" />
```

### 8.9 `EntityDrawer`

侧滑详情抽屉，用于不需要跳转新页面的详情展示：

```tsx
<EntityDrawer title="用户详情" open={open} onClose={() => setOpen(false)}>
  {/* 详情内容 */}
</EntityDrawer>
```

### 8.10 Radix UI 原语组件使用规则

| 组件 | 文件 | 关键约定 |
|------|------|---------|
| `Button` | `ui/button.tsx` | `variant`: `default/destructive/outline/secondary/ghost/link` |
| `Badge` | `ui/badge.tsx` | 配合 `StatusBadge` 使用，不直接在业务层堆 className |
| `Card` | `ui/card.tsx` | `CardHeader + CardTitle + CardContent` 三件套结构 |
| `Dialog` | `ui/dialog.tsx` | 普通弹窗；破坏性操作改用 `ConfirmDialog` |
| `Input` | `ui/input.tsx` | 配合 `Label` 使用，始终有 `id`+`htmlFor` 关联 |
| `Switch` | `ui/switch.tsx` | 必须有 `aria-label` 或关联 `Label` |
| `Table` | `ui/table.tsx` | 通过 `DataTable` 使用，不直接裸写 `<Table>` |

---

## 9. 暗色模式 | Dark Mode

### 9.1 实现机制

- `useTheme()` hook 管理状态：`light` / `dark` / `system`
- 切换时在 `document.documentElement` 上 toggle `.dark` class
- 用户偏好持久化到 `localStorage`（key: `imboy_admin_theme`）
- 系统偏好变化时自动跟随（`prefers-color-scheme` listener）

### 9.2 暗色 Token 映射

`.dark` 类下所有 CSS 变量自动切换（定义在 `index.css`）：

| 浅色 | 暗色 | 说明 |
|------|------|------|
| background: `#FFFFFF` | background: `#09090B` | 页面底色 |
| card: `#FFFFFF` | card: `#09090B` | 卡片背景 |
| primary: `#2474E5` | primary: `#3B82F6`（待调整为品牌色暗色变体） | 主色 |
| secondary: `#F1F5F9` | secondary: `#1E293B` | 次级背景 |
| border: `#E2E8F0` | border: `#1E293B` | 边框 |
| muted-foreground: `#64748B` | muted-foreground: `#94A3B8` | 次级文字 |

### 9.3 开发规则

- **只用语义 token**，不写 `dark:text-white`（Tailwind 暗色前缀）来覆盖 —— 语义 token 已自动适配
- 状态色（green/yellow/red）暗色下需手动处理：`dark:bg-green-900 dark:text-green-100`
- `PageHeader` 中 `text-gray-900` / `text-gray-600` 是已知暗色 bug，待统一修正

---

## 10. 可访问性 | Accessibility

### 10.1 键盘操作

- 所有交互元素可 Tab 到达
- Dialog / Drawer 打开时焦点 trap 在弹层内（Radix 内置）
- `Escape` 关闭所有弹层（Radix 内置）
- Header 全局搜索支持 `/` 快捷键触发

### 10.2 ARIA 规范

```tsx
// 纯图标按钮
<Button aria-label="删除用户" variant="ghost" size="icon">
  <Trash2 className="h-4 w-4" />
</Button>

// 状态指示
<span aria-live="polite">{isLoading ? '加载中...' : ''}</span>

// 表格
<Table aria-label="用户列表">...</Table>
```

### 10.3 对比度（WCAG AA）

- 正文 (`foreground` on `background`)：对比度 ≥ 4.5:1
- 大字号（≥ 18px 或 14px bold）：≥ 3:1
- 禁用态文字 (`muted-foreground`)：允许 ≥ 3:1
- 状态徽章（`bg-green-100 text-green-800`）：需验证，当前约 5.5:1 ✅

### 10.4 `prefers-reduced-motion`

使用 Tailwind `motion-reduce:` 前缀或 CSS media query 抑制动画：

```css
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in { animation: none; }
}
```

---

## 11. AI Agent 使用指引 | For Coding Agents

**当你被要求在 imboyadmin 中实现任何 UI 时，按以下顺序决策：**

### 11.1 决策树

```
1. 是主操作按钮（保存/确认/创建）?
   → <Button>（默认 variant="default" = primary 蓝）

2. 是破坏性操作（删除/封禁/清空）?
   → 先用 <ConfirmDialog>，按钮用 variant="destructive"

3. 是列表页?
   → PageHeader + DataTable + DataTablePagination
   → 筛选用 FilterBar，不自行实现

4. 是统计概览?
   → grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 + StatsCard

5. 是状态展示?
   → StatusBadge（不自行写 Badge + className）

6. 是详情展示（不需要独立页面）?
   → EntityDrawer

7. 是空/加载/错误状态?
   → EmptyState / LoadingState / ErrorState

8. 是图标?
   → lucide-react，h-4 w-4（行内）/ h-5 w-5（导航/操作区）
```

### 11.2 必须遵守的硬规则

- ❌ **禁止**硬编码颜色 `#hex` 或 Tailwind 具体色阶（`text-gray-900`、`bg-blue-500`）；用语义 token
- ❌ **禁止**破坏性操作不经 `ConfirmDialog` 直接执行
- ❌ **禁止**纯图标按钮不加 `aria-label`
- ❌ **禁止**不通过 `DataTablePagination` 自行实现分页
- ❌ **禁止**自行实现 loading/empty/error 状态（用已有三件套）
- ❌ **禁止**在 `PageHeader` 外自行写页面标题
- ✅ **必须**新列表页分页默认 `size=10`，filter 变化时重置 `page=1`
- ✅ **必须**所有 TSID 字段使用 `EntityId` 类型，不写 `string`/`number`
- ✅ **必须**同时验证浅色和暗色模式外观

### 11.3 新增列表页模板

```tsx
import { useListQueryState } from '@/hooks/useListQueryState'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'

export function XxxPage() {
  const [queryState, setQueryState] = useListQueryState()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['xxx', queryState],
    queryFn: () => fetchXxx(queryState),
  })
  const table = useReactTable({ ... })

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState onRetry={refetch} />

  return (
    <div className="space-y-6">
      <PageHeader title="XXX 管理" description="管理所有 XXX" />
      <DataTable table={table} emptyMessage="暂无数据" />
      <DataTablePagination table={table} onPageSizeChange={(size) =>
        setQueryState({ size, page: 1 })
      } />
    </div>
  )
}
```

### 11.4 自查清单（PR 必过）

- [ ] 没有硬编码颜色值（无 `#hex`、无 `text-gray-*`、无 `bg-blue-*`）
- [ ] 破坏性操作有 `ConfirmDialog` 保护
- [ ] 纯图标按钮有 `aria-label`
- [ ] 浅色 + 暗色模式均正常显示
- [ ] TSID 字段使用 `EntityId` 类型
- [ ] 列表页使用 `DataTablePagination`，filter 变化重置 `page=1`
- [ ] 图标来自 `lucide-react`，不引入其他图标库

---

## 附录 A：已知 Tech Debt

| 问题 | 位置 | 优先级 |
|------|------|--------|
| `--primary` 色值偏差（`#3B82F6` vs 品牌色 `#2474E5`） | `src/index.css:11` | P0 |
| `PageHeader` 中 `text-gray-900`/`text-gray-600` 暗色不适配 | `src/components/shared/PageHeader.tsx` | P1 |
| 缺少动画 token（`--duration-*`/`--ease-*`） | `src/index.css` | P2 |
| UI 组件库缺 Select / Combobox / Toast（Sonner） | `src/components/ui/` | P2 |

---

## 附录 B：版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| 0.1 | 2026-06-30 | 初版，基于现有代码扫描整理 |

**未来演进约束**：颜色/间距/组件等设计决策变更必须先在此文档记录，再改代码。

---

**End of DESIGN.md**
