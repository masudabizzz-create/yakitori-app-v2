/**
 * seed-test-data.mjs
 * テスト環境用ダミーデータ投入スクリプト
 *
 * 使い方:
 *   cd scripts
 *   node seed-test-data.mjs
 *
 * ../frontend/.env.local から VITE_SUPABASE_URL と VITE_SUPABASE_SERVICE_ROLE_KEY を自動読み込み。
 * 手動で環境変数を渡す場合:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=eyJ... node seed-test-data.mjs
 *
 * 投入内容:
 *   - テスト店舗（テナント）の設定更新
 *   - 串マスタ 15 品目
 *   - 過去 90 日分の営業ログ（日曜除く・曜日/季節変動あり）
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── 環境変数の読み込み ──────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', 'frontend', '.env.local')
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (!match) continue
    const key = match[1].trim()
    const val = match[2].trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。')
  console.error('   frontend/.env.local に設定するか、環境変数で渡してください。')
  process.exit(1)
}

// サービスロールキーが本番を向いていないかチェック（誤操作防止）
if (SUPABASE_URL.includes('mmquefvklrxjcmoxgvjb')) {
  console.error('🚨 本番プロジェクト（mmquefvklrxjcmoxgvjb）へのシードは禁止されています。')
  console.error('   .env.local をテストプロジェクトの URL に変更してください。')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── テナント ID 取得 ──────────────────────────────────────────────
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// ── 串マスタ ─────────────────────────────────────────────────────
const SKEWERS = [
  // レギュラー
  { name: 'もも', category: 'レギュラー', ideal_fri: 40, ideal_sat: 50, ideal_mon: 25, ideal_tue: 25, ideal_wed: 30, ideal_thu: 30, ideal_sun: 0, unit: 5, threshold1: 10, prep_amount1: 20, sort_order: 1 },
  { name: 'ねぎま', category: 'レギュラー', ideal_fri: 35, ideal_sat: 45, ideal_mon: 20, ideal_tue: 20, ideal_wed: 25, ideal_thu: 25, ideal_sun: 0, unit: 5, threshold1: 8, prep_amount1: 18, sort_order: 2 },
  { name: 'かわ', category: 'レギュラー', ideal_fri: 30, ideal_sat: 38, ideal_mon: 18, ideal_tue: 18, ideal_wed: 22, ideal_thu: 22, ideal_sun: 0, unit: 5, threshold1: 8, prep_amount1: 15, sort_order: 3 },
  { name: 'ハート', category: 'レギュラー', ideal_fri: 20, ideal_sat: 25, ideal_mon: 12, ideal_tue: 12, ideal_wed: 15, ideal_thu: 15, ideal_sun: 0, unit: 5, threshold1: 5, prep_amount1: 10, sort_order: 4 },
  { name: 'レバー', category: 'レギュラー', ideal_fri: 20, ideal_sat: 25, ideal_mon: 12, ideal_tue: 12, ideal_wed: 15, ideal_thu: 15, ideal_sun: 0, unit: 5, threshold1: 5, prep_amount1: 10, sort_order: 5 },
  { name: 'せせり', category: 'レギュラー', ideal_fri: 18, ideal_sat: 22, ideal_mon: 10, ideal_tue: 10, ideal_wed: 13, ideal_thu: 13, ideal_sun: 0, unit: 5, threshold1: 5, prep_amount1: 10, sort_order: 6 },
  { name: 'ふりそで', category: 'レギュラー', ideal_fri: 15, ideal_sat: 20, ideal_mon: 8, ideal_tue: 8, ideal_wed: 10, ideal_thu: 10, ideal_sun: 0, unit: 5, threshold1: 4, prep_amount1: 8, sort_order: 7 },
  // スペシャル
  { name: 'ぼんじり', category: 'スペシャル', ideal_fri: 12, ideal_sat: 15, ideal_mon: 6, ideal_tue: 6, ideal_wed: 8, ideal_thu: 8, ideal_sun: 0, unit: 5, threshold1: 3, prep_amount1: 6, sort_order: 8 },
  { name: 'ソリレス', category: 'スペシャル', ideal_fri: 10, ideal_sat: 12, ideal_mon: 5, ideal_tue: 5, ideal_wed: 7, ideal_thu: 7, ideal_sun: 0, unit: 5, threshold1: 3, prep_amount1: 5, sort_order: 9 },
  // つくね
  { name: 'つくね', category: 'つくね', ideal_fri: 25, ideal_sat: 30, ideal_mon: 15, ideal_tue: 15, ideal_wed: 18, ideal_thu: 18, ideal_sun: 0, unit: 5, threshold1: 6, prep_amount1: 12, sort_order: 10 },
  // 前日仕込み
  { name: 'ささみおおば', category: '前日仕込み', ideal_fri: 15, ideal_sat: 18, ideal_mon: 8, ideal_tue: 8, ideal_wed: 10, ideal_thu: 10, ideal_sun: 0, unit: 5, threshold1: 4, prep_amount1: 8, sort_order: 11, prep_method_name: '昆布締め' },
  { name: 'ささみわさび', category: '前日仕込み', ideal_fri: 12, ideal_sat: 15, ideal_mon: 6, ideal_tue: 6, ideal_wed: 8, ideal_thu: 8, ideal_sun: 0, unit: 5, threshold1: 3, prep_amount1: 6, sort_order: 12, prep_method_name: '昆布締め' },
  // その他仕込み
  { name: 'テバ', category: 'その他仕込み', ideal_fri: 8, ideal_sat: 10, ideal_mon: 4, ideal_tue: 4, ideal_wed: 5, ideal_thu: 5, ideal_sun: 0, unit: 5, threshold1: 2, prep_amount1: 4, sort_order: 13 },
  // 副産物
  { name: 'なんこつ', category: '副産物', ideal_fri: 8, ideal_sat: 10, ideal_mon: 4, ideal_tue: 4, ideal_wed: 5, ideal_thu: 5, ideal_sun: 0, unit: 5, threshold1: 2, prep_amount1: 4, sort_order: 14 },
  { name: 'やげんなんこつ', category: '副産物', ideal_fri: 6, ideal_sat: 8, ideal_mon: 3, ideal_tue: 3, ideal_wed: 4, ideal_thu: 4, ideal_sun: 0, unit: 5, threshold1: 2, prep_amount1: 3, sort_order: 15 },
]

// ── 曜日マッピング ────────────────────────────────────────────────
const DOW_JA = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜']

// 曜日ごとの売上係数（日曜は定休）
const DOW_FACTOR = [0, 0.65, 0.70, 0.75, 0.82, 1.0, 1.25]

// ── 乱数ユーティリティ ────────────────────────────────────────────
function randBetween(min, max) {
  return min + Math.random() * (max - min)
}
function randInt(min, max) {
  return Math.floor(randBetween(min, max + 1))
}

/** YYYY-MM-DD を Asia/Tokyo 基準で返す（toISOString は UTC なので使わない） */
function toYmdJst(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(date)
}
/** JST 基準の曜日インデックス（0=日） */
function getJstDow(date) {
  const ymd = toYmdJst(date)
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

// ── 営業ログ生成 ─────────────────────────────────────────────────
const STAFF_NAMES = ['山田', '佐藤', '田中', '鈴木', '高橋']
const CASUAL_PRICE = 3500
const STANDARD_PRICE = 4500
const PREMIUM_PRICE = 5800

/** 日付から月の季節係数 (0.85〜1.25 で夏がピーク) */
function seasonFactor(date) {
  const m = date.getMonth() + 1 // 1-12
  const factors = [0.82, 0.85, 0.90, 0.92, 0.95, 1.10, 1.25, 1.20, 1.05, 0.95, 1.00, 1.05]
  return factors[m - 1]
}

function generateDailyLog(date, tenantId) {
  const dow = getJstDow(date) // JST 基準の曜日
  if (dow === 0) return null // 日曜定休

  const dowFactor = DOW_FACTOR[dow]
  const season = seasonFactor(date)
  const noise = randBetween(0.88, 1.12)
  const totalFactor = dowFactor * season * noise

  // 客数（グループ数）
  const baseGroups = 18
  const groups = Math.round(baseGroups * totalFactor)

  // コース内訳（グループ数を 4:5:1 で割り振り）
  const casual = Math.round(groups * randBetween(0.32, 0.45))
  const premium = Math.round(groups * randBetween(0.08, 0.18))
  const standard = Math.max(0, groups - casual - premium)

  // 串本数（コースの合計 + αの追加串）
  const extraSkewers = randInt(0, Math.round(groups * 0.3))
  const totalSkewers = casual * 10 + standard * 15 + premium * 20 + extraSkewers

  // 売上
  const foodSales = casual * CASUAL_PRICE + standard * STANDARD_PRICE + premium * PREMIUM_PRICE
  const drinkRatio = parseFloat(randBetween(28, 48).toFixed(1))
  const drinkSales = Math.round(foodSales * (drinkRatio / 100))
  const totalSales = foodSales + drinkSales

  // 担当
  const staffName = STAFF_NAMES[dow % STAFF_NAMES.length]

  // 日付文字列
  const logDate = toYmdJst(date)  // JST 基準の日付
  const dayOfWeek = DOW_JA[dow]

  return {
    tenant_id: tenantId,
    log_date: logDate,
    day_of_week: dayOfWeek,
    staff_name: staffName,
    recorded_at: new Date(date.getTime() + 22 * 60 * 60 * 1000).toISOString(),
    course_casual: casual,
    course_standard: standard,
    course_premium: premium,
    extra_skewers: extraSkewers,
    total_skewers: totalSkewers,
    total_sales: totalSales,
    drink_sales: drinkSales,
    drink_ratio: drinkRatio,
    memo: '',
  }
}

// ── メイン処理 ───────────────────────────────────────────────────
async function main() {
  console.log(`\n🌱 テストデータ投入開始`)
  console.log(`   Supabase URL: ${SUPABASE_URL}`)
  console.log(`   Tenant ID:    ${TENANT_ID}\n`)

  // 1. テナントの primary_color を更新（テスト用の識別色）
  const { error: tenantErr } = await supabase
    .from('tenants')
    .update({ name: 'テスト店舗', primary_color: '#0891B2' })
    .eq('id', TENANT_ID)
  if (tenantErr) {
    console.warn(`⚠️  テナント更新スキップ: ${tenantErr.message}`)
  } else {
    console.log('✅ テナント: テスト店舗')
  }

  // 2. settings の確認・更新
  const { error: settErr } = await supabase
    .from('settings')
    .upsert(
      {
        tenant_id: TENANT_ID,
        course_casual_price: 3500,
        course_standard_price: 4500,
        course_premium_price: 5800,
        course_casual_skewers: 10,
        course_standard_skewers: 15,
        course_premium_skewers: 20,
        sunday_boost_enabled: false,
      },
      { onConflict: 'tenant_id' },
    )
  if (settErr) {
    console.warn(`⚠️  settings 更新スキップ: ${settErr.message}`)
  } else {
    console.log('✅ settings 更新完了')
  }

  // 3. 既存串マスタを削除して再投入
  const { error: delSkErr } = await supabase
    .from('skewers')
    .delete()
    .eq('tenant_id', TENANT_ID)
  if (delSkErr) console.warn(`⚠️  串マスタ削除スキップ: ${delSkErr.message}`)

  const skewersToInsert = SKEWERS.map((s) => ({
    tenant_id: TENANT_ID,
    prep_method_name: '昆布締め',
    course_type: 'all_courses',
    target_courses: [],
    weight_per_stick_g: 0,
    yield_rate: 1.0,
    order_unit_label: '',
    order_unit_g: 0,
    threshold2: 0,
    prep_amount2: 0,
    is_active: true,
    ...s,
  }))

  const { error: skErr } = await supabase.from('skewers').insert(skewersToInsert)
  if (skErr) {
    console.error(`❌ 串マスタ投入エラー: ${skErr.message}`)
    process.exit(1)
  }
  console.log(`✅ 串マスタ: ${SKEWERS.length} 品目`)

  // 4. 日次ログ（過去 90 日）
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const logs = []
  for (let i = 90; i >= 1; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const log = generateDailyLog(date, TENANT_ID)
    if (log) logs.push(log)
  }

  // 既存ログを削除
  const { error: delLogErr } = await supabase
    .from('daily_logs')
    .delete()
    .eq('tenant_id', TENANT_ID)
  if (delLogErr) console.warn(`⚠️  日次ログ削除スキップ: ${delLogErr.message}`)

  // バッチ投入（50件ずつ）
  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < logs.length; i += BATCH) {
    const batch = logs.slice(i, i + BATCH)
    const { error: logErr } = await supabase.from('daily_logs').insert(batch)
    if (logErr) {
      console.error(`❌ 日次ログ投入エラー: ${logErr.message}`)
      process.exit(1)
    }
    inserted += batch.length
  }
  console.log(`✅ 日次ログ: ${inserted} 件（過去 90 日・日曜除く）`)

  // 5. サマリー表示
  const { data: summary } = await supabase
    .from('daily_logs')
    .select('total_sales, total_skewers')
    .eq('tenant_id', TENANT_ID)

  if (summary && summary.length > 0) {
    const totalSales = summary.reduce((a, r) => a + r.total_sales, 0)
    const avgSales = Math.round(totalSales / summary.length)
    console.log(`\n📊 投入データ概要:`)
    console.log(`   営業日数: ${summary.length} 日`)
    console.log(`   合計売上: ¥${totalSales.toLocaleString()}`)
    console.log(`   平均売上: ¥${avgSales.toLocaleString()}/日`)
  }

  console.log('\n🎉 テストデータ投入完了！')
  console.log('   npm run dev でアプリを起動して確認してください。')
}

main().catch((e) => {
  console.error('❌ 予期しないエラー:', e)
  process.exit(1)
})
