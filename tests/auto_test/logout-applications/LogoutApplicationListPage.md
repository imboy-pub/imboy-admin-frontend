# `src/pages/logout-applications/LogoutApplicationListPage.tsx`

> 功能点 9 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/logout-applications/LogoutApplicationListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/logout-applications/LogoutApplicationListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 | p8 精确注入复测：ErrorState 已渲染 |
| 无待办 | - | `src/pages/logout-applications/LogoutApplicationListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/logout-applications/LogoutApplicationListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次9 | 0 | 0 | 0 | 六阶段播种/修复后复测通过（logout type=102 / grouptask 带参查询） |
| 无待办 | - | `src/pages/logout-applications/LogoutApplicationListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 「确认驳回」「确认通过」alertdialog 实测出现，取消路径无副作用，确认路径由行14/15 覆盖（e2e 净零段用户 92000000000050001） |
| 无待办 | - | `src/pages/logout-applications/LogoutApplicationListPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次9 | 0 | 0 | 0 | 六阶段播种/修复后复测通过（logout type=102 / grouptask 带参查询） |
| 无待办 | - | `src/pages/logout-applications/LogoutApplicationListPage.tsx` | 「驳回注销申请」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 1 | 1 | 0 | toast「已驳回注销申请」+行状态注销中→已驳回+DB user.status 2→1 落库核实；bug：user_ds:reject_logout_apply 的 UPDATE 引用不存在的 updated_at 列（user 表仅 created_at）致 {error}→「操作失败」，approve 同款，已删该子句修复（e2e 用户 92000000000050001） |
| 无待办 | - | `src/pages/logout-applications/LogoutApplicationListPage.tsx` | 「注销申请已审批通过」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | toast「注销申请已审批通过」+行状态→已删除+DB user.status→-1 落库核实；受益于行14 的 user_ds 修复 |
| 无待办 | - | `src/pages/logout-applications/LogoutApplicationListPage.tsx` | 「开始下载导出文件」操作提交成功并刷新列表数据 | 已通过 | 批次9 | 0 | 0 | 0 |  |
