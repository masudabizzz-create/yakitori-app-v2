-- ============================================================
-- 011_user_tenant_permissions.sql
-- ユーザー・テナント権限テーブルと has_tenant_access() 関数を追加し、
-- manager ロールが複数店舗にアクセスできるよう RLS を更新する
--
-- 変更内容:
--   1. user_tenant_permissions テーブル作成
--   2. has_tenant_access() ヘルパー関数追加
--   3. 全テーブルの SELECT ポリシーを has_tenant_access() ベースに更新
--   4. 書き込みポリシーも has_tenant_access() を使うよう更新
-- ============================================================

-- ─── 1. user_tenant_permissions テーブル ─────────────────────
CREATE TABLE IF NOT EXISTS public.user_tenant_permissions (
  user_id    uuid NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_utp_user_id   ON public.user_tenant_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_utp_tenant_id ON public.user_tenant_permissions(tenant_id);

ALTER TABLE public.user_tenant_permissions ENABLE ROW LEVEL SECURITY;

-- platform_admin は全件参照可能。本人も自分の権限を参照可能
DROP POLICY IF EXISTS "utp_select" ON public.user_tenant_permissions;
CREATE POLICY "utp_select" ON public.user_tenant_permissions
  FOR SELECT USING (
    public.current_user_role() = 'platform_admin'
    OR user_id = auth.uid()
  );

-- platform_admin のみ書き込み可能（権限付与は platform_admin が行う）
DROP POLICY IF EXISTS "utp_write" ON public.user_tenant_permissions;
CREATE POLICY "utp_write" ON public.user_tenant_permissions
  FOR ALL USING  (public.current_user_role() = 'platform_admin')
  WITH CHECK     (public.current_user_role() = 'platform_admin');

-- ─── 2. has_tenant_access() 関数 ─────────────────────────────
-- 指定したテナントIDへのアクセス権を持つか確認する
--   - platform_admin: 常に true
--   - 全ロール: 自分のホームテナントなら true
--   - manager: user_tenant_permissions に登録があれば true
CREATE OR REPLACE FUNCTION public.has_tenant_access(check_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_role() = 'platform_admin'
    OR check_tenant_id = public.current_tenant_id()
    OR EXISTS (
      SELECT 1 FROM public.user_tenant_permissions
      WHERE user_id = auth.uid() AND tenant_id = check_tenant_id
    )
$$;

-- ─── 3. tenants SELECT ───────────────────────────────────────
-- has_tenant_access(id) = アクセス可能な店舗のみ表示
DROP POLICY IF EXISTS "tenants_select" ON tenants;
CREATE POLICY "tenants_select" ON tenants
  FOR SELECT USING (public.has_tenant_access(id));

-- ─── 4. users SELECT ─────────────────────────────────────────
-- アクセス可能なテナントのスタッフを参照できる
DROP POLICY IF EXISTS "users_select_same_tenant" ON users;
CREATE POLICY "users_select_same_tenant" ON users
  FOR SELECT USING (public.has_tenant_access(tenant_id));

-- ─── 5. skewers ──────────────────────────────────────────────
DROP POLICY IF EXISTS "skewers_select" ON skewers;
CREATE POLICY "skewers_select" ON skewers
  FOR SELECT USING (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "skewers_write_manager" ON skewers;
CREATE POLICY "skewers_write_manager" ON skewers
  FOR ALL USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── 6. settings ─────────────────────────────────────────────
DROP POLICY IF EXISTS "settings_select" ON settings;
CREATE POLICY "settings_select" ON settings
  FOR SELECT USING (public.has_tenant_access(tenant_id));

-- settings 書き込みは store_owner 以上のみ（manager は読み取りのみ）
DROP POLICY IF EXISTS "settings_write_admin" ON settings;
CREATE POLICY "settings_write_admin" ON settings
  FOR ALL USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  )
  WITH CHECK (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );

-- ─── 7. order_schedules ──────────────────────────────────────
DROP POLICY IF EXISTS "order_schedules_select" ON order_schedules;
CREATE POLICY "order_schedules_select" ON order_schedules
  FOR SELECT USING (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "order_schedules_write_manager" ON order_schedules;
CREATE POLICY "order_schedules_write_manager" ON order_schedules
  FOR ALL USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── 8. delivery_blackout_periods ────────────────────────────
DROP POLICY IF EXISTS "blackout_periods_select" ON delivery_blackout_periods;
CREATE POLICY "blackout_periods_select" ON delivery_blackout_periods
  FOR SELECT USING (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "blackout_periods_write_manager" ON delivery_blackout_periods;
CREATE POLICY "blackout_periods_write_manager" ON delivery_blackout_periods
  FOR ALL USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── 9. delivery_irregular_dates ─────────────────────────────
DROP POLICY IF EXISTS "irregular_dates_select" ON delivery_irregular_dates;
CREATE POLICY "irregular_dates_select" ON delivery_irregular_dates
  FOR SELECT USING (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "irregular_dates_write_manager" ON delivery_irregular_dates;
CREATE POLICY "irregular_dates_write_manager" ON delivery_irregular_dates
  FOR ALL USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── 10. daily_logs ──────────────────────────────────────────
DROP POLICY IF EXISTS "daily_logs_select" ON daily_logs;
CREATE POLICY "daily_logs_select" ON daily_logs
  FOR SELECT USING (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "daily_logs_insert" ON daily_logs;
CREATE POLICY "daily_logs_insert" ON daily_logs
  FOR INSERT WITH CHECK (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "daily_logs_update_manager" ON daily_logs;
CREATE POLICY "daily_logs_update_manager" ON daily_logs
  FOR UPDATE USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "daily_logs_delete_admin" ON daily_logs;
CREATE POLICY "daily_logs_delete_admin" ON daily_logs
  FOR DELETE USING (
    public.has_tenant_access(tenant_id)
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );

-- ─── 11. daily_log_stocks ────────────────────────────────────
DROP POLICY IF EXISTS "daily_log_stocks_select" ON daily_log_stocks;
CREATE POLICY "daily_log_stocks_select" ON daily_log_stocks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM daily_logs
      WHERE id = daily_log_id AND public.has_tenant_access(tenant_id)
    )
  );

DROP POLICY IF EXISTS "daily_log_stocks_insert" ON daily_log_stocks;
CREATE POLICY "daily_log_stocks_insert" ON daily_log_stocks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_logs
      WHERE id = daily_log_id AND public.has_tenant_access(tenant_id)
    )
  );

DROP POLICY IF EXISTS "daily_log_stocks_update_manager" ON daily_log_stocks;
CREATE POLICY "daily_log_stocks_update_manager" ON daily_log_stocks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM daily_logs
      WHERE id = daily_log_id AND public.has_tenant_access(tenant_id)
    )
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "daily_log_stocks_delete_admin" ON daily_log_stocks;
CREATE POLICY "daily_log_stocks_delete_admin" ON daily_log_stocks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM daily_logs
      WHERE id = daily_log_id AND public.has_tenant_access(tenant_id)
    )
    AND public.current_user_role() IN ('platform_admin', 'store_owner')
  );

-- ─── 12. prep_logs ───────────────────────────────────────────
DROP POLICY IF EXISTS "prep_logs_select" ON prep_logs;
CREATE POLICY "prep_logs_select" ON prep_logs
  FOR SELECT USING (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "prep_logs_insert" ON prep_logs;
CREATE POLICY "prep_logs_insert" ON prep_logs
  FOR INSERT WITH CHECK (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "prep_logs_update" ON prep_logs;
CREATE POLICY "prep_logs_update" ON prep_logs
  FOR UPDATE USING  (public.has_tenant_access(tenant_id))
  WITH CHECK        (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "prep_logs_delete_own" ON prep_logs;
CREATE POLICY "prep_logs_delete_own" ON prep_logs
  FOR DELETE USING (
    public.has_tenant_access(tenant_id)
    AND (
      user_id = auth.uid()
      OR public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
    )
  );
