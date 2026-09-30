# IMBoy Admin RUNBOOK

> **Last updated**: 2026-09-30
> Scope: production deployment, health checks, and rollback for this repo (React admin SPA).
> The deployment orchestration source of truth lives in the backend repo: `../imboy/deploy/` (this document only cross-references, never duplicates).
>
> **Languages**: [简体中文](./RUNBOOK.md)（authoritative） | English

---

## 1. Deployment Modes

Two production delivery modes, choose one per target environment:

| Mode | Carrier | Applies to |
|------|---------|-----------|
| A. Static upload (current self-hosted production) | local `bun run build` → `dist/` → rsync/scp to server nginx static dir | `prodadm.imboy.pub` |
| B. Docker image (private deployment) | `ghcr.io/imboy-pub/imboy-admin:<version>`, `IMBOY_API_HOST` injected at runtime | Community/Commercial Compose stacks |

For mode B orchestration see the main repo `../imboy/deploy/README.md` (`admin` service); image build and the `IMBOY_API_HOST` placeholder injection mechanism are in this repo's `Dockerfile` and `vite.config.ts` (the CSP placeholder `__IMBOY_API_HOST__` is sed-replaced by the image entrypoint).

---

## 2. Mode A: Static Upload (current method)

### 2.1 Deploy procedure

```bash
# 1. Build locally (run lint + test + build before shipping, see README)
cd <this repo>
bun run build          # produces dist/

# 2. Upload and replace the server static dir
#    Option 1: unified deploy entry in the main repo (rsync over SSH)
bash ../imboy/scripts/imboy-deploy.sh admin

#    Option 2: manual rsync (--delete matches the deploy script's convention,
#    avoiding stale hashed chunks piling up)
rsync -az --delete dist/ <user>@<host>:/www/wwwroot/prodadm.imboy.pub/
```

> Server addresses, SSH ports and other connection details follow the main repo's deploy config:
> `../imboy/docs/guides/operations/deployment/deploy-script.md` (`.env.deploy` variable table) and
> `../imboy/docs/guides/operations/deployment/production-architecture.md`.

### 2.2 Server side (nginx, BT-panel managed)

- Static dir: `/www/wwwroot/prodadm.imboy.pub/`
- vhost snapshot (source of truth): `../imboy/deploy/nginx/prod-vhosts/prodadm.imboy.pub.conf`
  - `/api/*`, `/adm/*`, `/v1/*`, `/adm-api/*`, `/app_version/*` → reverse proxy to `127.0.0.1:9800` (Erlang backend node)
  - `/adm/assets/` → alias to static dir, `immutable` one-year cache
  - `= /index.html` → `Cache-Control: no-cache` (prevents browsers running stale chunks after deploy)
  - `/` → `try_files $uri $uri/ /index.html` (SPA fallback)
  - legacy `/adm/`, `/adm` → 302 back to `/`
- Note: the `/adm/` prefix on the server is the **backend Admin API** (proxied to 9800), NOT a frontend route; the admin SPA is mounted at root `/`. In local dev the vite proxy forwards `/api/adm` (`vite.config.ts`); differing from the production topology is expected.

### 2.3 Cross-domain login notes (deployment troubleshooting checklist)

The admin domain (`prodadm.imboy.pub`) and the API domain (`pro.imboy.pub`) are **cross-origin**. The following 5 contracts are production-verified; changing any one breaks login:

1. **`.env.production` is committed** (in `git ls-files`, containing only the `__IMBOY_API_HOST__` placeholder — see the `.gitignore` lines 39-40 comment): CI/Docker builds bake the placeholder into the artifact and the container entrypoint replaces it with the real API domain at runtime. **The domain-injection source of truth for the static-upload mode is `../imboy/scripts/imboy-deploy.sh:396-425` (option 1 in §2.1)**: at build time it generates `.env.production.local` (higher priority than `.env.production`) injecting **same-origin values** — the API base becomes the relative path `/api/adm` (requests go through the prodadm same-origin reverse proxy to 9800, **not** a cross-origin direct connection to `pro.imboy.pub`); after the build it sed-strips CSP placeholder residue from `dist/index.html` and fails if any `__IMBOY_API_HOST__` remains in dist. A plain manual `bun run build` (option 2) bypasses this injection chain, leaving placeholders in the artifact — **not deployable as-is**; manual deploys must replicate option 1's injection steps first. Acceptance: an option-1 artifact should carry the `/api/adm` same-origin base — a placeholder or a cross-origin domain means it is misconfigured.
2. **CSP `connect-src`**: the meta CSP in `index.html` must keep the API domain slot. Docker mode injects it at runtime via the `__IMBOY_API_HOST__` placeholder; in the static-upload mode (option 1) the base is a same-origin relative path, so the post-build sed empties the CSP placeholder and it degrades to same-origin access (only `'self'` remains).
3. **Cookie path=/ contract**: the admin auth cookie's path must be `/` (backend `adm_auth_middleware` side). A single cookie cannot match both `/adm` and `/api/adm` prefixes; their only common ancestor is `/`. If you see "invalid captcha", check the cookie path first.
4. **Password md5hex contract**: the frontend hashes plaintext with `md5()` before encrypting for transport; the backend validates against `elib_password:generate(md5(plaintext))`. Resetting an admin password must store the hex of `md5(plaintext)` — storing plaintext always yields "wrong password".
5. **`/api/adm/*` goes through the adm auth gate**: the backend `auth_middleware` dispatches the `/api/adm/` prefix to `adm_auth_middleware` (not the signature gate 902); `/api/adm/passport/*` is cookie-exempt (the login action itself). If a new prefix misbehaves, check the backend dispatch logic first.

---

## 3. Health Check

### 3.1 Quick smoke (no credentials)

```bash
# Homepage 200 and index.html not cached
curl -sI https://prodadm.imboy.pub/ | grep -iE "HTTP|cache-control"
# expect: HTTP/2 200 + cache-control: no-cache

# Static asset loads (long cache)
curl -sI https://prodadm.imboy.pub/vite.svg | head -1
```

### 3.2 Production E2E check

```bash
# README-baked convention (defaults to prodadm.imboy.pub, override via IMBOY_ADMIN_E2E_BASE_URL; run with care)
IMBOY_ADMIN_E2E_BASE_URL=https://prodadm.imboy.pub bun run test:e2e:prod
```

### 3.3 Full inspection (login + all-page audit)

```bash
PLAYWRIGHT_DISABLE_WEBSERVER=1 \
IMBOY_ADMIN_E2E_BASE_URL=https://prodadm.imboy.pub \
IMBOY_ADMIN_E2E_ACCOUNT=<account> IMBOY_ADMIN_E2E_PASSWORD=<password> \
IMBOY_ADMIN_E2E_CAPTCHA=<real captcha> \
bun run test:e2e -- tests/e2e/prod-health-check.spec.ts
```

Production has no test captcha; `IMBOY_ADMIN_E2E_CAPTCHA` must carry a real value (see the spec header comment).

---

## 4. Rollback

Pure static frontend rollback; no database or backend node involvement:

```bash
# 1. Keep the previous version on the server (snapshot before deploy)
ssh <user>@<host> 'cp -al /www/wwwroot/prodadm.imboy.pub /www/wwwroot/prodadm.imboy.pub.bak.$(date +%Y%m%d%H%M)'

# 2. Rollback = restore the previous snapshot
rsync -az --delete /www/wwwroot/prodadm.imboy.pub.bak.<timestamp>/ <user>@<host>:/www/wwwroot/prodadm.imboy.pub/
```

Key points:

- `index.html` is `no-cache`; after rollback a browser refresh returns to the old version, no client cache handling needed.
- `/assets/*` uses content-hashed filenames + `immutable`; old and new version filenames never collide. If a `--delete` rollback removed old chunks, an already-open old tab is unaffected until refresh; after refresh it picks up the rolled-back `index.html` — keep the `--delete` convention consistent.
- Backend blue-green rollback (API side) is out of scope for this repo; see the main repo `../imboy/docs/guides/operations/deployment/deploy-script.md` (`rollback` command).

---

## 5. Cross References

| Topic | Location |
|-------|----------|
| Deploy script & `.env.deploy` variables | `../imboy/docs/guides/operations/deployment/deploy-script.md` |
| Production architecture (domains/vhost/CORS allowlist) | `../imboy/docs/guides/operations/deployment/production-architecture.md` |
| prodadm vhost snapshot (source of truth) | `../imboy/deploy/nginx/prod-vhosts/prodadm.imboy.pub.conf` |
| Docker/Compose private deployment | `../imboy/deploy/README.md` |
| Customer-service widget deployment (separate artifact) | `../imboy/docs/guides/operations/deployment/customer-service-widget.md`; build convention in this repo's `vite.config.ts` (`build:widget`) |
