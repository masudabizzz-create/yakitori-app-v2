-- ============================================================
-- 012_fix_role_hierarchy.sql
-- ロール序列の修正: manager (rank=4) > store_owner (rank=3)
--
-- 以下のポリシーで store_owner のみ許可され manager が除外されていた箇所を修正する。
--
-- 正しいランク定義:
--   platform_admin : 5
--   manager        : 4  ← store_owner より上位
--   store_owner    : 3
--   staff_both     : 1
--   staff_kitchen  : 1
--   staff_hall     : 1
-- ============================================================

-- ─── users ───────────────────────────────────────────────────
-- INSERT / UPDATE / DELETE に manager を追加
DROP POLICY IF EXISTS "users_insert_owner" ON users;
CREATE POLICY "users_insert_owner" ON users
  FOR INSERT WITH CHECK (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "users_update_owner" ON users;
CREATE POLICY "users_update_owner" ON users
  FOR UPDATE USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "users_delete_owner" ON users;
CREATE POLICY "users_delete_owner" ON users
  FOR DELETE USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── settings ────────────────────────────────────────────────
-- manager は rank=4 のため store_owner (rank=3) と同等以上の権限を持つ
DROP POLICY IF EXISTS "settings_write_admin" ON settings;
CREATE POLICY "settings_write_admin" ON settings
  FOR ALL USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── user_invitations ────────────────────────────────────────
-- manager は招待の作成・承認・拒否が可能
DROP POLICY IF EXISTS "invitations_select_owner" ON user_invitations;
CREATE POLICY "invitations_select_owner" ON user_invitations
  FOR SELECT USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "invitations_insert_owner" ON user_invitations;
CREATE POLICY "invitations_insert_owner" ON user_invitations
  FOR INSERT WITH CHECK (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "invitations_update_owner" ON user_invitations;
CREATE POLICY "invitations_update_owner" ON user_invitations
  FOR UPDATE USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── tenants ─────────────────────────────────────────────────
-- 店舗名の更新は manager も可能（INSERT は platform_admin 専用のまま）
DROP POLICY IF EXISTS "tenants_update_owner" ON tenants;
CREATE POLICY "tenants_update_owner" ON tenants
  FOR UPDATE USING (
    public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── daily_logs ──────────────────────────────────────────────
-- 削除（管理操作）も manager が可能
DROP POLICY IF EXISTS "daily_logs_delete_admin" ON daily_logs;
CREATE POLICY "daily_logs_delete_admin" ON daily_logs
  FOR DELETE USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── daily_log_stocks ────────────────────────────────────────
DROP POLICY IF EXISTS "daily_log_stocks_delete_admin" ON daily_log_stocks;
CREATE POLICY "daily_log_stocks_delete_admin" ON daily_log_stocks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM daily_logs
      WHERE id = daily_log_id AND public.has_tenant_access(tenant_id)
    )
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );
