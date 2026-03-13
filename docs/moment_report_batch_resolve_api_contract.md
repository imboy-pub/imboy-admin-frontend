# Moment Report Batch Resolve API Contract

本文档定义“朋友圈举报批量处理”前后端联调契约，用于管理后台与治理服务协同上线。

## 1. Endpoint

- Method: `POST`
- URL: `/adm/moment/report/batch_resolve`
- Frontend service path: `/moment/report/batch_resolve`（已由 `VITE_API_BASE_URL=/adm` 自动拼接）

## 2. Request

```json
{
  "report_ids": [701, 702, 703],
  "result": 2,
  "note": "admin_batch_confirm_violation"
}
```

字段说明：

- `report_ids`: 举报 ID 数组，最少 1 条，建议后端限制单次 100~500 条。
- `result`: 处理结果
  - `1` = 驳回举报
  - `2` = 确认违规
- `note`: 处理备注，可选。

## 3. Success Response

推荐返回标准 envelope：

```json
{
  "code": 0,
  "msg": "ok",
  "payload": {
    "success_count": 2,
    "failed_count": 1,
    "failed_ids": [703]
  }
}
```

兼容建议：

- `payload` 可包含 `success_count` / `failed_count` / `failed_ids`，字段缺失时前端会做兜底推断。
- `failed_ids` 为空数组表示全部成功。

## 4. Error Handling Contract

前端已实现“批量优先 + 单条回退”：

- 当批量端点返回 `404/405/501`（或等价 unavailable 信号）时，前端自动回退逐条调用 `/adm/moment/report/resolve`。
- 非“端点不可用”错误（如参数/权限/业务失败）不会回退，会直接提示批量失败。

因此建议：

- 端点未发布阶段返回 `404` 或 `405`，前端可平滑回退。
- 端点已发布后，业务错误请返回明确错误码和错误信息，避免被误判为“未发布”。

## 5. Telemetry Alignment

批量操作完成后，前端会上报：

- event: `ux_batch_action_execute`
- payload keys:
  - `action_key = "report_batch_resolve"`
  - `phase = "summary"`
  - `selected_count`
  - `success_count`
  - `failed_count`
  - `execution_mode`（`batch` 或 `fallback`）

该字段可用于区分“真实批量处理”与“回退单条处理”的生产占比。

## 6. Backend Rollout Checklist

1. 上线 `/adm/moment/report/batch_resolve` 并返回标准 envelope。
2. 批量接口与单条接口权限模型保持一致（建议统一要求 `moments:report:handle`）。
3. 压测单次 100 条请求，确认 P95/P99 时延与失败率可接受。
4. 验证 `failed_ids` 与真实失败记录一致。
5. 发布后观察 24 小时：
   - `execution_mode=batch` 占比显著提升。
   - `failed_count` 分布稳定，无异常突增。

## 7. Smoke Test (Manual)

1. 登录管理后台，进入“运营中心 -> 朋友圈治理 -> 举报处理”。
2. 选中多条待处理举报，执行“批量驳回”或“批量确认违规”。
3. 预期：
   - 成功 toast 展示成功条数；
   - 部分失败时展示失败条数；
   - 接口未上线时，toast 标注“已回退单条接口”。

