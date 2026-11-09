# Contributing

> **Last updated**: 2026-10-12
>
> **Languages**: [简体中文](./CONTRIBUTING.md)（authoritative） | English

## Development Environment

| Tool | Version | Notes |
|---|---|---|
| bun | **1.3.14** (CI-anchored, see `BUN_VERSION` in `.github/workflows/ci.yml`) | Package manager / test runner / script runtime; this repo does **not** use npm/yarn/pnpm |
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
| `bun run licenses:generate` / `licenses:check` | Third-party license inventory generation / sync check |
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
   - Quality gates: lint (ratchet ≤37), typecheck (ratchet ≤31), knip (ratchet ≤35), unit tests green, E2E key flows
   - Contract changes: cross-repo (imboy / imboyapp) synchronized release requirement
   - Security: no hardcoded credentials (gitleaks), no leftover `console.log`
4. CI (`.github/workflows/`): `quality.yml` (lint+tsc+knip+secrets), `ci.yml`, `admin-e2e.yml`, `widget-pairing.yml` (cross-repo widget asset pairing gate); all status checks must pass before merge.

## Automated security scanning

[Security Scan](./.github/workflows/security-scan.yml) runs on pushes to `main` / `dev`, pull requests targeting either branch, and manual dispatch. A push to another branch alone does not trigger it; subsequent PR updates do. It scans the checked-out workspace, not only newly introduced findings or the entire Git history.

- Semgrep CE uses `p/security-audit`, `p/secrets`, and `p/owasp-top-ten`. All rule severities are reported; `HIGH` / `CRITICAL` and legacy `ERROR` findings fail the check. Semgrep rule severity is not a CVSS rating.
- Trivy explicitly enables `vuln,misconfig,secret` for dependencies, supported configurations, and secrets. It reports and blocks `HIGH,CRITICAL`, including development dependencies and vulnerabilities with no available fix.
- The scanners run independently. Installation, rule/database download, fatal scanner, and report-upload errors fail the workflow. The aggregate check has the stable name `security-scan`.
- Separate SARIF categories are uploaded to **Security → Code scanning**, with PR analyses also appearing in PR checks. Reports can contain source or secret snippets: they are not published as public Actions artifacts or committed.
- Existing Gitleaks, tests, and quality gates remain in place. Ordinary `pull_request` events require no application secrets or Semgrep account, and no application install/build scripts are executed.

Semgrep `warn` / `warning` diagnostics for parsing, rule matching, or timeouts do not independently block, but the summary shows their counts/types and explicitly states that some files or rules were not fully analyzed. Other or unknown diagnostic levels, invalid reports, and zero scanned files fail. A green check means the configured gate passed, not that every source path was fully analyzed; coverage warnings are not zero findings.

### Rollout and maintenance

The default is `FINDINGS_EXIT_CODE: "1"`, so existing findings also fail the check. If maintainers explicitly choose an observation period, change it to `"0"` through a reviewed change. Findings then become report-only, but scanner/report errors still fail. This does not implement a new-findings-only baseline or relax existing Gitleaks gates.

After the first run, require **`security-scan`** in the target branch protection or ruleset to enforce merge blocking. Merging the YAML does not change repository settings. Verify that all three jobs run and SARIF reports are visible before requiring the check. Resolve permission or Code scanning availability errors instead of ignoring upload failures.

Ordinary Dependabot/fork PR runs can upload SARIF. A Dependabot-authored squash merge may leave a push run with a read-only token and produce an upload 403. A maintainer can start a new `workflow_dispatch` to report that commit and review the merge strategy for future updates. Do not switch to `pull_request_target` to execute PR code or ignore upload errors.

External Actions are pinned to full commit SHAs with version comments; existing Dependabot `github-actions` updates still apply. Engine versions are pinned in the workflow and need validation when upgraded. Semgrep Registry rules and the Trivy vulnerability database update independently, so findings may change without source changes. Review and document individual exceptions instead of excluding entire application directories.

### Repository coverage limits

Semgrep runs applicable JavaScript/TypeScript/React and configuration rules. Trivy reads the committed text `bun.lock` and includes Vite, tests, and other build dependencies through `TRIVY_INCLUDE_DEV_DEPS`. No package-manager migration or additional lockfile is needed. Lockfile matching does not replace reviewing the actual contents of local tarballs in `vendor/` or assess runtime service/API behavior.

References: [Semgrep CE languages](https://semgrep.dev/docs/semgrep-ce-languages), [Trivy Bun and development dependency support](https://trivy.dev/docs/latest/coverage/language/nodejs/).
