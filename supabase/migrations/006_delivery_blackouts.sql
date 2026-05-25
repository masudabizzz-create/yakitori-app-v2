-- ============================================================
-- 006_delivery_blackouts.sql
-- 発注イレギュラー管理を再設計
-- 旧: order_schedule_irregulars（1行=1例外週）
-- 新: delivery_blackout_periods + delivery_irregular_dates
-- Supabase Dashboard > SQL Editor で実行してください
-- ============================================================

-- ─── 旧テーブルを廃止 ─────────────────────────────────────────
DROP TABLE IF EXISTS order_schedule_irregulars;

-- ─── 納品不可期間 ─────────────────────────────────────────────
CREATE TABLE delivery_blackout_periods (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  title       text NOT NULL,           -- 例: 年末年始 2026
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  note        text,
  created_at  timestamptz DEFAULT now()
);

-- ─── イレギュラー納品日 ────────────────────────────────────────
CREATE TABLE delivery_irregular_dates (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
  blackout_id   uuid NOT NULL REFERENCES delivery_blackout_periods(id) ON DELETE CASCADE,
  delivery_date date NOT NULL,
  note          text,
  created_at    timestamptz DEFAULT now()
);

-- ─── インデックス ──────────────────────────────────────────────
CREATE INDEX idx_blackout_periods_tenant  ON delivery_blackout_periods(tenant_id, start_date);
CREATE INDEX idx_irregular_dates_blackout ON delivery_irregular_dates(blackout_id);
CREATE INDEX idx_irregular_dates_tenant   ON delivery_irregular_dates(tenant_id);

-- ─── RLS 有効化 ────────────────────────────────────────────────
ALTER TABLE delivery_blackout_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_irregular_dates  ENABLE ROW LEVEL SECURITY;

-- ─── delivery_blackout_periods ─────────────────────────────────
-- 参照: 同テナント全ロール / 変更: manager 以上
CREATE POLICY "blackout_periods_select" ON delivery_blackout_periods
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "blackout_periods_write_manager" ON delivery_blackout_periods
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('super_admin', 'tenant_admin', 'admin', 'manager')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('super_admin', 'tenant_admin', 'admin', 'manager')
  );

-- ─── delivery_irregular_dates ──────────────────────────────────
-- 参照: 同テナント全ロール / 変更: manager 以上
CREATE POLICY "irregular_dates_select" ON delivery_irregular_dates
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "irregular_dates_write_manager" ON delivery_irregular_dates
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('super_admin', 'tenant_admin', 'admin', 'manager')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('super_admin', 'tenant_admin', 'admin', 'manager')
  );
