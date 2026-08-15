# `src/pages/admins/AdminListPage.tsx`

> 功能点 14 个 | bug 发现 4 / 解决 4 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次1 | 2 | 2 | 0 | |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次1 | 0 | 0 | 0 | 错误态经 500 注入验证（error-state.png） |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次1 | 0 | 0 | 0 | |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次1 | 1 | 1 | 0 | |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过 | 批次1 | 0 | 0 | 0 | |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次1 | 0 | 0 | 0 | 取消不发请求已断言 |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次1 | 0 | 0 | 0 | |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 「管理员创建」操作提交成功并刷新列表数据 | 已通过 | 批次1 | 0 | 0 | 0 | |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 「管理员已禁用」操作提交成功并刷新列表数据 | 已通过 | 批次1 | 0 | 0 | 0 | |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 「管理员角色已更新」操作提交成功并刷新列表数据 | 已通过 | 批次1 | 1 | 1 | 0 | bug：roleOptions 用 Number(item.id) 收窄 TSID（>2^53 丢精度），assign_role 出站 role_id 为错误 id（后端不校验存在性仍返回 200=静默写错数据）。已修：RoleOption/CreateAdminForm/Admin.role_id 全链路 EntityId，出站 string（批次85 复验 admin-rbac 测试1/2 全绿） |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 「导出 N 条管理员数据」操作提交成功并刷新列表数据 | 已通过 | 批次1 | 0 | 0 | 0 | |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 跳转 `/roles` | 已通过 | 批次1 | 0 | 0 | 0 | |
| 无待办 | - | `src/pages/admins/AdminListPage.tsx` | 跳转 `/logs` | 已通过 | 批次1 | 0 | 0 | 0 | |

## 批次1 发现的 bug（均已修复并复验通过）

1. **super_admin 可被降权锁死（后端）**：`/rbac/me` 对 role 1 返回配置覆盖后的 2 条权限（脏数据），
   全后台 403。修复：`adm_role_handler` 写侧拒绝 role_id=1 的权限保存；
   `adm_index_handler:role_acl(1)` 读侧忽略历史覆盖。
2. **搜索/重置命中 React Query 5min staleTime 缓存不发请求（前端）**：重置后列表静止不刷新。
   修复：`handleSearch`/`handleReset` 先 `invalidateQueries(['admins'])` 再改参数。
   ⚠️ 系统性模式：全站列表页共用 `useListQueryState` + 全局 staleTime，其他页面待各自首测轮验证。
3. **429/瞬态故障误登出（前端）**：`ProtectedRoute.checkAuth` 对任何错误（含 429/5xx）都 logout。
   修复：仅 `code === 401` 才登出，瞬态故障回退本地持久化登录态。
   配套：后端 `init_throttle_rates` 限流上限改为读 `throttle.rates` 配置（本地放宽至 6000/min）。

证据：`tests/auto_test/evidence/admins/batch1-*`（14 张截图 + api-hits.json）
