# `src/modules/bots/pages/BotListPage.tsx`

> 功能点 7 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次W2R1 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 空态自然（bot/list total=0）+错误态500注入验证 |
| 阻塞 | 补 ≥1 条 Bot 种子数据 | `src/modules/bots/pages/BotListPage.tsx` | 列表数据加载渲染与字段格式化 | 未测 | 批次W2R1 | 0 | 0 | 0 | 后端无 Bot 数据（total=0），行渲染无法验证 |
| 阻塞 | 补 ≥11 条 Bot 种子数据 | `src/modules/bots/pages/BotListPage.tsx` | 分页翻页与每页条数切换（本页无筛选/搜索） | 未测 | 批次W2R1 | 0 | 0 | 0 | 控件渲染/共0条/下一页禁用已验，翻页缺数据 |
| 阻塞 | 补 ≥1 条 Bot 种子数据 | `src/modules/bots/pages/BotListPage.tsx` | 详情抽屉（只读）打开、内容加载与关闭 | 未测 | 批次W2R1 | 0 | 0 | 0 | 无 Bot 行，抽屉不可开（本页无编辑/提交） |
| 阻塞 | 补测试账号属主的 Bot 种子 | `src/modules/bots/pages/BotListPage.tsx` | 启停 Bot 二次确认弹窗（确认执行与取消；仅测试账号属主可执行确认路径） | 未测 | 批次W2R1 | 0 | 0 | 0 | 无 Bot 行；真实属主 Bot 不可启停（扰第三方） |
| 阻塞 | 补 ≥1 条 Bot 种子数据 | `src/modules/bots/pages/BotListPage.tsx` | 属主 UID 复制按钮：写剪贴板并 toast「属主 UID 已复制」（纯前端无 API） | 未测 | 批次W2R1 | 0 | 0 | 0 | 无 Bot 行 |
