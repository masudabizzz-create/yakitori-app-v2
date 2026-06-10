import { describe, it, expect } from 'vitest'
import { calcBudgetComparison } from '@/composables/useBudgetComparison'
import type { DailyLog, DailyBudget } from '@/types'
import type { PeriodRange } from '@/composables/usePeriodRange'

// ============================================================
// フィクスチャ
// ============================================================

function makeLog(over: Partial<DailyLog> = {}): DailyLog {
  return {
    id: 'l',
    tenant_id: 't1',
    log_date: '2026-06-01',
    day_of_week: '月曜',
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

function makeBudget(over: Partial<DailyBudget> = {}): DailyBudget {
  return {
    id: 'b',
    tenant_id: 't1',
    log_date: '2026-06-01',
    amount: 80000,
    is_closed: false,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

const mockPeriod: PeriodRange = {
  scope: 'week',
  from: '2026-06-01',
  to: '2026-06-07',
  label: '2026-06-01 〜 2026-06-07',
}

// ============================================================
// calcBudgetComparison
// ============================================================

describe('calcBudgetComparison', () => {
  it('予算未設定の場合はnullを返す', () => {
    const logs = [makeLog({ log_date: '2026-06-01', total_sales: 100000 })]
    const budgets: DailyBudget[] = []
    const result = calcBudgetComparison(logs, budgets, mockPeriod, false)
    expect(result).toBe(null)
  })

  it('営業日予算のみを集計する（is_closed=trueを除外）', () => {
    const logs = [
      makeLog({ log_date: '2026-06-01', total_sales: 90000 }),
      makeLog({ log_date: '2026-06-02', total_sales: 85000 }),
    ]
    const budgets = [
      makeBudget({ log_date: '2026-06-01', amount: 80000, is_closed: false }),
      makeBudget({ log_date: '2026-06-02', amount: 80000, is_closed: false }),
      makeBudget({ log_date: '2026-06-03', amount: 0, is_closed: true }), // 臨時休業は除外
    ]
    const result = calcBudgetComparison(logs, budgets, mockPeriod, false)
    expect(result).not.toBe(null)
    expect(result!.fullBudget).toBe(160000) // 臨時休業分は含まない
    expect(result!.fullBudgetDays).toBe(2)
  })

  it('日付ベース突き合わせ: 実績がある日の予算のみを集計', () => {
    const logs = [
      makeLog({ log_date: '2026-06-02', total_sales: 85000 }), // 1日は入力漏れ
    ]
    const budgets = [
      makeBudget({ log_date: '2026-06-01', amount: 80000, is_closed: false }), // 実績なし→除外
      makeBudget({ log_date: '2026-06-02', amount: 80000, is_closed: false }), // 実績あり
      makeBudget({ log_date: '2026-06-03', amount: 150000, is_closed: false }), // 実績なし→除外
    ]
    const result = calcBudgetComparison(logs, budgets, mockPeriod, true)
    expect(result).not.toBe(null)
    expect(result!.actual).toBe(85000)
    expect(result!.budget).toBe(80000) // 2日分のみ
    expect(result!.fullBudget).toBe(310000) // 全営業日予算
    expect(result!.actualDays).toBe(1)
    expect(result!.budgetDays).toBe(1) // 実績日に対応する予算日数
    expect(result!.fullBudgetDays).toBe(3) // 全営業日数
  })

  it('達成率と差額を正しく計算', () => {
    const logs = [
      makeLog({ log_date: '2026-06-01', total_sales: 90000 }),
      makeLog({ log_date: '2026-06-02', total_sales: 95000 }),
    ]
    const budgets = [
      makeBudget({ log_date: '2026-06-01', amount: 80000 }),
      makeBudget({ log_date: '2026-06-02', amount: 80000 }),
    ]
    const result = calcBudgetComparison(logs, budgets, mockPeriod, false)
    expect(result).not.toBe(null)
    expect(result!.actual).toBe(185000)
    expect(result!.budget).toBe(160000)
    expect(result!.diffAmount).toBe(25000) // actual - budget
    expect(result!.diffPct).toBe(116) // Math.round((185000 / 160000) * 100)
    expect(result!.remaining).toBe(-25000) // budget - actual（負=超過）
  })

  it('予算未達成の場合', () => {
    const logs = [
      makeLog({ log_date: '2026-06-01', total_sales: 70000 }),
    ]
    const budgets = [
      makeBudget({ log_date: '2026-06-01', amount: 80000 }),
    ]
    const result = calcBudgetComparison(logs, budgets, mockPeriod, false)
    expect(result).not.toBe(null)
    expect(result!.actual).toBe(70000)
    expect(result!.budget).toBe(80000)
    expect(result!.diffAmount).toBe(-10000)
    expect(result!.diffPct).toBe(88) // Math.round((70000 / 80000) * 100)
    expect(result!.remaining).toBe(10000) // 正=未達成
  })

  it('進行中フラグが正しく保持される', () => {
    const logs = [makeLog({ log_date: '2026-06-01', total_sales: 80000 })]
    const budgets = [makeBudget({ log_date: '2026-06-01', amount: 80000 })]

    const inProgress = calcBudgetComparison(logs, budgets, mockPeriod, true)
    expect(inProgress!.isInProgress).toBe(true)

    const completed = calcBudgetComparison(logs, budgets, mockPeriod, false)
    expect(completed!.isInProgress).toBe(false)
  })

  it('実績なし・予算あり の場合はnull（実績日付がないため）', () => {
    const logs: DailyLog[] = []
    const budgets = [
      makeBudget({ log_date: '2026-06-01', amount: 80000 }),
    ]
    const result = calcBudgetComparison(logs, budgets, mockPeriod, true)
    // 実績日付が空 → matchedBudgetsも空 → null
    expect(result).toBe(null)
  })

  it('予算ゼロ（設定ミス）の場合はnull', () => {
    const logs = [makeLog({ log_date: '2026-06-01', total_sales: 80000 })]
    const budgets = [
      makeBudget({ log_date: '2026-06-02', amount: 80000 }), // 日付不一致
    ]
    const result = calcBudgetComparison(logs, budgets, mockPeriod, true)
    expect(result).toBe(null) // 実績に対応する予算がない→null
  })

  it('複数日の複雑なケース: 一部入力漏れ + 臨時休業', () => {
    const logs = [
      makeLog({ log_date: '2026-06-01', total_sales: 90000 }),
      // 2日は入力漏れ
      makeLog({ log_date: '2026-06-03', total_sales: 100000 }),
      makeLog({ log_date: '2026-06-05', total_sales: 150000 }),
    ]
    const budgets = [
      makeBudget({ log_date: '2026-06-01', amount: 80000, is_closed: false }),
      makeBudget({ log_date: '2026-06-02', amount: 80000, is_closed: false }), // 実績なし
      makeBudget({ log_date: '2026-06-03', amount: 80000, is_closed: false }),
      makeBudget({ log_date: '2026-06-04', amount: 0, is_closed: true }), // 臨時休業
      makeBudget({ log_date: '2026-06-05', amount: 150000, is_closed: false }),
    ]
    const result = calcBudgetComparison(logs, budgets, mockPeriod, true)
    expect(result).not.toBe(null)
    expect(result!.actual).toBe(340000) // 1,3,5日の実績
    expect(result!.budget).toBe(310000) // 1,3,5日の予算（2日は実績なしで除外）
    expect(result!.fullBudget).toBe(390000) // 1,2,3,5日の予算（4日は臨時休業で除外）
    expect(result!.actualDays).toBe(3)
    expect(result!.budgetDays).toBe(3)
    expect(result!.fullBudgetDays).toBe(4)
    expect(result!.diffPct).toBe(110) // Math.round((340000 / 310000) * 100)
  })
})
