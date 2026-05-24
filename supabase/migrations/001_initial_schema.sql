-- ============================================================
-- 001_initial_schema.sql
-- 串在庫管理アプリ v2 — 初期スキーマ
-- 適用順: 001 -> 002 -> 003
-- ============================================================

-- --------------------
-- tenants（店舗）
-- --------------------
CREATE TABLE tenants (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- --------------------
-- users（スタッフ / Supabase Auth と連動）
-- --------------------
CREATE TABLE users (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  role       text NOT NULL CHECK (role IN ('admin', 'manager', 'user')),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- --------------------
-- skewers（串マスタ）
-- --------------------
CREATE TABLE skewers (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                text NOT NULL,
  category            text NOT NULL
                        CHECK (category IN ('レギュラー','スペシャル','つくね','前日仕込み','その他仕込み','副産物')),
  ideal_mon           integer NOT NULL DEFAULT 0,
  ideal_tue           integer NOT NULL DEFAULT 0,
  ideal_wed           integer NOT NULL DEFAULT 0,
  ideal_thu           integer NOT NULL DEFAULT 0,
  ideal_fri           integer NOT NULL DEFAULT 0,
  ideal_sat           integer NOT NULL DEFAULT 0,
  ideal_sun           integer NOT NULL DEFAULT 0,
  unit                integer NOT NULL DEFAULT 1,
  threshold1          integer NOT NULL DEFAULT 0,
  prep_amount1        integer NOT NULL DEFAULT 0,
  threshold2          integer NOT NULL DEFAULT 0,
  prep_amount2        integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  prep_method_name    text NOT NULL DEFAULT '昆布締め',
  course_type         text NOT NULL DEFAULT 'all_courses'
                        CHECK (course_type IN ('all_courses','specific_courses')),
  target_courses      text[] NOT NULL DEFAULT '{}',
  weight_per_stick_g  numeric NOT NULL DEFAULT 0,
  yield_rate          numeric NOT NULL DEFAULT 1.0,
  order_unit_label    text NOT NULL DEFAULT '',
  order_unit_g        numeric NOT NULL DEFAULT 0,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now() NOT NULL
);

-- --------------------
-- daily_logs（日次営業ログ）
-- --------------------
CREATE TABLE daily_logs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  log_date        date NOT NULL,
  day_of_week     text NOT NULL,
  staff_name      text NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  course_casual   integer NOT NULL DEFAULT 0,
  course_standard integer NOT NULL DEFAULT 0,
  course_premium  integer NOT NULL DEFAULT 0,
  extra_skewers   integer NOT NULL DEFAULT 0,
  total_skewers   integer NOT NULL DEFAULT 0,
  total_sales     integer NOT NULL DEFAULT 0,
  drink_sales     integer NOT NULL DEFAULT 0,
  drink_ratio     numeric NOT NULL DEFAULT 0,
  memo            text NOT NULL DEFAULT '',
  created_at      timestamptz DEFAULT now() NOT NULL,
  UNIQUE (tenant_id, log_date)
);

-- --------------------
-- daily_log_stocks（日次在庫スナップショット）
-- --------------------
CREATE TABLE daily_log_stocks (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  daily_log_id uuid NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  skewer_id    uuid NOT NULL REFERENCES skewers(id) ON DELETE CASCADE,
  stock        integer NOT NULL DEFAULT 0,   -- その他仕込み: 999=仕込み中 / 0=なし
  is_kombu     boolean NOT NULL DEFAULT false, -- 前日仕込み: 昆布締め済みフラグ
  UNIQUE (daily_log_id, skewer_id)
);

-- --------------------
-- settings（システム設定）
-- --------------------
CREATE TABLE settings (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id               uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  sunday_boost_enabled    boolean NOT NULL DEFAULT true,
  course_casual_price     integer NOT NULL DEFAULT 3500,
  course_standard_price   integer NOT NULL DEFAULT 4500,
  course_premium_price    integer NOT NULL DEFAULT 5800,
  course_casual_skewers   integer NOT NULL DEFAULT 10,
  course_standard_skewers integer NOT NULL DEFAULT 15,
  course_premium_skewers  integer NOT NULL DEFAULT 20,
  line_token              text NOT NULL DEFAULT '',
  updated_at              timestamptz DEFAULT now() NOT NULL
);

-- --------------------
-- order_schedules（通常発注スケジュール）
-- --------------------
CREATE TABLE order_schedules (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deadline_dow   integer NOT NULL CHECK (deadline_dow BETWEEN 0 AND 6),
  delivery_dow   integer NOT NULL CHECK (delivery_dow BETWEEN 0 AND 6),
  uplift_weekday numeric NOT NULL DEFAULT 0,
  uplift_holiday numeric NOT NULL DEFAULT 0,
  sort_order     integer NOT NULL DEFAULT 0
);

-- --------------------
-- order_schedule_irregulars（例外発注スケジュール）
-- --------------------
CREATE TABLE order_schedule_irregulars (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  deadline_date   date NOT NULL,
  delivery_date   date NOT NULL,
  uplift_weekday  numeric NOT NULL DEFAULT 0,
  uplift_holiday  numeric NOT NULL DEFAULT 0,
  note            text NOT NULL DEFAULT ''
);

-- --------------------
-- インデックス
-- --------------------
CREATE INDEX idx_skewers_tenant        ON skewers(tenant_id);
CREATE INDEX idx_skewers_active        ON skewers(tenant_id, is_active);
CREATE INDEX idx_daily_logs_tenant     ON daily_logs(tenant_id, log_date DESC);
CREATE INDEX idx_daily_log_stocks_log  ON daily_log_stocks(daily_log_id);
CREATE INDEX idx_order_schedules_tenant ON order_schedules(tenant_id, sort_order);
CREATE INDEX idx_order_irregulars_tenant ON order_schedule_irregulars(tenant_id, week_start_date);
