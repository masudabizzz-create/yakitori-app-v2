-- ============================================================
-- 009_tenants_platform_admin_only.sql
-- 店舗作成（INSERT）の権限を platform_admin のみに制限する
--
-- 変更前: platform_admin OR store_owner が INSERT 可能
-- 変更後: platform_admin のみ INSERT 可能
--        UPDATE / DELETE は変更なし
-- ============================================================

DROP POLICY IF EXISTS "tenants_insert_owner" ON tenants;

CREATE POLICY "tenants_insert_platform_admin" ON tenants
  FOR INSERT WITH CHECK (
    public.current_user_role() = 'platform_admin'
  );
