import { describe, it, expect } from 'vitest'
import {
  summarize,
  calcTrend,
  weekdayAvgSales,
  courseShares,
} from '@/composables/useAnalytics'
import type { DailyLog } from '@/types'

// ============================================================
// フィクスチャ
// ============================================================

function makeLog(over: Partial<DailyLog> = {}): DailyLog {
  return {
    id: 'l',
    tenant_id: 't1',
    log_date: '2026-05-22',
    day_of_week: '金曜',
    staff_name: '田中',
    recorded_at: '',
    course_casual: 0,
    course_standard: 0,
    course_premium: 0,
    extra_skewers: 0,
    total_skewers: 0,
    total_sales: 0,
    drink_sales: 0,
    drink_ratio: 0,
    memo: '',
    created_at: '',
    ...over,
  }
}

// ============================================================
// summarize
// ============================================================

describe('summarize', () => {
  it('合計と日平均を算出する', () => {
    const logs = [
      makeLog({ total_sales: 100, total_skewers: 10, drink_ratio: 30 }),
      makeLog({ total_sales: 200, total_skewers: 20, drink_ratio: 40 }),
    ]
    const s = summarize(logs)
    expect(s.count).toBe(2)
    expect(s.totalSales).toBe(300)
    expect(s.avgSales).toBe(150)
    expect(s.totalSkewers).toBe(30)
    expect(s.avgSkewers).toBe(15)
    expect(s.avgDrink).toBe(35) // round((30+40)/2)
  })

  it('コース組数を合計する', () => {
    const logs = [
      makeLog({ course_casual: 2, course_standard: 3, course_premium: 1 }),
      makeLog({ course_casual: 4, course_standard: 1, course_premium: 5 }),
    ]
    const s = summarize(logs)
    expect(s.courseCasual).toBe(6)
    expect(s.courseStandard).toBe(4)
    expect(s.coursePremium).toBe(6)
  })

  it('空配列なら全て0', () => {
    const s = summarize([])
    expect(s.count).toBe(0)
    expect(s.avgSales).toBe(0)
    expect(s.avgDrink).toBe(0)
  })
})

// ============================================================
// calcTrend
// ============================================================

describe('calcTrend', () => {
  it('4件未満は判定なし（null）', () => {
    const logs = [
      makeLog({ total_sales: 100 }),
      makeLog({ total_sales: 200 }),
      makeLog({ total_sales: 300 }),
    ]
    expect(calcTrend(logs)).toEqual({ direction: null, pct: 0 })
  })

  it('新しい側の平均が高ければ ↑', () => {
    // logs は新しい順: [新, 新, 古, 古]
    const logs = [
      makeLog({ total_sales: 120 }),
      makeLog({ total_sales: 120 }),
      makeLog({ total_sales: 100 }),
      makeLog({ total_sales: 100 }),
    ]
    expect(calcTrend(logs)).toEqual({ direction: '↑', pct: 20 })
  })

  it('新しい側の平均が低ければ ↓', () => {
    const logs = [
      makeLog({ total_sales: 80 }),
      makeLog({ total_sales: 80 }),
      makeLog({ total_sales: 100 }),
      makeLog({ total_sales: 100 }),
    ]
    expect(calcTrend(logs)).toEqual({ direction: '↓', pct: -20 })
  })

  it('差が±3%以内なら横ばい →', () => {
    const logs = [
      makeLog({ total_sales: 101 }),
      makeLog({ total_sales: 101 }),
      makeLog({ total_sales: 100 }),
      makeLog({ total_sales: 100 }),
    ]
    expect(calcTrend(logs)).toEqual({ direction: '→', pct: 1 })
  })
})

// ============================================================
// weekdayAvgSales
// ============================================================

describe('weekdayAvgSales', () => {
  it('曜日別の平均売上を算出する', () => {
    const logs = [
      makeLog({ day_of_week: '月曜', total_sales: 100 }),
      makeLog({ day_of_week: '月曜', total_sales: 200 }),
      makeLog({ day_of_week: '火曜', total_sales: 80 }),
    ]
    const result = weekdayAvgSales(logs)
    const byDow = Object.fromEntries(result.map((r) => [r.dow, r.avg]))
    expect(byDow['月曜']).toBe(150)
    expect(byDow['火曜']).toBe(80)
    expect(byDow['水曜']).toBe(0)
  })

  it('月〜日の7曜日を返す', () => {
    const result = weekdayAvgSales([])
    expect(result.map((r) => r.dow)).toEqual([
      '月曜',
      '火曜',
      '水曜',
      '木曜',
      '金曜',
      '土曜',
      '日曜',
    ])
  })
})

// ============================================================
// courseShares
// ============================================================

describe('courseShares', () => {
  it('構成比（%）を算出する', () => {
    const summary = summarize([
      makeLog({ course_casual: 10, course_standard: 20, course_premium: 20 }),
    ])
    const shares = courseShares(summary)
    expect(shares).toEqual([
      { label: 'カジュアル', count: 10, rate: 20 },
      { label: 'スタンダード', count: 20, rate: 40 },
      { label: 'プレミアム', count: 20, rate: 40 },
    ])
  })

  it('コース組数が0なら構成比0', () => {
    const shares = courseShares(summarize([]))
    expect(shares.every((s) => s.rate === 0)).toBe(true)
  })
})
