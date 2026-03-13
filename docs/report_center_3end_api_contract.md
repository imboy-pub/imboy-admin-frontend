# Report Center 3-End API Contract

本文档用于对齐 IMBoy 举报体系在 3 端（APP 端、后端、管理后台端）的统一联调契约。

## 1. Scope

- 目标对象：`moment | group | channel | user`
- 统一状态：
  - `0` = 待处理
  - `1` = 已驳回
  - `2` = 违规确认
- 统一 envelope：

```json
{
  "code": 0,
  "msg": "ok",
  "payload": {}
}
```

## 2. 3-End Responsibilities

1. APP 端
- 提交举报工单（包含目标类型与目标 ID）
- 展示“已提交/处理中/已处理”状态（可选）

2. 后端
- 受理工单、查询工单、单条处理、批量处理
- 保证字段语义在 4 类对象上保持一致

3. 管理后台端
- 统一入口 `/reports`
- 已支持：
  - 列表筛选（状态、目标 ID）
  - 单条驳回 / 单条确认违规
  - 批量驳回 / 批量确认违规
  - 批量接口不可用时自动回退单条接口

## 3. API Contract

### 3.1 Create Report (APP -> Backend)

- Method: `POST`
- URL: `/adm/report/create`
- Request:

```json
{
  "target_type": "group",
  "target_id": 88,
  "reason": "spam",
  "description": "重复广告刷屏"
}
```

字段说明：

- `target_type`: `moment|group|channel|user`
- `target_id`: 被举报对象 ID
- `reason`: 举报原因编码或短文本
- `description`: 补充说明（可选）

### 3.2 List Reports (Admin)

- Method: `GET`
- URL: `/adm/report/list`
- Query:
  - `page` `size` `status`
  - `target_type`（非 moment 必传）
  - `target_id`（可选）
  - `reporter_uid`（可选）
  - `keyword`（可选）

Success payload（建议）：

```json
{
  "items": [
    {
      "id": 901,
      "target_type": "channel",
      "target_id": 3001,
      "reporter_uid": 2002,
      "reason": "porn",
      "description": "截图证据...",
      "status": 0,
      "handled_by": "",
      "handled_at": null,
      "created_at": "2026-03-01 10:00:00",
      "updated_at": "2026-03-01 10:00:00"
    }
  ],
  "page": 1,
  "size": 10,
  "total": 1,
  "total_pages": 1
}
```

### 3.3 Report Detail (Admin)

- Method: `GET`
- URL: `/adm/report/detail/:id`

### 3.4 Resolve Single (Admin)

- Method: `POST`
- URL: `/adm/report/resolve`
- Request:

```json
{
  "report_id": 901,
  "target_type": "channel",
  "result": 2,
  "note": "违规确认，执行禁言+清理"
}
```

### 3.5 Resolve Batch (Admin)

- Method: `POST`
- URL: `/adm/report/batch_resolve`
- Request:

```json
{
  "report_ids": [901, 902, 903],
  "target_type": "channel",
  "result": 1,
  "note": "批量驳回，证据不足"
}
```

Success payload（建议）：

```json
{
  "success_count": 2,
  "failed_count": 1,
  "failed_ids": [903]
}
```

## 4. Backend Compatibility (Current Frontend Behavior)

当前管理后台已实现“统一优先 + 分对象回退 + 单条回退”：

1. 列表查询
- 优先 `GET /adm/report/list`
- 回退 `GET /adm/{group|channel|user}/report/list`

2. 单条处理
- 优先 `POST /adm/report/resolve`
- 回退 `POST /adm/{group|channel|user}/report/resolve`

3. 批量处理
- 优先 `POST /adm/report/batch_resolve`
- 回退 `POST /adm/{group|channel|user}/report/batch_resolve`
- 若批量端点不可用，再回退逐条单条处理

端点不可用判定：`404 / 405 / 501`（或等价 unavailable 信号）。

## 5. cURL Acceptance Checklist

说明：将 `COOKIE` 替换为你的后台登录态 cookie。

```bash
BASE='http://localhost:8082/adm'
COOKIE='adm_user_id=...; adm_user_sig=...'
```

### 5.1 Auth

```bash
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/current" -H "Cookie: $COOKIE"
```

预期：`200`（已登录）或 `401`（未登录但路由存在）

### 5.2 Unified Routes

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$BASE/report/list?page=1&size=1&status=-1&target_type=group" \
  -H "Cookie: $COOKIE"

curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST "$BASE/report/resolve" \
  -H 'Content-Type: application/json' \
  -H "Cookie: $COOKIE" \
  -d '{"report_id":1,"target_type":"group","result":1,"note":"probe"}'

curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST "$BASE/report/batch_resolve" \
  -H 'Content-Type: application/json' \
  -H "Cookie: $COOKIE" \
  -d '{"report_ids":[1,2],"target_type":"group","result":1,"note":"probe"}'
```

预期：`200/400/401/403` 视为“路由已存在”；`404/405/501` 视为“未接入”。

### 5.3 Target Fallback Routes (Optional but recommended)

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$BASE/group/report/list?page=1&size=1&status=-1" \
  -H "Cookie: $COOKIE"
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$BASE/channel/report/list?page=1&size=1&status=-1" \
  -H "Cookie: $COOKIE"
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$BASE/user/report/list?page=1&size=1&status=-1" \
  -H "Cookie: $COOKIE"
```

## 6. One-Command Readiness Script

前端仓库已提供脚本：

```bash
bash scripts/check_report_backend_readiness.sh --strict
```

可选环境变量：

- `IMBOY_ADMIN_BASE_URL`（默认 `http://localhost:8082/adm`）
- `IMBOY_ADMIN_COOKIE`

## 7. Rollout Checklist

1. 后端先发布统一接口：`/adm/report/*`
2. 若统一接口尚未完备，至少保证分对象 fallback 接口存在
3. 压测批量处理（100 条/次）并观察失败率
4. 线上观察 24h：
   - 批量成功率
   - 回退模式占比
   - 误判/误封投诉量
