-- ============================================================
-- 025_submit_daily_report_rpc.sql
-- 日次ログと在庫の原子的保存（トランザクション内で実行）
-- ============================================================

-- フェーズ1: 1-4 daily_log成功/stocks失敗の不整合対策
-- 提案: PostgreSQL関数でdaily_logsとdaily_log_stocksを原子的に保存

CREATE OR REPLACE FUNCTION public.submit_daily_report(
  p_tenant_id uuid,
  p_log_date date,
  p_day_of_week text,
  p_staff_name text,
  p_recorded_at timestamptz,
  p_course_casual int,
  p_course_standard int,
  p_course_premium int,
  p_extra_skewers int,
  p_total_skewers int,
  p_total_sales int,
  p_drink_sales int,
  p_drink_ratio decimal(5,2),
  p_memo text,
  p_groups_count int DEFAULT NULL,
  p_guests_count int DEFAULT NULL,
  p_stock_rows jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_stock_row jsonb;
  v_current_tenant uuid;
  v_current_role text;
BEGIN
  -- セキュリティチェック: SECURITY DEFINERのため明示的に権限検証
  v_current_tenant := public.current_tenant_id();
  v_current_role := public.current_user_role();

  -- 1. テナント越境チェック
  IF p_tenant_id IS DISTINCT FROM v_current_tenant THEN
    RAISE EXCEPTION 'テナント越境エラー: 異なるテナントのデータは操作できません (tenant_id: %, current: %)',
      p_tenant_id, v_current_tenant;
  END IF;

  -- 2. ロール権限チェック（daily_logs INSERTポリシーと一致）
  -- 現行ポリシー: INSERT WITH CHECK (tenant_id = current_tenant_id())
  -- → ロール制限なし（全ロールが挿入可能）だが、念のため認証済みチェック
  IF v_current_tenant IS NULL THEN
    RAISE EXCEPTION '認証エラー: ログインが必要です';
  END IF;

  -- 3. 既存日報の上書き = 修正とみなし、権限者のみ許可
  -- (新規INSERTは全ロール可。026のUPDATEポリシーと一致させる)
  IF EXISTS (
    SELECT 1 FROM daily_logs
    WHERE tenant_id = p_tenant_id AND log_date = p_log_date
  ) AND v_current_role NOT IN ('platform_admin', 'manager', 'store_owner') THEN
    RAISE EXCEPTION '既存日報の修正権限がありません (role: %)', v_current_role;
  END IF;

  -- 4. daily_logs を upsert
  INSERT INTO daily_logs (
    tenant_id, log_date, day_of_week, staff_name, recorded_at,
    course_casual, course_standard, course_premium,
    extra_skewers, total_skewers, total_sales, drink_sales, drink_ratio,
    memo, groups_count, guests_count
  ) VALUES (
    p_tenant_id, p_log_date, p_day_of_week, p_staff_name, p_recorded_at,
    p_course_casual, p_course_standard, p_course_premium,
    p_extra_skewers, p_total_skewers, p_total_sales, p_drink_sales, p_drink_ratio,
    p_memo, p_groups_count, p_guests_count
  )
  ON CONFLICT (tenant_id, log_date) DO UPDATE SET
    day_of_week = EXCLUDED.day_of_week,
    staff_name = EXCLUDED.staff_name,
    recorded_at = EXCLUDED.recorded_at,
    course_casual = EXCLUDED.course_casual,
    course_standard = EXCLUDED.course_standard,
    course_premium = EXCLUDED.course_premium,
    extra_skewers = EXCLUDED.extra_skewers,
    total_skewers = EXCLUDED.total_skewers,
    total_sales = EXCLUDED.total_sales,
    drink_sales = EXCLUDED.drink_sales,
    drink_ratio = EXCLUDED.drink_ratio,
    memo = EXCLUDED.memo,
    groups_count = COALESCE(EXCLUDED.groups_count, daily_logs.groups_count),
    guests_count = COALESCE(EXCLUDED.guests_count, daily_logs.guests_count)
  RETURNING id INTO v_log_id;

  -- 5. daily_log_stocks を洗い替え（削除→挿入）
  DELETE FROM daily_log_stocks WHERE daily_log_id = v_log_id;

  -- 6. 在庫行を挿入
  FOR v_stock_row IN SELECT * FROM jsonb_array_elements(p_stock_rows)
  LOOP
    INSERT INTO daily_log_stocks (daily_log_id, skewer_id, stock, is_kombu)
    VALUES (
      v_log_id,
      (v_stock_row->>'skewerId')::uuid,
      (v_stock_row->>'stock')::int,
      (v_stock_row->>'isKombu')::boolean
    );
  END LOOP;

  -- 7. 成功を返す
  RETURN jsonb_build_object(
    'log_id', v_log_id,
    'success', true
  );
END;
$$;

COMMENT ON FUNCTION public.submit_daily_report IS
'日次ログと在庫を原子的に保存するRPC。
SECURITY DEFINER関数のため、冒頭でテナント越境チェックと認証チェックを実施。
トランザクション内でdaily_logsのupsertとdaily_log_stocksの洗い替えを実行。
両方成功または両方失敗（ロールバック）により、データ不整合を防ぐ。

セキュリティ:
- テナント越境: p_tenant_id != current_tenant_id() → EXCEPTION
- 認証: current_tenant_id() IS NULL → EXCEPTION
- 既存行UPDATE: 026のdaily_logs_update_store_ownerポリシーと一致（platform_admin/manager/store_owner）
- 新規INSERT: 全ロール許可（認証済みのみ）';
