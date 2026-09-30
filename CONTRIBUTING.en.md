# Contributing

> **Last updated**: 2026-09-30
>
> **Languages**: [简体中文](./CONTRIBUTING.md)（authoritative） | English

## Development Environment

| Tool | Version | Notes |
|---|---|---|
| bun | **1.3.6** (CI-anchored, see `BUN_VERSION` in `.github/workflows/ci.yml`) | Package manager / test runner / script runtime; this repo does **not** use npm/yarn/pnpm |
| Node | not declared by the repo (no `engines` field in `package.json`) | No standalone requirement; Playwright uses its bundled runtime. If Node is installed locally, current LTS is recommended |
| Backend | local imboy backend, default `http://127.0.0.1:9800` | Most feature pages and E2E need a real backend |

```bash
bun install
bun run dev        # http://127.0.0.1:8082, /api/adm etc. proxied to local backend
```

## Command Quick Reference

<!-- AUTO-GENERATED: START (source: package.json scripts; full table in README.md) -->

| Command | Description |
|---|---|
| `bun run dev` | Dev server |
| `bun run build` | Production build (`tsc -b && vite build`) |
| `bun run build:widget` | Customer-service widget build (widget + widget-loader + seat + manifest) |
| `bun run test` | Unit tests (= `bun test --isolate`, **never run bare `bun test`**) |
| `bun run test:e2e` | Playwright end-to-end tests |
| `bun run lint` / `lint:fix` | ESLint check / auto-fix |
| `bun run typecheck` | TypeScript type check |
| `bun run deadcode` | knip dead-code detection |
| `bun run check` | lint + typecheck + deadcode combined gate |

<!-- AUTO-GENERATED: END -->

Full command table (E2E config variants, widget verification): [README.md — Common Commands](./README.md).

## Testing Workflow

### Unit tests

```bash
bun run test
```

- Actually runs `bun test --isolate`. `--isolate` must be kept: by default bun shares one global object and module table across all test files, so cross-file mock/DOM leakage causes false "Found multiple elements" failures (verified: bare `bun test` has false reds, `--isolate` is all green).
- Unit tests scan `src/` only (`bunfig.toml` `[test] root`); Playwright specs live in `tests/e2e/` and never interfere.

### E2E (Playwright)

```bash
cp .env.e2e.example .env.e2e      # fill in local backend credentials (.env.e2e is gitignored)
bun run test:e2e:install          # first time: install chromium
bun run test:e2e
```

- Environment variable reference: [docs/env-vars.en.md](./docs/env-vars.en.md).
- Specs without backend/credentials auto-skip; `test:e2e:prod` is a production health check, run with care.

### Git hooks (lefthook)

| Stage | Checks |
|---|---|
| `pre-commit` | runs `bunx eslint --max-warnings=0` on staged `src/**`; gitleaks secret scan |
| `pre-push` | `bun run lint` + `bun run test` (same convention as CI; e2e left to CI) |

After a fresh clone you must configure the push upstream, otherwise pre-push silently skips with "no matching push files" (see `lefthook.yml` header note).

## Code Style

Source of truth: [eslint.config.js](./eslint.config.js). Highlights:

- Base: `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` (Vite preset).
- Unused variables: `_` prefix exempts (params, catch, destructuring all apply).
- **Module boundaries (key rule)**: pages/components/stores must not deep-import `@/modules/<domain>/internal paths`; only import from the `@/modules/<domain>` public entry. Likewise `@/services/api/*` domain files are funneled into their owning module. Dynamic `import()` is under the same constraint (`no-restricted-syntax` backstop).
- `src/pages|components|stores` must not import `getApiPayload` from `services/api/responseAdapter`; payload parsing is consolidated in the service layer.
- pre-commit runs with `--max-warnings=0`; zero warnings tolerated.

Type and architecture conventions (TSID/`EntityId`, pagination, payload-first): see [CLAUDE.md](./CLAUDE.md).

## Commits & PRs

1. Commit messages follow conventional prefixes (`feat:` / `fix:` / `test:` / `docs:` / `chore:` etc.; see `git log` for reference).
2. Self-check before committing: `bun run check` (lint + typecheck + knip) and `bun run test` all green.
3. PR descriptions use the template [.github/pull_request_template.md](./.github/pull_request_template.md); its self-review checklist covers:
   - Conventions: `EntityId`, `DataTablePagination`, module boundaries, bilingual documentation rule
   - Quality gates: lint (ratchet ≤10), typecheck (ratchet ≤31), knip (ratchet ≤35), unit tests green, E2E key flows
   - Contract changes: cross-repo (imboy / imboyapp) synchronized release requirement
   - Security: no hardcoded credentials (gitleaks), no leftover `console.log`
4. CI (`.github/workflows/`): `quality.yml` (lint+tsc+knip+secrets), `sonar.yml`, `ci.yml`, `admin-e2e.yml`; all status checks must pass before merge.
