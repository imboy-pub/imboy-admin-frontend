# `src/pages/settings/FeatureConfigPage.tsx`

> 功能点 4 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/settings/FeatureConfigPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/FeatureConfigPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/FeatureConfigPage.tsx` | 「功能开关已保存」操作提交成功并刷新列表数据 | 已通过 | 批次6 | 1 | 1 | 0 | 实测切换开关→PUT 200→toast「功能开关已保存」→回读持久化生效；发现并修复 bug：getPolicyEffective 未把扁平 effective 包成 {effective}，致 11 个开关恒显关闭（已修 policy.ts + 单测） |
| 无待办 | - | `src/pages/settings/FeatureConfigPage.tsx` | 跳转 `/settings` | 已通过 | 批次3 | 0 | 0 | 0 |  |
