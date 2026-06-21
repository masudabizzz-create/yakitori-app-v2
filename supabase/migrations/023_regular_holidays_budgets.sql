-- ============================================================
-- 023_regular_holidays_budgets.sql
-- 定休日設定 + 日別予算機能
-- ============================================================

-- --------------------
-- settings テーブルに定休日・予算プリセット追加
-- --------------------

-- 定休日設定（曜日コード配列: 0=日, 1=月, ..., 6=土）
-- 空配列 = 定休日なし（全日営業）
ALTER TABLE settings ADD COLUMN IF NOT EXISTS regular_holidays integer[] DEFAULT '{}';

-- 予算金額プリセット（店舗ごとに編集可能）
ALTER TABLE settings ADD COLUMN IF NOT EXISTS budget_presets jsonb DEFAULT '[
  {"label": "平日", "amount": 80000},
  {"label": "金土", "amount": 150000},
  {"label": "日", "amount": 100000}
]';

-- --------------------
-- daily_budgets（日別予算）
-- --------------------
CREATE TABLE IF NOT EXISTS daily_budgets (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  log_date   date NOT NULL,
  amount     integer NOT NULL DEFAULT 0,
  is_closed  boolean NOT NULL DEFAULT false,  -- 臨時休業フラグ
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (tenant_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_budgets_tenant ON daily_budgets(tenant_id, log_date DESC);

COMMENT ON TABLE daily_budgets IS '日別予算: 営業日は amount>0/is_closed=false、臨時休業は amount=0/is_closed=true、定休日は行なし';
COMMENT ON COLUMN daily_budgets.is_closed IS '臨時休業フラグ（true=休業、false=営業）';

-- --------------------
-- RLS
-- --------------------
ALTER TABLE daily_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_budgets_select" ON daily_budgets;
CREATE POLICY "daily_budgets_select" ON daily_budgets
  FOR SELECT USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "daily_budgets_write_store_owner" ON daily_budgets;
CREATE POLICY "daily_budgets_write_store_owner" ON daily_budgets
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('platform_admin', 'manager', 'store_owner')
  );
