# Environment Variables Reference

> **Last updated**: 2026-09-30
> Sources of truth: `package.json`, `src/vite-env.d.ts`, actual `import.meta.env` reads, `.env.development` / `.env.production` / `.env.e2e.example`.
> This document is an extraction; when in conflict, code and env files win.
>
> **Languages**: [简体中文](./env-vars.md)（authoritative） | English

---

## 1. Build-time variables (Vite, `VITE_` prefix)

Loaded from: `.env.development` (`bun run dev`), `.env.production` (`bun run build`).
Both files are **committed to the repo** and contain no sensitive values; runtime-sensitive config is always held by the backend.
Type declarations: `src/vite-env.d.ts`.

### Base configuration

| Variable | Required | Default/example | Read at | Description |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | no (code default) | `/api/adm`; production `__IMBOY_API_HOST__/api/adm` (placeholder replaced at deploy time) | `src/services/api/client.ts`, `src/services/api/systemHealth.ts`, `src/modules/messages/api/public.ts` | Backend admin API base URL |
| `VITE_SIDEBAR_CONFIG_URL` | no (but strongly recommended in dev) | code fallback `/sidebar-menu.json` | `src/services/api/adminConfig.ts` | Sidebar menu config endpoint. ⚠️ In dev it must point at the real backend `/api/adm/admin/config/sidebar`, otherwise the menu ≠ production (once lost the whole "Enterprise" group, EADM-07 lesson); `.env.development` already sets the correct value |
| `VITE_UX_EVENT_REPORT_URL` | no | set to `/api/adm/admin/ux/events` in `.env` | `src/services/api/uxTelemetryReporter.ts` | UX telemetry report endpoint |
| `VITE_FEEDBACK_WORKFLOW_CONFIG_URL` | no | set to `/admin/config/feedback-workflow` in `.env` | `src/services/api/feedbackWorkflowConfig.ts` | Feedback workflow config read endpoint |
| `VITE_CS_WIDGET_ORIGIN` | production only (CS widget) | `https://cs.imboy.pub` | `src/modules/customer_service/widgetConfig.ts` | Host origin for the CS agent widget, used in `build:widget` scenarios |

### Endpoint overrides (all optional, code has built-in defaults)

Set these only when admin endpoints must move to non-default paths; all go through `resolveEndpoint(env, DEFAULT_*)`:

| Variable | Read at |
|---|---|
| `VITE_ROLE_LIST_ENDPOINT` / `VITE_ROLE_CREATE_ENDPOINT` / `VITE_ROLE_PERMISSION_SAVE_ENDPOINT` / `VITE_ROLE_DISABLE_ENDPOINT` / `VITE_ROLE_DELETE_ENDPOINT` | `src/modules/identity/api/roles.ts` |
| `VITE_ADMIN_LIST_ENDPOINT` / `VITE_ADMIN_CREATE_ENDPOINT` / `VITE_ADMIN_DISABLE_ENDPOINT` / `VITE_ADMIN_ASSIGN_ROLE_ENDPOINT` | `src/services/api/admins.ts` |

### ⚠️ Declared but never read (stale)

| Variable | Status |
|---|---|
| `VITE_APP_NAME` | exists only in `.env.*` and the `src/vite-env.d.ts` type declaration; no code reads it |
| `VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL` | same (only the read-side `..._CONFIG_URL` is consumed) |

Removal is a code change; this document only records the facts. Before editing `.env`, check the read locations above.

> Re-verified 2026-09-30: repo-wide grep confirms neither variable has a code read site (only `.env.*`, `src/vite-env.d.ts` type declarations, and doc references; `VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL` is also mentioned in `docs/api-contracts/feedback_workflow_api_contract.md` — sync that when cleaning up).

---

## 2. E2E test variables (Playwright, `IMBOY_ADMIN_E2E_*` / `IMBOY_*`)

Template: copy `.env.e2e.example` to `.env.e2e` and fill in (`.env.e2e` is gitignored, never committed).

### Required (before `bun run test:e2e`)

| Variable | Example | Description |
|---|---|---|
| `IMBOY_ADMIN_E2E_ACCOUNT` / `IMBOY_ADMIN_E2E_PASSWORD` | `admin` / `password` | Admin login credentials (against a real backend) |
| `IMBOY_ADMIN_E2E_SUPER_ACCOUNT` / `IMBOY_ADMIN_E2E_SUPER_PASSWORD` | `admin` / `password` | Super-admin credentials (role/permission cases) |
| `IMBOY_ADMIN_BASE_URL` | `http://127.0.0.1:9800/api/adm` | Admin API base URL of the backend under test |

### Optional per scenario

| Variable | Description |
|---|---|
| `IMBOY_ADMIN_E2E_BASE_URL` | Frontend URL under test, default `http://127.0.0.1:8082`; `test:e2e:prod` also uses it to override the target |
| `IMBOY_ADMIN_E2E_PORT` | Local E2E server port |
| `IMBOY_ADMIN_E2E_READONLY_ACCOUNT` / `_READONLY_PASSWORD` | Read-only admin (read-only permission regression) |
| `IMBOY_ADMIN_E2E_CAPTCHA` | Captcha bypass value, fixed `1234`; backend needs `{captcha_test_mode, true}` or `IMBOY_CAPTCHA_BYPASS=1234` (see `.env.e2e.example` header) |
| `IMBOY_ADMIN_E2E_CHANNEL_ID` | Target channel ID for channel cases |
| `IMBOY_ADMIN_E2E_NEW_ADMIN_PREFIX` / `_NEW_ADMIN_PASSWORD` | Prefix/password for new-admin cases |
| `IMBOY_ADMIN_E2E_CREATE_ADMIN_ROLE_NAME` / `_ASSIGN_ROLE_NAME` | Target role names for role cases |
| `IMBOY_ADMIN_E2E_NEW_ROLE_PREFIX` / `_NEW_ROLE_DESCRIPTION` / `_ROLE_PERMISSION_KEY` | New-role case parameters |
| `IMBOY_ADMIN_E2E_ORG_SEED_NAME` / `_EADM_ORG_ID` / `_EADM_WS_ID` | Enterprise domain (EADM) case seed data |
| `IMBOY_ADMIN_E2E_PLUGIN_LOCATION_PATH` / `_OWNER_SEARCH_KEYWORD` / `_SEED_INVITEE_ID` / `_SCENARIO_MANIFEST` | Plugin/search/scenario-manifest case parameters |
| `IMBOY_TEST_SCENARIO_MANIFEST` | Scenario manifest JSON path (default `tests/e2e/fixtures/three-end-first-batch.local.json`, see example) |
| `IMBOY_E2E_REAL_BACKEND` | Declares the case needs a real backend (specs without backend/credentials auto-skip) |

> Backend-side scripts (diagnostic tools under `scripts/`) also read `IMBOY_REPO_DIR`, `IMBOY_ADMIN_COOKIE` etc.; ops-only, not part of the dev setup.

---

## 3. Checklist

- [ ] Local dev: no new env file needed, `.env.development` already has usable defaults
- [ ] E2E: `cp .env.e2e.example .env.e2e` and fill in local backend credentials
- [ ] Production build: confirm the `__IMBOY_API_HOST__` placeholder in `.env.production` is replaced by the deploy flow (see `Dockerfile`)
- [ ] New `VITE_*` variable: update the `src/vite-env.d.ts` type declaration + this document
