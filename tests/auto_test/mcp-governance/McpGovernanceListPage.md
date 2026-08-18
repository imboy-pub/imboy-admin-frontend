# `src/pages/mcp-governance/McpGovernanceListPage.tsx`

> 功能点 5 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/mcp-governance/McpGovernanceListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/mcp-governance/McpGovernanceListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 1 | 1 | 0 | bug 已修：未知 status 值致 STATUS_META[x].className 白屏；加兜底显示原始值（复验 16 条渲染+翻页通过） |
| 无待办 | - | `src/pages/mcp-governance/McpGovernanceListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/mcp-governance/McpGovernanceListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次9 | 0 | 0 | 0 | 第五阶段播种后复测通过（p22/p23） |
| 无待办 | - | `src/pages/mcp-governance/McpGovernanceListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 造数 e2e_mcp_dlg（client_id 92000000000003005，pending）：「拒绝」弹确认框（取消路径 DB status 仍 pending）→确认→toast「已拒绝 MCP 客户端接入」+DB status→revoked+行内按钮变「详情」；净零=测试行已删 |
