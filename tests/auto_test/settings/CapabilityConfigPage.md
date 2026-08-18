# `src/pages/settings/CapabilityConfigPage.tsx`

> 功能点 5 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/settings/CapabilityConfigPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/CapabilityConfigPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/CapabilityConfigPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次6 | 0 | 0 | 0 | 实测审计模式降级弹窗：取消→无 PUT、后端不变；仍要保存→PUT 200 持久化；升级方向无弹窗；已还原原值 |
| 无待办 | - | `src/pages/settings/CapabilityConfigPage.tsx` | 「能力配置已保存」操作提交成功并刷新列表数据 | 已通过 | 批次6 | 0 | 0 | 0 | 实测保留天数 30→31→30 往返持久化；message_search 受 secure_e2ee 约束强制 effective=false（后端 adjustments 正确说明，属设计）；展示修复依赖 FeatureConfigPage 同款 getPolicyEffective bug |
| 无待办 | - | `src/pages/settings/CapabilityConfigPage.tsx` | 跳转 `/settings` | 已通过 | 批次3 | 0 | 0 | 0 |  |
