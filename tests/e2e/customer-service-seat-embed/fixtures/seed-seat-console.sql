-- SC-E2E seat console embed 真实 E2E — scratch 种子（幂等：ON CONFLICT DO NOTHING）。
--
-- 镜像 tests/e2e/customer-service-hosted/fixtures/seed-installations.sql 的全部行
-- （org/member/identity/assignment/seat 等 QR 登录与队列链路依赖的 FK 面一模一样），
-- 再叠加本计划新增的 customer_service_seat_console 行（迁移 00000153 建表）。
-- 全部为本地 scratch 合成 TSID/值，零生产凭据/PII。
-- 执行方式：docker exec -i <pg容器> psql -U <user> -d <scratch库> -f - < 本文件。
--
-- id 段（可经 harness-seat-embed.sh 用 sed 换成 CS153_E2E_ORG_ID /
-- CS153_E2E_WORKSPACE_ID / CS153_E2E_CONSOLE_PUBLIC_ID 等环境覆盖值；
-- 以下为默认值，与 helpers/env.ts 常量一一对应）：
--   owner user                 1603940848519154
--   organization               1603940848519155   (CS153_E2E_ORG_ID)
--   workspace                  1603940848519156   (CS153_E2E_WORKSPACE_ID)
--   business identity          1603940848519157
--   retention policy           1603940848519158 / 1603940848519159
--   widget installation        1603940848519160（访客链路用；public_widget_id 702000000000000101）
--   identity assignment        1603940848519161
--   seat console               7003004002001001   (CS153_E2E_CONSOLE_PUBLIC_ID，public id = id 十进制串)
--
-- 注意：坐席登录账号（passport/signup 建号）的 uid 需绑定到本种子的成员行，
-- 见同目录 harness-seat-embed.sh 的「坐席绑定」步骤（UPDATE organization_member 等行）。

BEGIN;

INSERT INTO "user" (id, nickname, account, password, reg_ip, reg_cosv)
VALUES (1603940848519154, 'sc153-e2e-owner', 'sc153-e2e-owner@cse2e.test', 'x', '127.0.0.1', 'e2e')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization (id, name, owner_id)
VALUES (1603940848519155, 'SC153 E2E Org', 1603940848519154)
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspace (id, name, owner_id, organization_id)
VALUES (1603940848519156, 'SC153 E2E WS', 1603940848519154, 1603940848519155)
ON CONFLICT (id) DO NOTHING;

-- customer_service_seat_console：本计划唯一 active console（合同 §5.1）。
-- allowed_origins 经 cs_widget:normalize_origin/1 同款口径：浏览器实际 origin
-- 含非默认端口，必须带 :18443。public_seat_console_id 全局唯一（公开非 secret）。
INSERT INTO customer_service_seat_console
  (id, organization_id, workspace_id, public_seat_console_id, allowed_origins, status, version, created_by_user_id)
VALUES
  (7003004002001001, 1603940848519155, 1603940848519156, '7003004002001001',
   '["https://shop.test:18443"]'::jsonb,
   'active', 1, 1603940848519154)
ON CONFLICT (id) DO NOTHING;

-- widget installation（访客链路 A04/A05/A09 用：shop.test/visitor.html 的 loader snippet）
INSERT INTO customer_service_widget_installation
  (id, organization_id, public_widget_id, display_name, allowed_origins, branding, consent_version, status)
VALUES
  (1603940848519160, 1603940848519155, '702000000000000101',
   'SC153 E2E Shop Widget',
   '["https://shop.test:18443"]'::jsonb,
   '{"primaryColor":"#2563eb"}'::jsonb,
   'v1', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_business_identity (id, organization_id, function_key, display_name, created_by_user_id)
VALUES (1603940848519157, 1603940848519155, 'customer_service', 'SC153 CS Intake', 1603940848519154)
ON CONFLICT DO NOTHING;

INSERT INTO enterprise_retention_policy (id, organization_id, workspace_id, data_class, version, retention_days, trigger_event, created_by_user_id)
VALUES
 (1603940848519158, 1603940848519155, 1603940848519156, 'enterprise_message', 1, 1095, 'conversation_closed', 1603940848519154),
 (1603940848519159, 1603940848519155, 1603940848519156, 'enterprise_asset',   1, 1095, 'conversation_closed', 1603940848519154)
ON CONFLICT DO NOTHING;

INSERT INTO organization_member (organization_id, user_id, role, status, joined_at)
VALUES (1603940848519155, 1603940848519154, 'owner', 'active', now())
ON CONFLICT DO NOTHING;

INSERT INTO organization_business_identity_assignment
  (id, organization_id, business_identity_id, function_key, user_id, status, assigned_at, assigned_by)
VALUES (1603940848519161, 1603940848519155, 1603940848519157, 'customer_service', 1603940848519154, 'active', now(), 1603940848519154)
ON CONFLICT DO NOTHING;

INSERT INTO customer_service_seat
  (organization_id, business_identity_id, function_key, enabled, max_concurrent, created_by_user_id)
VALUES (1603940848519155, 1603940848519157, 'customer_service', true, 1, 1603940848519154)
ON CONFLICT DO NOTHING;

COMMIT;
