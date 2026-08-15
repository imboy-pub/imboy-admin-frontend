# `src/pages/auth/LoginPage.tsx`

> 功能点 3 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/auth/LoginPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 | 登录流程每轮巡检均验证（账号/密码/验证码 1234） |
| 无待办 | - | `src/pages/auth/LoginPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 登录页渲染+表单校验每轮验证 |
| 无待办 | - | `src/pages/auth/LoginPage.tsx` | 「登录」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 浏览器全流程：e2e 账号 pw_e2e_b1_11646 密码重置为 Test1234（按后端 md5 预哈希约定生成 hmac_sha512 hash 落库），表单提交→toast「登录成功」+跳 /dashboard+auth store 写入；失败路径先验证（错密码 toast errorPassword+刷新验证码）。e2e 账号密码变更保留 |
