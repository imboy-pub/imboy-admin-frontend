# `src/modules/plugin_management/pages/PluginManagementPage.tsx`

> 功能点 12 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过 | 批次7 | 0 | 0 | 0 | 详情抽屉（group_collab）实测：打开渲染名称/版本/描述/安装时间/运行状态+健康检查，关闭正常；只读详情无编辑表单 |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 1 | 1 | 0 | 卸载 ConfirmDialog「取消/卸载」实测出现并确认执行（确认路径由行15 覆盖）；bug=错误 toast 显示「[object Object]」（ApiError 非 Error 实例，7 处 onError 同款），已改用 getErrorMessage 修复并浏览器复验「卸载失败: 功能未启用」 |
| 阻塞 | 永久人工道（后端 FROZEN 安全门禁，不绕过） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件安装」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 后端 POST 返回 HTTP 200 + code 5190「功能未启用」：imboy_plugin_manager:lifecycle_enabled() 默认 false（A-28，审计#43 install Path 无白名单/#44 签名放行），7 个写端点有意禁用，绕过=打开代码加载面，保留阻塞 |
| 阻塞 | 永久人工道（后端 FROZEN 安全门禁，不绕过） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已启用」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 后端 POST 返回 HTTP 200 + code 5190「功能未启用」：imboy_plugin_manager:lifecycle_enabled() 默认 false（A-28，审计#43 install Path 无白名单/#44 签名放行），7 个写端点有意禁用，绕过=打开代码加载面，保留阻塞 |
| 阻塞 | 永久人工道（后端 FROZEN 安全门禁，不绕过） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已禁用」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 后端 POST 返回 HTTP 200 + code 5190「功能未启用」：imboy_plugin_manager:lifecycle_enabled() 默认 false（A-28，审计#43 install Path 无白名单/#44 签名放行），7 个写端点有意禁用，绕过=打开代码加载面，保留阻塞 |
| 阻塞 | 永久人工道（后端 FROZEN 安全门禁，不绕过） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已卸载」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 后端 POST 返回 HTTP 200 + code 5190「功能未启用」：imboy_plugin_manager:lifecycle_enabled() 默认 false（A-28，审计#43 install Path 无白名单/#44 签名放行），7 个写端点有意禁用，绕过=打开代码加载面，保留阻塞 |
| 阻塞 | 永久人工道（后端 FROZEN 安全门禁，不绕过） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已强制卸载」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 后端 POST 返回 HTTP 200 + code 5190「功能未启用」：imboy_plugin_manager:lifecycle_enabled() 默认 false（A-28，审计#43 install Path 无白名单/#44 签名放行），7 个写端点有意禁用，绕过=打开代码加载面，保留阻塞 |
| 阻塞 | 永久人工道（后端 FROZEN 安全门禁，不绕过） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已重置」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 后端 POST 返回 HTTP 200 + code 5190「功能未启用」：imboy_plugin_manager:lifecycle_enabled() 默认 false（A-28，审计#43 install Path 无白名单/#44 签名放行），7 个写端点有意禁用，绕过=打开代码加载面，保留阻塞 |
| 阻塞 | 永久人工道（后端 FROZEN 安全门禁，不绕过） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件升级」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 后端 POST 返回 HTTP 200 + code 5190「功能未启用」：imboy_plugin_manager:lifecycle_enabled() 默认 false（A-28，审计#43 install Path 无白名单/#44 签名放行），7 个写端点有意禁用，绕过=打开代码加载面，保留阻塞 |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 跳转 `/plugins/logs` | 已通过 | 批次3 | 0 | 0 | 0 |  |
