-- ============================================================
-- 007_prep_logs.sql
-- 仕込み完了ログテーブル
-- Supabase Dashboard > SQL Editor で実行してください
-- ============================================================

CREATE TABLE prep_logs (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid REFERENCES tenants(id) ON DELETE CASCADE,
  log_date         date NOT NULL,               -- 仕込み対象日（翌営業日）
  skewer_id        uuid REFERENCES skewers(id) ON DELETE SET NULL,
  skewer_name      text NOT NULL,
  prep_amount      integer NOT NULL,            -- 仕込み量（串本数）
  stick_count      integer NOT NULL,            -- 本数換算（同上）
  completed_at     timestamptz NOT NULL,        -- 完了時刻
  user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  duration_seconds integer,                     -- 仕込み時間（任意）
  type             text NOT NULL DEFAULT 'normal'
                     CHECK (type IN ('normal', 'extra')),
  note             text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_prep_logs_tenant_date ON prep_logs(tenant_id, log_date DESC);
CREATE INDEX idx_prep_logs_skewer      ON prep_logs(skewer_id);

ALTER TABLE prep_logs ENABLE ROW LEVEL SECURITY;

-- 参照: 同テナント全ロール
CREATE POLICY "prep_logs_select" ON prep_logs
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- 書き込み: 同テナント全ロール（現場スタッフが記録する）
CREATE POLICY "prep_logs_write" ON prep_logs
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
