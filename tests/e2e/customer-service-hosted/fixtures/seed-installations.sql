-- CP-ASSET-02 hosted Widget 真实 E2E — scratch 种子（幂等：ON CONFLICT DO NOTHING）。
--
-- 从历史 run cs-hosted-widget-20260920T150315Z（round3 seed）脱敏并适配当前合同。
-- 全部为本地 scratch 合成 TSID/值，零生产凭据/PII。
-- 执行方式：docker exec -i <pg容器> psql -U <user> -d <scratch库> -f - < 本文件。
--
-- 注意：坐席登录账号（passport/signup 建号）的 uid 需绑定到本种子的成员行，
-- 见同目录 harness.sh 的「坐席绑定」步骤（UPDATE organization_member 等行）。

BEGIN;

INSERT INTO "user" (id, nickname, account, password, reg_ip, reg_cosv)
VALUES (700100000000000001, 'cp12-e2e-owner', 'cp12-e2e-owner@cse2e.test', 'x', '127.0.0.1', 'e2e')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization (id, name, owner_id)
VALUES (700200000000000001, 'CP12 E2E Org', 700100000000000001)
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspace (id, name, owner_id, organization_id)
VALUES (700300000000000001, 'CP12 E2E WS', 700100000000000001, 700200000000000001)
ON CONFLICT (id) DO NOTHING;

-- installation A：active；允许嵌入 origin = https://shop.test:18443
INSERT INTO customer_service_widget_installation
  (id, organization_id, public_widget_id, display_name, allowed_origins, branding, consent_version, status)
VALUES
  (700400000000000001, 700200000000000001, '702000000000000001',
   'CP12 E2E Shop Widget',
   '["https://shop.test:18443"]'::jsonb,
   '{"primaryColor":"#2563eb"}'::jsonb,
   'v1', 'active')
ON CONFLICT (id) DO NOTHING;

-- installation B：revoked（kill switch 负例）
INSERT INTO customer_service_widget_installation
  (id, organization_id, public_widget_id, display_name, allowed_origins, branding, consent_version, status, revoked_at)
VALUES
  (700400000000000002, 700200000000000001, '702000000000000002',
   'CP12 E2E Revoked Widget',
   '["https://shop.test:18443"]'::jsonb,
   '{}'::jsonb,
   'v1', 'revoked', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_business_identity (id, organization_id, function_key, display_name, created_by_user_id)
VALUES (700500000000000001, 700200000000000001, 'customer_service', 'CP12 CS Intake', 700100000000000001)
ON CONFLICT DO NOTHING;

INSERT INTO enterprise_retention_policy (id, organization_id, workspace_id, data_class, version, retention_days, trigger_event, created_by_user_id)
VALUES
 (700600000000000001, 700200000000000001, 700300000000000001, 'enterprise_message', 1, 1095, 'conversation_closed', 700100000000000001),
 (700600000000000002, 700200000000000001, 700300000000000001, 'enterprise_asset',   1, 1095, 'conversation_closed', 700100000000000001)
ON CONFLICT DO NOTHING;

INSERT INTO organization_member (organization_id, user_id, role, status, joined_at)
VALUES (700200000000000001, 700100000000000001, 'owner', 'active', now())
ON CONFLICT DO NOTHING;

INSERT INTO organization_business_identity_assignment
  (id, organization_id, business_identity_id, function_key, user_id, status, assigned_at, assigned_by)
VALUES (700700000000000001, 700200000000000001, 700500000000000001, 'customer_service', 700100000000000001, 'active', now(), 700100000000000001)
ON CONFLICT DO NOTHING;

INSERT INTO customer_service_seat
  (organization_id, business_identity_id, function_key, enabled, max_concurrent, created_by_user_id)
VALUES (700200000000000001, 700500000000000001, 'customer_service', true, 1, 700100000000000001)
ON CONFLICT DO NOTHING;

COMMIT;
