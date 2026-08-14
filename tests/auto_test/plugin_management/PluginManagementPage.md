# `src/modules/plugin_management/pages/PluginManagementPage.tsx`

> 功能点 12 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 阻塞 | 需人工验证 | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 未测 | 批次3 | 0 | 0 | 0 | 弹窗交互深度超出自动化边界 |
| 阻塞 | 永久人工道（§1.4 不可逆/敏感写操作） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 未测 | 批次3 | 0 | 0 | 0 | 确认执行路径属不可逆/敏感操作 |
| 阻塞 | 永久人工道（§1.4 资金/审批/敏感配置写操作） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件安装」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 资金/审批/配置类敏感操作，自动化跳过 |
| 阻塞 | 永久人工道（§1.4 资金/审批/敏感配置写操作） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已启用」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 资金/审批/配置类敏感操作，自动化跳过 |
| 阻塞 | 永久人工道（§1.4 资金/审批/敏感配置写操作） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已禁用」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 资金/审批/配置类敏感操作，自动化跳过 |
| 阻塞 | 永久人工道（§1.4 资金/审批/敏感配置写操作） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已卸载」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 资金/审批/配置类敏感操作，自动化跳过 |
| 阻塞 | 永久人工道（§1.4 资金/审批/敏感配置写操作） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已强制卸载」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 资金/审批/配置类敏感操作，自动化跳过 |
| 阻塞 | 永久人工道（§1.4 资金/审批/敏感配置写操作） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已重置」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 资金/审批/配置类敏感操作，自动化跳过 |
| 阻塞 | 永久人工道（§1.4 资金/审批/敏感配置写操作） | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件升级」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 资金/审批/配置类敏感操作，自动化跳过 |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 跳转 `/plugins/logs` | 已通过 | 批次3 | 0 | 0 | 0 |  |
