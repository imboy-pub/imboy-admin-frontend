# Seat Console Embed 真实 E2E（SC-E2E）

商城管理后台 **iframe 直嵌坐席工作台** 的真实浏览器 E2E：
`<iframe src="https://cs.imboy.pub/seat/<public_seat_console_id>" sandbox="allow-scripts allow-same-origin allow-downloads" referrerpolicy="no-referrer">`
→ cs 网关 → backend 动态 frame（CSP frame-ancestors 按 console allowed_origins）→
QR 扫码登录（Seat JWT 内存 vault）→ 队列/消息/SSE/附件 → origin 轮换 / revoke /
sandbox 负例能力 → 泄漏门。

## 阶段门（FIXTURE_ONLY → EXECUTE）

| 文件 | 阶段 | 说明 |
|---|---|---|
| `contract.spec.ts` | **FIXTURE_ONLY 即跑**（现在） | 纯静态合同：`harness-seat-embed.sh --print-config-only` 渲染的 nginx 模板逐条实现 SC-OPS 合同（/seat/ 代理、四组 API 白名单、无全量 /api/v1/、seat-assets 缓存、SSE buffering off、网关零注入 CSP/XFO）+ 宿主 iframe snippet 冻结片段（sandbox 精确三值 / no-referrer / 零凭证标记）+ 种子↔常量↔宿主页同源。无需 backend/docker/nginx。 |
| `journey.spec.ts`（A01..A10） | **EXECUTE-GATED**（`SC153_E2E_EXECUTE=1` 才跑） | 真实业务旅程。A0 在 **SC-INT PASS + candidate manifest 冻结** 后置位。FIXTURE_ONLY 阶段 0 条执行，skipped 分类 = EXECUTE_GATED。 |

A01 合法宿主 iframe + /seat/ 路径 + QR SVG；A02 evil.test 浏览器实际 CSP 拒绝；
A03 QR 真实闭环 + JWT 零落地 + Admin Cookie 不放行；A04 claim→发文本→SSE 收敛；
A05 sandbox iframe 内附件闭环（presign→PUT→confirm→发送→预览→下载）；
A06 origin 轮换（snippet 不变）；A07 revoke（新加载 404 `seat_console_unavailable`，
已打开 frame 不强制终止）；A08 `/customer-service/workspace` 不再提供工作台而运营页正常；
A09 泄漏门（JWT/secret/手机号零泄漏）；A10 sandbox 精确属性 + top-nav/popup/form 负例。

## 域名映射（唯一映射，全程一致）

| 生产 | 本地（TLS 18443） | 角色 |
|---|---|---|
| `https://cs.imboy.pub` | `https://cs.test:18443` | seat 网关（/seat/* + 四组 API + /seat-assets/* 静态） |
| 商城管理后台 origin | `https://shop.test:18443` | 合法宿主（iframe snippet）+ `/visitor.html` 访客页 |
| （A06 轮换目标） | `https://shop2.test:18443` | 第二合法宿主 |
| （负例） | `https://evil.test:18443` | evil 宿主（永不在 allowed_origins） |
| Admin SPA | `https://admin.test:18443` | Admin 治理面（A08） |

域名解析用 Chromium `--host-resolver-rules` MAP 127.0.0.1（不改 /etc/hosts）+
`--no-proxy-server`；证书为 harness 生成的 2 天期自签 `*.test`（`ignoreHTTPSErrors`）。

## 纪律（与 hosted/P2 一致）

1. 禁止 `page.route` / mock backend —— 全部请求走真实栈；
2. PG oracle 只经容器内 `psql`（只读直查 + 测试夹具显式 UPDATE，如 A06/A07 的
   allowed_origins/status 落库等价物，均为文档化 oracle）；
3. 负例断言用 **浏览器侧事实**（console enforcement message + frame 未提交），
   不把响应头字符串当 oracle。

## 已知边界 / 未测区（REVIEW-4 F5/F7）

**本套件禁止并行执行**（跨 run 会互扰，多个 run 只能串行跑）：

- `closeStaleActiveSessions()`（`helpers/env.ts`）是 **全 workspace UPDATE**——
  `UPDATE customer_service_session ... WHERE organization_id=? AND workspace_id=?
  AND status='active'`，不带任何 run 维度隔离。并行 run 的清理会把对方
  正在操作的 active 会话一并关掉；坐席 `max_concurrent=1` 的前置也依赖
  干净现场，互扰即双双翻车。
- 访客建会话后的会话 id oracle 是 **按 id DESC 取最新一行**
  （`journey.spec.ts` `newVisitorSession` 的 `ORDER BY id DESC LIMIT 1`），
  同样不带 run 隔离——多 run 并行时可能取到**他人 run 刚建的会话**，
  后续 sessionId/conversationId 断言全部错位。

**并发盲区清单**（本套件未覆盖、真实多实例行为未在 EXECUTE 阶段验证）：

1. **双坐席 claim 竞争**：A04 只走单坐席 claim 成功路径；两个坐席对同一
   queued 会话并发 CAS claim 恰一成功、失败方收到 409 后列表自动收敛的
   端到端竞争未在真实浏览器 + 真实后端上验证（组件级 409 收敛已有单测）。
2. **SSE visitor→agent 半向**：访客发消息 → 坐席侧 SSE 实时收敛由 A04 覆盖；
   反方向（坐席回复 → 访客侧实时刷新）依赖访客页事件通道，本套件只断言
   坐席侧，访客侧实时性是盲区。
3. **多 run 并行**：即上两条的根因——全 workspace UPDATE 与 id DESC 最新行
   oracle 都隐含"同一时刻只有一个 run 在跑"；要支持并行须先引入 run 级
   隔离（独立 org/workspace 种子，或会话标记/前缀过滤）。

## 运行（EXECUTE 阶段）

前置（外部提供）：

1. **PG**：docker 容器 `imboy_pg18` 在跑；
2. **Backend**：imboy 仓本地节点监听 `9801`（scratch 库 `sc153_e2e`，auto-migrate
   到 head —— 必须含 `00000153 customer_service_seat_console`）。要点：
   - `{verification_master_code, <<"abc12345">>}`（harness 万能验证码）；
   - `{cs_widget_subject_key, <<64-hex>>}`、`{eb_enterprise_keyring, ...}`（同 hosted）；
3. **Admin 首启**（A08 用）：`/api/adm/setup/init` 建超管（captcha `1234` 为 local
   合同测试码；账号默认 `sc153-admin-e2e@imboy.local`）—— setup/init 密码走页内
   RSA 加密，harness 不在 bash 里复刻，与 P2 同口径由 run 环境提供，脚本只探测告警。

一键拉起其余环境（幂等）：

```bash
bash tests/e2e/customer-service-seat-embed/fixtures/harness-seat-embed.sh
SC153_E2E_EXECUTE=1 bunx playwright test --config=playwright.customer-service-seat-embed.config.ts
```

只验证模板生成（零副作用，FIXTURE_ONLY 的静态合同测试即基于它）：

```bash
bash tests/e2e/customer-service-seat-embed/fixtures/harness-seat-embed.sh --print-config-only
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `SC153_E2E_EXECUTE` | 未设置 | EXECUTE 阶段门；`1` 才跑 journey.spec.ts |
| `SC153_E2E_BACKEND` | `http://127.0.0.1:9801` | scratch backend |
| `SC153_E2E_PG_DB` | `sc153_e2e` | scratch 库名 |
| `SC153_E2E_PG_CONTAINER` / `SC153_E2E_PG_USER` | `imboy_pg18` / `imboy_user` | PG 容器/用户 |
| `SC153_E2E_MASTER_CODE` | `abc12345` | 万能验证码（与 backend 配置一致） |
| `SC153_E2E_SEAT_ACCOUNT` / `SC153_E2E_SEAT_PASSWORD` | `19900000002` / `Sc153E2e2026` | 合成坐席（仅本地 scratch） |
| `SC153_E2E_ADMIN_ACCOUNT` / `SC153_E2E_ADMIN_PASSWORD` | `sc153-admin-e2e@imboy.local` / `Sc153AdmE2e2026` | Admin 治理面账号（A08） |
| `SC153_E2E_ORG_ID` / `SC153_E2E_WORKSPACE_ID` / `SC153_E2E_CONSOLE_PUBLIC_ID` | `1603940848519155` / `1603940848519156` / `7003004002001001` | 种子 TSID（harness sed 种子；env.ts 同源默认） |
| `SC153_E2E_WIDGET_ID` | `702000000000000101` | 访客链路 widget installation |
| `SC153_E2E_CS_ORIGIN` | `https://cs.test:18443` | cs 网关 frame origin |
| `SC153_E2E_SKIP_ADMIN_BUILD` | `0` | 跳过 Admin SPA 构建（A08 才需要 dist） |

## 本目录文件

```text
contract.spec.ts                          静态合同测试（现在就跑）
journey.spec.ts                           A01..A10 真实旅程（EXECUTE-GATED）
helpers/env.ts                            常量 + psql oracle + 夹具/坐席 HTTP 通道
helpers/qr-embed.ts                       宿主 iframe 内 QR 登录驱动 + 访客建会话
helpers/gateway-probe.ts                  curl 预检探针（--resolve 钉 127.0.0.1）
helpers/admin-ui.ts                       Admin SPA 登录驱动（P2 admin-ui 参数化副本）
fixtures/harness-seat-embed.sh            五域拓扑一键拉起（幂等；--print-config-only）
fixtures/seed-seat-console.sql            scratch 种子（镜像 hosted 种子 + console 行）
fixtures/host-shop.html / host-shop2.html / host-evil.html / host-visitor.html
                                          宿主页/访客页模板（__SC153_* 占位符）
README.md                                 本文件
```
