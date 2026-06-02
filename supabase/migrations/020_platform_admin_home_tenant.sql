-- ============================================================
-- 020_platform_admin_home_tenant.sql
-- platform_admin が自分自身の拠点店舗（tenant_id）を変更できるよう
-- 専用の RLS UPDATE ポリシーを追加する。
--
-- 背景:
--   既存の users_update_owner ポリシーは
--   "tenant_id = current_tenant_id()" を条件とするため、
--   platform_admin が他テナントを訪問中（active_tenant_sessions あり）に
--   自分自身のレコードを更新しようとするとポリシーが通らない。
--   自分自身（id = auth.uid()）を更新する場合に限り、
--   テナントコンテキストに関わらず許可する専用ポリシーを追加する。
-- ============================================================

DROP POLICY IF EXISTS "users_update_self_platform_admin" ON public.users;

CREATE POLICY "users_update_self_platform_admin" ON public.users
  FOR UPDATE USING (
    id = auth.uid()
    AND public.current_user_role() = 'platform_admin'
  );
