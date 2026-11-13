# J02-c 真实后端独立验收 / Standalone real-backend acceptance

## 1. 范围与证据 / Scope and evidence

本入口复用 `tests/e2e/j02-role-permission-lifecycle.spec.ts` 的 **J02-c**，验证创建管理员、首次登录、角色撤权和刷新一致性。它不运行 J02-a/b，不修改默认 CI 的选择器，不建立重复测试套件。

2026-11-13 源码核对基线：前端 `b8d91e7f11fa096d81d7ec4ee2bccd8191999528`；后端 `d41f06f560e768d9370cbc7cb602d162433ac5e8`（`1.0.0-alpha.84`）。后续执行必须记录实际审核 SHA 和候选文件摘要；本段不是运行收据。

[PR #108](https://github.com/imboy-pub/imboy-admin-frontend/pull/108) 已合并；对应 [workflow run 42941365087 / job 130263700381](https://github.com/imboy-pub/imboy-admin-frontend/actions/runs/42941365087/job/130263700381) 的绿色状态覆盖 `setup-flow.spec.ts` 的 Mock 浏览器测试。当前 `.github/workflows/admin-e2e.yml` 仍只选这一文件，不启动真实后端。

| 证据 / Evidence | 含义 / Meaning | 本次状态 / Current state |
|---|---|---|
| `MOCK / PASS` | 所选 Mock 浏览器测试通过；不证明真实创建、登录或撤权 / Selected mocked browser tests passed | PR #108 历史 CI 已有此证据 |
| `REAL / PASS` | 已批准目标上的 J02-c 单次真实执行、语义断言及报告检查全部通过 / Approved real lifecycle and evidence validation passed | **没有此证据 / Not established** |
| `REAL / NOT_RUN` | 未启动真实验收；准备、预检、发现测试均不是通过 / Real acceptance was not started | **本交付当前状态 / Current delivery status** |
| `REAL / FAIL` | 真实执行已启动但失败，保留部分证据及清理待办 / Real run started and failed | 不可改记为未执行或 Mock 通过 |

This entry reuses only J02-c. Historical green CI proves the selected mocked setup flow. Source review, test discovery and successful preflight do not establish real-backend acceptance. No real account or database changes are authorized by this document.

## 2. 文件入口 / Entry points

| 文件 / File | 职责 / Responsibility |
|---|---|
| [`scripts/j02-acceptance.mjs`](../../scripts/j02-acceptance.mjs) | `plan`、`preflight`、`run`；批准绑定、执行和证据检查 / Reviewed entry and evidence validation |
| [`scripts/j02-contract.mjs`](../../scripts/j02-contract.mjs) | 目标、批准、运行态和结果的拒绝条件 / Pure validation contract |
| [`scripts/j02-runtime-probe.eval`](../../scripts/j02-runtime-probe.eval) | 既有后端的白名单运行信息及只读 SQL / Runtime identity and read-only SQL |
| [`playwright.j02-real.config.ts`](../../playwright.j02-real.config.ts) | 独立 Chromium project；仅选 J02-c / Dedicated browser configuration |
| [`vite.j02.config.ts`](../../vite.j02.config.ts) | 禁止自动加载 dotenv，固定同源 API 代理 / Dedicated Vite configuration without dotenv loading |
| [`j02-target.example.json`](../../tests/e2e/fixtures/j02-target.example.json) | 无秘密的环境及清理清单 / Non-secret target and cleanup manifest |
| [`j02-approval.example.json`](../../tests/e2e/fixtures/j02-approval.example.json) | 人工批准记录模板 / Human approval receipt template |
| [`.env.j02.example`](../../.env.j02.example) | 专用测试凭据模板 / Dedicated test credential template |

## 3. 执行条件 / Execution prerequisites

本入口只支持在**同一独立测试主机**上运行：前端、后端和 PostgreSQL 均使用 `127.0.0.1` 与明确端口；后端 HTTP 必须实际绑定 loopback。当前入口不接受生产域名、共享数据库、远端代理或隧道目标。

| 项目 / Item | 要求 / Requirement |
|---|---|
| 工具链 | Node.js ≥22；Bun `1.3.14`（与当前 CI 一致）；依锁安装 Playwright `1.65.0` 及其配套 Chromium |
| 前端 | `frontend_sha` 等于审核 checkout；入口另记录实际候选文件内容摘要；前端端口未被占用，不复用已有 Vite |
| 后端源码 | 固定 SHA 必须包含 `b418ad52944b687e0b643431d5b7e5be82b9594d`，该提交修复管理员创建时 RSA 密文先解密再哈希 |
| 后端产物 | 已存在的原生 release，含真实 `delivery-build/build.env` 与 `BUILD_FILES.sha256`；使用真实绝对目录，不使用会移动的 `current` 符号链接；源码 SHA、文件哈希及运行模块身份一致 |
| 后端实例 | 已独立启动；节点名为 `<run_id>@127.0.0.1`；与其他 BEAM 节点无连接；`test/local/dev` 环境支持固定验证码 `1234` |
| 数据库 | 本轮新建的专用库 `j02_<run_id>`；独立账号；`public` schema；无生产数据，无历史 J02 账号/角色；明确 PG major（本次后端基准为 PG18）；具备 `timescaledb/pg_jieba/postgis/pgcrypto/citext` 扩展 |
| 数据迁移 | 当前版本与该源码迁移 head 一致、`dirty=false`、history 与全部 `.up.sql` 版本集合一致；当前 head 为 275，编号不连续 |
| 秘密与隔离证明 | 专用 RSA、cookie、数据库及管理员凭据；提供实例负责人和 `isolation.evidence_file`，证明实例/数据库确实独立 |

名称含 `test`、数据库前缀和 `isolation.*=true` 只是检查输入，不能证明隔离。负责人需检查实例归属、实际连接、集群关系、数据来源及回收范围。缺独立环境、构建收据或证明时，停留在准备阶段，不自动启动、迁移、初始化或种入账号。

Only a dedicated local host is supported. Isolation declarations need independent evidence. Use the existing native release build workflow in the backend repository when provisioning is separately authorized; this entry neither builds nor starts the backend. Keep runtime configuration outside the verified payload with `RELX_CONFIG_PATH`/`VMARGS_PATH` where required. Do not use a startup helper that rewrites the verified release payload, and never manufacture a missing build receipt.

已具备 OTP29 原生构建依赖时，可复用后端现有构建工具生成收据（以下仅构建，未在本次执行；建库、启动、迁移、种超管仍另需批准）。`--out` 必须是尚不存在、位于源仓之外的新目录：

```bash
bash /abs/imboy/deploy/native-shell/tools/build-backend.sh \
  --repo /abs/imboy \
  --sha d41f06f560e768d9370cbc7cb602d162433ac5e8 \
  --out /abs/new-j02-build --jobs 4
# Result: /abs/new-j02-build/backend (use this as backend.release_dir)
```

独立实例的外置 `sys.config` 在 `imboy` 配置项内需要 `{listen_ip, {127,0,0,1}}`、`{start_mode, http}`；端口由 `HTTP_PORT` 或 `http_port` 明确指定。`vm.args` 使用本轮节点名和独立分布式 cookie，并将分布式监听绑定 loopback。不能只在命令里改一个测试标签而继续使用已有共享节点。

公钥摘要可以对**专用测试公钥文件**离线计算，不读取私钥：

```bash
node --input-type=module -e 'import fs from "node:fs"; import {createHash} from "node:crypto"; console.log(createHash("sha256").update(fs.readFileSync(process.argv[1], "utf8").replaceAll("\n", "")).digest("hex"))' /abs/test-public.pem
```

The native build command does not provision a database. Configure loopback HTTP and a dedicated distributed node during separately approved provisioning. Compute the fingerprint only from the test public key; it must match the running node.

## 4. 环境变量 / Environment variables

凭据仅放在未跟踪的 `.env.j02.local`，或由操作员安全注入；不要放入 target/approval JSON、报告或命令参数。独立配置不加载 `.env.e2e`。

| 变量 / Variable | 用途 / Use |
|---|---|
| `IMBOY_ADMIN_E2E_SUPER_ACCOUNT` | 入口从 target 的 `super_account` 注入专用 `j02_` 超管账号，不从凭据文件选账号 / Runner-controlled approved super identity |
| `IMBOY_ADMIN_E2E_SUPER_PASSWORD` | 专用超管密码，至少 6 位 / Dedicated super password |
| `IMBOY_ADMIN_E2E_NEW_ADMIN_PASSWORD` | 本轮 C 的密码，至少 6 位且不同于超管密码；不使用测试内默认密码 / Distinct explicit password for C |
| `IMBOY_ADMIN_E2E_BASE_URL` | 入口由 target 注入前端 origin / Runner-controlled frontend origin |
| `VITE_PROXY_TARGET` | 入口由 target 注入后端 origin / Runner-controlled proxy destination |
| `VITE_API_BASE_URL` | 入口固定 `/api/adm`；`src/services/api/client.ts` 的真实变量 / Same-origin API base |
| `IMBOY_J02_RUN_ID`、`IMBOY_J02_APPROVAL_DIGEST` | 入口注入运行标识和已批准计划摘要；手填变量不等于人工批准 / Runner-bound run and approval identity |
| `IMBOY_ADMIN_E2E_NEW_ADMIN_PREFIX`、`IMBOY_ADMIN_E2E_NEW_ROLE_PREFIX` | 入口固定 `j02_admin`、`j02_role`；最终名称追加同一 RUN_ID / Fixed per-run names |

`.env.j02.local` 只需填写两个不同的测试密码。旧 spec 的超管辅助函数支持 `IMBOY_ADMIN_E2E_ACCOUNT/PASSWORD` 回退，独立入口不使用这条隐式回退。`READONLY_ACCOUNT/PASSWORD`、`ROLE_PERMISSION_KEY`、`NEW_ROLE_DESCRIPTION` 属于其他段的配置，单独 J02-c 不需要。勿为通过 J02-c 配置或运行 J02-b。

后端变量应在**后端进程**生效：`IMBOYENV`；`HTTP_PORT`（覆盖 `http_port`）；`IMBOY_PG_HOST/PORT/DATABASE/USERNAME/PASSWORD`（数据库名兼容 `IMBOY_PG_DB`，用户名兼容 `IMBOY_PG_USER`）；`IMBOY_POSTGRE_AES_KEY`；`IMBOY_LOGIN_RSA_PUB_KEY_FILE`、`IMBOY_LOGIN_RSA_PRIV_KEY_FILE`；`IMBOY_ADM_COOKIE_SECRET`。预检读取正在运行后端，不凭本地 shell 的同名变量判断实际配置。

Credentials stay outside tracked files. The runner accepts two distinct passwords and owns account, URL, proxy, naming and approval variables. Its child environment uses an allowlist, and the dedicated Vite configuration disables dotenv loading. The fixed captcha is accepted only by a backend actually running in `local/dev/test`; never change a production process to test mode to satisfy this test.

## 5. 准备与离线审查 / Preparation and offline review

以下命令均从管理后台仓库根目录执行。安装依赖和浏览器不会运行 J02-c；系统浏览器依赖可按主机管理规则预先安装。先移除 `PLAYWRIGHT_BROWSERS_PATH`、`XDG_CACHE_HOME`、`PLAYWRIGHT_EXECUTABLE_PATH` 覆盖，使预检和执行使用同一默认缓存；不要改用系统 Chrome 代替锁定 Chromium。

```bash
bun install --frozen-lockfile
node node_modules/playwright/cli.js install --with-deps chromium
node node_modules/playwright/cli.js test --config=playwright.j02-real.config.ts --list
mkdir -p test-results
cp tests/e2e/fixtures/j02-target.example.json test-results/j02-target.local.json
cp .env.j02.example .env.j02.local
chmod 600 .env.j02.local
```

`--list` 应只发现 `j02-real-chromium` 的一条 J02-c；发现成功不等于执行成功。编辑 target，填入真实审核值及绝对路径；示例的占位符会被拒绝。RUN_ID 使用 8–48 位小写字母、数字、下划线或连字符，例如 `j02c_20261113_001`；不能复用已执行 RUN_ID。

```bash
node scripts/j02-acceptance.mjs plan test-results/j02-target.local.json
```

`plan` 仅做离线检查，在 `test-results/j02/<RUN_ID>/` 生成 `plan.json`、`review.md`。它不联网、不登录、不访问数据库。审核者阅读完整 review：目标实例、前后端 SHA/候选内容、数据库、即将执行的写操作、身份命名、清理责任和风险。计划摘要采用入口定义的规范化 JSON 算法；使用 review 输出的摘要，不以 `sha256sum plan.json` 的文件字节摘要替代。

Prepare the target and independent isolation evidence before planning. The example is deliberately not runnable as-is. An offline plan is review material, not approval and not a runtime proof. Keep local manifests and credentials out of Git.

## 6. 独立环境只读预检 / Read-only preflight

确认 target 指向已准备的独立测试实例后，操作员可执行。target 的 `backend.vm_args_file` 和 `backend.sys_config_file` 必须是该实例外置配置的真实绝对路径；入口分别固定传入 `VMARGS_PATH`、`RELX_CONFIG_PATH`，不能临时指向其他实例。

```bash
node scripts/j02-acceptance.mjs preflight test-results/j02-target.local.json
```

预检调用既有 release 的 `eval`，核对运行节点、release 路径、HTTP 实际绑定、PG 配置、公钥指纹及已加载模块与磁盘 BEAM 的 MD5。运行池使用同一连接 `BEGIN READ ONLY` → 固定 SELECT → `ROLLBACK`，读取实际 DB 身份、迁移账本、必需表及旧 J02 记录；另读 `/healthz`。它不登录、不启动服务、不执行迁移或创建数据。

`/healthz` 只有版本字符串、节点和依赖就绪状态，没有 git SHA 或数据库名。源码 SHA、构建收据/文件哈希、运行模块及实际池连接需一起成立。RSA 指纹是 `/passport/meta` 同口径的 PEM **去 LF 后字节 SHA256**，不是 DER/SPKI 指纹。`module_info` 可触发尚未加载模块的代码加载；这不运行 J02-c 业务，但预检并非对进程完全零影响。

迁移表由 `erlang_migrate v0.3.4` 定义：`schema_migrations(version, dirty, applied_at)` 与 `schema_migrations_history(version, applied_at)`。不调用 `erlang_migrate:version/1`，因其会先 `CREATE TABLE IF NOT EXISTS`；不调用 `force/2` 补标历史。

**不要复用 `scripts/check_admin_role_backend_readiness.sh` 作为无写预检。** 它包含创建管理员/角色、修改管理员 ID 1 角色和角色 ID 2 权限的 POST/PUT。文件名含 readiness 不代表只读。

预检也检查锁定 Playwright 对应的 Chromium 文件，并启动、关闭一个不访问应用的 headless 浏览器，验证运行依赖；它不自动下载或替换浏览器，缺文件或启动失败即阻止执行。这一检查并不替代真实浏览器验收。本次交付尚未执行真实节点上的 Erlang RPC 预检，不应把源码审查记为预检通过。

Preflight validates the already-running backend and its actual pool connection. It has no business-data writes or login. Any missing table, receipt, browser, mismatched target, dirty migration, stale module or previous J02 fixture blocks execution. Preflight success remains `REAL / NOT_RUN`.

## 7. 明确批准后单次执行 / One approved execution

运行前先向批准者展示 `review.md` 与预检结果，至少说明：

1. 实例 ID、负责人、前后端 origin/SHA/release、数据库主机/端口/名称/账号以及隔离证据。
2. 使用专用超管登录；新建 `j02_role_<RUN_ID>` 和 `j02_admin_<RUN_ID>`；新账号登录；撤销该角色的 `organizations:read`；刷新并复核。
3. 修改 `adm_role`、`adm_user`，以及全局 config 的 `adm_role_names/adm_role_descriptions/adm_role_permissions`；登录、审计/UX、cookie 与进程缓存可能有副作用。
4. 失败也可能留下部分数据；整套专用环境由指定操作员回收；报告不自动上传，清理不自动执行。

批准必须明确针对这个计划摘要及一次执行。收到真实人工批准后，才将批准人、引用、时间、有效期和摘要写入 approval；有效期最多 24 小时，使用含时区的 ISO 8601 时间。模板文件、一个 env 开关或代理自行填写 `APPROVED` 都不能代替人的批准。

```bash
cp tests/e2e/fixtures/j02-approval.example.json test-results/j02-approval.local.json
# 仅在明确批准后填写 approval；本行不表示已经批准。
node --env-file=.env.j02.local scripts/j02-acceptance.mjs run \
  test-results/j02-target.local.json test-results/j02-approval.local.json
```

`run` 验证 `scope=RUN_J02_C_ONCE`、批准摘要与时效，重新预检，取得单次执行锁，再调用本地已安装的 Playwright CLI。配置为单 Chromium、单 worker、一次尝试、零 retries、不复用已有前端；trace/video/screenshot 关闭。缺凭据或任何检查失败即退出，不能 skip 成绿。变更目标、代码或清理范围后重新生成审查材料并取得相应批准。

Show the concrete target, mutations, cleanup scope and risks before approval. Record an actual human decision bound to the plan digest; the agent must not self-approve. A run is single-use and repeats preflight. Do not delete the run lock or modify evidence to reuse approval after a failure; investigate, dispose of the old isolated environment, then prepare a new RUN_ID and approval.

## 8. 必须形成的业务证据 / Required semantic evidence

| 检查点 / Checkpoint | 必须观察到 / Required observation |
|---|---|
| 创建前 | 本轮完整账号查询不存在；批准的创建方确认为专用超管 / Exact account absent; approved super identity confirmed |
| 创建 R、C | UI 写请求 HTTP/业务均成功；角色 ID 关联创建结果；C 列表精确匹配 account、ID、R；TSID 保留十进制字符串 / Created entities correlated without numeric precision loss |
| C 首次登录 | 独立空 browser context；同 context 的 `/current` 精确等于本轮 account/ID / New identity proven by authenticated API |
| 初始 RBAC | `role_ids`、`role_names` 精确等于 R；permissions 精确含 `dashboard:view` 与 `organizations:read` / Exact initial role and permission set |
| 允许与初始拒绝 | 组织 UI 可见，组织 API HTTP 200 且 `code=0`；管理员列表明确拒绝 / Allowed organization access and denied admin-list access |
| 撤权传播 | 超管保存仅保留 `dashboard:view`；同一 C 会话的组织 API 在有界等待内拒绝 / Revocation enforced within the bounded poll |
| 刷新一致性 | reload 后组织页进入 forbidden；组织 API 仍拒绝；`/current` 仍为 C，RBAC 仅保留 `dashboard:view` / UI, API, identity and RBAC agree after reload |

拒绝必须是应用权限拒绝：HTTP 200 或 403，**两种传输都须有 JSON 业务 `code=403`**；这与本次后端 `adm_acl` 两条返回路径一致。裸 HTTP 403/HTML、401、登录重定向、5xx、网络错误和代理错误不能充当撤权成功。自定义角色的 `/dashboard` 角色门本来会拒绝，因此登录落在 `/forbidden` 不能单独证明身份；未撤权限由精确 RBAC 集合验证。

The acceptance entry requires one passing J02-c result with no retries, skips or flaky outcomes, plus completed semantic evidence bound to the same run and plan. A browser exit code alone is insufficient.

## 9. 证据保留与清理 / Evidence and disposal

运行材料保存在 `test-results/j02/<RUN_ID>/`：`plan.json`、`review.md`、`preflight.json`、`summary.json`，执行后另有批准记录、执行锁、`runner.log`、`playwright.json`、HTML 和 `j02-c-evidence` 语义附件。成功时另导出 `j02-c-evidence.json`。输出只保留审核必要字段，不打印凭据、完整 cookie 或 RSA 私钥。报告仍应在分享前审查；本入口不自动上传。测试失败保存已完成检查点；不能将部分完成记为 PASS。

机器状态以 `summary.json` 为准：准备阶段 `evidence_state=NOT_RUN`；真实成功 `scope=REAL_BACKEND, verdict=PASS, evidence_state=REAL_PASS`；失败或中断为 `REAL_NOT_PASSED`，其中 `verdict=FAIL` 或 `INCOMPLETE`。中断/报告缺失不等于通过；不得把它重新标成未执行来隐去可能的写入。

语义附件的 `cleanup_status=PENDING_EXTERNAL_DISPOSAL` 表示清理尚未完成，浏览器关闭不改变这个状态。角色删除接口不清理三个 config map；管理员 disable 不是删除，禁用管理员仍可能阻止删角色；config.value 为加密文本，不能以 JSONB 子键删除代替清理。

获批操作员按 target 的清理流程停止并回收**整个专用后端/数据库环境**，处理专用秘密、缓存和残留会话；保留脱敏证据并另记录实际清理结果。禁止按模糊前缀删除共享数据、恢复共享 config 或自动删除生产/共享库。清理失败须单独报告，即使业务断言已经通过。

Preserve sanitized evidence before disposing of the approved dedicated environment. Cleanup remains pending until an authorized operator actually completes and records it. Closing browser contexts is not database cleanup. Default CI must continue to run only its explicit Mock suite; adding real acceptance to shared or production-backed CI is outside this entry.

## 10. 故障处理与源码依据 / Failure handling and sources

| 失败 / Failure | 处理 / Action |
|---|---|
| 缺环境、凭据或构建收据 | 停止，不启动/种数据/伪造收据 / Stop without provisioning or fabricating evidence |
| API 登录失败 | 检查 RSA 解密修复、固定验证码实际环境、专用凭据及 cookie 同源；不放宽身份断言 / Check the real auth chain |
| 迁移缺项或 dirty | 交环境负责人按部署流程修复；重新预检；不 force 账本 / Repair through the approved deployment process |
| 已存在 J02 数据或执行锁 | 保留故障证据并回收旧专用环境；新环境、新 RUN_ID、新批准 / Preserve evidence and use a fresh approved run |
| 撤权后得到 401/500 | 按认证或后端失败处理，不算权限拒绝 / Authentication/server failure is not authorization success |

后端源码均以本次核对 SHA 为锚：[管理员创建](https://github.com/imboy-pub/imboy/blob/d41f06f560e768d9370cbc7cb602d162433ac5e8/src/adm/adm_admin_handler.erl)、[角色创建/权限保存](https://github.com/imboy-pub/imboy/blob/d41f06f560e768d9370cbc7cb602d162433ac5e8/src/adm/adm_role_handler.erl)、[当前身份/RBAC](https://github.com/imboy-pub/imboy/blob/d41f06f560e768d9370cbc7cb602d162433ac5e8/src/adm/adm_index_handler.erl)、[权限守卫](https://github.com/imboy-pub/imboy/blob/d41f06f560e768d9370cbc7cb602d162433ac5e8/src/adm/adm_acl.erl)、[配置加密及失效](https://github.com/imboy-pub/imboy/blob/d41f06f560e768d9370cbc7cb602d162433ac5e8/src/ds/config_ds.erl)、[健康探针](https://github.com/imboy-pub/imboy/blob/d41f06f560e768d9370cbc7cb602d162433ac5e8/src/api/healthz_handler.erl)。迁移表结构来源：[PG driver v0.3.4](https://github.com/imboy-pub/erlang_migrate/blob/v0.3.4/src/erlang_migrate_pg.erl)、[strict history v0.3.4](https://github.com/imboy-pub/erlang_migrate/blob/v0.3.4/src/erlang_migrate.erl)。
