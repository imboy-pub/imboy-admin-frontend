# Hosted Widget 真实 E2E（CP-ASSET-02）

第三方**托管（hosted）Widget 全链路真实 E2E**：最小 snippet → loader → 动态 iframe
（`/w/:public_widget_id`）→ bootstrap → 会话 → 访客消息 → 坐席回复（SSE 到达）→
关闭 → 评分 → PG 直证，另含负例（evil origin / revoked / 伪造 token / URL token /
org 申报）与合同头断言（S6 缓存/CSP）。

来源：从历史 run `cs-hosted-widget-20260920T150315Z` 的 CSD-E2E-03（round3，
6 passed）提取，脱敏并适配当前合同（`hosted-widget-contract` v1.1；frame 资产
`/widget-assets/cs-widget.v2.js`）。全部为本地 scratch 合成值，零生产凭据/PII。

## 两个 E2E 入口的分工

| 入口 | config | 覆盖面 | 依赖 |
|---|---|---|---|
| mock / dev-server 面（既有，本目录不改） | `playwright.config.ts` 等既有 config | Admin/UI 组件、坐席工作台等，允许 mock | dev server |
| 客服坐席域四域主链（既有 real 面） | `playwright.customer-service-real.config.ts` | 坐席工作台 + 宿主页为测试静态服务承载的客服主链 | backend 9802 |
| **hosted Widget 真实面（本目录）** | `playwright.customer-service-hosted.config.ts` | 第三方托管 snippet/loader/iframe 真实网络栈：nginx TLS 网关 + 真实 `dist-widget` 产物 + 真实 backend + PG 直证 | backend 9805（scratch 库）+ nginx 四域 |

三条纪律（与历史 run 一致）：

1. **禁止 `page.route` / mock backend** —— 全部请求走真实栈；
2. PG oracle 只经容器内 `psql` **只读直查**，不伪造行；
3. 坐席侧一律走真实 HTTP 通道（passport/login + eb_tenant/cs_tenant API），零 SQL 模拟。

## 四域本地拓扑

```text
shop.test:18443   第三方宿主页（合法 origin；snippet 挂载点）
cs.test:18443     Widget 网关（TLS；/v1/loader.js、/assets/、/widget/、/widget-assets/
                  → dist-widget 静态产物；/w/* 与 /api/v1/cs/widget/* → backend）
shop2.test:18443  evil 宿主（负例 origin；不在 installation allowlist）
api.test:18443    Backend 主 API 面（坐席通道直连 BE_MAIN，不经网关）
```

域名解析用 Chromium `--host-resolver-rules` 映射 127.0.0.1（不改 `/etc/hosts`），
并 `--no-proxy-server`（本机系统代理会绕过 MAP）。证书为 harness 生成的 2 天期
自签 `*.test` 证书，仅限本地测试域，`ignoreHTTPSErrors: true`。

## 运行（本机或 CI 可选 job）

前置（外部提供）：

1. **PG**：docker 容器 `imboy_pg18`（PostgreSQL 18，扩展齐全）在跑；
2. **Backend**：imboy 仓起本地节点（scratch 库），监听 `9805`。要点：
   - `config/sys.local.config`（gitignore 的本地文件）的 `pg_conf`/`super_account`
     指向 scratch 库（默认 `imboy_cp12_e2e02`），节点启动时 auto-migrate 到 head；
   - 配置 `{verification_master_code, <<"abc12345">>}`（本目录 harness/seed 的默认
     万能验证码，可经 `CP12_E2E_MASTER_CODE` 覆盖）、
     `{cs_widget_subject_key, <<64-hex>>}`（bootstrap subject HMAC 材料）、
     `{eb_enterprise_keyring, #{active_version => 1, keys => #{1 => <<64-hex>>}}}`
     （contact 托管加密）。三者缺失时 bootstrap/signup 会以对应 500/验证码错误
     fail-closed —— 这是合同行为，不是缺陷；
   - 后端节点启动/停止属 imboy 主仓运维，不在本仓脚本范围内。

一键拉起其余环境（幂等）并校验：

```bash
bash tests/e2e/customer-service-hosted/fixtures/harness.sh
```

harness 负责：建 scratch 库 + 扩展、迁移 head 校验（auto-migrate 结果）、种子、
坐席 signup/login + uid 绑定、`bun run build:widget`、生成证书/宿主页/nginx 四域。

跑测试（单 worker 串行，约 2 分钟）：

```bash
bunx playwright test -c playwright.customer-service-hosted.config.ts
# 本机亦可：bunx playwright test -c playwright.customer-service-hosted.config.ts
```

6 个用例：浏览器内主链（全链 + 载荷零 org + SSE 渲染 + PG 对账）、SSE 协议面钉死
（message 帧 id = DB 行 id）、revoked 负例、负例组合（origin/伪造 token/URL token/
org 申报）、合同头断言（no-store / frame-ancestors / no-cache / immutable）、
SSE 首帧时延（x3 < 1s）。

## CI 可选 job（示例）

```yaml
e2e-cs-hosted:
  # 可选 job：需要 backend scratch 节点与 docker PG service；失败不阻塞主干。
  when: manual
  allow_failure: true
  script:
    - bash tests/e2e/customer-service-hosted/fixtures/harness.sh
    - bunx playwright test -c playwright.customer-service-hosted.config.ts
  artifacts:
    when: always
    paths: [tests/e2e/customer-service-hosted/.artifacts/]
```

job 需先以服务容器拉起 `imboy_pg18` 等价 PG18 镜像，并以 scratch 配置启动 imboy
backend（见上文「前置」）；harness 自身幂等，可重复运行。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `CP12_E2E_BACKEND` | `http://127.0.0.1:9805` | 坐席面/网关 upstream 的 backend |
| `CP12_E2E_PG_DB` | `imboy_cp12_e2e02` | scratch 库名 |
| `CP12_E2E_PG_CONTAINER` | `imboy_pg18` | PG docker 容器名 |
| `CP12_E2E_PG_USER` | `imboy_user` | PG 用户 |
| `CP12_E2E_MASTER_CODE` | `abc12345` | 万能验证码（需与 backend 配置一致） |
| `CP12_E2E_SEAT_ACCOUNT` / `CP12_E2E_SEAT_PASSWORD` | `19900000001` / `Cp12E2e2026` | 合成坐席（仅本地 scratch） |

## 本目录文件

```text
hosted-widget-real.spec.ts        6 用例真实 E2E
helpers/env.ts                    常量 + psql oracle + 坐席 HTTP 通道
fixtures/seed-installations.sql   scratch 种子（幂等；固定 TSID）
fixtures/harness.sh               四域拓扑一键拉起（幂等）
README.md                         本文件
```
