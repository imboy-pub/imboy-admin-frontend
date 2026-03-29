# Admin Frontend Module Map

> Date: 2026-03-15
> Scope: admin React app domain modules, public barrels, and extension-point boundaries

## Module Layout

- `src/core`
  - app-wide primitives such as auth shell, app bootstrap, shared runtime policies, and stable cross-domain infrastructure
- `src/modules/*`
  - domain modules that own their page exports, API adapters, hooks, schemas, registries, and feature routes
- `src/app`
  - top-level app composition, route wiring, shell layout, and startup integration

## Hard Rules

- Pages, API, hooks, schemas, and feature routes for one domain should live under the same module.
- External imports should prefer `src/modules/<domain>/index.ts` or other explicit public barrels rather than internal module files.
- Extension registries are narrow and in-repo only; they are for high-change dashboard/report panels, not for core auth, routing, or admin consistency flows.

## Initial Domain Targets

| Domain | Current roots | Future public entry |
|---|---|---|
| Channels | `src/pages/channels/`, `src/services/api/channels.ts` | `src/modules/channels/public.ts` |
| Messages | `src/pages/messages/`, `src/services/api/messages.ts` | `src/modules/messages/public.ts` |
| Moments | `src/pages/moments/`, `src/services/api/moments.ts` | `src/modules/moments/public.ts` |
| Groups | `src/pages/groups/`, `src/services/api/groups.ts` | `src/modules/groups/public.ts` |
| Identity | `src/pages/auth/`, `src/pages/users/`, `src/pages/roles/`, `src/modules/identity/api/{auth,users,roles}.ts` | `src/modules/identity/public.ts` |
| Social graph | `src/pages/users/`, `src/modules/social_graph/api/{tags,collects}.ts` | `src/modules/social_graph/public.ts` |
| Reports and governance | `src/pages/reports/`, `src/pages/feedback/`, `src/pages/settings/`, `src/modules/ops_governance/api/{reports,feedback,versions,ddl}.ts` | `src/modules/ops_governance/public.ts` |

## Migration Note

Task 2 establishes the map and public-entry rule first. Physical page moves happen later, after module barrels and compatibility layers are in place.

Compatibility re-export files such as `src/services/api/auth.ts`, `src/services/api/users.ts`, `src/services/api/roles.ts`, `src/services/api/reports.ts`, `src/services/api/feedback.ts`, `src/services/api/versions.ts`, and `src/services/api/ddl.ts` remain temporary adapters for older imports and are not the ownership boundary anymore.
