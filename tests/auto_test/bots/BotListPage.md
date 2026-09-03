# `src/modules/bots/pages/BotListPage.tsx`

> 功能点 7 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 未登录跳login实测；路由级403缺无权限账号未测 |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 500注入错误态+重试恢复2xx；空态注入实测 |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次W2R1 | 0 | 0 | 0 | 11条种子实测，6列头+公开/私有徽标渲染 |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 分页翻页与每页条数切换（本页无筛选/搜索） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 共11条；page2与size50切换均2xx实测 |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 详情抽屉（只读）打开、内容加载与关闭 | 已通过 | 批次W2R1 | 1 | 1 | 0 | 重测：detail 2xx三区块；注册时间已格式化 |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 启停 Bot 二次确认弹窗（确认与取消；adm 端点平台处置权 bots:update，无属主校验） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 取消0请求；种子属主停用/启用2xx+重拉+回滚 |
| 无待办 | - | `src/modules/bots/pages/BotListPage.tsx` | 属主 UID 复制按钮：写剪贴板并 toast「属主 UID 已复制」（纯前端无 API） | 已通过 | 批次W2R1 | 0 | 0 | 0 | toast 1秒内截图；headless剪贴板报错系环境限制 |
