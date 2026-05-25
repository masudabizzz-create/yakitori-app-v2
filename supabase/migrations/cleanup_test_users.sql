-- ============================================================
-- cleanup_test_users.sql
-- テストユーザーの確認・削除
-- Supabase Dashboard の SQL Editor で実行する
--
-- 【注意】削除は取り消せません。必ずSTEP 1で確認してから実行してください。
-- ============================================================

-- ============================================================
-- STEP 1: 削除対象ユーザーの確認（SELECT のみ・安全）
-- まずこれだけ実行して内容を確認してください
-- ============================================================
SELECT
  au.id,
  au.email,
  au.created_at,
  au.email_confirmed_at,
  pu.name,
  pu.role,
  pu.tenant_id
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE au.email != 'masuda.bizzz@gmail.com'
ORDER BY au.created_at;


-- ============================================================
-- STEP 2: 削除実行（STEP 1 で内容を確認してから実行）
-- 以下をコメントアウト解除して実行してください
-- ============================================================

/*

-- user_invitations の削除対象確認
SELECT * FROM public.user_invitations
WHERE created_by IN (
  SELECT id FROM auth.users WHERE email != 'masuda.bizzz@gmail.com'
);

-- public.users を削除（auth.users の CASCADE により関連データも削除）
DELETE FROM public.users
WHERE id IN (
  SELECT id FROM auth.users WHERE email != 'masuda.bizzz@gmail.com'
);

-- user_invitations のうち削除対象が作成したもの（孤立レコード）を削除
DELETE FROM public.user_invitations
WHERE created_by NOT IN (SELECT id FROM auth.users);

-- auth.users を削除（Supabase Auth ユーザー本体）
-- ※ auth スキーマの users は直接 DELETE が可能
DELETE FROM auth.users
WHERE email != 'masuda.bizzz@gmail.com';

*/
