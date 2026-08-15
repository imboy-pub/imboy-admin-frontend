# `src/pages/license/LicensePage.tsx`

> 功能点 4 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/license/LicensePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/license/LicensePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 主体为静态许可证文本 |
| 无待办 | - | `src/pages/license/LicensePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 「确认更新 License？」alertdialog 实测出现，取消路径弹窗关闭且授权状态无变化（仍社区版） |
| 无待办 | - | `src/pages/license/LicensePage.tsx` | 「授权已生效」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 1 | 1 | 0 | 本地净零段：dev 私钥签发 7 天专业版测试 license 应用→toast「授权已生效」+页面切专业版/被授权方=e2e测试授权；bug：dev server 把 /license 路由解析到根目录 LICENSE 文件致页面被劫持成许可证文本（macOS 大小写不敏感 FS），vite.config 加 spaRouteClashFix 中间件修复复验 200；测后删 priv/license.key+热加载回社区版净零 |
