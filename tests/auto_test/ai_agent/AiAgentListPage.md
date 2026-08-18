# `src/modules/ai_agent/pages/AiAgentListPage.tsx`

> 功能点 9 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/modules/ai_agent/pages/AiAgentListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/ai_agent/pages/AiAgentListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 | 错误态经 500 注入验证（error-state.png）；空态经无结果分类筛选验证 |
| 无待办 | - | `src/modules/ai_agent/pages/AiAgentListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次9 | 1 | 1 | 0 |  |
| 无待办 | - | `src/modules/ai_agent/pages/AiAgentListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/modules/ai_agent/pages/AiAgentListPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次2 | 0 | 0 | 0 | 分类筛选 250ms 防抖已验证；重置清空筛选条件（staleTime 内走缓存，按 UI 状态断言） |
| 无待办 | - | `src/modules/ai_agent/pages/AiAgentListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次2 | 0 | 0 | 0 | 停用二次确认弹窗已验证 |
| 无待办 | - | `src/modules/ai_agent/pages/AiAgentListPage.tsx` | 「状态已更新」操作提交成功并刷新列表数据 | 已通过 | 批次2 | 0 | 0 | 0 | 停用→启用已恢复，set_status 均 2xx 且列表刷新 |
| 阻塞 | 需本地 Garage S3 服务 | `src/modules/ai_agent/pages/AiAgentListPage.tsx` | 「头像已上传」操作提交成功并刷新列表数据 | 未测 | 批次7 | 0 | 0 | 0 | 批次7实测复核：POST /api/adm/ai_agent/upload_avatar（multipart PNG）返回 code 950「文件上传失败」=elib_oss:upload 无 S3 后端；本机无 docker 命令、3900/3901 端口无响应，Garage 确未部署，维持环境阻塞 |
| 无待办 | - | `src/modules/ai_agent/pages/AiAgentListPage.tsx` | 「UID 已复制」操作提交成功并刷新列表数据 | 已通过 | 批次2 | 0 | 0 | 0 | uid-copy-toast.png |

## 批次2 发现的 bug（已修复并复验通过）

1. **`ai_agent_repo:page/3` 未导出导致列表接口崩溃（后端）**：`/adm/ai_agent/list` 以 HTTP 200 包裹
   `{"code":400,"msg":"读取 Agent 列表失败"}`，debug.log 显示 `undef` 崩溃。修复：`src/repo/ai_agent_repo.erl`
   补 `-export([page/3])`。

## 批次2 环境问题（非代码 bug，不计入恒等式）

- **本地库 57 号迁移产物缺失**：`schema_migrations_history` 有 00000057 记录（2026-08-07 applied），但
  `ai_agent` 表缺 `category/voice_id/greeting/capabilities/temperature` 五列（58 号产物正常存在）。
  处置：直接 psql 幂等补跑 `priv/migrations/00000057_ai_agent_extended.up.sql`（全部 `IF NOT EXISTS`），
  不改迁移文件。疑为本地库曾被重建/恢复导致 history 与实际 DDL 不一致，迁移工具本身未发现吞错证据。

证据：`tests/auto_test/evidence/ai_agent/batch2-*`（15 张截图 + api-hits.json）
