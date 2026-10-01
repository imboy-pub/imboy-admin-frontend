# 企业组织架构图阶段验证 / Organization chart progress

English summary: Admin now offers a connected department chart using the existing authorized directory query, filtering, sorting, selection and mutation handlers. No dependency, API, membership permission or database change was introduced. This is focused local UI evidence, not browser, real-device or production acceptance.

- Source base: `381df923fadb0da997f9cd5476f6a1f8e5eaeb90`.
- Contract: backend `docs/design/2026-09-30-guangzhou-enterprise-ux/implementation-contract-v2.md`, SHA256 `7331846159fc0ab61a1a8be248c52e9a8d81581a3fa7a01c9fb0a49723a98599`; UX-03 partial progress.
- Existing department tree builder is reused. Only departments whose actual parent is null connect to the enterprise root. Missing-parent and cycle-promoted branches are shown separately with an explicit relationship warning, avoiding fabricated enterprise edges. Each node remains reachable once after the existing cycle guard.
- Directory remains available; switching preserves selection. Chart uses current search/status/sort filters and includes archived labels. Node buttons preserve string EntityId values, expose pressed selection, support keyboard focus and have a minimum 44px height. The chart region is keyboard focusable and horizontally scrollable.
- New diagram introduces no write path. Clicking selects the existing details panel; its existing read/write authorization and mutation handlers remain authoritative. No guessed member counts are displayed.
- Product copy now explains actions without protocol codes or internal CAS/error mapping details.

## 检查 / Checks

1. Baseline: added chart-navigation test failed because the chart toggle did not exist (baseline.txt).
2. `bun run test src/modules/organization/pages/OrganizationDepartmentsPage.test.tsx src/modules/organization/pages/DepartmentOrganizationChart.test.tsx`: 12 pass, 0 fail. Controlled API responders, not live backend evidence. Includes selected detail parity, search ancestor path, read-only actions, denied-read no organization query, >2^53 ID preservation, missing parent/cycle isolation, archived and keyboard-region semantics.
3. Scoped ESLint: exit 0 after fixing an unused callback type parameter.
4. `bun run build`: exit 0; includes TypeScript compilation. Existing unrelated dynamic-import notices remain.
5. Manual source review: data gates precede both views; reuse of callbacks keeps mutation CAS unchanged. No independent agent review claimed.

Evidence: `evidence/organization-chart-2026-10-01/`, hashes in sha256.txt.

## 未完成 / Outstanding

No actual browser screenshot, dark/light layout rendering, large department stress case, real backend management journey, device or release gate was run. The full six-goal acceptance remains open; this does not prove production readiness. Existing dialog-description warnings in the reused page remain visible in focused logs.
