/**
 * staging-daily-seed.mjs
 * ステージング環境への毎日ダミーデータ投入スクリプト
 *
 * 実行タイミング: GitHub Actions cron（毎日 JST 23:30）
 *
 * 動作:
 *   1. テストユーザーでサインイン
 *   2. 本日分の daily_logs をダミーデータで upsert
 *   3. send-line Edge Function を呼び出してLINE通知をテスト
 *   4. 結果をログ出力（失敗時は exit 1）
 *
 * 必要な環境変数（GitHub Secrets）:
 *   SUPABASE_URL          … staging の URL
 *   SUPABASE_ANON_KEY     … staging の anon key
 *   STAGING_TEST_EMAIL    … staging テストユーザーのメールアドレス
 *   STAGING_TEST_PASSWORD … staging テストユーザーのパスワード
 */

import { createClient } from '@supabase/supabase-js'

// ── 環境変数チェック ──────────────────────────────────────────────
const SUPABASE_URL      = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const TEST_EMAIL        = process.env.STAGING_TEST_EMAIL
const TEST_PASSWORD     = process.env.STAGING_TEST_PASSWORD

for (const [key, val] of Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD })) {
  if (!val) { console.error(`❌ 環境変数 ${key} が未設定です`); process.exit(1) }
}

// 本番プロジェクトへの誤投入を防止
if (SUPABASE_URL.includes('mmquefvklrxjcmoxgvjb')) {
  console.error('🚨 本番プロジェクトへのシードは禁止されています。')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── 日付ユーティリティ ────────────────────────────────────────────
function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']

// ── ダミーデータ生成 ──────────────────────────────────────────────
function generateDummyLog(tenantId) {
  const now = new Date()
  const dow = DOW[now.getDay()]

  // 曜日で変動する客数（金土は多め）
  const isBusy = [5, 6].includes(now.getDay())
  const courseCasual   = isBusy ? 4 : 2
  const courseStandard = isBusy ? 8 : 5
  const coursePremium  = isBusy ? 3 : 1
  const extraSkewers   = isBusy ? 20 : 8
  const totalSkewers   = courseCasual * 10 + courseStandard * 15 + coursePremium * 20 + extraSkewers
  const totalSales     = isBusy ? 280000 : 160000
  const drinkRatio     = 0.28
  const groupsCount    = isBusy ? 12 : 7
  const guestsCount    = isBusy ? 24 : 14

  return {
    tenant_id:       tenantId,
    log_date:        todayYmd(),
    day_of_week:     dow,
    staff_name:      '自動テスト',
    recorded_at:     now.toISOString(),
    course_casual:   courseCasual,
    course_standard: courseStandard,
    course_premium:  coursePremium,
    extra_skewers:   extraSkewers,
    total_skewers:   totalSkewers,
    total_sales:     totalSales,
    drink_sales:     Math.round(totalSales * drinkRatio),
    drink_ratio:     drinkRatio,
    memo:            `[自動テスト] ${todayYmd()} の定期動作確認`,
    groups_count:    groupsCount,
    guests_count:    guestsCount,
  }
}

// ── メイン処理 ────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔧 staging-daily-seed 開始: ${new Date().toLocaleString('ja-JP')}\n`)

  // 1. テストユーザーでサインイン
  console.log('① サインイン中...')
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })
  if (authErr) {
    console.error('❌ サインイン失敗:', authErr.message)
    process.exit(1)
  }
  const user = authData.user
  console.log(`   ✅ サインイン成功: ${user.email}`)

  // 2. ユーザーの tenant_id を取得
  const { data: userData, error: userErr } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (userErr) {
    console.error('❌ ユーザー情報取得失敗:', userErr.message)
    process.exit(1)
  }
  const tenantId = userData.tenant_id
  console.log(`   テナント: ${tenantId} / ロール: ${userData.role}`)

  // 3. daily_logs に本日分をupsert
  console.log('\n② 本日分ダミーデータを投入中...')
  const logRow = generateDummyLog(tenantId)
  const { error: logErr } = await supabase
    .from('daily_logs')
    .upsert(logRow, { onConflict: 'tenant_id,log_date' })
  if (logErr) {
    console.error('❌ daily_logs upsert 失敗:', logErr.message)
    process.exit(1)
  }
  console.log(`   ✅ ${logRow.log_date} (${logRow.day_of_week}) 投入完了`)
  console.log(`      売上: ¥${logRow.total_sales.toLocaleString()} / 串: ${logRow.total_skewers}本 / ${logRow.groups_count}組${logRow.guests_count}名`)

  // 4. send-line Edge Function 呼び出し（LINE通知テスト）
  console.log('\n③ LINE通知テスト中...')
  const message = [
    `【ステージング自動テスト】${logRow.log_date} (${logRow.day_of_week})`,
    `担当: ${logRow.staff_name}`,
    `売上: ¥${logRow.total_sales.toLocaleString()}`,
    `串数: ${logRow.total_skewers}本`,
    `組数: ${logRow.groups_count}組 / 客数: ${logRow.guests_count}名`,
    `ドリンク比率: ${Math.round(logRow.drink_ratio * 100)}%`,
  ].join('\n')

  const { error: lineErr } = await supabase.functions.invoke('send-line', {
    body: { message, tenant_id: tenantId },
  })
  if (lineErr) {
    // LINE失敗はワーニング扱い（トークン未設定の場合もある）
    console.warn('⚠️  LINE通知失敗（設定確認要）:', lineErr.message)
  } else {
    console.log('   ✅ LINE通知送信成功')
  }

  console.log('\n✅ staging-daily-seed 完了\n')
}

main().catch(err => {
  console.error('❌ 予期しないエラー:', err)
  process.exit(1)
})
