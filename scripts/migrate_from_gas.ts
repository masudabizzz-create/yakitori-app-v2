/**
 * GAS（Google Spreadsheet）→ Supabase 移行スクリプト
 *
 * 前提:
 *   - gas_export.js を実行して gas_export.json を取得済み
 *   - Supabase で 001〜003 のマイグレーション適用済み
 *
 * 実行:
 *   cd scripts && npm install
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx migrate_from_gas.ts
 *
 * 環境変数:
 *   SUPABASE_URL              … https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY … service_role キー（RLSをバイパスするため必須）
 *   TENANT_ID                 … 省略時 00000000-0000-0000-0000-000000000001
 *   EXPORT_FILE               … 省略時 ./gas_export.json
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ---------------- GAS エクスポート形式 ----------------

interface GasSkewer {
  name: string
  category: string
  ideal: number[] // [月,火,水,木,金,土,日]
  unit: number
  threshold1: number
  prepAmount1: number
  threshold2: number
  prepAmount2: number
  active: boolean
  prepMethodName: string
  courseType: string
  targetCourses: string[]
  weightPerStickG: number
  yieldRate: number
  orderUnitLabel: string
  orderUnitG: number
}

interface GasStockEntry {
  skewerName: string
  stock: number
  isKombu: boolean
}

interface GasDailyLog {
  date: string
  dayOfWeek: string
  staffName: string
  recordedAt: string
  courseCasual: number
  courseStandard: number
  coursePremium: number
  extraSkewers: number
  totalSkewers: number
  totalSales: number
  drinkSales: number
  drinkRatio: number
  memo: string
  stocks: GasStockEntry[]
}

interface GasSettings {
  sundayBoostEnabled: boolean
  courseCasualPrice: number
  courseStandardPrice: number
  coursePremiumPrice: number
  courseCasualSkewers: number
  courseStandardSkewers: number
  coursePremiumSkewers: number
  lineToken: string
}

interface GasOrderSchedule {
  deadlineDow: number
  deliveryDow: number
  upliftWeekday: number
  upliftHoliday: number
}

interface GasOrderScheduleIrregular {
  weekStartDate: string
  deadlineDate: string
  deliveryDate: string
  upliftWeekday: number
  upliftHoliday: number
  note: string
}

interface GasExport {
  skewers: GasSkewer[]
  dailyLogs: GasDailyLog[]
  settings: GasSettings
  orderSchedules: GasOrderSchedule[]
  orderScheduleIrregulars: GasOrderScheduleIrregular[]
}

// ---------------- ヘルパー ----------------

/** "yyyy/MM/dd" -> "yyyy-MM-dd" */
function toIsoDate(gasDate: string): string {
  return gasDate.replace(/\//g, '-')
}

/** "yyyy/MM/dd HH:mm:ss" -> ISO8601(+09:00) */
function toIsoDateTime(gasDateTime: string): string {
  const [datePart, timePart] = gasDateTime.split(' ')
  if (!datePart) return new Date().toISOString()
  const d = datePart.replace(/\//g, '-')
  return timePart ? `${d}T${timePart}+09:00` : `${d}T00:00:00+09:00`
}

// ---------------- メイン ----------------

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const tenantId = process.env.TENANT_ID ?? '00000000-0000-0000-0000-000000000001'
  const exportFile = process.env.EXPORT_FILE ?? './gas_export.json'

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を環境変数に設定してください')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const data: GasExport = JSON.parse(
    fs.readFileSync(path.resolve(exportFile), 'utf-8')
  )

  console.log('\n🍢 GAS → Supabase 移行開始')
  console.log(`   テナント: ${tenantId}`)
  console.log(`   串マスタ: ${data.skewers.length}件 / 日次ログ: ${data.dailyLogs.length}件\n`)

  // --- 1. settings ---
  console.log('📋 settings を移行中...')
  const { error: settingsErr } = await supabase.from('settings').upsert(
    {
      tenant_id: tenantId,
      sunday_boost_enabled: data.settings.sundayBoostEnabled,
      course_casual_price: data.settings.courseCasualPrice,
      course_standard_price: data.settings.courseStandardPrice,
      course_premium_price: data.settings.coursePremiumPrice,
      course_casual_skewers: data.settings.courseCasualSkewers,
      course_standard_skewers: data.settings.courseStandardSkewers,
      course_premium_skewers: data.settings.coursePremiumSkewers,
      line_token: data.settings.lineToken ?? '',
    },
    { onConflict: 'tenant_id' }
  )
  if (settingsErr) throw new Error(`settings 移行失敗: ${settingsErr.message}`)
  console.log('   ✅ settings')

  // --- 2. skewers ---
  console.log('🍢 skewers を移行中...')
  const skewerRows = data.skewers.map((s, i) => ({
    tenant_id: tenantId,
    name: s.name,
    category: s.category,
    ideal_mon: s.ideal[0] ?? 0,
    ideal_tue: s.ideal[1] ?? 0,
    ideal_wed: s.ideal[2] ?? 0,
    ideal_thu: s.ideal[3] ?? 0,
    ideal_fri: s.ideal[4] ?? 0,
    ideal_sat: s.ideal[5] ?? 0,
    ideal_sun: s.ideal[6] ?? 0,
    unit: s.unit,
    threshold1: s.threshold1,
    prep_amount1: s.prepAmount1,
    threshold2: s.threshold2,
    prep_amount2: s.prepAmount2,
    is_active: s.active,
    prep_method_name: s.prepMethodName || '昆布締め',
    course_type: s.courseType || 'all_courses',
    target_courses: s.targetCourses ?? [],
    weight_per_stick_g: s.weightPerStickG ?? 0,
    yield_rate: s.yieldRate ?? 1.0,
    order_unit_label: s.orderUnitLabel ?? '',
    order_unit_g: s.orderUnitG ?? 0,
    sort_order: i,
  }))

  const { data: insertedSkewers, error: skewerErr } = await supabase
    .from('skewers')
    .insert(skewerRows)
    .select('id, name')
  if (skewerErr) throw new Error(`skewers 移行失敗: ${skewerErr.message}`)

  const skewerNameToId = new Map<string, string>(
    (insertedSkewers ?? []).map((s: { id: string; name: string }) => [s.name, s.id])
  )
  console.log(`   ✅ skewers ${skewerRows.length}件`)

  // --- 3. daily_logs + daily_log_stocks ---
  console.log('📊 daily_logs を移行中...')
  let logCount = 0
  for (const log of data.dailyLogs) {
    const { data: logData, error: logErr } = await supabase
      .from('daily_logs')
      .upsert(
        {
          tenant_id: tenantId,
          log_date: toIsoDate(log.date),
          day_of_week: log.dayOfWeek,
          staff_name: log.staffName,
          recorded_at: toIsoDateTime(log.recordedAt),
          course_casual: log.courseCasual,
          course_standard: log.courseStandard,
          course_premium: log.coursePremium,
          extra_skewers: log.extraSkewers,
          total_skewers: log.totalSkewers,
          total_sales: log.totalSales,
          drink_sales: log.drinkSales,
          drink_ratio: log.drinkRatio,
          memo: log.memo ?? '',
        },
        { onConflict: 'tenant_id,log_date' }
      )
      .select('id')
      .single()

    if (logErr) {
      console.warn(`   ⚠️  ${log.date}: ${logErr.message}`)
      continue
    }

    const logId = (logData as { id: string }).id
    const stockRows = log.stocks
      .filter((s) => skewerNameToId.has(s.skewerName))
      .map((s) => ({
        daily_log_id: logId,
        skewer_id: skewerNameToId.get(s.skewerName)!,
        stock: s.stock,
        is_kombu: s.isKombu,
      }))

    if (stockRows.length > 0) {
      await supabase.from('daily_log_stocks').delete().eq('daily_log_id', logId)
      const { error: stockErr } = await supabase.from('daily_log_stocks').insert(stockRows)
      if (stockErr) console.warn(`   ⚠️  ${log.date} 在庫: ${stockErr.message}`)
    }
    logCount++
  }
  console.log(`   ✅ daily_logs ${logCount}件`)

  // --- 4. order_schedules ---
  if (data.orderSchedules.length > 0) {
    console.log('📦 order_schedules を移行中...')
    const { error } = await supabase.from('order_schedules').insert(
      data.orderSchedules.map((s, i) => ({
        tenant_id: tenantId,
        deadline_dow: s.deadlineDow,
        delivery_dow: s.deliveryDow,
        uplift_weekday: s.upliftWeekday,
        uplift_holiday: s.upliftHoliday,
        sort_order: i,
      }))
    )
    if (error) console.warn(`   ⚠️  order_schedules: ${error.message}`)
    else console.log(`   ✅ order_schedules ${data.orderSchedules.length}件`)
  }

  // --- 5. order_schedule_irregulars ---
  if (data.orderScheduleIrregulars.length > 0) {
    console.log('📦 order_schedule_irregulars を移行中...')
    const { error } = await supabase.from('order_schedule_irregulars').insert(
      data.orderScheduleIrregulars.map((s) => ({
        tenant_id: tenantId,
        week_start_date: toIsoDate(s.weekStartDate),
        deadline_date: toIsoDate(s.deadlineDate),
        delivery_date: toIsoDate(s.deliveryDate),
        uplift_weekday: s.upliftWeekday,
        uplift_holiday: s.upliftHoliday,
        note: s.note ?? '',
      }))
    )
    if (error) console.warn(`   ⚠️  order_schedule_irregulars: ${error.message}`)
    else console.log(`   ✅ order_schedule_irregulars ${data.orderScheduleIrregulars.length}件`)
  }

  console.log('\n✨ 移行完了!\n')
}

main().catch((err) => {
  console.error('\n❌ 移行失敗:', err)
  process.exit(1)
})
