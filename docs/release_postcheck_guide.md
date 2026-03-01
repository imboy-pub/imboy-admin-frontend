# Release Postcheck Guide (T+0 / T+1)

用于发布后快速执行可观测巡检，覆盖：

- 后端路由就绪（strict）
- 登录态业务链路（smoke）
- UX 埋点漏斗基线（SQL）

## 1. One Command

```bash
IMBOY_ADMIN_BASE_URL='http://localhost:8082/adm' \
IMBOY_ADMIN_COOKIE='k1=v1; k2=v2; ...' \
IMBOY_UX_DB_DSN='postgresql://user:pass@host:5432/db' \
bash scripts/run_release_postcheck.sh
```

输出会按 3 个阶段打印结果，并最终给出：

- `PASS`：通过项数量
- `FAIL`：失败项数量（>0 时命令返回非 0）
- `WARN`：跳过项数量（通常是未提供可选参数）

## 2. Parameter Notes

- `IMBOY_ADMIN_BASE_URL`：管理后端基址，默认 `http://localhost:8082/adm`
- `IMBOY_ADMIN_COOKIE`：登录态 Cookie（用于登录态 API 验收）
- `IMBOY_UX_DB_DSN`：PostgreSQL 连接串（用于漏斗基线 SQL）

## 3. Non-Destructive Defaults

- 登录态 smoke 默认执行“非破坏性探测”。
- 反馈配置保存路由探测默认开启（`PUT/POST`），用于确认写路径可用。
- 若要跳过保存探测：

```bash
bash scripts/run_release_postcheck.sh --no-config-save
```

## 4. Skip Controls

按需跳过阶段：

```bash
bash scripts/run_release_postcheck.sh --skip-readiness
bash scripts/run_release_postcheck.sh --skip-login-smoke
bash scripts/run_release_postcheck.sh --skip-ux-baseline
```

## 5. Recommended Rhythm

T+0（上线后 0-2 小时）：

1. 跑 `run_release_postcheck.sh`（至少包含 readiness + login smoke）
2. 检查举报处理批量链路可用
3. 观察 401/403/5xx 是否异常

T+1（上线后 24 小时）：

1. 跑 `run_release_postcheck.sh`（包含 UX baseline SQL）
2. 关注 `ux_batch_action_execute` 中 `execution_mode=batch` 占比
3. 复核反馈配置保存成功率与异常趋势

