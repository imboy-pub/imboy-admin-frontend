# `src/pages/workspaces/ProjectListPage.tsx`

> 功能点 6 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/workspaces/ProjectListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 未登录跳login实测；路由级403缺无权限账号未测 |
| 无待办 | - | `src/pages/workspaces/ProjectListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 500注入错误态+重试恢复；zzz无命中空态实测 |
| 无待办 | - | `src/pages/workspaces/ProjectListPage.tsx` | 列表数据加载渲染与字段格式化（名称/状态徽标 进行中·已完成/Owner/创建时间） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 七列头+状态徽标渲染实测，total>10 |
| 无待办 | - | `src/pages/workspaces/ProjectListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次W2R1 | 0 | 0 | 0 | page=2请求2xx；回翻缓存命中按UI页码断言 |
| 无待办 | - | `src/pages/workspaces/ProjectListPage.tsx` | 筛选 / 搜索条件生效与清空重置（关键字 + 状态 全部/进行中/已完成） | 已通过 | 批次W2R1 | 0 | 0 | 0 | keyword+status=active请求page=1实测；重置UI复位 |
| 无待办 | - | `src/pages/workspaces/ProjectListPage.tsx` | 点击行进入项目详情 /projects/:id | 已通过 | 批次W2R1 | 0 | 0 | 0 | 种子项目行点击进详情实测 |
