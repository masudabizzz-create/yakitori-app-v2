/**
 * Excel（.xlsx）→ Supabase 移行スクリプト
 *
 * 読み込み対象シート:
 *   - skewers       : 串マスタ（1行目=ヘッダー、2行目以降=データ）
 *   - settings      : コース設定（ヘッダーなし、キーバリュー形式）
 *   - order_schedule: 発注スケジュール（ヘッダーなし）
 *
 * 実行:
 *   cd scripts && npm install
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx migrate_from_gas.ts
 *
 * 環境変数:
 *   SUPABASE_URL              … https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY … service_role キー（RLS バイパスに必須）
 *   TENANT_ID                 … 省略時 00000000-0000-0000-0000-000000000001
 *   EXCEL_FILE                … 省略時 ~/Downloads/串管理アプリ改_202605.xlsx
 */

import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'

// xlsx は CJS モジュールのため createRequire で読み込む
const require = createRequire(import.meta.url)
const XLSX = require('xlsx') as typeof import('xlsx')

// ============================================================
// ヘルパー
// ============================================================

type Row = unknown[]

/** 数値変換（NaN・null は def を返す） */
function num(v: unknown, def = 0): number {
  const n = Number(v)
  return isNaN(n) ? def : n
}

/** 文字列変換（null・undefined・NaN は def を返す） */
function str(v: unknown, def = ''): string {
  if (v === null || v === undefined) return def
  const s = String(v).trim()
  return s === 'NaN' || s === '' ? def : s
}

/** 真偽値変換 */
function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  const s = String(v).toLowerCase().trim()
  return s === 'true' || s === '1' || s === 'yes'
}

/** "a,b,c" → ['a','b','c']（空文字除去） */
function splitCsv(v: unknown): string[] {
  const s = str(v)
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []
}

/** ~/... をホームディレクトリに展開 */
function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}

// ============================================================
// シートパーサー
// ============================================================

/**
 * skewers シート → Supabase INSERT 用オブジェクト配列
 *
 * 列マッピング（0 始まり）:
 *  0  串名          name
 *  1  カテゴリ       category
 *  2  理想_月        ideal_mon
 *  3  理想_火        ideal_tue
 *  4  理想_水        ideal_wed
 *  5  理想_木        ideal_thu
 *  6  理想_金        ideal_fri
 *  7  理想_土        ideal_sat
 *  8  理想_日        ideal_sun
 *  9  単位           unit
 * 10  閾値1          threshold1
 * 11  仕込量1        prep_amount1
 * 12  閾値2          threshold2
 * 13  仕込量2        prep_amount2
 * 14  有効           is_active
 * 15  仕込み名        prep_method_name
 * 16  コース分類      course_type
 * 17  対象コース      target_courses (CSV)
 * 18  重量g/本       weight_per_stick_g
 * 19  歩留まり率      yield_rate
 * 20  発注単位        order_unit_label
 * 21  発注単位g      order_unit_g
 */
function parseSkewers(rows: Row[], tenantId: string) {
  // 1行目はヘッダーなのでスキップ
  return rows
    .slice(1)
    .filter((r) => str(r[0]))  // 串名が空の行は除外
    .map((r, i) => ({
      tenant_id:          tenantId,
      name:               str(r[0]),
      category:           str(r[1]),
      ideal_mon:          num(r[2]),
      ideal_tue:          num(r[3]),
      ideal_wed:          num(r[4]),
      ideal_thu:          num(r[5]),
      ideal_fri:          num(r[6]),
      ideal_sat:          num(r[7]),
      ideal_sun:          num(r[8]),
      unit:               num(r[9], 1),
      threshold1:         num(r[10]),
      prep_amount1:       num(r[11]),
      threshold2:         num(r[12]),
      prep_amount2:       num(r[13]),
      is_active:          bool(r[14]),
      prep_method_name:   str(r[15], '昆布締め'),
      // 'additional_only' は DB に存在しない値 → specific_courses（対象コースなし）に変換
      course_type:        str(r[16], 'all_courses') === 'additional_only'
                            ? 'specific_courses'
                            : str(r[16], 'all_courses'),
      target_courses:     splitCsv(r[17]),
      weight_per_stick_g: num(r[18]),
      yield_rate:         num(r[19], 1.0),
      order_unit_label:   str(r[20]),
      order_unit_g:       num(r[21]),
      sort_order:         i,
    }))
}

/**
 * settings シート → Supabase upsert 用オブジェクト
 *
 * ヘッダーなし。col 0 = キー名、col 1 = 値。
 * Supabase settings テーブルに存在するキーのみ使用。
 */
function parseSettings(rows: Row[], tenantId: string) {
  const SUPABASE_SETTINGS_KEYS = new Set([
    'sunday_boost_enabled',
    'course_casual_price',
    'course_standard_price',
    'course_premium_price',
    'course_casual_skewers',
    'course_standard_skewers',
    'course_premium_skewers',
    'line_token',
  ])

  const kv: Record<string, unknown> = {}
  for (const r of rows) {
    const key = str(r[0])
    if (!key || !SUPABASE_SETTINGS_KEYS.has(key)) continue
    kv[key] = r[1]
  }

  return {
    tenant_id:               tenantId,
    sunday_boost_enabled:    bool(kv['sunday_boost_enabled']),
    course_casual_price:     num(kv['course_casual_price'],   3500),
    course_standard_price:   num(kv['course_standard_price'], 4500),
    course_premium_price:    num(kv['course_premium_price'],  5800),
    course_casual_skewers:   num(kv['course_casual_skewers'], 10),
    course_standard_skewers: num(kv['course_standard_skewers'], 15),
    course_premium_skewers:  num(kv['course_premium_skewers'],  20),
    // line_token は移行対象外（既存設定を上書きしないよう除外）
  }
}

/**
 * order_schedule シート → Supabase INSERT 用オブジェクト配列
 *
 * ヘッダーなし。
 *  col 0  deadline_dow   (締め切り曜日: 0=日〜6=土)
 *  col 1  delivery_dow   (納品曜日)
 *  col 2  uplift_weekday (平日上乗せ率)
 *  col 3  uplift_holiday (祝日上乗せ率)
 */
function parseOrderSchedules(rows: Row[], tenantId: string) {
  return rows
    .filter((r) => r[0] !== null && r[0] !== undefined && str(r[0]) !== '')
    .map((r, i) => ({
      tenant_id:      tenantId,
      deadline_dow:   num(r[0]),
      delivery_dow:   num(r[1]),
      uplift_weekday: num(r[2]),
      uplift_holiday: num(r[3]),
      sort_order:     i,
    }))
}

// ============================================================
// メイン
// ============================================================

async function main() {
  const supabaseUrl  = process.env.SUPABASE_URL
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY
  const tenantId     = process.env.TENANT_ID ?? '00000000-0000-0000-0000-000000000001'
  const excelFile    = expandHome(
    process.env.EXCEL_FILE ?? '~/Downloads/串管理アプリ改_202605.xlsx'
  )

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を環境変数に設定してください')
    process.exit(1)
  }

  // Excel を読み込む
  console.log(`\n📂 Excel 読み込み: ${excelFile}`)
  const wb = XLSX.readFile(excelFile)

  const REQUIRED = ['skewers', 'settings', 'order_schedule']
  for (const name of REQUIRED) {
    if (!wb.SheetNames.includes(name)) {
      console.error(`❌ シート "${name}" が見つかりません（存在するシート: ${wb.SheetNames.join(', ')}）`)
      process.exit(1)
    }
  }

  // sheet_to_json は header:1 で全行を配列として返す
  const toRows = (sheetName: string): Row[] =>
    XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], { header: 1, defval: null })

  const skewersRows       = toRows('skewers')
  const settingsRows      = toRows('settings')
  const orderScheduleRows = toRows('order_schedule')

  const skewersData       = parseSkewers(skewersRows, tenantId)
  const settingsData      = parseSettings(settingsRows, tenantId)
  const orderScheduleData = parseOrderSchedules(orderScheduleRows, tenantId)

  console.log(`\n🍢 移行開始`)
  console.log(`   テナント:         ${tenantId}`)
  console.log(`   串マスタ:         ${skewersData.length}件`)
  console.log(`   発注スケジュール: ${orderScheduleData.length}件`)

  // global.headers で Authorization を明示指定（service_role が RLS をバイパスするために必須）
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  })

  // ─── 1. settings ─────────────────────────────────────────────
  // 既存レコードを UPDATE（テナント作成時に settings 行は自動生成されるため）
  // 失敗（例: レコード未存在・RLS）してもスキップして続行する
  console.log('\n📋 settings を移行中...')
  const { tenant_id: _tid, ...settingsPatch } = settingsData
  const { error: settingsErr } = await supabase
    .from('settings')
    .update(settingsPatch)
    .eq('tenant_id', tenantId)
  if (settingsErr) {
    console.warn(`   ⚠️  settings スキップ（${settingsErr.message}）`)
    console.warn('      → アプリの「システム管理 > システム設定」から手動で設定してください')
  } else {
    console.log('   ✅ settings')
  }

  // ─── 2. skewers ──────────────────────────────────────────────
  console.log('🍢 skewers を移行中...')
  const { error: skewerErr } = await supabase
    .from('skewers')
    .insert(skewersData)
  if (skewerErr) throw new Error(`skewers 移行失敗: ${skewerErr.message}`)
  console.log(`   ✅ skewers ${skewersData.length}件`)

  // ─── 3. order_schedules ──────────────────────────────────────
  if (orderScheduleData.length > 0) {
    console.log('📦 order_schedules を移行中...')
    const { error: schedErr } = await supabase
      .from('order_schedules')
      .insert(orderScheduleData)
    if (schedErr) throw new Error(`order_schedules 移行失敗: ${schedErr.message}`)
    console.log(`   ✅ order_schedules ${orderScheduleData.length}件`)
  } else {
    console.log('   ⏭  order_schedules: データなしのためスキップ')
  }

  console.log('\n✨ 移行完了!\n')
}

main().catch((err) => {
  console.error('\n❌ 移行失敗:', err)
  process.exit(1)
})
