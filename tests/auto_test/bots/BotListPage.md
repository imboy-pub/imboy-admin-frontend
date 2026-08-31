# `src/modules/bots/pages/BotListPage.tsx`

> 功能点 7 个 | bug 发现 1 / 解决 0 / 待处理 1
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次W2R1 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 空态自然（bot/list total=0）+错误态500注入验证 |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次W2R3 | 0 | 0 | 0 |  |
| 阻塞 | 补 ≥11 条 Bot 种子数据 | `src/modules/bots/pages/BotListPage.tsx` | 分页翻页与每页条数切换（本页无筛选/搜索） | 未测 | 批次W2R3 | 0 | 0 | 0 | 已验共1条/第1/1页/上下页禁用/切50重拉；翻页仍缺数据 |
| 待修复 | 2026-08-31 | `src/modules/bots/pages/BotListPage.tsx` | 详情抽屉（只读）打开、内容加载与关闭 | 有BUG待修 | 批次W2R3 | 1 | 0 | 1 | 注册时间显示13位毫秒时间戳未格式化 |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 启停 Bot 二次确认弹窗（确认与取消；adm 端点平台处置权 bots:update，无属主校验） | 已通过 | 批次W2R3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 属主 UID 复制按钮：写剪贴板并 toast「属主 UID 已复制」（纯前端无 API） | 已通过 | 批次W2R3 | 0 | 0 | 0 |  |
