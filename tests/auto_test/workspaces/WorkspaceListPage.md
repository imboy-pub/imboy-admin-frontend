# `src/pages/workspaces/WorkspaceListPage.tsx`

> 功能点 8 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 未登录跳login实测；路由级403缺无权限账号未测 |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 500注入错误态+重试恢复；zzz无命中空态实测 |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 列表数据加载渲染与字段格式化（名称/状态徽标 正常·已归档/创建时间） | 已通过 | 批次W2R1 | 0 | 0 | 0 | total=27，种子区行+正常徽标可见 |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 分页翻页与每页条数切换（默认 size:10，筛选/搜索变化时重置 page=1） | 已通过 | 批次W2R1 | 0 | 0 | 0 | total=27>10，page=2请求2xx实测 |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 筛选 / 搜索条件生效与清空重置（名称关键字 + 状态 全部/正常/已归档） | 已通过 | 批次W2R1 | 0 | 0 | 0 | keyword+status=archived请求page=1实测 |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 归档工作区：二次确认弹窗确认后提交成功，toast「工作区已归档（读保留，业务写被拒绝）」且列表失效重拉 | 已通过 | 批次W2R1 | 1 | 1 | 0 | 重测：200+code=0+toast+GET重拉+已归档徽标 |
| 无待办 | - | `src/pages/workspaces/WorkspaceListPage.tsx` | 恢复已归档工作区：二次确认后提交成功，toast「工作区已恢复」且列表失效重拉；取消不发请求 | 已通过 | 批次W2R1 | 0 | 0 | 0 | 重测：归档种子区后恢复200+code=0+重拉，终态active |
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
   **已修复（imboy f019e2c6，批次W2R2FIX 复验 HTTP code=0）**。

**W2R1 第二次全量首测（2026-09-03）终局复验**：
- 归档：取消 0 请求；确认 `POST /workspace/archive` HTTP 200 + `code=0,msg=工作区已归档` → toast 1 秒内截图 →
  `GET /workspace/list(keyword=种子)` 失效重拉 200 → 行显示「已归档」徽标。
- 恢复（历史阻塞行，解阻塞条件已满足）：确认 `POST /workspace/restore` HTTP 200 + `code=0,msg=工作区已恢复` →
  toast → 失效重拉 200 → 行恢复「正常」徽标；DB 终态 active（任务铁律：种子区必须恢复）。
- 证据：evidence/workspaces/w2r1b-wslist-*-archive-*/restore-*.png、evidence-misc/w2r1b-wslist-*-api-hits.json
  （archive→GET、restore→GET 两对 mutation+refetch 链完整）。
