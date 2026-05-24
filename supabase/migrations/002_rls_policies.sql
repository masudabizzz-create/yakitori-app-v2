-- ============================================================
-- 002_rls_policies.sql
-- Row Level Security（RLS）— テナント分離 + ロールベース制御
-- ============================================================

-- --------------------
-- ヘルパー関数
-- ログイン中ユーザーの tenant_id / role を返す
-- 注: Supabase の SQL Editor は auth スキーマに関数を作れないため public に配置する
-- --------------------
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

-- ============================================================
-- tenants
-- ============================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_select_own" ON tenants
  FOR SELECT USING (id = public.current_tenant_id());

-- ============================================================
-- users
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_same_tenant" ON users
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "users_insert_admin" ON users
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id() AND public.current_user_role() = 'admin'
  );

CREATE POLICY "users_update_admin" ON users
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id() AND public.current_user_role() = 'admin'
  );

CREATE POLICY "users_delete_admin" ON users
  FOR DELETE USING (
    tenant_id = public.current_tenant_id() AND public.current_user_role() = 'admin'
  );

-- ============================================================
-- skewers（参照: 全ロール / 変更: manager 以上）
-- ============================================================
ALTER TABLE skewers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skewers_select" ON skewers
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "skewers_write_manager" ON skewers
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'manager')
  );

-- ============================================================
-- daily_logs（参照/挿入: 全ロール / 更新: manager / 削除: admin）
-- ============================================================
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_logs_select" ON daily_logs
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "daily_logs_insert" ON daily_logs
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "daily_logs_update_manager" ON daily_logs
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'manager')
  );

CREATE POLICY "daily_logs_delete_admin" ON daily_logs
  FOR DELETE USING (
    tenant_id = public.current_tenant_id() AND public.current_user_role() = 'admin'
  );

-- ============================================================
-- daily_log_stocks（親 daily_logs 経由でテナント確認）
-- ============================================================
ALTER TABLE daily_log_stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_log_stocks_select" ON daily_log_stocks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM daily_logs
            WHERE id = daily_log_id AND tenant_id = public.current_tenant_id())
  );

CREATE POLICY "daily_log_stocks_insert" ON daily_log_stocks
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM daily_logs
            WHERE id = daily_log_id AND tenant_id = public.current_tenant_id())
  );

CREATE POLICY "daily_log_stocks_update_manager" ON daily_log_stocks
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM daily_logs
            WHERE id = daily_log_id AND tenant_id = public.current_tenant_id())
    AND public.current_user_role() IN ('admin', 'manager')
  );

CREATE POLICY "daily_log_stocks_delete_admin" ON daily_log_stocks
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM daily_logs
            WHERE id = daily_log_id AND tenant_id = public.current_tenant_id())
    AND public.current_user_role() = 'admin'
  );

-- ============================================================
-- settings（参照: 全ロール / 変更: admin のみ）
-- ============================================================
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select" ON settings
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "settings_write_admin" ON settings
  FOR ALL USING (
    tenant_id = public.current_tenant_id() AND public.current_user_role() = 'admin'
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id() AND public.current_user_role() = 'admin'
  );

-- ============================================================
-- order_schedules（参照: 全ロール / 変更: manager 以上）
-- ============================================================
ALTER TABLE order_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_schedules_select" ON order_schedules
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "order_schedules_write_manager" ON order_schedules
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'manager')
  );

-- ============================================================
-- order_schedule_irregulars（参照: 全ロール / 変更: manager 以上）
-- ============================================================
ALTER TABLE order_schedule_irregulars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_irregulars_select" ON order_schedule_irregulars
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "order_irregulars_write_manager" ON order_schedule_irregulars
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'manager')
  );
