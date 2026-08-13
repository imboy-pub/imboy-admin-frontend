-- 管理后台分页测试数据扩充播种（幂等；真实用户 1..15 满足 FK）
-- 用法：PGPASSWORD=abc54321 psql -h 127.0.0.1 -p 4323 -U imboy_user -d imboy_v1 -f tests/auto_test/scripts/seed_pagination_data.sql
DO $$
DECLARE
  adm bigint := 103119732858947584;
  cid bigint := 103209560378181632;
  gid bigint := 106571324669036544;
  i int;
  ruid bigint;
BEGIN
  FOR i IN 1..15 LOOP
    ruid := i;
    INSERT INTO announcement (id, adm_user_id, title, body, type, status, pinned, published_at, created_at, updated_at)
    SELECT 92000000000010000 + i, adm, 'e2e 公告 #' || i, '播种正文',
      (ARRAY['info','warning','important'])[1 + i % 3], 1, (i % 2 = 0), now() - (i || ' hours')::interval, now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM announcement WHERE id = 92000000000010000 + i);
    INSERT INTO report_ticket (id, target_type, target_id, reporter_uid, reason, description, status, created_at, updated_at)
    SELECT 92000000000011000 + i, 'moment', 92000000000000000 + i, ruid, 'spam', 'e2e 播种工单', (i % 3), now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM report_ticket WHERE id = 92000000000011000 + i);
    INSERT INTO moment_report (id, post_id, reporter_uid, reason, description, status, created_at, updated_at)
    SELECT 92000000000000100 + i, 92000000000000000 + i, ruid, 'spam', 'e2e 播种举报', (i % 3), now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM moment_report WHERE id = 92000000000000100 + i);
    INSERT INTO channel_subscription (id, channel_id, user_id, subscribed_at, unread_count, status)
    SELECT 92000000000012000 + i, cid, ruid, now() - (i || ' hours')::interval, i % 5, 1
    WHERE NOT EXISTS (SELECT 1 FROM channel_subscription WHERE id = 92000000000012000 + i);
    -- uk_channel_admin(channel_id,user_id) 唯一：避开已有 4 条的 user 1..4
    INSERT INTO channel_admin (id, channel_id, user_id, role, created_at)
    SELECT 92000000000013000 + i, cid, ruid, 1 + (i % 3), now() - (i || ' hours')::interval
    WHERE i >= 6 AND NOT EXISTS (SELECT 1 FROM channel_admin WHERE channel_id = cid AND user_id = ruid);
    INSERT INTO ai_agent_role (code, name, description, status, created_by, created_at, updated_at)
    SELECT 'e2e_role_' || i, 'e2e AI 角色 #' || i, '播种', 1, adm, now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM ai_agent_role WHERE code = 'e2e_role_' || i);
    INSERT INTO recharge_order (id, order_no, user_id, amount, currency, payment_method, status, expires_at, created_at, updated_at)
    SELECT 92000000000014000 + i, 'e2e_ro_' || i, ruid, 10 + i, 'CNY', 'wallet', 0, now() + interval '1 day', now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM recharge_order WHERE order_no = 'e2e_ro_' || i);
    INSERT INTO billing_plan (id, code, name, price, billing_period, description, status, created_at, updated_at)
    SELECT 92000000000015000 + i, 'e2e_plan_' || i, 'e2e 套餐 #' || i, 10 + i, 'month', '播种', 1, now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM billing_plan WHERE code = 'e2e_plan_' || i);
    INSERT INTO billing_subscription (id, plan_id, status, current_period_start, current_period_end, auto_renew, created_at, updated_at)
    SELECT 92000000000016000 + i, 92000000000015000 + i, 2, now() - interval '40 days', now() - interval '10 days', false, now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM billing_subscription WHERE id = 92000000000016000 + i);
    INSERT INTO billing_invoice (id, invoice_no, subscription_id, amount, currency, status, period_start, period_end, created_at, updated_at)
    SELECT 92000000000017000 + i, 'e2e_inv_' || i, 92000000000016000 + i, 10 + i, 'CNY', 2, now() - interval '30 days', now(), now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM billing_invoice WHERE invoice_no = 'e2e_inv_' || i);
    INSERT INTO payment_transaction (id, trade_no, biz_type, biz_order_no, user_id, gateway, amount, currency, status, created_at, updated_at)
    SELECT 92000000000018000 + i, 'e2e_txn_' || i, 1, 'e2e_ro_' || i, ruid, 'wallet', 10 + i, 'CNY', 1, now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM payment_transaction WHERE trade_no = 'e2e_txn_' || i);
    INSERT INTO channel (id, name, description, type, creator_uid, subscriber_count, status, created_at, updated_at)
    SELECT 92000000000019000 + i, 'e2e 频道 #' || i, '播种', 0, ruid, i, 1, now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM channel WHERE id = 92000000000019000 + i);
    INSERT INTO group_member (id, group_id, user_id, role, status, created_at, updated_at)
    SELECT 92000000000020000 + i, gid, ruid, 0, 1, now() - (i || ' hours')::interval, now()
    WHERE NOT EXISTS (SELECT 1 FROM group_member WHERE id = 92000000000020000 + i);
  END LOOP;
END $$;
