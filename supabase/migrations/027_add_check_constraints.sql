-- ============================================================
-- 027_add_check_constraints.sql
-- 数値範囲のサーバ側CHECK制約（フェーズ1: 4-2）
-- ============================================================

-- 問題:
-- クライアント側バリデーションのみで、サーバ側に範囲チェックが無い
-- DevToolsやcurlで異常値を送信できてしまう

-- ============================================================
-- 適用前: 違反データ確認SELECT（手動実行）
-- ============================================================

-- 以下のクエリで既存データに制約違反が無いか確認すること:

/*
-- 売上が負数のレコード
SELECT id, log_date, total_sales FROM daily_logs WHERE total_sales < 0;

-- ドリンク売上が負数のレコード
SELECT id, log_date, drink_sales FROM daily_logs WHERE drink_sales < 0;

-- ドリンク比率が範囲外のレコード
SELECT id, log_date, drink_ratio FROM daily_logs WHERE drink_ratio < 0 OR drink_ratio > 100;

-- コース数が負数のレコード
SELECT id, log_date, course_casual, course_standard, course_premium
FROM daily_logs
WHERE course_casual < 0 OR course_standard < 0 OR course_premium < 0;

-- 串本数が負数のレコード
SELECT id, log_date, extra_skewers, total_skewers
FROM daily_logs
WHERE extra_skewers < 0 OR total_skewers < 0;

-- 組数・客数が負数のレコード
SELECT id, log_date, groups_count, guests_count
FROM daily_logs
WHERE groups_count < 0 OR guests_count < 0;

-- 予算金額が負数のレコード
SELECT id, log_date, amount FROM daily_budgets WHERE amount < 0;

-- 違反データがある場合は、ALTER TABLE前に修正すること:
-- UPDATE daily_logs SET total_sales = 0 WHERE total_sales < 0;
-- など
*/

-- ============================================================
-- daily_logs: 数値範囲のCHECK制約
-- ============================================================

-- 売上: 0以上（負数を拒否）
ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_total_sales_non_negative;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_total_sales_non_negative
  CHECK (total_sales >= 0);

-- ドリンク売上: 0以上
ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_drink_sales_non_negative;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_drink_sales_non_negative
  CHECK (drink_sales >= 0);

-- ドリンク比率: 0以上100以下
ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_drink_ratio_range;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_drink_ratio_range
  CHECK (drink_ratio >= 0 AND drink_ratio <= 100);

-- コース数: 0以上
ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_course_casual_non_negative;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_course_casual_non_negative
  CHECK (course_casual >= 0);

ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_course_standard_non_negative;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_course_standard_non_negative
  CHECK (course_standard >= 0);

ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_course_premium_non_negative;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_course_premium_non_negative
  CHECK (course_premium >= 0);

-- 追加串: 0以上
ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_extra_skewers_non_negative;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_extra_skewers_non_negative
  CHECK (extra_skewers >= 0);

-- 合計串: 0以上
ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_total_skewers_non_negative;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_total_skewers_non_negative
  CHECK (total_skewers >= 0);

-- 組数・客数: nullまたは0以上（負数を拒否）
ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_groups_count_non_negative;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_groups_count_non_negative
  CHECK (groups_count IS NULL OR groups_count >= 0);

ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_guests_count_non_negative;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_guests_count_non_negative
  CHECK (guests_count IS NULL OR guests_count >= 0);

-- ============================================================
-- daily_budgets: 金額は0以上
-- ============================================================

ALTER TABLE daily_budgets DROP CONSTRAINT IF EXISTS daily_budgets_amount_non_negative;
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
