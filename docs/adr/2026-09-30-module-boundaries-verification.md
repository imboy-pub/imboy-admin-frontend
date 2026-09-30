# 验证记录: Admin Feature Module Boundaries 核查

- Status: Verification Record（只读核查，未修改任何代码/配置/既有文档）
- Date: 2026-09-30
- 关联 ADR: [2026-03-15-admin-feature-module-boundaries.md](./2026-03-15-admin-feature-module-boundaries.md)（Accepted，199 天未复核）
- 核查范围: `src/modules/` 全部 19 个模块目录、`eslint.config.js`、全量 `@/modules/*` import 扫描
- 仓库: `imboyadmin`（独立 git 仓）

---

## 1. 核查方法（可复现命令）

```bash
# A) barrel 覆盖
for d in src/modules/*/; do ls "$d"index.ts >/dev/null 2>&1 && echo "$(basename $d) YES" || echo "$(basename $d) NO"; done

# B) 深路径 import 全量扫描（@/modules/<mod>/<sub> 形式）
grep -rEn "from ['\"]@/modules/[A-Za-z0-9_-]+/" src --include="*.ts" --include="*.tsx"

# C) barrel 合法浅引（@/modules/<mod> 形式）
grep -rEn "from ['\"]@/modules/[A-Za-z0-9_-]+['\"]" src --include="*.ts" --include="*.tsx"
```

分类口径：importing 文件位于 `src/modules/<A>/` 且 target 为 `<B>`——`A==B` 记 SELF（合法自引），`A!=B` 记 CROSS-MODULE（跨模块深引，违规）；importing 文件不在 `src/modules/` 下记 OUTSIDE（模块外深引，违反 barrel 收敛）。

## 2. ADR 规则提取（可机械核查项）

ADR 决策涉及四条可机械核查的规则：

| # | 规则 | 来源措辞 |
|---|------|---------|
| R1 | 领域模块壳 + public barrel 收敛（页面/API/hooks/routes 收敛到同一模块目录） | "以领域模块壳、public barrel 和模块内聚的 API/hooks/routes 为主线收敛结构" |
| R2 | 模块外只经 barrel 导入，不深入模块内部 | "防止新增代码继续绕过模块边界" |
| R3 | 旧全局入口（pages/services/components）保留为薄封装直至收敛完成 | "保留为薄封装，直到调用点和验证收敛完成" |
| R4 | 边界门禁（后续任务） | "边界门禁会在后续任务中加入" |
| R5 | 插件化仅用于高变化扩展点（dashboard panel、report panel） | Non-Goals 及 Decision 段 |

## 3. eslint 门禁落地状态（R4）

**结论：已落地，但为窄口径白名单式强制，覆盖面与实际代码结构存在显著差距。**

`eslint.config.js` 中已有两段门禁：

1. **静态 import**（`no-restricted-imports` patterns，第 54-120 行）：
   - 禁 `@/modules/*/*` 深引（"Import module surfaces from `@/modules/<domain>` only"）→ 对应 R2。
   - 禁直引旧全局入口 `@/pages/{auth,users,roles,reports,feedback,channels,messages,moments,groups}/*` 与 `@/services/api/{auth,users,roles,reports,feedback,versions,ddl,channels,messages,moments,groups,groupEnhancements}` → 对应 R3。
2. **动态 import()**（`no-restricted-syntax` ImportExpression selector，第 121-139 行）：与静态等价的四条补充 → 门禁设计完整考虑了 lazy route。

**关键限制——生效文件范围（第 55-62 行 files 列表）仅限：**

```
src/App.tsx, src/components/**, src/stores/**,
src/pages/admins/**, src/pages/logs/**, src/pages/settings/SettingsHomePage.tsx
```

并显式 `ignores: src/**/*.test.ts(x)`（测试豁免）。

**门禁覆盖范围内违规数：0**（对上述 files 逐一 grep 验证）。即：门禁所辖范围内是干净的，但门禁不辖的范围内有大量存量违规（见第 5 节）。

## 4. 统计结果

### 4.1 模块与 barrel（R1）

- `src/modules/` 下 **19 个模块目录**（任务预估"约 21"；**`workspaces` 模块不存在**，最接近的是页面目录 `src/pages/workspaces/`，非模块）。
- **15/19 有 `index.ts` barrel**；**4 个缺失**：

| 模块 | 目录内容 | 评估 |
|------|---------|------|
| `dashboard` | contracts/ + registry/ | R5 点名的 panel 扩展点；无 barrel 使消费方被迫深引 contracts/registry |
| `reports` | contracts/ + registry/ | 同上 |
| `agent-hub` | api.ts + api.test.ts | 纯 API 模块，无 barrel，消费方（pages/ai-hub）被迫深引 api.ts |
| `enterprise_access` | hooks.ts + preset.ts | 无 barrel；被 pages/channels、pages/groups、pages/workspaces 深引共 8 处 |

### 4.2 深路径 import 全量统计

| 类别 | 条数 | 说明 |
|------|-----:|------|
| 深引总量（`@/modules/<mod>/<sub>`） | 102 | 全 src/ 扫描 |
| ├─ 其中 `.test.ts(x)` | 24 | eslint ignores 豁免；含 `modules.test.ts`（边界验证测试本身）深引 dashboard/reports contracts+registry（R5 扩展点契约消费，可辩护）及 identity/social_graph api |
| └─ 生产代码 | 78 | 见下拆分 |
| &nbsp;&nbsp;&nbsp;├─ SELF（模块自引，合法） | 2 | — |
| &nbsp;&nbsp;&nbsp;├─ CROSS-MODULE（跨模块深引，**违规**） | **10** | 清单见 5.1 |
| &nbsp;&nbsp;&nbsp;└─ OUTSIDE（模块外深引，违反 R2） | **66** | 分布见 5.2 |
| barrel 合法浅引（`@/modules/<mod>`） | 11 | 合规路径的使用量远小于深引 |

### 4.3 依赖方向（R2 补充观察）

生产代码跨模块深引构成的方向图：

```
identity ← organization ← { customer_service(×4), enterprise_access(×1), enterprise_business(×1) }
moments ← ops_governance(×1)
```

- `identity` 为最底层依赖；未见**循环依赖**（好消息）。
- 但方向约束目前纯靠惯例，无任何 lint 规则表达"允许谁依赖谁"。

## 5. 违规清单

### 5.1 跨模块深引（CROSS-MODULE，生产代码 10 条）

| # | 文件:行 | 深引目标 |
|---|--------|---------|
| 1 | `src/modules/organization/components/UserSearchSelect.tsx:8` | `@/modules/identity/api/...` |
| 2 | `src/modules/organization/pages/OrganizationCreateDialog.tsx:13` | `@/modules/identity/...` |
| 3 | `src/modules/organization/pages/OrganizationCreateDialogV2.tsx:11` | `@/modules/identity/...` |
| 4 | `src/modules/enterprise_access/hooks.ts:7` | `@/modules/organization/...` |
| 5 | `src/modules/customer_service/pages/CustomerServiceHomePage.tsx:47` | `@/modules/organization/...` |
| 6 | `src/modules/customer_service/pages/useOrgWorkspaceScope.ts:24` | `@/modules/organization/...` |
| 7 | `src/modules/customer_service/pages/CsProvisioningWizardPage.tsx:25` | `@/modules/organization/...` |
| 8 | `src/modules/customer_service/pages/CsProvisioningWizardPage.tsx:26` | `@/modules/organization/...` |
| 9 | `src/modules/enterprise_business/pages/useOrgWorkspaceOptions.ts:9` | `@/modules/organization/...` |
| 10 | `src/modules/ops_governance/api/reports.ts:9` | `@/modules/moments/...` |

其中 8 条（#4-#9 与 #1-#3 涉及的 identity/organization）的目标模块**均有 barrel**，存在合规替代路径，属确凿违规。测试文件另有 1 条（`src/modules/identity/api/identity.test.ts:18 → messages`，豁免范围内）。

### 5.2 模块外深引（OUTSIDE，生产代码 66 条，按分布）

| 来源 | 条数 | 深引目标模块 |
|------|-----:|-------------|
| `src/pages/groups` | 14 | groups, enterprise_access |
| `src/pages/channels` | 12 | channels, enterprise_access |
| `src/pages/reports` | 5 | ops_governance, reports |
| `src/pages/workspaces` | 4 | enterprise_access |
| `src/pages/auth` / `users` / `roles` | 7 | identity, social_graph |
| `src/pages/{billing-*,wallets,recharge-orders,withdrawals,payment-transactions}` | 7 | finance |
| `src/hooks` | 3 | identity, ops_governance |
| `src/pages/moments` | 3 | moments |
| `src/pages/settings` | 2 | ops_governance |
| `src/pages/{dashboard,feedback,messages,ai-hub}` | 4 | 各自对应模块 |
| `src/seat` | 1 | customer_service（见 5.3） |
| **合计** | **66** | |

### 5.3 焦点案例：seat 面绕行已导出 barrel

`src/modules/customer_service/public.ts:9` **已通过 barrel 导出**坐席工作台：

```ts
export { SeatWorkspacePage, SEAT_WORKSPACE_ROUTE } from './seat'
```

但 `src/seat/seatMain.tsx:18` 仍深引内部路径：

```ts
import { SeatWorkspacePage } from "@/modules/customer_service/seat/workbench/SeatWorkspacePage";
```

合规路径已存在却被绕行，属最易修复的违规（单行改 barrel 导入）。且 `src/seat/`、`src/widget/` 两个新 UI 面**完全不在 eslint 门禁 files 列表内**（`src/widget/` 当前无 `@/` 深引，0 违规）。

## 6. ADR 规则 vs eslint 实际强制差距

| 差距 | 说明 |
|------|------|
| G1 生效范围窄 | `@/modules/*/*` 禁令只作用于 6 处白名单文件；`src/pages/**` 其余 14 个目录（66 条 OUTSIDE 主体）、`src/services/**`、`src/hooks/**`、`src/seat/**`、`src/widget/**` 均在盲区 |
| G2 模块间互引无约束 | 现有规则的 files 列表不含 `src/modules/**`，10 条 CROSS 深引（含新模块 customer_service→organization ×4、organization→identity ×3）无任何 lint 拦截 |
| G3 新模块无旧入口禁令 | patterns 只覆盖 identity/ops_governance/channels/messages/moments/groups 六域的旧 pages/services 入口；customer_service、organization、enterprise_*、finance、social_graph、agent-hub、ai_agent、bots、dashboard、plugin_management 无对应条目（这些模块多数无旧全局入口包袱，但一旦出现绕行即无门禁） |
| G4 barrel 缺失使 R2 无法闭环 | agent-hub、enterprise_access 有消费方被迫深引；dashboard/reports 的 contracts/registry 无 barrel（R5 扩展点是否豁免 barrel 需 ADR 补充说明） |
| G5 测试豁免未登记 | `ignores: src/**/*.test.ts(x)` 使 24 条测试深引合规，属合理设计但 ADR 未提及该豁免口径 |

**总评**：R4"边界门禁"已落地为**窄口径白名单**——门禁范围内 0 违规（设计有效），但覆盖了存量违规最密集的 `src/pages/**` 与模块间互引之外的部分；生产代码现存 **76 条不受门禁约束的深引**（66 OUTSIDE + 10 CROSS）。

## 7. 关联发现（DESIGN.md 缺口）

- `DESIGN.md`（最后更新 2026-06-30）**零提及** `customer_service`、`seat`、`widget`、客服、坐席（`grep -nE "customer_service|seat|widget|客服|坐席" DESIGN.md` 无命中）。
- 现存两个无设计规范覆盖的新 UI 面：
  - **坐席工作台**：`src/modules/customer_service/seat/`（`SeatWorkspacePage`，独立 Seat JWT 域 + QR 登录门，路由面由 App 挂载，见 `public.ts:8` 注释）；
  - **widget 嵌入面**：`src/widget/`（独立入口目录）。
- 两面均脱离"内部管理后台"的原始设计语境（面向外部坐席/嵌入宿主），DESIGN.md 的色彩/间距/组件规范是否适用未经确认。本记录只登记缺口，不改 DESIGN.md。

## 8. 结论

- **ADR 边界规则落地度：部分落地。** barrel 结构 15/19；eslint 门禁已建（含动态 import 补丁，设计完整）但生效范围为窄口径白名单；门禁范围内 0 违规，范围外生产代码 76 条深引（10 跨模块 + 66 模块外）不受约束。
- **跨模块违规 10 条**（其中 8 条目标模块有 barrel、存在合规替代路径）；**模块外深引 66 条**，集中在 `src/pages/{groups,channels}`（26 条）与 finance/billing 系列页面（7 条）。
- **无循环依赖**；方向图 identity ← organization ← {customer_service, enterprise_*} 单向。
- **最小修复顺序建议**（本次未执行）：1) seatMain.tsx 单行改 barrel 导入；2) 补 4 个缺失 barrel；3) 将门禁 files 扩为 `src/**`（`@/` 别名深引 pattern 不影响模块内相对导入）；4) 追加 `src/modules/**` 内跨模块深引 pattern 与新模块旧入口禁令。
