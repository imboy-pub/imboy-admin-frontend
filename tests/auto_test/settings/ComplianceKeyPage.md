# `src/pages/settings/ComplianceKeyPage.tsx`

> 功能点 5 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/settings/ComplianceKeyPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/ComplianceKeyPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/ComplianceKeyPage.tsx` | 「合规密钥创建」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 本地净零段：openssl 临时 RSA 公钥上传→toast「合规密钥创建成功」+列表「活跃」徽章+DB compliance_key 落行；测后删行净零 |
| 无待办 | - | `src/pages/settings/ComplianceKeyPage.tsx` | 「密钥已撤销」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 确认弹窗取消路径关闭无副作用；确认路径 toast「密钥已撤销」+徽章→已撤销+DB status→0/revoked_at 写入；测后删行净零 |
| 无待办 | - | `src/pages/settings/ComplianceKeyPage.tsx` | 跳转 `/settings` | 已通过 | 批次3 | 0 | 0 | 0 |  |
