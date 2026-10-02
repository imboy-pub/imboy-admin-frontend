# ADR: 生产深引违规 76 条修复路线（module deep-import remediation）

- Status: Proposed（分析方案；未修改任何代码/配置）
- Date: 2026-09-30
- 关联: [2026-03-15-admin-feature-module-boundaries.md](./2026-03-15-admin-feature-module-boundaries.md)（边界 ADR）、[2026-09-30-module-boundaries-verification.md](./2026-09-30-module-boundaries-verification.md)（核查记录）
- 仓库: `imboyadmin`（独立 git 仓）

---

## 1. 背景与复核结论

核查记录（verification ADR §5-6）登记生产代码 **76 条**不受门禁约束的深引（10 跨模块 + 66 模块外），eslint `no-restricted-imports` 仅对 6 处白名单 files 生效（`eslint.config.js:55-62`），构建产物正常（架构债非功能 bug）。

本 ADR 于同日以当前代码（HEAD）**逐条复核**，结论：

| 项 | 核查记录 | 本次复核（2026-09-30） | 判定 |
|---|---|---|---|
| 深引总量（含 test） | 102 | 102 | 一致 |
| 生产代码深引 | 78 | 78 | 一致 |
| ├ SELF（模块自引） | 2 | 2（dashboard/reports 的 registry→contracts） | 一致 |
| ├ CROSS-MODULE | 10 | 10 | 一致 |
| └ OUTSIDE | 66 | 66 | 一致 |
| OUTSIDE 分布 auth/users/roles | 7 | **9**（auth 3 + users 4 + roles 2） | **记录小滞后**，总数不变 |
| OUTSIDE 目标含 social_graph | 有登记 | **0 条**（当前无生产深引指向 social_graph） | 记录滞后，已消失 |
| 缺 barrel 模块 | 4（dashboard、reports、agent-hub、enterprise_access） | 4，同一批 | 一致 |
| seat 绕行（seatMain.tsx:18） | 存在 | 存在，`public.ts:9` 已导出 `SeatWorkspacePage` 仍被绕行 | 一致 |
| 死环境变量 | 2 个 | 见 §6（另发现 env-vars 文档 4 处需同步） | 补充 |

> 复核方法同核查记录 §1（grep `from ['\"]@/modules/<mod>/<sub>`，剔 `.test.`）；分类口径 SELF/CROSS/OUTSIDE 相同。

**结论：76 条存量确认、无新增恶化；修复路线以本 ADR 清单为准。**

## 2. 逐条清单与修复模式聚类

四类修复模式：

- **M1 提升公共 API（改 import 路径）**：目标模块已有 barrel 且符号已从 public 面导出 → 消费方把 `@/modules/<mod>/<sub>` 改为 `@/modules/<mod>`。**只动 import 语句，不动任何类型与值**。
- **M2 barrel 导出补齐**：目标模块无 barrel → 新增 `index.ts`（转发 public 面，同既有 15 模块的 `export * from './public'` 形态）→ 消费方按 M1 改路径。
- **M3 依赖注入/相对导入**：模块**内部**自引（SELF）改为相对导入 `../contracts/...`；模块间如 barrel 化会引起循环时（当前方向图无环，暂不需要 DI）。
- **M4 死代码删除**：无消费方的深引目标直接删除（本次复核未发现 M4 候选——66 条 OUTSIDE 全部有活跃消费方；死环境变量属 M4 变体，见 §6）。

### 2.1 CROSS-MODULE 10 条（全部 M1：目标符号已可达 barrel，证据逐一核过）

| # | 文件:行 | 深引目标 | 模式 | 符号可达性证据 |
|---|---|---|---|---|
| 1 | `src/modules/organization/components/UserSearchSelect.tsx:8` | `@/modules/identity/api/users`（`searchUsersPayload`） | M1 | identity 链 index→public→api/public（`export * from './users'`，api/public.ts:3）；符号定义 api/users.ts:67 |
| 2 | `src/modules/organization/pages/OrganizationCreateDialog.tsx:13` | `@/modules/identity/...` | M1 | 同上 |
| 3 | `src/modules/organization/pages/OrganizationCreateDialogV2.tsx:11` | `@/modules/identity/...` | M1 | 同上 |
| 4 | `src/modules/enterprise_access/hooks.ts:7` | `@/modules/organization/api/public`（`getOrganizations`） | M1 | organization/api/public.ts:93 定义；barrel `export * from './api'` |
| 5 | `src/modules/customer_service/pages/CustomerServiceHomePage.tsx:47` | `@/modules/organization/...` | M1 | 同上 |
| 6 | `src/modules/customer_service/pages/useOrgWorkspaceScope.ts:24` | `@/modules/organization/...` | M1 | 同上 |
| 7 | `src/modules/customer_service/pages/CsProvisioningWizardPage.tsx:25` | `@/modules/organization/...` | M1 | 同上 |
| 8 | `src/modules/customer_service/pages/CsProvisioningWizardPage.tsx:26` | `@/modules/organization/...`（`api/pureFunctions`） | M1 | 同上（需确认 pureFunctions 经 api/index 转发；若未转发，先在 organization/api/public.ts 补一行 re-export） |
| 9 | `src/modules/enterprise_business/pages/useOrgWorkspaceOptions.ts:9` | `@/modules/organization/...` | M1 | 同上 |
| 10 | `src/modules/ops_governance/api/reports.ts:9` | `@/modules/moments/api`（`resolveMomentReport` 等 4 符号） | M1 | moments 链 index→public→api/index（`export * from './public'`）；符号定义 moments/api/public.ts:257 |

> #8 标注 UNVERIFIED 点：`api/pureFunctions` 是否已由 organization 的 api/index 转发未逐文件核实，修复 PR 内验证。

### 2.2 OUTSIDE 66 条（按消费方目录聚类）

| 来源目录 | 条数 | 深引目标（模式） | 修复 |
|---|---:|---|---|
| `src/pages/groups` | 14 | groups/api、groups/api/enhancements（M1）+ enterprise_access/preset、/hooks（**M2**） | 12 改路径 + 2 待 barrel |
| `src/pages/channels` | 12 | channels/api（M1）+ enterprise_access/preset、/hooks（**M2**） | 10 改路径 + 2 待 barrel |
| `src/pages/reports` | 5 | ops_governance/api（M1）+ reports/contracts、reports/registry（**M2**，R5 扩展点） | 2 改路径 + 3 待 barrel |
| `src/pages/workspaces` | 4 | enterprise_access/preset、/hooks（**M2**） | 待 barrel |
| `src/pages/auth`+`users`+`roles` | 9 | identity/api、identity/api/setup、identity/api/auth（M1，identity barrel 已 `export * from './api'`） | 改路径 |
| `src/pages/{billing-invoices,billing-plans,billing-subscriptions,wallets,recharge-orders,withdrawals,payment-transactions}` | 7 | finance/api（M1，finance 有 barrel） | 改路径 |
| `src/hooks` | 3 | identity/api/setup、ops_governance/api/reports、api/feedback（M1） | 改路径 |
| `src/pages/moments` | 3 | moments/api（M1） | 改路径 |
| `src/pages/settings` | 2 | ops_governance/api（M1） | 改路径 |
| `src/pages/{dashboard,feedback,messages,ai-hub}` | 4 | dashboard/registry（**M2**）、feedback（M1）、messages/api（M1）、agent-hub/api（**M2**） | 2 待 barrel + 2 改路径 |
| `src/seat` | 1 | customer_service/seat/workbench/SeatWorkspacePage（M1：`public.ts:9` 已导出，纯绕行） | 改路径（最易，单行） |

M1 合计 **52** 条、M2 前置 **14** 条（enterprise_access 8 + reports 3 + dashboard 1 + agent-hub 1，另有 2 条 SELF 见 §2.3）。

逐条明细（文件:行 → 目标，供执行 PR 时勾销）：

<details>
<summary>OUTSIDE 66 条全列（点开）</summary>

```
src/hooks/useSetupGuard.ts:2                → identity/api/setup          (M1)
src/hooks/useSidebarBadges.ts:2             → ops_governance/api/reports  (M1)
src/hooks/useSidebarBadges.ts:3             → ops_governance/api/feedback (M1)
src/pages/ai-hub/AiHubOverviewPage.tsx:10   → agent-hub/api               (M2)
src/pages/auth/LoginPage.tsx:14             → identity/api                (M1)
src/pages/auth/SetupPage.tsx:19             → identity/api/setup          (M1)
src/pages/auth/SetupPage.tsx:20             → identity/api/auth           (M1)
src/pages/billing-invoices/BillingInvoiceListPage.tsx:19       → finance/api (M1)
src/pages/billing-plans/BillingPlanListPage.tsx:25             → finance/api (M1)
src/pages/billing-subscriptions/BillingSubscriptionListPage.tsx:19 → finance/api (M1)
src/pages/channels/ChannelAdminPage.tsx:14  → channels/api                (M1)
src/pages/channels/ChannelDetailPage.tsx:13 → channels/api                (M1)
src/pages/channels/ChannelInvitationPage.tsx:15 → channels/api            (M1)
src/pages/channels/ChannelListPage.tsx:11   → channels/api                (M1)
src/pages/channels/ChannelListPage.tsx:22   → enterprise_access/preset    (M2)
src/pages/channels/ChannelListPage.tsx:23   → enterprise_access/hooks     (M2)
src/pages/channels/ChannelMessagePage.tsx:19 → channels/api               (M1)
src/pages/channels/ChannelOrderPage.tsx:28  → channels/api                (M1)
src/pages/channels/ChannelOrdersDialog.tsx:24 → channels/api              (M1)
src/pages/channels/ChannelSubscriberPage.tsx:13 → channels/api            (M1)
src/pages/channels/PaidChannelOpsPage.tsx:19 → channels/api               (M1)
src/pages/channels/SetChannelPriceDialog.tsx:25 → channels/api            (M1)
src/pages/dashboard/DashboardPage.tsx:22    → dashboard/registry          (M2)
src/pages/feedback/FeedbackListPage.tsx:15  → feedback/api                (M1)
src/pages/groups/GroupAlbumManagePage.tsx:20   → groups/api/enhancements  (M1)
src/pages/groups/GroupCategoryManagePage.tsx:23 → groups/api/enhancements (M1)
src/pages/groups/GroupCategoryManagePage.tsx:24 → groups/api              (M1)
src/pages/groups/GroupDetailPage.tsx:11     → groups/api                  (M1)
src/pages/groups/GroupFileManagePage.tsx:24 → groups/api/enhancements     (M1)
src/pages/groups/GroupGovernanceLogPage.tsx:21 → groups/api/enhancements  (M1)
src/pages/groups/GroupListPage.tsx:11       → groups/api                  (M1)
src/pages/groups/GroupListPage.tsx:23       → enterprise_access/preset    (M2)
src/pages/groups/GroupListPage.tsx:24       → enterprise_access/hooks     (M2)
src/pages/groups/GroupMemberManagePage.tsx:16 → groups/api                (M1)
src/pages/groups/GroupNoticeManagePage.tsx:24 → groups/api/enhancements   (M1)
src/pages/groups/GroupScheduleManagePage.tsx:25 → groups/api              (M1)
src/pages/groups/GroupTagManagePage.tsx:17  → groups/api/enhancements     (M1)
src/pages/groups/GroupTaskListPage.tsx:24   → groups/api                  (M1)
src/pages/groups/GroupTaskManagePage.tsx:31 → groups/api                  (M1)
src/pages/groups/GroupVoteManagePage.tsx:21 → groups/api                  (M1)
src/pages/messages/MessageListPage.tsx:27   → messages/api                (M1)
src/pages/moments/MomentDetailPage.tsx:10   → moments/api                 (M1)
src/pages/moments/MomentListPage.tsx:27     → moments/api                 (M1)
src/pages/moments/MomentReportPage.tsx:38   → moments/api                 (M1)
src/pages/payment-transactions/PaymentTransactionListPage.tsx:24 → finance/api (M1)
src/pages/recharge-orders/RechargeOrderListPage.tsx:24      → finance/api (M1)
src/pages/reports/ReportActionPanel.tsx:26  → ops_governance/api          (M1)
src/pages/reports/ReportCenterPage.tsx:14   → reports/contracts           (M2)
src/pages/reports/ReportCenterPage.tsx:15   → reports/registry            (M2)
src/pages/reports/TargetReportPanel.tsx:35  → reports/contracts           (M2)
src/pages/reports/TargetReportPanel.tsx:46  → ops_governance/api          (M1)
src/pages/roles/RolePermissionPage.tsx:12   → identity/api                (M1)
src/pages/roles/RolePermissionPage.tsx:22   → identity/api                (M1)
src/pages/settings/DDLPage.tsx:16           → ops_governance/api          (M1)
src/pages/settings/VersionPage.tsx:17       → ops_governance/api          (M1)
src/pages/users/UserCollectManagePage.tsx:24 → identity/api               (M1)
src/pages/users/UserDetailPage.tsx:9        → identity/api                (M1)
src/pages/users/UserListPage.tsx:11         → identity/api                (M1)
src/pages/users/UserTagManagePage.tsx:24    → identity/api                (M1)
src/pages/wallets/WalletListPage.tsx:33     → finance/api                 (M1)
src/pages/withdrawals/WithdrawalsPage.tsx:22 → finance/api                (M1)
src/pages/workspaces/ProjectListPage.tsx:19 → enterprise_access/preset    (M2)
src/pages/workspaces/ProjectListPage.tsx:20 → enterprise_access/hooks     (M2)
src/pages/workspaces/WorkspaceListPage.tsx:27 → enterprise_access/preset  (M2)
src/pages/workspaces/WorkspaceListPage.tsx:28 → enterprise_access/hooks   (M2)
src/seat/seatMain.tsx:18                    → customer_service/seat/...   (M1，barrel 已导出)
```
</details>

### 2.3 SELF 2 条（M3：改相对导入）

| 文件:行 | 目标 | 说明 |
|---|---|---|
| `src/modules/dashboard/registry/dashboardPanelRegistry.ts:1` | `@/modules/dashboard/contracts/dashboardPanelExtension` | 模块内 `@/modules/<self>/x` 形态；ratchet 全量化后会被 `@/modules/*/*` pattern 命中（pattern 无法区分 self），须改为 `../contracts/dashboardPanelExtension` |
| `src/modules/reports/registry/reportPanelRegistry.ts:4` | `@/modules/reports/contracts/reportPanelExtension` | 同上 |

### 2.4 R5 扩展点裁定建议（原 ADR 遗留问题）

dashboard/reports 的 `contracts/`+`registry/` 是 R5 点名的 panel 扩展点。本 ADR 建议**不豁免、补 barrel**：contracts（扩展契约类型）与 registry（注册器）是稳定的公共扩展面，经 barrel 导出无副作用，且豁免会在 ratchet 上开洞。barrel 形态建议 `index.ts` 同时转发 `./contracts/*` 与 `./registry/*`，并在 public 面注释声明"扩展点消费亦须经 barrel"。

## 3. eslint ratchet 分阶段收紧路线

仓库既有 ratchet 先例（本设计对齐）：

- **计数式**：`.github/workflows/quality.yml:39-50` ESLint "baseline 37 problems"（grep `✖ N problems` 比对基线，超即红）；typecheck ≤31（:52-61）、knip ≤35（:63-）同款。CONTRIBUTING.md:88 已将三个 ratchet 写入 PR 自检清单。
- **指纹基线式**：`imboy/scripts/check_dialyzer_baseline.sh`（imboy 仓 CI-00，指纹=文件+归一化正文，新增即红、存量减少提示收紧）。

深引 ratchet 采用**行级抑制 + 计数双保险**，分四阶段：

| 阶段 | 动作 | 验收 |
|---|---|---|
| **R0 立规（与清零解耦）** | ① `eslint.config.js` 现有 `@/modules/*/*` pattern 的 files 从 6 处白名单扩为 `src/**/*.{ts,tsx}`（含 `src/modules/**`、`src/seat/**`、`src/widget/**`）；② 动态 import 的 `no-restricted-syntax` 四条同步扩域；③ 现存 78 条生产深引用 **`eslint --suppress` 生成 `eslint-suppressions.json`**（行级抑制，入库）；④ lint 脚本加 `--report-unused-suppressions`（eslint ≥9.7 原生），使"已修复但抑制未删"直接报错 | CI 绿；新增深引（未抑制）即红；已修复深引的残留抑制也红 → 单向棘轮成立 |
| **R1 逐目录清零** | 按 §4 PR 顺序逐域修复，每清一条同步删除对应 suppression 条目 | 该目录在豁免文件中不再出现 |
| **R2 移除豁免** | `eslint-suppressions.json` 深引条目归零后删除文件（或其中该规则段） | 规则裸奔全量，新深引直接 lint error |
| **R3 门禁文档化** | quality.yml 基线注释、PR 模板自检项、verification ADR 状态更新、DESIGN.md 补 seat/widget 两面（原核查 §7 缺口） | 文档与门禁一致 |

**备选机制说明**（若团队不想引入 suppressions 文件）：改用 quality.yml 同款计数 ratchet——`grep -rEc "from ['\"]@/modules/[a-z_-]+/" src --include=*.ts* | awk 求和` ≤ 78 只降不升。缺点是全域一个数、无法定位到域、代码挪行无影响但也不强制清理残留；优点是零新文件。**推荐 suppressions 方案**（行级、强制清残留、与 eslint 生态一致），计数式作过渡期双保险（`problems` 基线 37 本身会随修复下降，注意同步收紧防回弹）。

> 测试豁免口径维持现状（`eslint.config.js:63` ignores `src/**/*.test.ts(x)`，24 条测试深引豁免属合理设计，R5 扩展点契约消费在 `modules.test.ts` 可辩护）；边界 ADR（2026-03-15）需补一句登记该豁免口径（G5）。

## 4. PR 拆分（每 PR 单一模块主题；文件数为预估值）

| 序 | PR 主题 | 内容 | 文件数 | 依赖 |
|---|---|---|---:|---|
| 1 | `refactor(modules): 补齐 4 个缺失 barrel 并相对化模块内自引` | enterprise_access/agent-hub/dashboard/reports 各新增 index.ts（M2 前置）；SELF 2 条改相对导入 | ~7 | 无（纯增量，不改消费方） |
| 2 | `chore(lint): 深引门禁全量化 + 行级抑制基线（ratchet R0）` | eslint.config.js、eslint-suppressions.json、package.json lint 脚本、quality.yml 基线注释 | ~4 | PR-1 之后（SELF 已消除，抑制数最小化） |
| 3 | `refactor(seat): seat 面改 barrel 导入并纳入门禁` | seatMain.tsx:18 单行改 `@/modules/customer_service`（public.ts:9 已导出） | 1-2 | PR-2 |
| 4 | `refactor(channels): channels 页面深引清零（12 条）` | 10 改路径 + 2 改 enterprise_access barrel | ~11 | PR-1 |
| 5 | `refactor(groups): groups 页面深引清零（14 条）` | 12 改路径 + 2 改 enterprise_access barrel | ~10 | PR-1 |
| 6 | `refactor(workspaces): workspaces 页面深引清零（4 条）` | 改 enterprise_access barrel | ~2 | PR-1 |
| 7 | `refactor(finance): billing/wallet 系页面深引清零（7 条）` | 改 finance barrel | ~7 | PR-2 |
| 8 | `refactor(identity): auth/users/roles 页面深引清零（9 条）` | 改 identity barrel | ~8 | PR-2 |
| 9 | `refactor(organization): organization 模块跨引 identity 改 barrel（CROSS #1-3）` | 3 条改路径（含 #8 pureFunctions 转发核实） | ~4 | PR-2 |
| 10 | `refactor(customer_service): CS 模块跨引 organization 改 barrel（CROSS #5-7）` | 3 条改路径 | ~3 | PR-2 |
| 11 | `refactor(enterprise): enterprise_access/enterprise_business 跨引改 barrel（CROSS #4、#9）` | 2 条改路径 | ~2 | PR-2 |
| 12 | `refactor(ops_governance): governance 域深引清零（reports 5 + settings 2 + hooks 3 + CROSS #10 = 11 条）` | 改 ops_governance/moments barrel | ~9 | PR-2 |
| 13 | `refactor(misc): moments/messages/feedback/dashboard/ai-hub/reports 面清零（13 条）` | 改路径（含 reports/dashboard 的 M2 消费） | ~10 | PR-1 |
| 14 | `chore(lint): 移除深引抑制豁免，门禁裸奔（ratchet R2）+ 文档同步（R3）` | 删 suppressions 深引段、更新 quality.yml 基线/PR 模板/两个 ADR/DESIGN.md、env-vars 清理（§6） | ~8 | PR-3..13 全合 |

**工作量**：PR-1 约 0.5 天；PR-2 约 0.5 天（含 CI 调试）；M1 类每条 = 改一行 import + typecheck + 删一条 suppression，整批 52 条约 1 天内完成（机械替换）；M2 类随所属 PR；全路线含 review 约 **3–4 人日**。

## 5. 风险与红线

1. **EntityId 红线（历史教训）**：admin 曾因 `Number(id)` 回转 TSID 丢精度写脏权限数据，已全链路改 `EntityId` string。本次全部修复动作仅改 **import 路径/新增 barrel 转发**，不触碰任何类型定义、序列化与 id 处理逻辑；每个 PR 的验收含 `bun run typecheck` 与既有 ratchet ≤31 不回升。**严禁**借 barrel 重导出时顺手"规整"任何 `EntityId` 类型或 payload 解析。
2. **循环依赖**：当前方向图 `identity ← organization ← {customer_service, enterprise_access, enterprise_business}`、`moments ← ops_governance` 单向无环（核查记录 §4.3）。barrel 化不改依赖方向，仅收敛入口；PR 内跑 `madge`/`dpdm` 类环检测可作可选加固（若仓库无该依赖则人工核对方向图）。
3. **barrel 副作用**：新增 barrel 只做 `export *` 转发纯类型与函数，不引入组件级副作用导入；`export * from './public'` 形态与既有 15 模块一致，不改变 chunk 划分语义（页面级 lazy 由路由面负责）。
4. **门禁全量化的误伤面**：`@/modules/*/*` pattern 扩到 `src/modules/**` 后，模块内自引也会被拦（SELF 2 条已在 PR-1 相对化消除）；`src/widget/**` 当前 0 深引（核查 §5.3），纳入无阻力。
5. **suppressions 的维护纪律**：修复 PR 必须同 PR 删除对应 suppression（`--report-unused-suppressions` 强制），防止豁免文件变成新的垃圾场。

## 6. 关联清理：2 个死环境变量（随 PR-14 或独立小 PR）

复核（2026-09-30，全仓 grep）：两变量在 `src/` 均无代码读取处，仅类型声明、`.env.*` 赋值与文档引用（`docs/env-vars.md:40-44` 已有同日复核记录）。

| 变量 | 出现位置 | 动作 |
|---|---|---|
| `VITE_APP_NAME` | `src/vite-env.d.ts:5`、`.env.development:2`、`.env.production:2` | 删除以上 3 处 |
| `VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL` | `src/vite-env.d.ts:10`、`.env.development:11`、`.env.production:7`、`docs/api-contracts/feedback_workflow_api_contract.md:36`、`:61` | 删除以上 5 处；**同步**更新复核记录 `docs/env-vars.md:40,:44` 与 `docs/env-vars.en.md:41,:45`（合计 9 处） |

注意：该变量被移除后，feedback-workflow 配置保存地址回归契约默认 `/adm/admin/config/feedback-workflow`（feedback 契约文档 :36 的"可通过…覆盖"措辞一并删除），属纯文档行为收敛、无运行时影响（本就无读取方）。

## 7. 完成判定

- `grep -rEn "from ['\"]@/modules/[A-Za-z0-9_-]+/" src --include="*.ts" --include="*.tsx" | grep -v "\.test\."` 输出 0 条；
- `eslint-suppressions.json` 中无 `no-restricted-imports`/`no-restricted-syntax` 深引条目（或文件已删）；
- `bun run lint` / `typecheck` ratchet 基线不高于合入前；
- 死环境变量 9 处清理完毕，env-vars 双语文档同步。
