-- ============================================================
-- 010_platform_admin_cross_tenant.sql
-- platform_admin が全テナントのデータを読み書きできるよう RLS を更新する
--
-- 対象テーブル:
--   tenants                   - SELECT: platform_admin は全件表示
--   skewers                   - SELECT / ALL: platform_admin は全テナントアクセス
--   settings                  - SELECT / ALL: platform_admin は全テナントアクセス
--   order_schedules           - SELECT / ALL: platform_admin は全テナントアクセス
--   delivery_blackout_periods - SELECT / ALL: platform_admin は全テナントアクセス
--   delivery_irregular_dates  - SELECT / ALL: platform_admin は全テナントアクセス
-- ============================================================

-- ─── tenants SELECT ──────────────────────────────────────────────
DROP POLICY IF EXISTS "tenants_select_own" ON tenants;
CREATE POLICY "tenants_select" ON tenants
  FOR SELECT USING (
    id = public.current_tenant_id()
    OR public.current_user_role() = 'platform_admin'
  );

-- ─── skewers ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "skewers_select" ON skewers;
CREATE POLICY "skewers_select" ON skewers
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    OR public.current_user_role() = 'platform_admin'
  );

-- 008 で更新済みの WRITE ポリシーを再定義（platform_admin 追加）
DROP POLICY IF EXISTS "skewers_write_manager" ON skewers;
CREATE POLICY "skewers_write_manager" ON skewers
  FOR ALL USING (
    public.current_user_role() = 'platform_admin'
    OR (tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('manager', 'store_owner'))
  )
  WITH CHECK (
    public.current_user_role() = 'platform_admin'
    OR (tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('manager', 'store_owner'))
  );

-- ─── settings ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "settings_select" ON settings;
CREATE POLICY "settings_select" ON settings
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    OR public.current_user_role() = 'platform_admin'
  );

DROP POLICY IF EXISTS "settings_write_admin" ON settings;
CREATE POLICY "settings_write_admin" ON settings
  FOR ALL USING (
    public.current_user_role() = 'platform_admin'
    OR (tenant_id = public.current_tenant_id()
        AND public.current_user_role() = 'store_owner')
  )
  WITH CHECK (
    public.current_user_role() = 'platform_admin'
    OR (tenant_id = public.current_tenant_id()
        AND public.current_user_role() = 'store_owner')
  );

-- ─── order_schedules ─────────────────────────────────────────────
DROP POLICY IF EXISTS "order_schedules_select" ON order_schedules;
CREATE POLICY "order_schedules_select" ON order_schedules
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    OR public.current_user_role() = 'platform_admin'
  );

DROP POLICY IF EXISTS "order_schedules_write_manager" ON order_schedules;
CREATE POLICY "order_schedules_write_manager" ON order_schedules
  FOR ALL USING (
    public.current_user_role() = 'platform_admin'
    OR (tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('manager', 'store_owner'))
  )
  WITH CHECK (
    public.current_user_role() = 'platform_admin'
    OR (tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('manager', 'store_owner'))
  );

-- ─── delivery_blackout_periods ───────────────────────────────────
DROP POLICY IF EXISTS "blackout_periods_select" ON delivery_blackout_periods;
CREATE POLICY "blackout_periods_select" ON delivery_blackout_periods
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    OR public.current_user_role() = 'platform_admin'
  );

DROP POLICY IF EXISTS "blackout_periods_write_manager" ON delivery_blackout_periods;
CREATE POLICY "blackout_periods_write_manager" ON delivery_blackout_periods
  FOR ALL USING (
    public.current_user_role() = 'platform_admin'
    OR (tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('manager', 'store_owner'))
  )
  WITH CHECK (
    public.current_user_role() = 'platform_admin'
    OR (tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('manager', 'store_owner'))
  );

-- ─── delivery_irregular_dates ────────────────────────────────────
DROP POLICY IF EXISTS "irregular_dates_select" ON delivery_irregular_dates;
CREATE POLICY "irregular_dates_select" ON delivery_irregular_dates
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    OR public.current_user_role() = 'platform_admin'
  );

DROP POLICY IF EXISTS "irregular_dates_write_manager" ON delivery_irregular_dates;
CREATE POLICY "irregular_dates_write_manager" ON delivery_irregular_dates
  FOR ALL USING (
    public.current_user_role() = 'platform_admin'
    OR (tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('manager', 'store_owner'))
  )
  WITH CHECK (
    public.current_user_role() = 'platform_admin'
    OR (tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('manager', 'store_owner'))
  );
