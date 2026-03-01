# 发布验收报告（2026-03-01）

## 1. 基本信息

- 发布模块：IMBoy 管理后台（朋友圈治理）
- 发布环境：本地联调环境
- 验收日期：2026-03-01
- 后端基址：`http://localhost:8082/adm`

## 2. 验收结论

- 结论：`通过`
- 发布建议：`允许进入发布流程`
- 阻断项：无

## 3. 验收范围

- 朋友圈菜单可见性与权限兼容
- 动态列表读链路（分页/筛选）
- 举报处理读链路（分页/筛选）
- 举报批量处理路由可达
- 反馈配置读写路由可达
- UX 埋点上报路由可达

## 4. 门禁结果（自动化）

### 4.1 后端就绪门禁（strict）

执行命令：

```bash
IMBOY_ADMIN_BASE_URL='http://localhost:8082/adm' \
bash scripts/check_ux_backend_readiness.sh --strict
```

结果（通过）：

- `GET /current -> 401 READY`
- `POST /admin/ux/events -> 401 READY`
- `POST /moment/report/batch_resolve -> 401 READY`
- `GET /admin/config/feedback-workflow -> 401 READY`
- `PUT /admin/config/feedback-workflow -> 401 READY`
- `POST /admin/config/feedback-workflow -> 401 READY`
- Summary：`TOTAL=6 READY=6 MISSING=0 UNKNOWN=0 UNREACHABLE=0`
- Exit code：`0`

说明：`401 READY` 表示路由已挂载且鉴权生效。

### 4.2 登录态联调门禁（with config save）

执行命令：

```bash
IMBOY_ADMIN_BASE_URL='http://localhost:8082/adm' \
IMBOY_ADMIN_COOKIE='<已登录 Cookie>' \
bash scripts/run_login_smoke_acceptance.sh --with-config-save
```

结果（通过）：

- Auth current payload：`HTTP 200 / API 0 / PASS`
- Moment list payload：`HTTP 200 / API 0 / PASS`
- Moment report list payload：`HTTP 200 / API 0 / PASS`
- Feedback config read payload：`HTTP 200 / API 0 / PASS`
- Moment batch resolve route probe：`HTTP 200 / API 400 / PASS(reachable)`
- Feedback config save (PUT) route probe：`HTTP 200 / API 0 / PASS`
- Feedback config save (POST) route probe：`HTTP 200 / API 0 / PASS`
- Summary：`TOTAL=7 PASS=7 FAIL=0`

说明：批量路由探针使用安全参数，`API 400` 表示业务参数校验触发，但接口路由可达且鉴权通过，验收判定为 PASS。

### 4.3 前端质量门禁

执行命令：

```bash
bun run lint
bun run test -- --run src/pages/moments/MomentListPage.test.tsx src/pages/moments/MomentReportPage.test.tsx src/services/api/payloadServices.test.ts
bun run build
```

结果：

- lint：通过
- test：27 pass / 0 fail
- build：通过

## 5. 关键证据

- 严格门禁：`READY=6`、退出码 `0`
- 登录态 smoke：`PASS=7`、`FAIL=0`
- 关键链路返回：
  - `/adm/current`
  - `/adm/moment/list`
  - `/adm/moment/report/list`
  - `/adm/moment/report/batch_resolve`
  - `/adm/admin/config/feedback-workflow`

## 6. 风险与建议

- 已知低风险：批量路由探针使用非业务参数会返回 `API 400`，属预期行为。
- 建议上线后观察：
  - `ux_batch_action_execute` 的 `execution_mode` 分布
  - 举报批量处理成功率
  - 反馈配置写入成功率

## 7. 回滚点

- 若上线后出现以下任一问题，触发回滚：
  - 举报处理核心链路不可用
  - 反馈配置无法读写
  - 大量 401/403/5xx 异常

回滚后复核：

```bash
IMBOY_ADMIN_BASE_URL='http://localhost:8082/adm' \
bash scripts/check_ux_backend_readiness.sh --strict
```

## 8. 最终判定

- 判定：`Go`
- 说明：本次验收已满足发布门禁与登录态联调门槛，可进入发布流程。
