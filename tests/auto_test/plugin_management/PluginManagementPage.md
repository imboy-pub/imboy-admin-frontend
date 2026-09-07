# `src/modules/plugin_management/pages/PluginManagementPage.tsx`

> 功能点 12 个 | bug 发现 6 / 解决 6 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过 | 批次7 | 0 | 0 | 0 | 详情抽屉（group_collab）实测：打开渲染名称/版本/描述/安装时间/运行状态+健康检查，关闭正常；只读详情无编辑表单 |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 1 | 1 | 0 | 卸载 ConfirmDialog「取消/卸载」实测出现并确认执行（确认路径由行15 覆盖）；bug=错误 toast 显示「[object Object]」（ApiError 非 Error 实例，7 处 onError 同款），已改用 getErrorMessage 修复并浏览器复验「卸载失败: 功能未启用」 |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件安装」操作提交成功并刷新列表数据 | 已通过 | 批次W2R2 | 1 | 1 | 0 | 标注对齐+前端必填校验：空路径拦截0请求、实装 location 2xx+toast+refetch（w2r2fix-install-* 截图） |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已启用」操作提交成功并刷新列表数据 | 已通过 | 批次W2R2 | 1 | 1 | 0 | installed 态启用入口补齐（复验 enable 2xx+toast+已启用徽标，w2r2fix-enable-toast.png） |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已禁用」操作提交成功并刷新列表数据 | 已通过 | 批次W2R2 | 1 | 1 | 0 | enabled 可达后禁用链路复验：确认弹窗+disable 2xx+toast+已禁用徽标（w2r2fix-disable-toast.png） |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已卸载」操作提交成功并刷新列表数据 | 已通过 | 批次W2R2 | 0 | 0 | 0 | 门禁开启实测 location soft 卸载：2xx+code0+toast 插件已卸载+list refetch，卡片移除；截图取证 |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已强制卸载」操作提交成功并刷新列表数据 | 已通过 | 批次W2R2 | 1 | 1 | 0 | failed→error 映射后入口恢复：复验错误徽标+强制卸载 2xx+toast+回已安装（w2r2fix-failed-state-mapped-error.png） |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件已重置」操作提交成功并刷新列表数据 | 已通过 | 批次W2R2 | 1 | 1 | 0 | 同上演示 reset 链路复验：重置确认弹窗+2xx+toast+入口消失（w2r2fix-reset-toast.png） |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 「插件升级」操作提交成功并刷新列表数据 | 已通过 | 批次W2R2 | 0 | 0 | 0 | 门禁开启实测 installed 态升级：2xx+code0+toast 插件升级成功+list refetch；截图取证 |
| 无待办 | - | `src/modules/plugin_management/pages/PluginManagementPage.tsx` | 跳转 `/plugins/logs` | 已通过 | 批次3 | 0 | 0 | 0 |  |

## 批次W2R2 修复记录（5 项，复验全过）

1. **安装路径必填**：Label/描述去「可选」、提交前校验并 toast「请填写插件路径」（不发请求）。
2. **installed 态启用入口**：启用按钮条件 disabled||installed（后端 imboy_plugin_lifecycle 支持 installed→enable）。
3. **禁用连带可达**：enabled 态可达后，禁用确认弹窗+disable 2xx 实测恢复。
4. **failed→error 映射**：normalizePluginState 归一（imboy_plugin_lifecycle 状态机含 failed，前端 PluginState 无该值），
   错误徽标/异常计数/重置与强制卸载入口恢复；补单测 plugins.test.ts。
5. 复验手段：plugin_gate_probe.escript（gate-on / inject_failure / cleanup）+ round_w2r2_plugin_fix_verify.spec.ts 全绿；
   复验后门禁恢复默认关闭（gate-off），location/channel/group_collab/moment 终态均回 manifest installed。
   注：channel 包 install 被后端校验拒绝、group_collab enable 启动失败（插件包自身问题，与本页前端无关，不记 bug）。

