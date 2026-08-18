# `src/pages/settings/ProfileSwitchPage.tsx`

> 功能点 5 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/settings/ProfileSwitchPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/ProfileSwitchPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/ProfileSwitchPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次6 | 0 | 0 | 0 | 实测切换套餐确认弹窗：取消→无写请求、profile 不变；确认切换→PUT 200 生效 |
| 无待办 | - | `src/pages/settings/ProfileSwitchPage.tsx` | 「产品套餐已切换」操作提交成功并刷新列表数据 | 已通过 | 批次6 | 0 | 0 | 0 | 实测社区→企业→社区往返：双向 PUT 200+toast，profile 正确切换；已保存能力覆盖优先于套餐默认值（secure_e2ee/required 未丢），终态与初始一致 |
| 无待办 | - | `src/pages/settings/ProfileSwitchPage.tsx` | 跳转 `/settings` | 已通过 | 批次3 | 0 | 0 | 0 |  |
