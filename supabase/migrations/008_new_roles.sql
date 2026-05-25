-- ============================================================
-- 008_new_roles.sql
-- ロール設計を全面刷新
--
-- 旧ロール → 新ロール 対応表
--   super_admin   → platform_admin
--   tenant_admin  → store_owner
--   admin         → store_owner
--   manager       → manager（変更なし）
--   user          → staff_both
--   kitchen       → staff_kitchen
--   hall          → staff_hall
--
-- あわせて:
--   - prep_logs の DELETE を「自分の記録のみ」に制限
--   - RLS ポリシーを新ロール名に更新
-- ============================================================

-- ─── Step 1: CHECK 制約を一時解除 ──────────────────────────────
ALTER TABLE users            DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE user_invitations DROP CONSTRAINT IF EXISTS user_invitations_role_check;

-- ─── Step 2: 既存データをマイグレーション ─────────────────────
UPDATE users SET role = 'platform_admin' WHERE role = 'super_admin';
UPDATE users SET role = 'store_owner'    WHERE role IN ('tenant_admin', 'admin');
-- manager はそのまま
UPDATE users SET role = 'staff_both'    WHERE role = 'user';
UPDATE users SET role = 'staff_kitchen' WHERE role = 'kitchen';
UPDATE users SET role = 'staff_hall'    WHERE role = 'hall';

-- 発行済み招待も同様に更新
UPDATE user_invitations SET role = 'platform_admin' WHERE role = 'super_admin';
UPDATE user_invitations SET role = 'store_owner'    WHERE role IN ('tenant_admin', 'admin');
UPDATE user_invitations SET role = 'staff_both'     WHERE role = 'user';
UPDATE user_invitations SET role = 'staff_kitchen'  WHERE role = 'kitchen';
UPDATE user_invitations SET role = 'staff_hall'     WHERE role = 'hall';

-- ─── Step 3: 新 CHECK 制約を追加 ───────────────────────────────
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('platform_admin', 'manager', 'store_owner', 'staff_both', 'staff_kitchen', 'staff_hall'));

ALTER TABLE user_invitations ADD CONSTRAINT user_invitations_role_check
  CHECK (role IN ('platform_admin', 'manager', 'store_owner', 'staff_both', 'staff_kitchen', 'staff_hall'));

-- ─── Step 4: users テーブルの RLS ポリシーを更新 ────────────────
DROP POLICY IF EXISTS "users_insert_admin" ON users;
DROP POLICY IF EXISTS "users_update_admin" ON users;
DROP POLICY IF EXISTS "users_delete_admin" ON users;

CREATE POLICY "users_insert_owner" ON users
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );
CREATE POLICY "users_update_owner" ON users
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );
CREATE POLICY "users_delete_owner" ON users
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );

-- ─── Step 5: skewers の書き込みを manager 以上に更新 ────────────
DROP POLICY IF EXISTS "skewers_write_manager" ON skewers;
CREATE POLICY "skewers_write_manager" ON skewers
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── Step 6: daily_logs の更新・削除ポリシーを更新 ──────────────
DROP POLICY IF EXISTS "daily_logs_update_manager" ON daily_logs;
DROP POLICY IF EXISTS "daily_logs_delete_admin"   ON daily_logs;
CREATE POLICY "daily_logs_update_manager" ON daily_logs
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );
CREATE POLICY "daily_logs_delete_admin" ON daily_logs
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );

-- ─── Step 7: daily_log_stocks の更新・削除ポリシーを更新 ────────
DROP POLICY IF EXISTS "daily_log_stocks_update_manager" ON daily_log_stocks;
DROP POLICY IF EXISTS "daily_log_stocks_delete_admin"   ON daily_log_stocks;
CREATE POLICY "daily_log_stocks_update_manager" ON daily_log_stocks
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM daily_logs WHERE id = daily_log_id AND tenant_id = public.current_tenant_id())
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );
CREATE POLICY "daily_log_stocks_delete_admin" ON daily_log_stocks
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM daily_logs WHERE id = daily_log_id AND tenant_id = public.current_tenant_id())
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );

-- ─── Step 8: settings の書き込みを store_owner 以上に更新 ───────
DROP POLICY IF EXISTS "settings_write_admin" ON settings;
CREATE POLICY "settings_write_admin" ON settings
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );

-- ─── Step 9: order_schedules を manager 以上に更新 ──────────────
DROP POLICY IF EXISTS "order_schedules_write_manager" ON order_schedules;
CREATE POLICY "order_schedules_write_manager" ON order_schedules
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── Step 10: delivery_blackout_periods / irregular_dates を更新 ─
DROP POLICY IF EXISTS "blackout_periods_write_manager" ON delivery_blackout_periods;
CREATE POLICY "blackout_periods_write_manager" ON delivery_blackout_periods
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "irregular_dates_write_manager" ON delivery_irregular_dates;
CREATE POLICY "irregular_dates_write_manager" ON delivery_irregular_dates
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── Step 11: user_invitations を store_owner 以上に更新 ────────
DROP POLICY IF EXISTS "invitations_select_admin" ON user_invitations;
DROP POLICY IF EXISTS "invitations_insert_admin" ON user_invitations;
DROP POLICY IF EXISTS "invitations_update_admin" ON user_invitations;
CREATE POLICY "invitations_select_owner" ON user_invitations
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );
CREATE POLICY "invitations_insert_owner" ON user_invitations
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );
CREATE POLICY "invitations_update_owner" ON user_invitations
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );

-- ─── Step 12: prep_logs DELETE を自分の記録のみに制限 ──────────
-- 旧の FOR ALL ポリシーを削除し、操作別に分割
DROP POLICY IF EXISTS "prep_logs_write" ON prep_logs;

CREATE POLICY "prep_logs_insert" ON prep_logs
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "prep_logs_update" ON prep_logs
  FOR UPDATE USING  (tenant_id = public.current_tenant_id())
  WITH CHECK        (tenant_id = public.current_tenant_id());

-- DELETE: 自分の記録のみ。ただし manager 以上は全員分削除可
CREATE POLICY "prep_logs_delete_own" ON prep_logs
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND (
      user_id = auth.uid()
      OR public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
    )
  );

-- ─── Step 13: tenants ポリシーも新ロールに更新 ──────────────────
DROP POLICY IF EXISTS "tenants_insert_admin" ON tenants;
DROP POLICY IF EXISTS "tenants_update_admin" ON tenants;
CREATE POLICY "tenants_insert_owner" ON tenants
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('platform_admin', 'store_owner')
  );
CREATE POLICY "tenants_update_owner" ON tenants
  FOR UPDATE USING (
    public.current_user_role() IN ('platform_admin', 'store_owner')
  );
