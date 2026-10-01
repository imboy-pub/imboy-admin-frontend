# 组织架构图浏览器验证 / Organization chart browser verification

English summary: Real Chromium rendering exposed mobile content overflow in the department chart and shared breadcrumb. One constrained grid column and wrapping breadcrumbs fix the actual layout causes. The chart now starts at the enterprise node and offers a native return-to-enterprise action. Tests use synthetic intercepted APIs; they do not establish backend or production readiness.

- Source base: `ed18b3d51b87a25ae25f54fed8d0c6e461c5844f`.
- Contract: backend implementation-contract-v2.md, SHA256 `7331846159fc0ab61a1a8be248c52e9a8d81581a3fa7a01c9fb0a49723a98599`; UX-03 partial.
- Preferred autoglm-browser-agent was checked and unavailable (unknown MCP server); existing project Playwright used instead. No extension or dependency installed.
- Initial harness incorrectly intercepted Vite source paths containing `/api/`; corrected to URL-path API prefixes and explicit brand root. Ancillary feature/license/report/feedback responses are synthetic fixtures. Unknown API requests abort and fail the final assertion. Page runtime errors also fail.
- Valid layout baseline: desktop and dark large text passed; 390px mobile main content measured 2564px. Setting the mobile grid column reduced that to 456px, exposing a separate shared breadcrumb overflow. Native flex wrapping fixes the latter; enterprise breadcrumb labels now use Chinese and retain exact string ID links.
- Native scrollIntoView centers the actual enterprise root on entering the chart and returning to it, including vertical positioning for large text. It does not alter selection or data, and selection rerenders do not recenter the diagram.

## 检查 / Checks

- `IMBOY_ADMIN_E2E_PORT=18862 IMBOY_ADMIN_E2E_BASE_URL=http://127.0.0.1:18862 bunx playwright test tests/e2e/organization-chart.mock.spec.ts --workers=1 --reporter=list --output=/tmp/gz-org-chart-browser-finish`: 3 pass, no skipped. Desktop 1440px, mobile 390px and dark 1440px with 32px root text (200%). Six screenshot files.
- Browser oracles: exact department count, actual scroll width of both document and main content, diagram local horizontal scrolling, enterprise root in viewport, deepest node navigable, minimum 44px target (88px at 200%), selected full hierarchy path, directory selection preserved, return-to-enterprise root visible, no unexpected API calls or runtime errors.
- `bun run test src/components/shared/shared.test.tsx src/modules/organization/pages/OrganizationDepartmentsPage.test.tsx src/modules/organization/pages/DepartmentOrganizationChart.test.tsx`: 100 pass, zero fail; controlled responders and DOM tests. Exact 19-digit breadcrumb URL regression included.
- Scoped ESLint: exit 0. `bun run build`: exit 0 including TypeScript compilation. Existing dialog-description and dynamic-import notices remain in logs.
- Manual source review only; no independent agent review claimed. Both shared breadcrumb and department view use existing navigation and data authorization; no API or permission changes.

Evidence: evidence/organization-chart-browser-2026-10-01/ with sha256.txt.

## 边界 / Limits

This proves browser layout and controlled UI interactions on the development server, not a live backend organization lifecycle or real-device App. Department member management, OA/device journeys, full six-goal ledger and production qualification remain open. A 16-node fixture with four department levels does not prove large-organization performance. No external notifications, production writes or deployments were performed.
