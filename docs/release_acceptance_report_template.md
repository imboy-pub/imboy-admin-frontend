# 发布验收报告模板（管理后台）

> 用途：直接复制到发布单/Jira/飞书审批。  
> 范围：朋友圈治理、举报批量处理、反馈配置、UX 埋点、后端就绪门禁。

## 1. 基本信息

- 发布版本：
- 发布环境：
- 验收日期：
- 验收负责人：
- 协作团队：前端 / 后端 / 测试 / 运维
- 后端基址（Base URL）：

## 2. 验收结论

- 结论：`通过 / 不通过`
- 发布建议：`允许发布 / 暂缓发布`
- 阻断项（如有）：

## 3. 验收范围

- 朋友圈菜单与权限可见性
- 朋友圈动态列表（查询/分页）
- 举报处理列表（查询/分页）
- 举报批量处理（批量端点优先 + 回退策略）
- 反馈配置读写（GET/PUT/POST）
- UX 埋点上报路由可达

## 4. 门禁结果（自动化）

### 4.1 后端就绪门禁

执行命令：

```bash
IMBOY_ADMIN_BASE_URL='<BASE_URL>' bash scripts/check_ux_backend_readiness.sh --strict
```

验收口径：

- `READY=6`
- `MISSING=0`
- `UNKNOWN=0`
- `UNREACHABLE=0`
- 退出码 `0`

结果摘要：

- READY：
- MISSING：
- UNKNOWN：
- UNREACHABLE：
- EXIT CODE：

### 4.2 登录态联调门禁

执行命令：

```bash
IMBOY_ADMIN_BASE_URL='<BASE_URL>' \
IMBOY_ADMIN_COOKIE='<COOKIE>' \
bash scripts/run_login_smoke_acceptance.sh --with-config-save
```

验收口径：

- `FAIL=0`
- `/current`、`/moment/list`、`/moment/report/list`、`/admin/config/feedback-workflow` 应为 `HTTP=200 + API code=0`

结果摘要：

- TOTAL：
- PASS：
- FAIL：

### 4.3 前端质量门禁

执行命令：

```bash
bun run lint
bun run test -- --run src/pages/moments/MomentListPage.test.tsx src/pages/moments/MomentReportPage.test.tsx src/services/api/payloadServices.test.ts
bun run build
```

结果摘要：

- lint：
- test：
- build：

## 5. 关键证据（建议附图/日志）

- readiness 严格检查输出截图：
- login smoke 输出截图：
- Network 抓包：
  - `GET /adm/moment/list`
  - `GET /adm/moment/report/list`
  - `POST /adm/moment/report/batch_resolve`
  - `GET/PUT /adm/admin/config/feedback-workflow`

## 6. 风险评估

- 当前已知风险：
- 潜在回归点：
- 数据一致性风险：
- 权限相关风险：

## 7. 回滚方案

- 前端回滚版本：
- 后端回滚版本：
- 回滚触发条件：
  - 登录态请求异常率升高
  - 举报处理核心链路失败
  - 反馈配置读写异常
- 回滚后验证命令：

```bash
IMBOY_ADMIN_BASE_URL='<BASE_URL>' bash scripts/check_ux_backend_readiness.sh --strict
```

## 8. 发布后观察项（T+0 / T+1）

- `ux_batch_action_execute` 中 `execution_mode=batch` 占比
- 举报处理成功率与失败率
- 反馈配置保存成功率
- 401/403/5xx 异常趋势

## 9. 签署

- 前端负责人：
- 后端负责人：
- 测试负责人：
- 发布负责人：
