# `src/pages/auth/SetupPage.tsx`

> 功能点 4 个 | bug 发现 2 / 解决 2 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/auth/SetupPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 | 已初始化环境访问 /setup 重定向（guards 证据） |
| 无待办 | - | `src/pages/auth/SetupPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次7 | 0 | 0 | 0 | 已初始化环境访问 /setup→alreadyInitialized 重定向 /login 实测；离线（emulate Offline）setup/status 失败→容错降级仍展示表单（catch 分支） |
| 无待办 | - | `src/pages/auth/SetupPage.tsx` | 「超级管理员创建」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 2 | 2 | 0 | 临时腾空 adm_user（备份 13 行）实测向导：bug1=adm_setup_handler 缺 rsa_decrypt（密文恒被拒「首启参数无效」）；bug2=create_super_admin role_id 传标量 1 而 adm_user.role_id 是 bigint[]（INSERT 崩连接）。两处已修+重建复验：toast「超级管理员创建成功」+跳 /login+DB 落行 role_id={1}+flag 写入，且新账号可直接登录（闭环）；测后恢复 13 行/删 flag/删测试行净零 |
| 无待办 | - | `src/pages/auth/SetupPage.tsx` | 跳转 `/login` | 已通过 | 批次3 | 0 | 0 | 0 | 向导完成跳登录逻辑存在于代码路径（guards 部分） |
