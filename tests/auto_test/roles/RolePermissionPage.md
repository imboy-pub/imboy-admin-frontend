# `src/pages/roles/RolePermissionPage.tsx`

> 功能点 7 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/roles/RolePermissionPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/roles/RolePermissionPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/roles/RolePermissionPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 无待办 | - | `src/pages/roles/RolePermissionPage.tsx` | 「角色创建」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 1 | 1 | 0 | bug：POST /api/adm/role/create 恒 400 not_null_violation（adm_role_handler INSERT 不含 id 且 adm_role.id bigint NOT NULL 无默认=TSID 迁移遗漏；adm_role 标签也未注册）。已修：注册表补 adm_role + 应用侧 elib_tsid:generate(adm_role)，复验 code=0 落库（批次3 的 2xx 仅前端表单层，端点实为假绿） |
| 无待办 | - | `src/pages/roles/RolePermissionPage.tsx` | 「角色权限已保存」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 自动填表提交 2xx |
| 无待办 | - | `src/pages/roles/RolePermissionPage.tsx` | 「角色已停用」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | e2e 角色实测：确认弹窗取消路径 DB status 不变；确认路径 POST disable 200+toast「角色已停用」+DB status→0 |
| 无待办 | - | `src/pages/roles/RolePermissionPage.tsx` | 「角色已删除」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | POST delete 200+toast「角色已删除」+角色总数 4→3+DB 行删除（净零，adm_role 回基线 1 行） |
