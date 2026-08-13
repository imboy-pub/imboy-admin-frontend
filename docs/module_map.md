# Admin Frontend Module Map

> Date: 2026-08 (rewritten from the 2026-03-15 plan to reflect the completed modular layout)
> Scope: admin React app domain modules, public barrels, and extension-point boundaries

## Module Layout

- `src/modules/*`
  - Domain modules that own their page exports, API adapters, hooks, schemas, registries, and feature routes. Each module exposes a public barrel (`public.ts`) that is the ownership boundary for external importers.
- `src/services/api/`
  - Shared HTTP client (`client.ts`, with token refresh and response adapter) plus cross-domain and small services not yet promoted into a module.
- `src/pages/`
  - Route-level page components.

## Hard Rules

- Pages, API, hooks, schemas, and feature routes for one domain should live under the same module.
- External imports should prefer `src/modules/<domain>/public.ts` (or `src/modules/<domain>/index.ts`) rather than internal module files.
- Extension registries are narrow and in-repo only; they are for high-change dashboard/report panels, not for core auth, routing, or admin consistency flows.

## Domain Modules

Modules with a public barrel (the ownership boundary):

| Domain | Module | Public barrel | API sources |
|---|---|---|---|
| Channels | `src/modules/channels` | `channels/public.ts` | `api/index.ts` |
| Messages | `src/modules/messages` | `messages/public.ts` | `api/index.ts` |
| Moments | `src/modules/moments` | `moments/public.ts` | `api/index.ts` |
| Groups | `src/modules/groups` | `groups/public.ts` | `api/enhancements.ts`, `api/index.ts` |
| Identity | `src/modules/identity` | `identity/public.ts` | `api/auth.ts`, `api/users.ts`, `api/roles.ts`, `api/index.ts` |
| Social graph | `src/modules/social_graph` | `social_graph/public.ts` | `api/tags.ts`, `api/collects.ts`, `api/index.ts` |
| Ops & governance | `src/modules/ops_governance` | `ops_governance/public.ts` | `api/reports.ts`, `api/feedback.ts`, `api/versions.ts`, `api/ddl.ts`, `api/index.ts` |
| AI agent | `src/modules/ai_agent` | `ai_agent/public.ts` | `api/index.ts`, `pages/` |
| Finance | `src/modules/finance` | `finance/public.ts` | `api/index.ts` |

Extension-point modules (registry/contracts only, no public barrel):

| Domain | Module | Layout |
|---|---|---|
| Dashboard panels | `src/modules/dashboard` | `contracts/`, `registry/` |
| Report panels | `src/modules/reports` | `contracts/`, `registry/` |
| Plugin management | `src/modules/plugin_management` | `api/`, `pages/` |

## Migration Note

The modular migration outlined in the original 2026-03-15 plan is complete:

- Domain logic lives under `src/modules/<domain>/` and is imported through `public.ts` barrels.
- The former `src/services/api/*.ts` compatibility adapters for domain concerns (e.g. `auth.ts`, `users.ts`, `roles.ts`, `reports.ts`, `feedback.ts`, `versions.ts`, `ddl.ts`) have been removed; their capabilities moved into the corresponding modules.
- `src/services/api/` now holds only the shared HTTP client and cross-domain services.
- `src/core` and `src/app` (proposed in the original plan) were not adopted; app composition and route wiring live in `src/App.tsx` (entry `src/main.tsx`) instead.
