# ORG-ADMIN-WIRING 发现记录（findings）

任务：把管理后台组织成员「停用 / 恢复 / 离场」操作接到后端新接口。
仓库：`imboyadmin`（worktree 分支 `codex/org-v1-admin-20260916`，基线 f4baec0 = ORG-14）。

---

## 1. 任务卡文件缺失（如实记录）

- 指定路径 `/Users/leeyi/project/imboy.pub/control/dispatch-ORG-ADMIN-V2-WIRING.md` **不存在**（`control/` 目录整个不在工作区）。
- 处置：以任务描述中的要点 + 后端代码真源为准执行，未阻塞（耗时远小于 30 分钟）。任务卡提到的「9 个锚点位置」无法读取，以下用实际核对结果补齐。

## 2. 锚点位置与实际文件的对应（偏差说明）

| 任务卡描述 | 实际位置 | 说明 |
|---|---|---|
| `src/api/public.ts` 约 134-183 行缺 3 个成员生命周期 API | `src/modules/organization/api/public.ts` 134-183 行 = 「成员治理」段 | 行号完全吻合，只是模块化路径不同（ORG-14 已模块化） |
| `OrganizationMembersPage.tsx` 约 161-216 行占位/死按钮 | 同文件「成员状态」列 + 「操作」列区域 | ORG-14 注释明确记录 `BLOCKED_MISSING_ENDPOINT`：当时端点未暴露，只留了「移除」（DELETE）按钮与占位说明 |
| `OrganizationMembersPage.tsx` 约 290-293 行 | 同文件页脚「契约缺口：membership suspend / restore / offboard 端点未暴露…」说明段 | 本次已替换为接入后的真实说明 |
| `src/lib/pureFunctions.ts` 约 273-304 行谓词函数 | `src/modules/organization/api/pureFunctions.ts` 273-304 行 = 权限矩阵区 | 在该区追加了生命周期行级谓词 |

## 3. 后端契约核对（真源：imboy worktree，逐字对齐）

来源：`src/imboy_router.erl`（EB-D07/EB-08 注册段）、`src/api/organization_member_handler.erl`、`src/logic/organization_member_logic.erl`。

| 端点 | 方法 | 请求体 | 响应 data（member_result） |
|---|---|---|---|
| `/api/v1/organizations/:organization_id/members/:user_id/suspend` | POST | 无业务请求体（路径绑定即参数） | `{organization_id, user_id, role, status:"suspended"}` |
| `/api/v1/organizations/:organization_id/members/:user_id/restore` | POST | 同上 | `{organization_id, user_id, role, status:"active"}` |
| `/api/v1/organizations/:organization_id/members/:user_id/offboard` | POST | 同上 | `{organization_id, user_id, status:"removed"}`（无 role，前端投影为 `null`） |

服务端裁决规则（UI 谓词逐条镜像）：
- 三命令共用 `write_tx`：组织必须 active（否则 409）；actor 必须 owner/admin（否则 403）。
- suspend：目标仅 active；主 Owner 目标 409「请先转移 Owner」；**admin 目标不要求主 Owner**（`suspend_tx` 无 `ensure_primary_owner`，与 remove 不同——这是一个真实差异，UI 谓词已按差异镜像）。
- restore：目标仅 suspended（active/removed 都 409；removed 恢复走重新邀请）。
- offboard：= `remove/3` 终态语义（两步离场 S3，与 DB 守卫 `trg_organization_member_offboarding_guard` 同名同义）；目标 active|suspended；主 Owner 409；**admin 目标需主 Owner**；仍被依赖资源引用时数据库 23514 → 409「请先完成交接」。

信封：`elib_response:success` → `{code:0, message:"success", payload:{...}}`，与 `requireApiPayload` 对齐。

## 4. 恢复入口设计决策

- 后端成员分页 `page_by_organization` 硬编码 `WHERE status='active'`，**没有 suspended 列表端点**，也没有成员操作审计端点可复用。
- 因此停用后的成员会从成员表格消失（现网行为）。恢复入口 = 本页会话内的「最近停用」记录面板（`SuspendedMembersPanel`，`data-testid="suspended-members-panel"`）：
  - suspend 成功 → 记录进组件 state（不进 query cache / store / 日志）；
  - 面板内提供「恢复」（restore）与「离场」（offboard，供两步离场 S3 直达）；
  - restore/offboard 成功 → 从记录中移除；
  - 局限如实呈现：记录仅本会话可见，刷新页面后消失，长期悬置成员需在 App 端处理（页脚说明已写明）。
- 未发明新页面结构：面板是成员列表 Card 内的一小块提示区，符合「按现有 UI 结构合理接线」的要求。

## 5. 「离场」单一入口

- 原「移除」按钮（`member-remove-btn`，DELETE `/members/:uid`）替换为「离场」按钮（`member-offboard-btn`，POST `/members/:uid/offboard`）。
- `removeOrganizationMember`（legacy DELETE wrapper）已从 public.ts 删除；单测断言该导出已不存在（`organizationMemberLifecycle.test.ts`）。
- 后端 DELETE 端点本身仍在（legacy 契约），但管理端 UI 不再有第二个离场入口。
- admin 行的离场按钮在非主 Owner 操作时**禁用而非隐藏**（title 提示「离场 admin 成员需要主 Owner 执行」），规则可见。

## 6. E2E 状态

- `BLOCKED_E2E_ENV`：没有管理端 E2E 账号、没有可用后端实例；且 `tests/e2e` 目录下无本页既有 spec，本轮不新增 E2E。skipped 不算 passed。

## 7. 其他

- `git status` 里既存脏文件 `src/generated/*`、`deps/` 属于其他会话，未触碰、未纳入提交。
- 门禁全绿：bun test 1542 pass / 0 fail；lint、typecheck、build 全过（详见 gates.md）。
