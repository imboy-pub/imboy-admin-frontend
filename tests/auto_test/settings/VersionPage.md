# `src/pages/settings/VersionPage.tsx`

> 功能点 6 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/settings/VersionPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/VersionPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/VersionPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/VersionPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 第五阶段播种后复测通过（p22/p23） |
| 无待办 | - | `src/pages/settings/VersionPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 无待办 | - | `src/pages/settings/VersionPage.tsx` | 「版本已删除」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 造数 vsn 9.9.99-e2e（id 92000000000003007）：卡片删除按钮→「确认删除版本」弹窗（取消路径 DB 行仍在）→确认→toast「版本已删除」+卡片消失+DB 硬删；净零=16→15 恢复基线 |
