-- ============================================================
-- 026_fix_rls_role_alignment.sql
-- RLSとUI権限の不一致を修正（フェーズ1: 4-1）
-- ============================================================

-- 問題:
-- 1. daily_logs UPDATE: RLS=manager以上 / UI=store_owner以上（データ修正機能）
-- 2. settings変更: RLS=admin / UI=store_owner以上（定休日設定など）

-- 修正方針:
-- store_ownerロールを追加して、UI権限とRLSを一致させる

-- ============================================================
-- 現行ポリシーの確認（002_rls_policies.sqlより）
-- ============================================================
-- daily_logs:
--   SELECT: 全ロール (tenant_id のみチェック)
--   INSERT: 全ロール (tenant_id のみチェック)
--   UPDATE: admin, manager
--   DELETE: admin
--
-- settings:
--   SELECT: 全ロール (tenant_id のみチェック) ← 読み取りは全ロール必要
--   INSERT/UPDATE/DELETE: admin (FOR ALL ポリシー)

-- ============================================================
-- daily_logs: UPDATEをstore_owner以上に変更
-- ============================================================

-- 既存ポリシー削除
DROP POLICY IF EXISTS "daily_logs_update_manager" ON daily_logs;

-- 新ポリシー: store_owner以上に変更
CREATE POLICY "daily_logs_update_store_owner" ON daily_logs
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- ============================================================
-- settings: 読み取りと書き込みを分離
-- ============================================================

-- 既存ポリシー削除
DROP POLICY IF EXISTS "settings_write_admin" ON settings;

-- 読み取りポリシー: settings_select は既存のまま維持（全ロールが読み取り可能）
-- 書き込みポリシー: INSERT/UPDATE/DELETEをstore_owner以上に変更

-- INSERT: store_owner以上
CREATE POLICY "settings_insert_store_owner" ON settings
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- UPDATE: store_owner以上
CREATE POLICY "settings_update_store_owner" ON settings
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- DELETE: platform_adminのみ（安全のため）
CREATE POLICY "settings_delete_admin" ON settings
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() = 'platform_admin'
  );

-- ============================================================
-- 注記
-- ============================================================

COMMENT ON POLICY "daily_logs_update_store_owner" ON daily_logs IS
'データ修正機能（Phase 3）でstore_owner以上が編集可能。
UI制限とRLSを一致させるため、managerからstore_ownerに変更。';

COMMENT ON POLICY "settings_insert_store_owner" ON settings IS
'定休日設定・予算プリセット編集などでstore_owner以上が作成可能。
UI制限とRLSを一致させるため、adminからstore_ownerに変更。';

COMMENT ON POLICY "settings_update_store_owner" ON settings IS
'定休日設定・予算プリセット編集などでstore_owner以上が変更可能。
UI制限とRLSを一致させるため、adminからstore_ownerに変更。
読み取り(SELECT)は既存ポリシーで全ロール許可を維持。';

COMMENT ON POLICY "settings_delete_admin" ON settings IS
'settings削除はplatform_adminのみ。誤削除防止のため厳格に制限。';
