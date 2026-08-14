-- 第五阶段播种：wallet/提现流水/mcp_client/push_token/app_ddl/app_version（幂等）
-- 用法：PGPASSWORD=abc54321 psql -h 127.0.0.1 -p 4323 -U imboy_user -d imboy_v1 -f tests/auto_test/scripts/seed_phase5_data.sql
DO $$
DECLARE
  adm bigint := 103119732858947584;
  i int;
  ruid bigint;
BEGIN
  FOR i IN 1..15 LOOP
    ruid := i;
    INSERT INTO wallet (id, user_id, balance, frozen, version, status, created_at, updated_at)
    SELECT 92000000000021000 + i, ruid, 10000 + i * 100, 0, 1, 1, now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM wallet WHERE user_id = ruid);
    -- 提现流水（tx_type=10 提现；status 0 待处理/1 完成/2 拒绝 分布）
    INSERT INTO wallet_transaction (id, wallet_id, user_id, amount, balance_after, tx_type, reference_no, remark, status, created_at)
    SELECT 92000000000022000 + i, (SELECT id FROM wallet WHERE user_id = ruid), ruid, 100 + i, 9000 + i * 100, 10, 'e2e_wd_' || i, 'e2e 提现', (i % 3), now() - (i || ' hours')::interval
    WHERE NOT EXISTS (SELECT 1 FROM wallet_transaction WHERE reference_no = 'e2e_wd_' || i);
    INSERT INTO mcp_client (client_id, owner_uid, name, description, status, reason, created_at, updated_at)
    SELECT 92000000000026000 + i, ruid, 'e2e MCP 客户端 #' || i, '播种', (ARRAY['pending','approved','revoked'])[1 + i % 3], 'e2e 申请', now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM mcp_client WHERE client_id = 92000000000026000 + i);
    INSERT INTO push_token (id, user_id, device_id, device_type, platform, token, status, created_at, updated_at)
    SELECT 92000000000023000 + i, ruid, 'e2e_dev_' || i, CASE WHEN i % 2 = 0 THEN 'android' ELSE 'ios' END, CASE WHEN i % 2 = 0 THEN 'fcm' ELSE 'apns' END, 'e2e_token_' || i, 1, now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM push_token WHERE token = 'e2e_token_' || i);
    INSERT INTO app_ddl (id, ddl, down_ddl, admin_user_id, old_vsn, new_vsn, status, created_at, updated_at)
    SELECT 92000000000024000 + i, 'SELECT ' || i || ';', 'SELECT ' || i || ';', adm, i, i + 1, 1, now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM app_ddl WHERE id = 92000000000024000 + i);
    INSERT INTO app_version (id, region_code, type, package_name, app_name, vsn, description, force_update, sort, status, created_at, updated_at)
    SELECT 92000000000025000 + i, 'CN', 1, 'com.imboy.app', 'imboy', '1.0.' || i, 'e2e 版本 #' || i, false, i, 1, now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM app_version WHERE id = 92000000000025000 + i);
  END LOOP;
END $$;

-- 注销申请（user_log type=102，JOIN user 取 account/nickname）
INSERT INTO user_log (ts, type, uid, body, remark, created_at)
SELECT now() - (i || ' hours')::interval, 102, i,
  jsonb_build_object('device_id', 'e2e_dev_' || i, 'app_version', '1.0.' || (i % 9), 'device_type', CASE WHEN i % 2 = 0 THEN 'android' ELSE 'ios' END, 'ip', '127.0.0.1', 'reason', 'e2e 播种注销'),
  'e2e_logout_apply', now() - (i || ' hours')::interval
FROM generate_series(1, 15) AS i
WHERE NOT EXISTS (SELECT 1 FROM user_log WHERE type = 102 AND uid = i AND remark = 'e2e_logout_apply');
