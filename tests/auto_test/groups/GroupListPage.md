# `src/pages/groups/GroupListPage.tsx`

> 功能点 13 个 | bug 发现 2 / 解决 2 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次9 | 0 | 0 | 0 | ux/events 404 已修复复验200 |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 批量勾选与批量操作执行 | 已通过 | 批次3 | 0 | 0 | 0 | 勾选后批量操作反馈已验证（p13） |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过 | 批次3 | 0 | 0 | 0 | 打开+取消已验证 |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 「群组信息已更新」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 1 | 1 | 0 | 编辑抽屉改名+简介→保存→toast「群组信息已更新」+列表刷新+DB title/introduction 落库核实；bug：后端 adm_group_handler 用 atom 键 map 触发 group_repo:update 的 maps:get(<<"id">>) 异常致 500，已改 binary 键修复（e2e 群组 92000000000020011，净零段） |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 「群组已解散」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 1 | 1 | 0 | 行内解散→ConfirmDialog 确认→toast「群组已解散」+DB status→-1；bug：前端状态列 labels 缺 -1 映射致裸显数字，已补 {[-1]: '已解散'}（表格+CSV 两处） |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 「批量解散」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 勾选 B/C 两群组→批量操作栏「批量解散」→高危弹窗（原因≥2字+输入 DISSOLVE）→toast「批量解散完成：成功 2 个群组」→DB 92000000000020012/13 status→-1 核实+列表刷新「已解散」 |
| 无待办 | - | `src/pages/groups/GroupListPage.tsx` | 跳转 `/groups/:id` | 已通过 | 批次3 | 0 | 0 | 0 |  |
