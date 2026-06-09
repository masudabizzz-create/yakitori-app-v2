-- ============================================================
-- 024_daily_log_edits.sql
-- データ修正機能: 編集履歴記録
-- ============================================================

-- --------------------
-- daily_log_edits（編集履歴）
-- --------------------
CREATE TABLE daily_log_edits (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  daily_log_id uuid NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  edited_by   uuid NOT NULL REFERENCES users(id),
  old_values  jsonb NOT NULL,
  new_values  jsonb NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_daily_log_edits_tenant ON daily_log_edits(tenant_id, created_at DESC);
CREATE INDEX idx_daily_log_edits_log ON daily_log_edits(daily_log_id, created_at DESC);

COMMENT ON TABLE daily_log_edits IS '日次ログ編集履歴: 分析画面からのデータ修正を記録';
COMMENT ON COLUMN daily_log_edits.old_values IS '編集前の値（jsonb）';
COMMENT ON COLUMN daily_log_edits.new_values IS '編集後の値（jsonb）';

-- --------------------
-- RLS
-- --------------------
ALTER TABLE daily_log_edits ENABLE ROW LEVEL SECURITY;

-- 店舗責任者以上: 履歴閲覧可能
CREATE POLICY "daily_log_edits_select" ON daily_log_edits
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );

-- 店舗責任者以上: 履歴作成可能
CREATE POLICY "daily_log_edits_insert" ON daily_log_edits
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );
