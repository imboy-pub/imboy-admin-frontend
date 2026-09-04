# `src/modules/plugin_management/pages/PluginManagementPage.tsx`

> 功能点 12 个 | bug 发现 6 / 解决 1 / 待处理 5
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过 | 批次7 | 0 | 0 | 0 | 详情抽屉（group_collab）实测：打开渲染名称/版本/描述/安装时间/运行状态+健康检查，关闭正常；只读详情无编辑表单 |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 1 | 1 | 0 | 卸载 ConfirmDialog「取消/卸载」实测出现并确认执行（确认路径由行15 覆盖）；bug=错误 toast 显示「[object Object]」（ApiError 非 Error 实例，7 处 onError 同款），已改用 getErrorMessage 修复并浏览器复验「卸载失败: 功能未启用」 |
| 待修复 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件安装」操作提交成功并刷新列表数据 | 有BUG待修 | 批次W2R2 | 1 | 0 | 1 | 核心流程通过：门禁开启后卸后重装 location，2xx+code0+toast 安装成功+refetch；新发现=路径标注「可选」实为后端必填（不填 400「缺少插件路径」，UI 标注与契约不符），截图取证 |
| 待修复 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已启用」操作提交成功并刷新列表数据 | 有BUG待修 | 批次W2R2 | 1 | 0 | 1 | UI 入口缺失：列表=manifest 注册表一律显示已安装，installed 态无启用按钮（UI 仅 disabled 态显示），后端状态机支持 installed→enable；截图取证 w2r2gate-enable-missing.png |
| 待修复 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已禁用」操作提交成功并刷新列表数据 | 有BUG待修 | 批次W2R2 | 1 | 0 | 1 | 同启用行根因：禁用按钮仅 enabled 态显示，启用入口缺失致 enabled 不可达，禁用连带不可达 |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已卸载」操作提交成功并刷新列表数据 | 已通过 | 批次W2R2 | 0 | 0 | 0 | 门禁开启实测 location soft 卸载：2xx+code0+toast 插件已卸载+list refetch，卡片移除；截图取证 |
| 待修复 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已强制卸载」操作提交成功并刷新列表数据 | 有BUG待修 | 批次W2R2 | 1 | 0 | 1 | failed 态经 rpc inject_failure 夹具实测达成；但后端状态 failed 未映射前端 error（PluginState 无 failed），错误徽标与强制卸载按钮均不出现；截图取证 w2r2gate-failed-state-no-entry.png |
| 待修复 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已重置」操作提交成功并刷新列表数据 | 有BUG待修 | 批次W2R2 | 1 | 0 | 1 | 同强制卸载行：failed→error 映射缺失，重置按钮不出现；failed 态本身实测达成（PROBE_STATE failed） |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件升级」操作提交成功并刷新列表数据 | 已通过 | 批次W2R2 | 0 | 0 | 0 | 门禁开启实测 installed 态升级：2xx+code0+toast 插件升级成功+list refetch；截图取证 |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 跳转 `/plugins/logs` | 已通过 | 批次3 | 0 | 0 | 0 |  |
