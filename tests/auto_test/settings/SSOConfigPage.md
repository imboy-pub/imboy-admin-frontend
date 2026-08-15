# `src/pages/settings/SSOConfigPage.tsx`

> 功能点 6 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/settings/SSOConfigPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/SSOConfigPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/SSOConfigPage.tsx` | 「LDAP 配置已保存」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 受控注入 9 字段→保存→toast「LDAP 配置已保存」+DB sso_config 落 ldap 行（host=ldap.e2e-batch7.test:389，净零段域名） |
| 无待办 | - | `src/pages/settings/SSOConfigPage.tsx` | 「SAML 配置已保存」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 切 SAML tab 填 metadata/entity/acs→保存→toast+DB sso_config 落 saml 行（entity_id 落库核实） |
| 无待办 | - | `src/pages/settings/SSOConfigPage.tsx` | 「OAuth2 配置已保存」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 切 OAuth2 tab 填 7 字段→保存→toast+DB sso_config 落 oauth2 行（client_id/issuer 落库核实） |
| 无待办 | - | `src/pages/settings/SSOConfigPage.tsx` | 「回调地址已复制」操作提交成功并刷新列表数据 | 已通过 | 批次6 | 0 | 0 | 0 | 实测 OAuth2 页「复制」：toast「回调地址已复制」，剪贴板读回与输入框值一致（http://127.0.0.1:8082/api/v1/auth/oidc/callback） |
