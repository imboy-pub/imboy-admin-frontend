# `src/modules/bots/pages/BotListPage.tsx`

> 功能点 7 个 | bug 发现 1 / 解决 0 / 待处理 1
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次W2R1 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 空态自然（bot/list total=0）+错误态500注入验证 |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次W2R3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 分页翻页与每页条数切换（本页无筛选/搜索） | 已通过 | 批次W2R3 | 0 | 0 | 0 | 11 条种子实测：共 11 条/下一页可点/每页 50 切换重拉（spec w2r3_bots_verify 全过） |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 详情抽屉（只读）打开、内容加载与关闭 | 已通过 | 批次W2R3FIX | 1 | 1 | 0 | 注册时间显示13位毫秒时间戳未格式化 |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 启停 Bot 二次确认弹窗（确认与取消；adm 端点平台处置权 bots:update，无属主校验） | 已通过 | 批次W2R3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 属主 UID 复制按钮：写剪贴板并 toast「属主 UID 已复制」（纯前端无 API） | 已通过 | 批次W2R3 | 0 | 0 | 0 |  |
