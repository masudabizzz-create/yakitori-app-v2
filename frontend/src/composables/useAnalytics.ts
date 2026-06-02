/**
 * useAnalytics.ts
 * 分析・集計の集計ロジック。
 *
 * GAS getAnalyticsData / analytics.html render() の集計を移植。
 * logs は「新しい順（log_date 降順）」であることを前提とする。
 */
import type { DailyLog } from '@/types'

export interface AnalyticsSummary {
  count: number
  totalSales: number
  totalSkewers: number
  avgSales: number
  avgSkewers: number
  avgDrink: number
  courseCasual: number
  courseStandard: number
  coursePremium: number
}

/** 期間サマリーを集計する */
export function summarize(logs: DailyLog[]): AnalyticsSummary {
  const count = logs.length
  const totalSales = logs.reduce((a, r) => a + r.total_sales, 0)
  const totalSkewers = logs.reduce((a, r) => a + r.total_skewers, 0)
  const courseCasual = logs.reduce((a, r) => a + r.course_casual, 0)
  const courseStandard = logs.reduce((a, r) => a + r.course_standard, 0)
  const coursePremium = logs.reduce((a, r) => a + r.course_premium, 0)
  const drinkSum = logs.reduce((a, r) => a + r.drink_ratio, 0)
  return {
    count,
    totalSales,
    totalSkewers,
    avgSales: count > 0 ? Math.round(totalSales / count) : 0,
    avgSkewers: count > 0 ? Math.round(totalSkewers / count) : 0,
    avgDrink: count > 0 ? Math.round(drinkSum / count) : 0,
    courseCasual,
    courseStandard,
    coursePremium,
  }
}

export type TrendDirection = '↑' | '↓' | '→'
export interface TrendResult {
  direction: TrendDirection | null
  pct: number
}

/**
 * 売上トレンド（前半=新しい側 / 後半=古い側 で比較）。
 * GAS analytics.html: 4件未満は判定なし。half=floor(len/2)。
 *   recentAvg = slice(0,half) 平均 / half
 *   oldAvg    = slice(half)   合計 / half
 *   pct = round(diff/oldAvg*100)。pct>3→↑ / pct<-3→↓ / それ以外→→
 */
export function calcTrend(logs: DailyLog[]): TrendResult {
  if (logs.length < 4) return { direction: null, pct: 0 }
  const half = Math.floor(logs.length / 2)
  const recentAvg = logs.slice(0, half).reduce((a, r) => a + r.total_sales, 0) / half
  const oldAvg = logs.slice(half).reduce((a, r) => a + r.total_sales, 0) / half
  const diff = recentAvg - oldAvg
  const pct = oldAvg > 0 ? Math.round((diff / oldAvg) * 100) : 0
  if (pct > 3) return { direction: '↑', pct }
  if (pct < -3) return { direction: '↓', pct }
  return { direction: '→', pct }
}

export interface WeekdayAvg {
  dow: string
  avg: number
}

const WEEKDAY_ORDER = ['月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜']

/** 曜日別の平均売上を算出する（月〜日の順で7件返す） */
export function weekdayAvgSales(logs: DailyLog[]): WeekdayAvg[] {
  const sum: Record<string, number> = {}
  const cnt: Record<string, number> = {}
  for (const d of WEEKDAY_ORDER) {
    sum[d] = 0
    cnt[d] = 0
  }
  for (const r of logs) {
    if (r.day_of_week in sum) {
      sum[r.day_of_week] += r.total_sales
      cnt[r.day_of_week]++
    }
  }
  return WEEKDAY_ORDER.map((d) => ({
    dow: d,
    avg: cnt[d] > 0 ? Math.round(sum[d] / cnt[d]) : 0,
  }))
}

export interface CourseShare {
  label: string
  count: number
  rate: number
}

/** コース内訳（件数・構成比%）を算出する */
export function courseShares(summary: AnalyticsSummary): CourseShare[] {
  const total = summary.courseCasual + summary.courseStandard + summary.coursePremium
  const mk = (label: string, count: number): CourseShare => ({
    label,
    count,
    rate: total > 0 ? Math.round((count / total) * 100) : 0,
  })
  return [
    mk('カジュアル', summary.courseCasual),
    mk('スタンダード', summary.courseStandard),
    mk('プレミアム', summary.coursePremium),
  ]
}

// ============================================================
// 以下は既存関数に追加した新機能（既存は一切変更なし）
// ============================================================

// ─── 前期比較 ────────────────────────────────────────────────────

export interface CompareItem {
  current: number
  prev: number
  /** 増減率 % (正=増加, 負=減少) */
  pct: number
  direction: '↑' | '↓' | '→'
}

export interface PeriodComparison {
  sales: CompareItem
  customers: CompareItem
  unitPrice: CompareItem
}

function mkCompareItem(curr: number, prev: number): CompareItem {
  if (prev === 0) return { current: curr, prev, pct: 0, direction: '→' }
  const pct = Math.round(((curr - prev) / prev) * 100)
  const direction: '↑' | '↓' | '→' = pct > 3 ? '↑' : pct < -3 ? '↓' : '→'
  return { current: curr, prev, pct, direction }
}

/**
 * 今期ログ / 前期ログ を比較して増減率を返す。
 * logs は「新しい順」を前提とするが、ここでは集計のみのため順不同でも可。
 */
export function calcPeriodComparison(
  currentLogs: DailyLog[],
  prevLogs: DailyLog[],
): PeriodComparison {
  const totalSales = (ls: DailyLog[]) => ls.reduce((a, r) => a + r.total_sales, 0)
  const totalCustomers = (ls: DailyLog[]) =>
    ls.reduce((a, r) => a + r.course_casual + r.course_standard + r.course_premium, 0)

  const currSales = totalSales(currentLogs)
  const prevSales = totalSales(prevLogs)
  const currCust = totalCustomers(currentLogs)
  const prevCust = totalCustomers(prevLogs)
  const currUnit = currCust > 0 ? Math.round(currSales / currCust) : 0
  const prevUnit = prevCust > 0 ? Math.round(prevSales / prevCust) : 0

  return {
    sales: mkCompareItem(currSales, prevSales),
    customers: mkCompareItem(currCust, prevCust),
    unitPrice: mkCompareItem(currUnit, prevUnit),
  }
}

// ─── 客数・客単価 ─────────────────────────────────────────────────

export interface CustomerMetrics {
  /** 期間合計グループ数（course 合計） */
  totalCustomers: number
  /** 1営業日あたり平均グループ数 */
  avgCustomersPerDay: number
  /** 売上 ÷ グループ数（グループ単価） */
  avgUnitPrice: number
}

export function calcCustomerMetrics(logs: DailyLog[]): CustomerMetrics {
  const totalCustomers = logs.reduce(
    (a, r) => a + r.course_casual + r.course_standard + r.course_premium,
    0,
  )
  const avgCustomersPerDay = logs.length > 0 ? Math.round(totalCustomers / logs.length) : 0
  const totalSales = logs.reduce((a, r) => a + r.total_sales, 0)
  const avgUnitPrice = totalCustomers > 0 ? Math.round(totalSales / totalCustomers) : 0
  return { totalCustomers, avgCustomersPerDay, avgUnitPrice }
}

// ─── 異常値検出 ───────────────────────────────────────────────────

export interface AnomalyRecord {
  date: string
  dayOfWeek: string
  actualSales: number
  /** その曜日の平均売上 */
  expectedSales: number
  /** 標準偏差の倍数（絶対値） */
  sigmas: number
  direction: '↑' | '↓'
}

/**
 * 各曜日の標準偏差を基準に、平均から threshold σ 以上外れた日を返す。
 * std が小さい（データ不足や変動なし）場合はスキップ。
 * 結果は |σ| 降順・最大5件。
 */
export function detectAnomalies(logs: DailyLog[], threshold = 1.5): AnomalyRecord[] {
  // 曜日ごとの売上リスト
  const byDow: Record<string, number[]> = {}
  for (const r of logs) {
    ;(byDow[r.day_of_week] ??= []).push(r.total_sales)
  }

  // 曜日ごとの平均・標準偏差
  const stats: Record<string, { mean: number; std: number }> = {}
  for (const [dow, sales] of Object.entries(byDow)) {
    if (sales.length < 3) continue // データ不足はスキップ
    const mean = sales.reduce((a, b) => a + b, 0) / sales.length
    const variance = sales.reduce((a, b) => a + (b - mean) ** 2, 0) / sales.length
    const std = Math.sqrt(variance)
    if (std < 5000) continue // 変動が小さすぎる場合もスキップ
    stats[dow] = { mean, std }
  }

  const anomalies: AnomalyRecord[] = []
  for (const r of logs) {
    const s = stats[r.day_of_week]
    if (!s) continue
    const sigmasRaw = (r.total_sales - s.mean) / s.std
    if (Math.abs(sigmasRaw) < threshold) continue
    anomalies.push({
      date: r.log_date,
      dayOfWeek: r.day_of_week,
      actualSales: r.total_sales,
      expectedSales: Math.round(s.mean),
      sigmas: Math.round(Math.abs(sigmasRaw) * 10) / 10,
      direction: sigmasRaw > 0 ? '↑' : '↓',
    })
  }

  return anomalies.sort((a, b) => b.sigmas - a.sigmas).slice(0, 5)
}

// ─── 実入力 組数・客数・客単価 ───────────────────────────────────────

/**
 * 実入力された組数・客数がある日のみを対象とした客数・客単価指標。
 *
 * groups_count / guests_count が null または undefined のログは除外する。
 * sampleCount が 0 のとき他の値もすべて 0 になるため、呼び出し側で
 * `sampleCount === 0` を判定して「データなし」を表示すること。
 */
export interface RealCustomerMetrics {
  /** 実入力データがある営業日数 */
  sampleCount: number
  /** 期間合計実組数 */
  totalGroups: number
  /** 期間合計実客数 */
  totalGuests: number
  /** 1日あたり平均組数 */
  avgGroupsPerDay: number
  /** 1日あたり平均客数 */
  avgGuestsPerDay: number
  /** グループ単価（売上 ÷ 実組数） */
  avgSpendPerGroup: number
  /** 客単価（売上 ÷ 実客数） */
  avgSpendPerGuest: number
}

export function calcRealCustomerMetrics(logs: DailyLog[]): RealCustomerMetrics {
  // 組数・客数ともに実入力されている日だけ対象
  const realLogs = logs.filter(
    (l) => l.groups_count != null && l.guests_count != null,
  )
  const sampleCount = realLogs.length
  const totalGroups = realLogs.reduce((a, l) => a + (l.groups_count ?? 0), 0)
  const totalGuests = realLogs.reduce((a, l) => a + (l.guests_count ?? 0), 0)
  const totalSales = realLogs.reduce((a, l) => a + l.total_sales, 0)
  return {
    sampleCount,
    totalGroups,
    totalGuests,
    avgGroupsPerDay: sampleCount > 0 ? Math.round(totalGroups / sampleCount) : 0,
    avgGuestsPerDay: sampleCount > 0 ? Math.round(totalGuests / sampleCount) : 0,
    avgSpendPerGroup: totalGroups > 0 ? Math.round(totalSales / totalGroups) : 0,
    avgSpendPerGuest: totalGuests > 0 ? Math.round(totalSales / totalGuests) : 0,
  }
}

// ─── AI搭載準備 ───────────────────────────────────────────────────

export interface AnalyticsSummaryJson {
  generated_at: string
  period: { days: number; from: string; to: string }
  sales: { total: number; daily_avg: number; vs_prev_period_pct: number | null }
  customers: { total: number; avg_per_day: number; avg_unit_price: number }
  courses: { casual: number; standard: number; premium: number }
  drink: { avg_ratio: number }
  weekday_pattern: { dow: string; avg_sales: number }[]
  anomalies: { date: string; direction: string; actual: number; expected: number; sigmas: number }[]
}

/**
 * 全集計結果を構造化 JSON に変換する。
 * Claude API に渡して「今週の傾向を要約して」「来週の発注アドバイス」などに使用できる。
 * （現時点では AI 呼び出しは実装しない — データ整形のみ）
 */
export function getAnalyticsSummary(
  logs: DailyLog[],
  prevLogs: DailyLog[],
): AnalyticsSummaryJson {
  const sum = summarize(logs)
  const cm = calcCustomerMetrics(logs)
  const comp = prevLogs.length > 0 ? calcPeriodComparison(logs, prevLogs) : null
  const wp = weekdayAvgSales(logs)
  const anom = detectAnomalies(logs)

  const dates = [...logs.map((l) => l.log_date)].sort()

  return {
    generated_at: new Date().toISOString(),
    period: {
      days: logs.length,
      from: dates[0] ?? '',
      to: dates[dates.length - 1] ?? '',
    },
    sales: {
      total: sum.totalSales,
      daily_avg: sum.avgSales,
      vs_prev_period_pct: comp?.sales.pct ?? null,
    },
    customers: {
      total: cm.totalCustomers,
      avg_per_day: cm.avgCustomersPerDay,
      avg_unit_price: cm.avgUnitPrice,
    },
    courses: {
      casual: sum.courseCasual,
      standard: sum.courseStandard,
      premium: sum.coursePremium,
    },
    drink: { avg_ratio: sum.avgDrink },
    weekday_pattern: wp.map((w) => ({ dow: w.dow, avg_sales: w.avg })),
    anomalies: anom.map((a) => ({
      date: a.date,
      direction: a.direction,
      actual: a.actualSales,
      expected: a.expectedSales,
      sigmas: a.sigmas,
    })),
  }
}
