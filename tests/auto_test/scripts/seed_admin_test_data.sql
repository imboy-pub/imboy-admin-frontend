-- 管理后台测试数据播种（幂等：目标表为空时才插入）
-- 用法：PGPASSWORD=abc54321 psql -h 127.0.0.1 -p 4323 -U imboy_user -d imboy_v1 -f tests/auto_test/scripts/seed_admin_test_data.sql
-- 关联上下文：用户 106808244793772032 / 群 106571324669036544 / 频道 103209560378181632
DO $$
DECLARE
  uid bigint := 106808244793772032;
  gid bigint := 106571324669036544;
  cid bigint := 103209560378181632;
  i int;
BEGIN
  IF (SELECT COUNT(*) FROM moment_post) = 0 THEN
    FOR i IN 1..12 LOOP
      INSERT INTO moment_post (id, author_uid, content, media, visibility, allow_comment, like_count, comment_count, status, created_at, updated_at, at_uids)
      VALUES (92000000000000000 + i, uid, 'e2e 播种动态 #' || i, '[]'::jsonb, 0, true, i, 0, 0, now() - (i || ' hours')::interval, now(), '[]'::jsonb);
    END LOOP;
    FOR i IN 1..3 LOOP
      INSERT INTO moment_report (id, post_id, reporter_uid, reason, description, status, created_at, updated_at)
      VALUES (92000000000000100 + i, 92000000000000000 + i, uid, 'spam', 'e2e 播种举报', 0, now(), now());
    END LOOP;
  END IF;
  IF (SELECT COUNT(*) FROM group_schedule) = 0 THEN
    FOR i IN 1..3 LOOP
      INSERT INTO group_schedule (id, group_id, schedule_id, title, description, creator_id, start_at, end_at, status, created_at, updated_at)
      VALUES (92000000000000200 + i, gid, 'e2e_sched_' || i, 'e2e 日程 #' || i, '播种', uid, now() + interval '1 day', now() + interval '2 hours 1 day', 1, now(), now());
    END LOOP;
  END IF;
  IF (SELECT COUNT(*) FROM group_task) = 0 THEN
    FOR i IN 1..3 LOOP
      INSERT INTO group_task (id, group_id, task_id, title, description, creator_id, deadline, status, created_at, updated_at)
      VALUES (92000000000000300 + i, gid, 'e2e_task_' || i, 'e2e 任务 #' || i, '播种', uid, now() + interval '3 days', 0, now(), now());
    END LOOP;
  END IF;
  IF (SELECT COUNT(*) FROM group_album) = 0 THEN
    FOR i IN 1..2 LOOP
      INSERT INTO group_album (id, group_id, album_id, album_name, creator_id, photo_count, status, created_at)
      VALUES (92000000000000400 + i, gid, 'e2e_album_' || i, 'e2e 相册 #' || i, uid, i, 1, now());
    END LOOP;
  END IF;
  IF (SELECT COUNT(*) FROM group_file) = 0 THEN
    FOR i IN 1..2 LOOP
      INSERT INTO group_file (id, group_id, file_id, file_name, file_size, file_type, file_category, file_url, uploader_id, status, created_at)
      VALUES (92000000000000500 + i, gid, 'e2e_file_' || i, 'e2e 文件 #' || i || '.txt', 1024, 'text/plain', 'doc', 'https://example.com/e2e' || i || '.txt', uid, 1, now());
    END LOOP;
  END IF;
  IF (SELECT COUNT(*) FROM channel_order) = 0 THEN
    FOR i IN 1..2 LOOP
      INSERT INTO channel_order (id, channel_id, user_id, order_no, amount, currency, status, payment_method, expires_at, created_at)
      VALUES (92000000000000600 + i, cid, uid, 'e2e_order_' || i, 9.9, 'CNY', 1, 'wallet', now() + interval '30 days', now());
    END LOOP;
  END IF;
  IF (SELECT COUNT(*) FROM channel_invitation) = 0 THEN
    FOR i IN 1..2 LOOP
      INSERT INTO channel_invitation (id, channel_id, inviter_uid, invitee_uid, invitation_code, status, message, expires_at, created_at)
      VALUES (92000000000000700 + i, cid, uid, uid + i, 'e2e_inv_' || i, 0, 'e2e 邀请', now() + interval '7 days', now());
    END LOOP;
  END IF;
  IF (SELECT COUNT(*) FROM sensitive_word) = 0 THEN
    FOR i IN 1..3 LOOP
      INSERT INTO sensitive_word (id, word, category, severity, created_at)
      VALUES (92000000000000800 + i, 'e2e敏感词' || i, 'other', 'low', now());
    END LOOP;
  END IF;
  IF (SELECT COUNT(*) FROM feedback) = 0 THEN
    FOR i IN 1..3 LOOP
      -- type 约束：bugReport | featureRequest
      INSERT INTO feedback (id, user_id, device_id, body, type, status, created_at)
      VALUES (92000000000000900 + i, uid, 'e2e_device_' || i, 'e2e 反馈内容 #' || i, 'bugReport', 0, now());
    END LOOP;
  END IF;
END $$;
