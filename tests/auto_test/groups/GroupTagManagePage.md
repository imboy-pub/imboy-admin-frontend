# `src/pages/groups/GroupTagManagePage.tsx`

> 功能点 9 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupTagManagePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupTagManagePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 1 | 1 | 0 | bug 已修：elib_pg pluck 聚合识别仅小写，COUNT(*) 大写恒取默认 0（修复复验 count=17+翻页通过） |
| 无待办 | - | `src/pages/groups/GroupTagManagePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupTagManagePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 七阶段数据整备后复测通过（p24-p27） |
| 无待办 | - | `src/pages/groups/GroupTagManagePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 无待办 | - | `src/pages/groups/GroupTagManagePage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 七阶段数据整备后复测通过（p24-p27） |
| 无待办 | - | `src/pages/groups/GroupTagManagePage.tsx` | 「标签已删除」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 造数 e2e_del_tag_01（id 92000000000003001）：确认弹窗（取消路径 DB 行仍在）→确认→toast「标签已删除」+列表行消失+DB 硬删（group_tag 无 deleted_at 为硬删除）；净零=行删除后总数 18→17 恢复基线 |
| 无待办 | - | `src/pages/groups/GroupTagManagePage.tsx` | 「导出当前页 N 条数据」操作提交成功并刷新列表数据 | 已通过 | 批次5 | 0 | 0 | 0 | 下载 group_tags_2026-08-14.csv+toast「已导出当前页 17 条数据」 |
| 无待办 | - | `src/pages/groups/GroupTagManagePage.tsx` | 跳转 `/groups/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
