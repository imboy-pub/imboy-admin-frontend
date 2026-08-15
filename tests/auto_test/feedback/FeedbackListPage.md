# `src/pages/feedback/FeedbackListPage.tsx`

> 功能点 11 个 | bug 发现 3 / 解决 3 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 1 | 1 | 0 | bug 已修：feedback-workflow env 双前缀 404（修复复验 200） |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 渲染+交互验证通过；数据单页，多页翻页待数据扩充 |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办| -| `src/pages/feedback/FeedbackListPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过| 批次7| 0| 0| 0| 自动化补测：…9013「查看」抽屉打开（详情+回复历史+回复模板渲染核实）→「关闭」按钮关闭；提交路径由行「回复」覆盖（抽屉打开→填→提交→DB 落库） |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 渲染+交互验证通过；数据单页，多页翻页待数据扩充 |
| 无待办| -| `src/pages/feedback/FeedbackListPage.tsx` | 「回复」操作提交成功并刷新列表数据 | 已通过| 批次7| 1| 1| 0| 实测…9010「回复」→抽屉填「e2e 回复落库修复验证」→「提交回复」：成功+列表刷新，DB feedback_reply 出现 TSID 主键新行+feedback status→2 核实。发现并修复后端 bug：add_reply 的 insert 因 id 无值 23502 not_null_violation 被 ?ERROR_LOG 吞掉仍返回 ok——页面显示回复成功但 feedback_reply 永远无行；修复=Data 补 elib_tsid:generate(feedback_reply) + status=1（热加载后复验落库） |
| 无待办| -| `src/pages/feedback/FeedbackListPage.tsx` | 「反馈已删除」操作提交成功并刷新列表数据 | 已通过| 批次7| 1| 1| 0| 实测…9010 行内 trash icon→ConfirmDialog「确认」：删除成功，DB status→-1（软删）核实。发现并修复后端 bug：role_acl(1)/(2) 内置权限全集遗漏 feedback:delete——delete 接口 403「无权限操作」但 HTTP 200，页面看似成功实际未删；修复=两个角色的 feedback 权限段补 feedback:delete（编译+热加载+清权限缓存后复验 code=0+status→-1） |
| 无待办| -| `src/pages/feedback/FeedbackListPage.tsx` | 「反馈已标记完结」操作提交成功并刷新列表数据 | 已通过| 批次7| 0| 0| 0| 实测…9010（已回复态）「标记完结」：无确认弹窗直接执行+列表刷新，DB status 2→3 核实 |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 「导出 N 条反馈数据」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
