# ORG-ADMIN-WIRING 结论（verdict）

**结论：PASS（代码门禁全绿；E2E 因环境阻塞如实标注 BLOCKED_E2E_ENV，不影响本轮交付范围）**

## 交付了什么

管理后台组织成员「停用 / 恢复 / 离场」操作从占位接到后端真实接口（EB-D07/EB-08）：

1. **API 层**（`src/modules/organization/api/public.ts`）
   - 新增 `suspendOrganizationMember` / `restoreOrganizationMember` / `offboardOrganizationMember`，全部 POST `/api/v1/organizations/:oid/members/:uid/{suspend|restore|offboard}`，契约与后端逐字对齐（路径绑定即参数、无业务请求体、member_result 投影）。
   - 删除 legacy `removeOrganizationMember`（DELETE wrapper）——「离场」单一入口，UI 只走 POST offboard。
2. **谓词与投影**（`src/modules/organization/api/pureFunctions.ts`）
   - `canSuspendMember` / `canRestoreMember` / `canOffboardMember` / `canManageMemberLifecycle` 行级谓词，逐条镜像后端裁决（含「suspend 对 admin 目标不要求主 Owner、offboard 要求」这一真实差异）。
   - `toMemberLifecycleResult` 投影（offboard 响应无 role → null）。
3. **页面接线**（`src/modules/organization/pages/OrganizationMembersPage.tsx`）
   - 操作列：非 owner 行新增「停用」按钮；原「移除」按钮改为「离场」（POST offboard）；admin 行离场在非主 Owner 时禁用并提示。
   - 恢复入口：成员列表只含 active（后端硬编码），停用后的成员从表格消失 → 本页新增「最近停用」记录面板（组件 state，不进 cache/store/日志），提供「恢复」与「离场」操作；局限（刷新即失、长期悬置走 App 端）在页脚如实说明。
   - 页面头部契约注释与页脚说明同步更新，清除 ORG-14 的 BLOCKED_MISSING_ENDPOINT 占位文案。

## 验证状态

- bun test：1542 pass / 0 fail（含本次新增 18 个用例）
- lint / typecheck / build：全过
- E2E：BLOCKED_E2E_ENV（无管理端 E2E 账号与后端实例；tests/e2e 下亦无本页既有 spec）

## 偏差与阻塞（不改变结论）

- 任务卡文件 `control/dispatch-ORG-ADMIN-V2-WIRING.md` 缺失 → 按任务描述要点 + 后端真源执行（findings.md 第 1、2 节有锚点对应说明）。
- 任务卡中的文件路径是模块化前的旧路径（`src/api/public.ts` / `src/lib/pureFunctions.ts`），实际为 `src/modules/organization/api/*`，行号可对上。

## 提交

- conventional 提交：`feat(organization): wire member suspend/restore/offboard actions (TASK_ID=ORG-ADMIN-WIRING)`
- 显式 pathspec：4 个源码/测试文件 + 新测试文件 + 本证据目录；不含 `src/generated/*`、`deps/` 等他人脏文件。
- 未 push（按纪律）。
