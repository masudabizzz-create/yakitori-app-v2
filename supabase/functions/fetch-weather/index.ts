// supabase/functions/fetch-weather/index.ts
//
// 天気データ取得 Edge Function
//
// 【アクション】
//   historical — 指定日の過去天気を Open-Meteo Archive API で取得し daily_logs を UPDATE
//   today      — 当日の現在天気を Open-Meteo Forecast API で取得して返す（DB 更新なし）
//
// 【認証】
//   両アクションとも Bearer JWT 必須。
//   service_role を使用して RLS をバイパスし天気データを書き込む。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/** デフォルト座標（渋谷 35.6762, 139.6503）— テナントに座標未設定の場合に使用 */
const DEFAULT_LAT = 35.6762
const DEFAULT_LON = 139.6503

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** yyyy-MM-dd 形式で日付文字列を生成 */
function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * is_pre_holiday 判定: 翌日が祝日または日曜ならば true。
 *
 * 定義を1つの関数に閉じ込めることで、将来 settings に店舗定休日が追加された際も
 * この関数の条件だけを差し替えれば対応できる。
 */
function calcIsPreHoliday(
  dateStr: string,
  holidays: Record<string, string>,
): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const nextDate = new Date(y, m - 1, d + 1)
  const nextStr = toYmd(nextDate)
  // 翌日が祝日
  if (nextStr in holidays) return true
  // 翌日が日曜（つまり土曜は「翌日が日曜なので」is_pre_holiday = true）
  if (nextDate.getDay() === 0) return true
  return false
}

/**
 * holidays-jp API から指定年の祝日一覧を取得する。
 * ネットワーク障害時は空オブジェクトを返す（失敗を無視）。
 */
async function fetchHolidays(year: number): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `https://holidays-jp.github.io/api/v1/${year}/date.json`,
    )
    if (!res.ok) return {}
    return (await res.json()) as Record<string, string>
  } catch {
    return {}
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const { action } = payload
  if (typeof action !== 'string') return json(400, { error: 'action は必須です' })

  // ── JWT 認証 ────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json(401, { error: '認証が必要です' })

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authData?.user) return json(401, { error: '認証に失敗しました' })

  // ── テナントID の解決 ─────────────────────────────────────
  // フロントが effectiveTenantId を tenant_id として渡す。
  // 未指定の場合は users テーブルから解決する。
  let effectiveTenantId: string | null = null
  if (typeof payload.tenant_id === 'string' && payload.tenant_id.length > 0) {
    effectiveTenantId = payload.tenant_id
  } else {
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('id', authData.user.id)
      .single()
    effectiveTenantId = userRow?.tenant_id ?? null
  }
  if (!effectiveTenantId) return json(400, { error: 'tenant_id を解決できません' })

  // ── テナント座標の取得 ────────────────────────────────────
  const { data: tenantRow } = await supabaseAdmin
    .from('tenants')
    .select('latitude, longitude')
    .eq('id', effectiveTenantId)
    .single()

  const lat = (tenantRow?.latitude as number | null | undefined) ?? DEFAULT_LAT
  const lon = (tenantRow?.longitude as number | null | undefined) ?? DEFAULT_LON

  // ============================================================
  // historical — 過去天気を取得し daily_logs を UPDATE
  // ============================================================
  if (action === 'historical') {
    const { log_date } = payload
    if (typeof log_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(log_date)) {
      return json(400, { error: 'log_date は YYYY-MM-DD 形式で指定してください' })
    }

    try {
      // 祝日データ取得（当年 + 翌年）
      const year = parseInt(log_date.slice(0, 4), 10)
      const [holidaysThis, holidaysNext] = await Promise.all([
        fetchHolidays(year),
        fetchHolidays(year + 1),
      ])
      const holidays: Record<string, string> = { ...holidaysThis, ...holidaysNext }

      const isHoliday = log_date in holidays
      const isPreHoliday = calcIsPreHoliday(log_date, holidays)

      // Open-Meteo Archive API
      const url = new URL('https://archive-api.open-meteo.com/v1/archive')
      url.searchParams.set('latitude', String(lat))
      url.searchParams.set('longitude', String(lon))
      url.searchParams.set('start_date', log_date)
      url.searchParams.set('end_date', log_date)
      url.searchParams.set(
        'daily',
        'weather_code,temperature_2m_max,temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean',
      )
      url.searchParams.set('timezone', 'Asia/Tokyo')

      const weatherRes = await fetch(url.toString())

      // 天気取得失敗の場合でも祝日フラグだけ更新する
      if (!weatherRes.ok) {
        await supabaseAdmin
          .from('daily_logs')
          .update({ is_holiday: isHoliday, is_pre_holiday: isPreHoliday })
          .eq('tenant_id', effectiveTenantId)
          .eq('log_date', log_date)
        return json(200, { success: true, weather_fetched: false, holiday_updated: true })
      }

      const wd = await weatherRes.json()
      const daily = wd.daily ?? {}
      const weatherCode: number | null =
        typeof daily.weather_code?.[0] === 'number'
          ? Math.round(daily.weather_code[0])
          : null
      const tempMax: number | null = daily.temperature_2m_max?.[0] ?? null
      const tempAvg: number | null = daily.temperature_2m_mean?.[0] ?? null
      const precipMm: number | null = daily.precipitation_sum?.[0] ?? null
      const humidityAvg: number | null =
        typeof daily.relative_humidity_2m_mean?.[0] === 'number'
          ? Math.round(daily.relative_humidity_2m_mean[0])
          : null

      const { error: updateError } = await supabaseAdmin
        .from('daily_logs')
        .update({
          weather_code: weatherCode,
          temp_max: tempMax,
          temp_avg: tempAvg,
          precip_mm: precipMm,
          humidity_avg: humidityAvg,
          is_holiday: isHoliday,
          is_pre_holiday: isPreHoliday,
        })
        .eq('tenant_id', effectiveTenantId)
        .eq('log_date', log_date)

      if (updateError) return json(500, { error: updateError.message })
      return json(200, { success: true, weather_fetched: true, holiday_updated: true })
    } catch (e) {
      return json(500, { error: String(e) })
    }
  }

  // ============================================================
  // today — 当日の現在天気を返す（DB 更新なし）
  // ============================================================
  if (action === 'today') {
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast')
      url.searchParams.set('latitude', String(lat))
      url.searchParams.set('longitude', String(lon))
      url.searchParams.set(
        'current',
        'weather_code,temperature_2m,relative_humidity_2m,precipitation',
      )
      url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min')
      url.searchParams.set('timezone', 'Asia/Tokyo')
      url.searchParams.set('forecast_days', '1')

      const weatherRes = await fetch(url.toString())
      if (!weatherRes.ok) return json(502, { error: '天気の取得に失敗しました' })

      const wd = await weatherRes.json()
      const current = wd.current ?? {}
      const daily = wd.daily ?? {}

      return json(200, {
        weather_code: current.weather_code ?? null,
        temperature: current.temperature_2m ?? null,
        humidity: current.relative_humidity_2m ?? null,
        precipitation: current.precipitation ?? null,
        temp_max: daily.temperature_2m_max?.[0] ?? null,
        temp_min: daily.temperature_2m_min?.[0] ?? null,
      })
    } catch (e) {
      return json(500, { error: String(e) })
    }
  }

  return json(400, { error: `未知の action: ${action}` })
})
