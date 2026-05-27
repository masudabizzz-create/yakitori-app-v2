-- ============================================================
-- 015_tenant_isolation.sql
-- 店舗完全独立化 Phase 1 — DB・RLS
--
-- 変更内容:
--   1. current_tenant_id() を JWT app_metadata 対応に更新
--      （active_tenant_id を優先し、なければ users.tenant_id にフォールバック）
--   2. set_tenant_context() 関数を新規作成（権限検証）
--   3. 全データテーブルの RLS を tenant_id = current_tenant_id() に統一
--      （has_tenant_access() による platform_admin 全テナント参照を廃止）
--   4. tenants SELECT は例外として platform_admin の全件参照を維持
--      （店舗選択画面の動作に必要）
-- ============================================================

-- ─── 1. current_tenant_id() 更新 ─────────────────────────────────
-- JWT の app_metadata.active_tenant_id を優先して読み取る。
-- 設定されていなければ users.tenant_id（ホームテナント）にフォールバック。
-- フロントエンドのテナント切り替えは JWT を更新することで反映される（Phase 2）。
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      (auth.jwt() -> 'app_metadata' ->> 'active_tenant_id'),
      ''
    )::uuid,
    (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  )
$$;

-- ─── 2. set_tenant_context() 新規作成 ────────────────────────────
-- 指定テナントへの入店権限を検証する。
-- 許可条件:
--   - 自分のホームテナント
--   - platform_admin（全テナント可）
--   - manager かつ user_tenant_permissions に登録あり
-- 実際の JWT 更新は Edge Function (enter-tenant) + authStore.refreshSession() で行う（Phase 2）。
CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       text;
  v_own_tenant uuid;
BEGIN
  SELECT role, tenant_id
    INTO v_role, v_own_tenant
    FROM public.users
   WHERE id = auth.uid();

  -- 自テナントは常に許可
  IF p_tenant_id = v_own_tenant THEN RETURN; END IF;

  -- platform_admin は全テナント可
  IF v_role = 'platform_admin' THEN RETURN; END IF;

  -- manager: user_tenant_permissions に登録があれば可
  IF v_role = 'manager' AND EXISTS (
    SELECT 1 FROM public.user_tenant_permissions
     WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  ) THEN RETURN; END IF;

  RAISE EXCEPTION 'Access denied: user does not have permission to access tenant %', p_tenant_id
    USING ERRCODE = '42501';
END;
$$;

-- ─── 3. tenants ──────────────────────────────────────────────────
-- SELECT: platform_admin は全件表示（店舗選択画面に必要）
--         他のロールは ホームテナント + user_tenant_permissions に登録済みのテナント
-- INSERT: platform_admin のみ（変更なし）
-- UPDATE: platform_admin は全件 / 他は現在のテナントのみ
-- DELETE: 変更なし（存在するポリシーを維持）

DROP POLICY IF EXISTS "tenants_select" ON tenants;
CREATE POLICY "tenants_select" ON tenants
  FOR SELECT USING (
    public.current_user_role() = 'platform_admin'
    OR id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_tenant_permissions
       WHERE user_id = auth.uid() AND tenant_id = id
    )
  );

DROP POLICY IF EXISTS "tenants_update_owner" ON tenants;
CREATE POLICY "tenants_update_owner" ON tenants
  FOR UPDATE USING (
    public.current_user_role() = 'platform_admin'
    OR (
      id = public.current_tenant_id()
      AND public.current_user_role() IN ('manager', 'store_owner')
    )
  );

-- ─── 4. users ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_select_same_tenant" ON users;
CREATE POLICY "users_select_same_tenant" ON users
  FOR SELECT USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "users_insert_owner" ON users;
CREATE POLICY "users_insert_owner" ON users
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "users_update_owner" ON users;
CREATE POLICY "users_update_owner" ON users
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "users_delete_owner" ON users;
CREATE POLICY "users_delete_owner" ON users
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── 5. skewers ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "skewers_select" ON skewers;
CREATE POLICY "skewers_select" ON skewers
  FOR SELECT USING (tenant_id = public.current_tenant_id());

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

-- ─── 6. settings ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "settings_select" ON settings;
CREATE POLICY "settings_select" ON settings
  FOR SELECT USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "settings_write_admin" ON settings;
CREATE POLICY "settings_write_admin" ON settings
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── 7. order_schedules ──────────────────────────────────────────
DROP POLICY IF EXISTS "order_schedules_select" ON order_schedules;
CREATE POLICY "order_schedules_select" ON order_schedules
  FOR SELECT USING (tenant_id = public.current_tenant_id());

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

-- ─── 8. order_schedule_irregulars ────────────────────────────────
DROP POLICY IF EXISTS "order_irregulars_select" ON order_schedule_irregulars;
CREATE POLICY "order_irregulars_select" ON order_schedule_irregulars
  FOR SELECT USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "order_irregulars_write_manager" ON order_schedule_irregulars;
CREATE POLICY "order_irregulars_write_manager" ON order_schedule_irregulars
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── 9. delivery_blackout_periods ────────────────────────────────
DROP POLICY IF EXISTS "blackout_periods_select" ON delivery_blackout_periods;
CREATE POLICY "blackout_periods_select" ON delivery_blackout_periods
  FOR SELECT USING (tenant_id = public.current_tenant_id());

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

-- ─── 10. delivery_irregular_dates ────────────────────────────────
DROP POLICY IF EXISTS "irregular_dates_select" ON delivery_irregular_dates;
CREATE POLICY "irregular_dates_select" ON delivery_irregular_dates
  FOR SELECT USING (tenant_id = public.current_tenant_id());

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

-- ─── 11. daily_logs ──────────────────────────────────────────────
DROP POLICY IF EXISTS "daily_logs_select" ON daily_logs;
CREATE POLICY "daily_logs_select" ON daily_logs
  FOR SELECT USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "daily_logs_insert" ON daily_logs;
CREATE POLICY "daily_logs_insert" ON daily_logs
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "daily_logs_update_manager" ON daily_logs;
CREATE POLICY "daily_logs_update_manager" ON daily_logs
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "daily_logs_delete_admin" ON daily_logs;
CREATE POLICY "daily_logs_delete_admin" ON daily_logs
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── 12. daily_log_stocks ────────────────────────────────────────
DROP POLICY IF EXISTS "daily_log_stocks_select" ON daily_log_stocks;
CREATE POLICY "daily_log_stocks_select" ON daily_log_stocks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.daily_logs
       WHERE id = daily_log_id
         AND tenant_id = public.current_tenant_id()
    )
  );

DROP POLICY IF EXISTS "daily_log_stocks_insert" ON daily_log_stocks;
CREATE POLICY "daily_log_stocks_insert" ON daily_log_stocks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daily_logs
       WHERE id = daily_log_id
         AND tenant_id = public.current_tenant_id()
    )
  );

DROP POLICY IF EXISTS "daily_log_stocks_update_manager" ON daily_log_stocks;
CREATE POLICY "daily_log_stocks_update_manager" ON daily_log_stocks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.daily_logs
       WHERE id = daily_log_id
         AND tenant_id = public.current_tenant_id()
    )
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "daily_log_stocks_delete_admin" ON daily_log_stocks;
CREATE POLICY "daily_log_stocks_delete_admin" ON daily_log_stocks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.daily_logs
       WHERE id = daily_log_id
         AND tenant_id = public.current_tenant_id()
    )
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── 13. prep_logs ───────────────────────────────────────────────
DROP POLICY IF EXISTS "prep_logs_select" ON prep_logs;
CREATE POLICY "prep_logs_select" ON prep_logs
  FOR SELECT USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "prep_logs_insert" ON prep_logs;
DROP POLICY IF EXISTS "prep_logs_write" ON prep_logs;
CREATE POLICY "prep_logs_insert" ON prep_logs
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "prep_logs_update" ON prep_logs;
CREATE POLICY "prep_logs_update" ON prep_logs
  FOR UPDATE USING  (tenant_id = public.current_tenant_id())
  WITH CHECK        (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "prep_logs_delete_own" ON prep_logs;
CREATE POLICY "prep_logs_delete_own" ON prep_logs
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND (
      user_id = auth.uid()
      OR public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
    )
  );

-- ─── 14. audit_logs ──────────────────────────────────────────────
-- 現在のテナントの監査ログのみ表示する。
-- platform_admin も入店中のテナントのみ（全店舗一覧は廃止）。
-- NULL tenant_id のログ（システム操作）は platform_admin のみ閲覧可。
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    OR (
      tenant_id IS NULL
      AND public.current_user_role() = 'platform_admin'
    )
  );

-- ─── 15. user_invitations ────────────────────────────────────────
DROP POLICY IF EXISTS "invitations_select_owner" ON user_invitations;
CREATE POLICY "invitations_select_owner" ON user_invitations
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "invitations_insert_owner" ON user_invitations;
CREATE POLICY "invitations_insert_owner" ON user_invitations
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

DROP POLICY IF EXISTS "invitations_update_owner" ON user_invitations;
CREATE POLICY "invitations_update_owner" ON user_invitations
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ─── 16. user_tenant_permissions ─────────────────────────────────
-- 変更なし。platform_admin は全件参照可（権限管理のため）、
-- ユーザーは自分の権限レコードのみ参照可。
-- 書き込みは platform_admin のみ（自己付与禁止）。
-- 既存ポリシー "utp_select" / "utp_write" はそのまま維持。
