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
