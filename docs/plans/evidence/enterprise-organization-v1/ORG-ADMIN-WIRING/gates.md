# ORG-ADMIN-WIRING 门禁记录（gates）

时间：2026-09-17 ｜ 仓库：imboyadmin ｜ 分支：codex/org-v1-admin-20260916

| 门禁 | 命令（package.json script） | 结果 | 证据摘要 |
|---|---|---|---|
| 单元测试 | `bun run test`（bun test --isolate） | **PASS** | 1542 pass / 0 fail / 146 files；含本次新增的 18 个用例（生命周期谓词 4 组 + 响应投影 3 例 + API 方法 7 例） |
| Lint | `bun run lint`（eslint .） | **PASS** | 首跑 4 errors（类型注解回调参数名触发 no-unused-vars），按项目 `argsIgnorePattern: '^_'` 惯例修正后复跑无错误无警告 |
| Typecheck | `bun run typecheck`（tsc --noEmit -p tsconfig.app.json） | **PASS** | 无错误（lint 修复后复跑确认） |
| 构建 | `bun run build`（tsc -b && vite build） | **PASS** | built in 1.14s；输出中的 INEFFECTIVE_DYNAMIC_IMPORT warning 为基线已有，与本次改动无关 |
| E2E | `bun run test:e2e`（playwright） | **BLOCKED_E2E_ENV** | 无管理端 E2E 账号、无后端实例；且 tests/e2e 下无组织成员页既有 spec，本轮未新增 E2E。**skipped 不等于 passed**，如实标注 |

## 单测新增覆盖明细

- `src/modules/organization/api/pureFunctions.test.ts`
  - `成员生命周期谓词`：actor 资格基线；suspend（owner 行禁用、admin 目标不要求主 Owner）；restore（仅 suspended）；offboard（owner 行禁用、admin 行需主 Owner）。
  - `生命周期响应投影`：suspend/restore 全量映射（TSID string）；offboard 无 role → null；未知/缺字段防御默认。
- `src/modules/organization/api/organizationMemberLifecycle.test.ts`（新文件，mock client 模式沿用 identity.test.ts 先例）
  - suspend/restore/offboard 的 URL、baseURL（/api/v1）、空请求体 `{}`、响应投影；
  - payload 缺失抛错（契约回归检出）；空 ID 拦截不发请求；TSID 超安全整数仍为 string；
  - `removeOrganizationMember` 导出已移除（离场单一入口回归保护）。

## 结论

- 代码门禁 4/4 全绿；E2E 因环境阻塞（BLOCKED_E2E_ENV）未执行。
