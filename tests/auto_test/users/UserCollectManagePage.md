# `src/pages/users/UserCollectManagePage.tsx`

> 功能点 9 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次8 | 0 | 0 | 0 | 错误态经定向 XHR 劫持注入验证（API 404 → ErrorState 错误文案+重试按钮）：「加载用户收藏数据失败」 |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次4 | 0 | 0 | 0 | 造数12条实测：page=2 GET 200；size=50 GET 200 显示1-12/12 |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次4 | 0 | 0 | 0 | 下载事件捕获 user_collects_*.csv 实测 |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 「收藏项已移除」操作提交成功并刷新列表数据 | 已通过 | 批次4 | 0 | 0 | 0 | 移除 e2e_collect_01 POST 200+toast+GET 刷新 12→11 项 |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 「导出 N 条数据」操作提交成功并刷新列表数据 | 已通过 | 批次4 | 0 | 0 | 0 | toast「已导出 12 条数据」实测 |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 跳转 `/users/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 入口点击导航已验证（p14） |
