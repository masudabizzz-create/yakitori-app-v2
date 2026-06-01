-- Migration 019: 月次売上目標
-- settings テーブルに monthly_sales_target カラムを追加する

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS monthly_sales_target integer NOT NULL DEFAULT 0;
