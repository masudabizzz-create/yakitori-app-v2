-- ============================================================
-- 027_add_check_constraints.sql
-- 数値範囲のサーバ側CHECK制約（フェーズ1: 4-2）
-- ============================================================

-- 問題:
-- クライアント側バリデーションのみで、サーバ側に範囲チェックが無い
-- DevToolsやcurlで異常値を送信できてしまう

-- ============================================================
-- daily_logs: 数値範囲のCHECK制約
-- ============================================================

-- 売上: 0以上（負数を拒否）
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_total_sales_non_negative
  CHECK (total_sales >= 0);

-- ドリンク売上: 0以上
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_drink_sales_non_negative
  CHECK (drink_sales >= 0);

-- ドリンク比率: 0以上100以下
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_drink_ratio_range
  CHECK (drink_ratio >= 0 AND drink_ratio <= 100);

-- コース数: 0以上
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_course_casual_non_negative
  CHECK (course_casual >= 0);

ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_course_standard_non_negative
  CHECK (course_standard >= 0);

ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_course_premium_non_negative
  CHECK (course_premium >= 0);

-- 追加串: 0以上
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_extra_skewers_non_negative
  CHECK (extra_skewers >= 0);

-- 合計串: 0以上
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_total_skewers_non_negative
  CHECK (total_skewers >= 0);

-- 組数・客数: nullまたは0以上（負数を拒否）
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_groups_count_non_negative
  CHECK (groups_count IS NULL OR groups_count >= 0);

ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_guests_count_non_negative
  CHECK (guests_count IS NULL OR guests_count >= 0);

-- ============================================================
-- daily_budgets: 金額は0以上
-- ============================================================

ALTER TABLE daily_budgets
  ADD CONSTRAINT daily_budgets_amount_non_negative
  CHECK (amount >= 0);

-- ============================================================
-- 注記
-- ============================================================

COMMENT ON CONSTRAINT daily_logs_total_sales_non_negative ON daily_logs IS
'売上は0以上（負数を拒否）。クライアント側バリデーションと整合。';

COMMENT ON CONSTRAINT daily_logs_drink_ratio_range ON daily_logs IS
'ドリンク比率は0%〜100%の範囲。UI側バリデーションと整合。';
