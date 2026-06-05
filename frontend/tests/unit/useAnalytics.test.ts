import { describe, it, expect } from 'vitest'
import {
  summarize,
  calcTrend,
  weekdayAvgSales,
  courseShares,
  calcRealCustomerMetrics,
  calcSalesTrendLine,
  calcSufficiency,
  alignToPeriod,
  calcPeriodComparison,
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

// ============================================================
// calcRealCustomerMetrics
// ============================================================

describe('calcRealCustomerMetrics', () => {
  it('groups_count / guests_count が入力されている日だけ集計する', () => {
    const logs = [
      makeLog({ total_sales: 120000, groups_count: 10, guests_count: 25 }),
      makeLog({ total_sales:  80000, groups_count:  8, guests_count: 20 }),
      makeLog({ total_sales:  60000, groups_count: null, guests_count: null }), // 旧データ: 除外
    ]
    const m = calcRealCustomerMetrics(logs)
    expect(m.sampleCount).toBe(2)
    expect(m.totalGroups).toBe(18)
    expect(m.totalGuests).toBe(45)
    // avgGroupsPerDay = round(18/2) = 9
    expect(m.avgGroupsPerDay).toBe(9)
    // avgGuestsPerDay = round(45/2) = 23 (round(22.5)=23)
    expect(m.avgGuestsPerDay).toBe(23)
    // avgSpendPerGroup = round(200000/18) = 11111
    expect(m.avgSpendPerGroup).toBe(Math.round(200000 / 18))
    // avgSpendPerGuest = round(200000/45) = 4444
    expect(m.avgSpendPerGuest).toBe(Math.round(200000 / 45))
  })

  it('groups_count のみ null のログは除外する', () => {
    const logs = [
      makeLog({ total_sales: 100000, groups_count: 10, guests_count: 20 }),
      makeLog({ total_sales:  50000, groups_count: null, guests_count: 15 }), // groups_count null → 除外
    ]
    const m = calcRealCustomerMetrics(logs)
    expect(m.sampleCount).toBe(1)
    expect(m.totalGroups).toBe(10)
    expect(m.totalGuests).toBe(20)
  })

  it('0 組・0 客は有効なデータとして集計する', () => {
    const logs = [
      makeLog({ total_sales: 0, groups_count: 0, guests_count: 0 }),
    ]
    const m = calcRealCustomerMetrics(logs)
    expect(m.sampleCount).toBe(1)
    expect(m.totalGroups).toBe(0)
    expect(m.totalGuests).toBe(0)
    // 0除算: avgSpendPerGroup / avgSpendPerGuest は 0
    expect(m.avgSpendPerGroup).toBe(0)
    expect(m.avgSpendPerGuest).toBe(0)
  })

  it('全ログが旧データ（null）なら sampleCount=0・全値0', () => {
    const logs = [
      makeLog({ groups_count: null, guests_count: null }),
      makeLog({ groups_count: undefined, guests_count: undefined }),
    ]
    const m = calcRealCustomerMetrics(logs)
    expect(m.sampleCount).toBe(0)
    expect(m.totalGroups).toBe(0)
    expect(m.totalGuests).toBe(0)
    expect(m.avgGroupsPerDay).toBe(0)
    expect(m.avgGuestsPerDay).toBe(0)
    expect(m.avgSpendPerGroup).toBe(0)
    expect(m.avgSpendPerGuest).toBe(0)
  })

  it('空配列なら全値0', () => {
    const m = calcRealCustomerMetrics([])
    expect(m.sampleCount).toBe(0)
    expect(m.avgSpendPerGuest).toBe(0)
  })
})

// ============================================================
// calcSalesTrendLine
// ============================================================

describe('calcSalesTrendLine', () => {
  it('空配列なら空を返す', () => {
    expect(calcSalesTrendLine([], 'day')).toEqual([])
  })

  it('day: 各日が1点になる', () => {
    const logs = [
      makeLog({ log_date: '2026-06-01', total_sales: 100000 }),
      makeLog({ log_date: '2026-06-02', total_sales: 80000 }),
      makeLog({ log_date: '2026-06-03', total_sales: 120000 }),
    ]
    const result = calcSalesTrendLine(logs, 'day')
    expect(result).toHaveLength(3)
    expect(result[0].label).toBe('6/1')
    expect(result[0].avgSales).toBe(100000)
    expect(result[0].count).toBe(1)
  })

  it('week: 同じ週のログが集約される（平均）', () => {
    // 2026-06-01（月）〜 2026-06-05（金）は同一週
    const logs = [
      makeLog({ log_date: '2026-06-01', total_sales: 100000 }),
      makeLog({ log_date: '2026-06-03', total_sales: 80000 }),
      makeLog({ log_date: '2026-06-08', total_sales: 120000 }), // 翌週
    ]
    const result = calcSalesTrendLine(logs, 'week')
    expect(result).toHaveLength(2)
    // 1週目: (100000+80000)/2 = 90000
    expect(result[0].avgSales).toBe(90000)
    expect(result[0].count).toBe(2)
    // 2週目
    expect(result[1].avgSales).toBe(120000)
    expect(result[1].count).toBe(1)
  })

  it('month: 同月が集約される', () => {
    const logs = [
      makeLog({ log_date: '2026-06-10', total_sales: 100000 }),
      makeLog({ log_date: '2026-06-20', total_sales: 200000 }),
      makeLog({ log_date: '2026-07-05', total_sales: 90000 }),
    ]
    const result = calcSalesTrendLine(logs, 'month')
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('6月')
    expect(result[0].avgSales).toBe(150000) // (100000+200000)/2
    expect(result[1].label).toBe('7月')
  })

  it('quarter: 同四半期が集約される（Q2=4〜6月）', () => {
    const logs = [
      makeLog({ log_date: '2026-04-15', total_sales: 100000 }),
      makeLog({ log_date: '2026-06-10', total_sales: 200000 }),
      makeLog({ log_date: '2026-07-01', total_sales: 80000 }), // Q3
    ]
    const result = calcSalesTrendLine(logs, 'quarter')
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('2026Q2')
    expect(result[0].avgSales).toBe(150000)
    expect(result[1].label).toBe('2026Q3')
  })

  it('year: 年単位で集約される', () => {
    const logs = [
      makeLog({ log_date: '2025-12-31', total_sales: 100000 }),
      makeLog({ log_date: '2026-01-01', total_sales: 200000 }),
      makeLog({ log_date: '2026-06-15', total_sales: 300000 }),
    ]
    const result = calcSalesTrendLine(logs, 'year')
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('2025年')
    expect(result[0].avgSales).toBe(100000)
    expect(result[1].avgSales).toBe(250000) // (200000+300000)/2
  })

  it('時系列順（古い順）で返す', () => {
    const logs = [
      makeLog({ log_date: '2026-06-03', total_sales: 300 }),
      makeLog({ log_date: '2026-06-01', total_sales: 100 }),
      makeLog({ log_date: '2026-06-02', total_sales: 200 }),
    ]
    const result = calcSalesTrendLine(logs, 'day')
    expect(result.map((r) => r.label)).toEqual(['6/1', '6/2', '6/3'])
  })
})

// ============================================================
// calcSufficiency
// ============================================================

describe('calcSufficiency', () => {
  function makeLogs(n: number): ReturnType<typeof makeLog>[] {
    return Array.from({ length: n }, (_, i) =>
      makeLog({ log_date: `2026-06-${String(i + 1).padStart(2, '0')}` }),
    )
  }

  it('前期 2件以上かつ min(current×0.5,3) 以上で true', () => {
    const s = calcSufficiency(makeLogs(6), makeLogs(3))
    expect(s.hasSufficientPrev).toBe(true)
  })

  it('前期 1件は false（prev_days < 2）', () => {
    const s = calcSufficiency(makeLogs(6), makeLogs(1))
    expect(s.hasSufficientPrev).toBe(false)
  })

  it('前期 0件は false', () => {
    const s = calcSufficiency(makeLogs(6), [])
    expect(s.hasSufficientPrev).toBe(false)
  })

  it('当期6件・前期2件: threshold=min(3,3)=3 → false（2<3）', () => {
    const s = calcSufficiency(makeLogs(6), makeLogs(2))
    expect(s.hasSufficientPrev).toBe(false)
  })

  it('当期4件・前期2件: threshold=min(2,3)=2 → true（2>=2）', () => {
    const s = calcSufficiency(makeLogs(4), makeLogs(2))
    expect(s.hasSufficientPrev).toBe(true)
  })

  it('昨対 2件以上で true', () => {
    const s = calcSufficiency(makeLogs(6), makeLogs(3), makeLogs(3))
    expect(s.hasSufficientYoy).toBe(true)
  })

  it('昨対 1件は false', () => {
    const s = calcSufficiency(makeLogs(6), makeLogs(3), makeLogs(1))
    expect(s.hasSufficientYoy).toBe(false)
  })

  it('昨対 省略（[]）は false', () => {
    const s = calcSufficiency(makeLogs(6), makeLogs(3))
    expect(s.hasSufficientYoy).toBe(false)
  })
})

// ============================================================
// alignToPeriod
// ============================================================

describe('alignToPeriod', () => {
  function makeLogDate(date: string): ReturnType<typeof makeLog> {
    return makeLog({ log_date: date, total_sales: 100000 })
  }

  // 参照ログは降順（fetchByDateRange の出力を模倣）
  const prevLogs = [
    makeLogDate('2026-05-31'),
    makeLogDate('2026-05-30'),
    makeLogDate('2026-05-29'),
    makeLogDate('2026-05-28'),
    makeLogDate('2026-05-27'),
  ]

  it('current が 3件 → 参照の末尾3件（先頭3営業日）を返す', () => {
    const current = [makeLogDate('2026-06-04'), makeLogDate('2026-06-03'), makeLogDate('2026-06-02')]
    const aligned = alignToPeriod(current, prevLogs)
    expect(aligned).toHaveLength(3)
    // 末尾3件 = 最古3件 = 5/27, 5/28, 5/29
    expect(aligned.map(l => l.log_date)).toEqual(['2026-05-29', '2026-05-28', '2026-05-27'])
  })

  it('current が reference 以上なら全件返す', () => {
    const current = Array(7).fill(makeLogDate('2026-06-01'))
    const aligned = alignToPeriod(current, prevLogs)
    expect(aligned).toHaveLength(5) // prevLogs.length
  })

  it('current が 0件なら参照をそのまま返す', () => {
    const aligned = alignToPeriod([], prevLogs)
    expect(aligned).toBe(prevLogs) // 同一参照
  })

  it('reference が空なら空を返す', () => {
    const current = [makeLogDate('2026-06-04')]
    const aligned = alignToPeriod(current, [])
    expect(aligned).toHaveLength(0)
  })

  it('current が 1件 → 参照の最古1件のみ', () => {
    const current = [makeLogDate('2026-06-01')]
    const aligned = alignToPeriod(current, prevLogs)
    expect(aligned).toHaveLength(1)
    expect(aligned[0].log_date).toBe('2026-05-27')
  })

  it('期間揃えにより前期比が -90% にならない（進行中月の検証）', () => {
    // 今期: 6月3日間 (合計¥300,000)
    const curr = [
      makeLog({ log_date:'2026-06-03', total_sales:100000 }),
      makeLog({ log_date:'2026-06-02', total_sales:100000 }),
      makeLog({ log_date:'2026-06-01', total_sales:100000 }),
    ]
    // 前期: 5月の全営業日25件（合計¥2,500,000）→ 揃え後は先頭3日(¥300,000)
    const prev = Array.from({ length: 25 }, (_, i) =>
      makeLog({ log_date: `2026-05-${String(31 - i).padStart(2,'0')}`, total_sales: 100000 })
    )
    const aligned = alignToPeriod(curr, prev)
    const comp = calcPeriodComparison(curr, aligned)
    // 揃え後は同額なので ±0%（方向→）になるはず（-90%にならない）
    expect(comp.sales.pct).toBe(0)
    expect(comp.sales.direction).toBe('→')
  })
})
