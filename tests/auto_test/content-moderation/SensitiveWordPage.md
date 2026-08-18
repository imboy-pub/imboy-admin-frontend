# `src/pages/content-moderation/SensitiveWordPage.tsx`

> 功能点 8 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/content-moderation/SensitiveWordPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/content-moderation/SensitiveWordPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/content-moderation/SensitiveWordPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/content-moderation/SensitiveWordPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次9 | 0 | 0 | 0 | 多页翻页实测（共 17 条）：第1页 10 行→第2页 7 行，末页禁用下一页 |
| 无待办 | - | `src/pages/content-moderation/SensitiveWordPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 无待办 | - | `src/pages/content-moderation/SensitiveWordPage.tsx` | 「敏感词已添加」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 实测内联表单填 e2e_batch7_word→「添加」：POST 200 code:0+toast「敏感词已添加」，列表刷新出现新行 |
| 无待办 | - | `src/pages/content-moderation/SensitiveWordPage.tsx` | 「敏感词已删除」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 实测行内删除→ConfirmDialog「确认删除」→确认：DELETE 200 code:0+toast「敏感词已删除」，行消失 |
| 无待办 | - | `src/pages/content-moderation/SensitiveWordPage.tsx` | 「CSV 导入」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 实测 setInputFiles 2 词 CSV→POST import 200「导入完成：成功 2 条，跳过 0 条」 |
