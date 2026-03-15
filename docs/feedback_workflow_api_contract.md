# Feedback Workflow API Contract

本文档定义反馈模板与 SLA 配置的前后端契约，供管理后台与配置服务联调使用。

## 1. Read Config

- Method: `GET`
- URL: `/adm/admin/config/feedback-workflow`
- Success response (推荐):

```json
{
  "code": 0,
  "msg": "ok",
  "payload": {
    "reply_templates": [
      "感谢反馈，我们已收到并会尽快处理。",
      "问题已记录到修复队列，预计将在后续版本优化。"
    ],
    "sla_hours": 24
  }
}
```

前端兼容规则：

- `reply_templates` 为空时，前端回退默认模板。
- `sla_hours` 非法时，前端回退默认值，并限制在 `1-720` 小时。
- 接口不可用时，前端回退本地配置，再回退默认配置。

## 2. Save Config

- Method priority: `PUT` first, fallback `POST`
- URL: `/adm/admin/config/feedback-workflow`（可通过 `VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL` 覆盖）
- Request body:

```json
{
  "reply_templates": [
    "感谢反馈，我们已收到并会尽快处理。",
    "请补充相关截图和复现步骤，便于我们进一步排查。"
  ],
  "sla_hours": 24
}
```

- Success response:
  - 可返回标准 envelope（`code=0` + `payload`），也可返回 `204 No Content`。
  - 若返回 `payload`，建议仍使用 `reply_templates` 与 `sla_hours` 字段。

失败处理策略：

- `404/405`：视为后端暂未开放保存接口，前端自动回退本地保存（`localStorage`）。
- 其他非 2xx：前端同样回退本地保存，避免阻断运营配置。

## 3. Frontend Env

- `VITE_FEEDBACK_WORKFLOW_CONFIG_URL`
- `VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL`

默认值均为：`/adm/admin/config/feedback-workflow`

## 4. Readiness Check

前端仓库当前没有单独覆盖反馈工作流配置的 readiness 脚本。联调时可先执行现有通用检查：

```bash
bash scripts/check_report_backend_readiness.sh --strict
bash scripts/check_admin_role_backend_readiness.sh --strict
```

反馈工作流配置接口建议额外通过下列方式验证：

- `bun test src/services/api/feedbackWorkflowConfig.test.ts`
- 反馈工作流页面实际读取与保存联调

反馈工作流自身涉及的关键接口如下：

- `GET /adm/current`
- `GET /adm/admin/config/feedback-workflow`
- `PUT /adm/admin/config/feedback-workflow`
- `POST /adm/admin/config/feedback-workflow`
