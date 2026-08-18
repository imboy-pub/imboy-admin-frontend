# `src/pages/moments/MomentReportPage.tsx`

> 功能点 8 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 | 302 → /reports?target_type=moment（p13） |
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 500 注入错误态已渲染（p13） |
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 | 举报列表 API 200（p13） |
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 举报数据播种后翻页验证通过（p21） |
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次3 | 0 | 0 | 0 | 搜索按钮点击已验证（p17） |
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 批量勾选与批量操作执行 | 已通过 | 批次6 | 0 | 0 | 0 | 实测勾选 2 条待处理举报（仅 status=0 行可勾选，已处理行 disabled）→「批量驳回」→填原因→确认执行：toast「批量处理完成：成功 2 条举报」，DB 两条 status=1+handled_by 写入核实 |
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 「举报处理」操作提交成功并刷新列表数据 | 已通过 | 批次6 | 1 | 1 | 0 | 实测「确认违规」→POST 200+toast「举报处理成功」，DB status=2+handled_by 写入。发现并修复后端 bug：moment_report.handled_by 外键错误引用 "user"(id)，而写入的是 adm_user 体系 id，致纯管理员处理必 FK 违约（单条+批量全挂）；已加迁移 67 删除该外键（imboy 仓），对齐 report_ticket 无外键模式 |
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 跳转 `/moments/:id` | 已通过 | 批次6 | 0 | 0 | 0 | 实测行内「查看动态」→/moments/92000000000000015（举报关联 post 详情） |
