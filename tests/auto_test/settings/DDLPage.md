# `src/pages/settings/DDLPage.tsx`

> 功能点 6 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/settings/DDLPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/DDLPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/DDLPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/DDLPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 第五阶段播种后复测通过（p22/p23） |
| 无待办 | - | `src/pages/settings/DDLPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 无待办 | - | `src/pages/settings/DDLPage.tsx` | 「DDL 配置已删除」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 1 | 1 | 0 | bug=adm_app_ddl_handler 把 {ok,0} 当成功：app_ddl_ds:delete 仅删 status=0（禁用）行，启用行删除 0 行受影响仍 toast「已删除」（假成功）；已修（{ok,0}→报「不存在或未禁用」）+重建复验：造数 v998→v999（取消路径 DB 不变；启用行删除报错；DB 置禁用后删除→toast「DDL 配置已删除」+卡片消失+DB 硬删）；净零=16→15 恢复基线 |
