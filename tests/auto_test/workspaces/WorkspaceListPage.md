# `src/pages/workspaces/WorkspaceListPage.tsx`

> 功能点 8 个 | bug 发现 1 / 解决 0 / 待处理 1
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次W2R1 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 错误态500注入+重试恢复；空态无命中关键字实测（w2r1-empty-wslist.png） |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 列表数据加载渲染与字段格式化（名称/状态徽标 正常·已归档/创建时间） | 已通过 | 批次W2R1 | 0 | 0 | 0 | total=24，种子工作区 AT-WS-* 行+正常徽标可见 |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 分页翻页与每页条数切换（默认 size:10，筛选/搜索变化时重置 page=1） | 已通过 | 批次W2R1 | 0 | 0 | 0 | total=24>10，page=2 请求2xx实测；回翻缓存命中按UI页码断言 |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 筛选 / 搜索条件生效与清空重置（名称关键字 + 状态 全部/正常/已归档） | 已通过 | 批次W2R1 | 0 | 0 | 0 | keyword+status=archived 请求带 page=1 实测；取消归档弹窗不发请求已断言 |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 归档工作区：二次确认弹窗确认后提交成功，toast「工作区已归档（读保留，业务写被拒绝）」且列表失效重拉 | 已通过 | 批次W2R2FIX | 1 | 1 | 0 | 后端 archived_by FK 23503 已修（admin 路径写 NULL+操作日志审计，imboy f019e2c6）；HTTP 实证归档/恢复 code=0（真实 adm uid 登录全链） |
| 阻塞 | 待归档 bug 修复（制造已归档工作区） | `src/pages/workspaces/WorkspaceListPage.tsx` | 恢复已归档工作区：二次确认后提交成功，toast「工作区已恢复」且列表失效重拉；取消不发请求 | 未测 | 批次W2R1 | 0 | 0 | 0 | 无已归档工作区；归档接口500无法制造，恢复路径无法实测 |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 点击行进入工作区详情 /workspaces/:id | 已通过 | 批次W2R1 | 0 | 0 | 0 |  |

## 批次W2R1 发现的 bug

1. **归档工作区失败（后端，imboy 仓）**：`POST /api/adm/workspace/archive` 返回 HTTP 200 + `{"code":500,"msg":"归档失败，请稍后重试"}`。
   根因：`workspace_logic:admin_archive_tx` 写 `archived_by = adm_user.id`，但 `workspace.archived_by` 有外键
   `REFERENCES "user"(id)`，而 adm_user.id 与 user 表零交集（本机实测 `UPDATE ... archived_by=103119732858947584`
   直接报 `violates foreign key constraint "fk_workspace_archived_by"`，已 ROLLBACK 验证）→ 归档对全部真实管理员不可用。
   前端表现正常：二次确认弹窗（wslist-archive-confirm-dialog.png）、取消不发请求（断言 0 hit）、失败走 onError
   toast「归档失败: 归档失败，请稍后重试」（wslist-archive-error-toast.png）、不失效重拉、行保持正常徽标。
   恢复路径未受影响（restore 清空 archived_by 无 FK 写入，但需先有已归档工作区才能实测）。
   附带环境疑点（不单列 bug）：CSP 指令含未替换占位符 `__IMBOY_API_HOST__`，每次加载 console error（dev 注入产物，全站性）。
