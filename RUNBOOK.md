# IMBoy Admin 运维手册 / RUNBOOK

> **最后更新 / Last updated**: 2026-09-30
> 语言 / Languages: 简体中文（权威） | [English](./RUNBOOK.en.md)
> 适用范围：本仓（React 管理后台 SPA）的生产部署、健康检查与回滚。
> 部署编排真源在后端主仓：`../imboy/deploy/`（本文只交叉引用，不复制内容）。

---

## 1. 部署形态 / Deployment Modes

本仓有两种生产交付形态，按目标环境二选一：

| 形态 | 载体 | 适用 |
|------|------|------|
| A. 静态上传（自托管生产现役） | 本地 `bun run build` → `dist/` → rsync/scp 到服务器 nginx 静态目录 | `prodadm.imboy.pub` |
| B. Docker 镜像（私有化交付） | `ghcr.io/imboy-pub/imboy-admin:<version>`，`IMBOY_API_HOST` 运行时注入 | 社区版/商务版 Compose 编排 |

形态 B 的编排细节见主仓 `../imboy/deploy/README.md`（`admin` 服务）；镜像构建与 `IMBOY_API_HOST` 占位符注入机制见本仓 `Dockerfile` 与 `vite.config.ts`（CSP 占位符 `__IMBOY_API_HOST__` 由镜像 entrypoint sed 替换）。

---

## 2. 形态 A：静态上传部署（现役方式）

### 2.1 部署流程

```bash
# 1. 本地构建（提交前至少跑过 lint + test + build，见 README）
cd <本仓>
bun run build          # 产出 dist/

# 2. 上传替换服务器静态目录
#    方式一：走主仓统一部署入口（rsync over SSH）
bash ../imboy/scripts/imboy-deploy.sh admin

#    方式二：手工 rsync（--delete 与部署脚本口径一致，避免旧 hash chunk 堆积）
rsync -az --delete dist/ <user>@<host>:/www/wwwroot/prodadm.imboy.pub/
```

> 服务器地址、SSH 端口等连接信息以主仓部署配置为准：
> `../imboy/docs/guides/operations/deployment/deploy-script.md`（`.env.deploy` 变量表）与
> `../imboy/docs/guides/operations/deployment/production-architecture.md`。

### 2.2 服务器侧（nginx，宝塔托管）

- 静态目录：`/www/wwwroot/prodadm.imboy.pub/`
- vhost 快照（真源）：`../imboy/deploy/nginx/prod-vhosts/prodadm.imboy.pub.conf`
  - `/api/*`、`/adm/*`、`/v1/*`、`/adm-api/*`、`/app_version/*` → 反代 `127.0.0.1:9800`（Erlang 后端节点）
  - `/adm/assets/` → alias 静态目录，`immutable` 一年缓存
  - `= /index.html` → `Cache-Control: no-cache`（防部署后浏览器跑旧 chunk）
  - `/` → `try_files $uri $uri/ /index.html`（SPA 兜底）
  - 旧 `/adm/`、`/adm` → 302 回 `/`
- 注意：`/adm/` 前缀在服务器上是**后端 Admin API**（反代 9800），不是前端路由；前端 SPA 挂在根路径 `/`。本地 dev server 里 `/api/adm` 由 vite proxy 转发（`vite.config.ts`），与生产拓扑不同属正常。

### 2.3 跨域登录注意事项（部署排障清单）

admin 域（`prodadm.imboy.pub`）与 API 域（`pro.imboy.pub`）**跨域**，以下 5 点为上线实证过的契约，改动任一处都会破坏登录：

1. **`.env.production` 已入仓**（`git ls-files` 在库，仅含 `__IMBOY_API_HOST__` 占位符，见 `.gitignore` 39-40 行注释）：CI/Docker 构建把占位符 bake 进产物、容器 entrypoint 运行时替换。**静态上传形态的域注入真源是 `../imboy/scripts/imboy-deploy.sh:396-425`（即 2.1 的方式一）**：构建期生成 `.env.production.local`（优先级高于 `.env.production`）注入**同源值**——API 基址为相对路径 `/api/adm`（请求经 prodadm 同源反代到 9800，**不是**跨域直连 `pro.imboy.pub`），构建后对 `dist/index.html` 后置 sed 清除 CSP 占位符残留，并以「dist 无 `__IMBOY_API_HOST__` 残留」为 fail 门。方式二纯手工 `bun run build` 不经此注入链，产物会保留占位符、**不可直接上线**——手工部署必须先复刻方式一的注入步骤。验收口径：走方式一的产物 API 基址应为 `/api/adm`（同源），出现占位符或跨域直连域即配错。
2. **CSP `connect-src`**：`index.html` 的 meta CSP 必须保留 API 域槽位；Docker 形态用 `__IMBOY_API_HOST__` 占位符运行时注入；静态上传形态（方式一）因基址为同源相对路径，构建后 sed 把 CSP 中的占位符清空、退化为同源访问（仅剩 `'self'`）。
3. **Cookie path=/ 契约**：admin 认证 cookie 的 path 必须是 `/`（后端 `adm_auth_middleware` 侧）。单 cookie 无法同时匹配 `/adm` 与 `/api/adm` 两个前缀，公共祖先只有 `/`；出现「验证码有误」先查 cookie path。
4. **密码 md5hex 契约**：前端对明文先 `md5()` 再加密传输，后端按 `elib_password:generate(md5(明文))` 校验。重置 admin 密码必须存 `md5(明文)` 的 hex，直接存明文会恒「密码错误」。
5. **`/api/adm/*` 走 adm 认证门**：后端 `auth_middleware` 按 `/api/adm/` 前缀分派到 `adm_auth_middleware`（非签名门 902）；`/api/adm/passport/*` 免 cookie（登录动作本身）。若新增前缀行为异常先核对后端分派逻辑。

---

## 3. 健康检查 / Health Check

### 3.1 快速冒烟（无需凭证）

```bash
# 首页 200 且 index.html 不缓存
curl -sI https://prodadm.imboy.pub/ | grep -iE "HTTP|cache-control"
# 期望: HTTP/2 200 + cache-control: no-cache

# 静态资产可加载（长缓存）
curl -sI https://prodadm.imboy.pub/vite.svg | head -1
```

### 3.2 生产 E2E 检查

```bash
# README 内置口径（默认 prodadm.imboy.pub，可用 IMBOY_ADMIN_E2E_BASE_URL 覆盖；谨慎执行）
IMBOY_ADMIN_E2E_BASE_URL=https://prodadm.imboy.pub bun run test:e2e:prod
```

### 3.3 全面巡检（登录 + 全页面审计）

```bash
PLAYWRIGHT_DISABLE_WEBSERVER=1 \
IMBOY_ADMIN_E2E_BASE_URL=https://prodadm.imboy.pub \
IMBOY_ADMIN_E2E_ACCOUNT=<账号> IMBOY_ADMIN_E2E_PASSWORD=<密码> \
IMBOY_ADMIN_E2E_CAPTCHA=<真实验证码> \
bun run test:e2e -- tests/e2e/prod-health-check.spec.ts
```

生产环境无测试验证码，`IMBOY_ADMIN_E2E_CAPTCHA` 需传入真实值（见 spec 头注释）。

---

## 4. 回滚 / Rollback

纯静态前端回滚，不涉及数据库与后端节点：

```bash
# 1. 服务器端保留上一个版本副本（部署前快照）
ssh <user>@<host> 'cp -al /www/wwwroot/prodadm.imboy.pub /www/wwwroot/prodadm.imboy.pub.bak.$(date +%Y%m%d%H%M)'

# 2. 回滚 = 恢复上一个副本
rsync -az --delete /www/wwwroot/prodadm.imboy.pub.bak.<时间戳>/ <user>@<host>:/www/wwwroot/prodadm.imboy.pub/
```

要点：

- `index.html` 为 `no-cache`，回滚后浏览器刷新即回到旧版，无需处理客户端缓存。
- `/assets/*` 为内容 hash 文件名 + `immutable`，新旧版本文件名互不冲突；若用 `--delete` 回滚误删旧 chunk，正在打开的旧标签页刷新前不受影响，刷新后会拿到回滚后的 `index.html` 加载旧版本文件——保持 `--delete` 一致口径即可。
- 后端蓝绿回滚（API 侧）不在本仓范围，见主仓 `../imboy/docs/guides/operations/deployment/deploy-script.md`（`rollback` 命令）。

---

## 5. 交叉引用 / Cross References

| 主题 | 位置 |
|------|------|
| 部署脚本与 `.env.deploy` 变量 | `../imboy/docs/guides/operations/deployment/deploy-script.md` |
| 生产架构（域名/vhost/CORS 白名单） | `../imboy/docs/guides/operations/deployment/production-architecture.md` |
| prodadm vhost 快照（真源） | `../imboy/deploy/nginx/prod-vhosts/prodadm.imboy.pub.conf` |
| Docker/Compose 私有化部署 | `../imboy/deploy/README.md` |
| 客服 Widget 部署（独立产物） | `../imboy/docs/guides/operations/deployment/customer-service-widget.md`；本仓构建口径见 `vite.config.ts`（`build:widget`） |
