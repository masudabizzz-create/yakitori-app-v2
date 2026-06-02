-- 021_groups_guests_weather.sql
--
-- daily_logs: 組数・客数の実入力カラム + 外的要因（天気・祝日）カラムを追加
-- tenants   : 緯度経度カラムを追加（Open-Meteo 天気取得用）

-- ─── daily_logs への追加 ─────────────────────────────────────────
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS groups_count   integer,           -- 実際の総組数（null = 未入力）
  ADD COLUMN IF NOT EXISTS guests_count   integer,           -- 実際の総客数（null = 未入力）
  ADD COLUMN IF NOT EXISTS weather_code   smallint,          -- WMO weather code（null = 未取得）
  ADD COLUMN IF NOT EXISTS temp_max       numeric(4,1),      -- 最高気温 ℃
  ADD COLUMN IF NOT EXISTS temp_avg       numeric(4,1),      -- 平均気温 ℃
  ADD COLUMN IF NOT EXISTS precip_mm      numeric(5,1),      -- 降水量 mm
  ADD COLUMN IF NOT EXISTS humidity_avg   smallint,          -- 平均湿度 %
  ADD COLUMN IF NOT EXISTS is_holiday     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pre_holiday boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.daily_logs.groups_count   IS '実際の総組数（コース＋アラカルト含む）。null = 未入力（旧データ）';
COMMENT ON COLUMN public.daily_logs.guests_count   IS '実際の総客数（人数）。null = 未入力（旧データ）';
COMMENT ON COLUMN public.daily_logs.weather_code   IS 'Open-Meteo WMO weather interpretation code。null = 未取得';
COMMENT ON COLUMN public.daily_logs.temp_max       IS '最高気温（℃）。null = 未取得';
COMMENT ON COLUMN public.daily_logs.temp_avg       IS '平均気温（℃）。null = 未取得';
COMMENT ON COLUMN public.daily_logs.precip_mm      IS '降水量（mm）。null = 未取得';
COMMENT ON COLUMN public.daily_logs.humidity_avg   IS '平均湿度（%）。null = 未取得';
COMMENT ON COLUMN public.daily_logs.is_holiday     IS '祝日フラグ（holidays-jp API による判定）';
COMMENT ON COLUMN public.daily_logs.is_pre_holiday IS '祝日前日フラグ。翌日が祝日または日曜のとき true';

-- ─── tenants への追加 ────────────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS latitude  numeric(9,6),   -- 緯度（Open-Meteo 天気取得用）
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6);   -- 経度

COMMENT ON COLUMN public.tenants.latitude  IS '緯度（Open-Meteo 天気取得用）。null = 未設定（デフォルト: 渋谷 35.6762）';
COMMENT ON COLUMN public.tenants.longitude IS '経度（Open-Meteo 天気取得用）。null = 未設定（デフォルト: 渋谷 139.6503）';
