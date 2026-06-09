/**
 * useBudgetComparison.ts
 *
 * 予算比（実績 vs 予算）の計算
 * - 定休日・臨時休業を営業日数から除外
 * - 進行中は日付ベースで突き合わせ（実績の欠損に対応）
 */

import type { DailyLog, DailyBudget } from '@/types'
import type { PeriodRange } from './usePeriodRange'

export interface BudgetComparison {
  /** 実績売上 */
  actual: number
  /** 予算（進行中は実績がある日付分のみ） */
  budget: number
  /** 期間全体の予算（営業日のみ） */
  fullBudget: number
  /** 差額（actual - budget） */
  diffAmount: number
  /** 達成率% */
  diffPct: number
  /** 残り（budget - actual）、負なら超過 */
  remaining: number
  /** 進行中か */
  isInProgress: boolean
  /** 実績営業日数 */
  actualDays: number
  /** 予算設定営業日数（is_closed除外、実績日付に合致） */
  budgetDays: number
  /** 期間全体の営業日数（is_closed除外） */
  fullBudgetDays: number
}

/**
 * 予算比を計算
 *
 * @param actualLogs - 実績ログ
 * @param budgets - 予算データ（期間全体）
 * @param periodRange - 期間情報（表示用、計算には不使用）
 * @param isInProgress - 進行中か
 * @returns 予算比、または予算未設定時はnull
 *
 * ## 日付ベース突き合わせ
 * 進行中の場合、実績ログが存在する日付の予算のみを集計。
 * これにより実績の入力漏れがあっても正しく比較できる。
 *
 * 例:
 * - 予算: 1日80000, 2日80000, 3日150000
 * - 実績: 2日のみ（1日入力漏れ）
 * → 予算も2日分のみで比較（80000）
 */
export function calcBudgetComparison(
  actualLogs: DailyLog[],
  budgets: DailyBudget[],
  _periodRange: PeriodRange,  // 将来の拡張用（現在は未使用）
  isInProgress: boolean,
): BudgetComparison | null {
  // 1. 営業日の予算のみ抽出（is_closed=false）
  const operatingBudgets = budgets.filter((b) => !b.is_closed)

  // 2. 予算未設定チェック
  if (operatingBudgets.length === 0) return null

  // 3. 実績が存在する日付のSetを作成
  const actualDates = new Set(actualLogs.map((log) => log.log_date))

  // 4. 実績がある日付の予算のみを抽出（日付join）
  const matchedBudgets = operatingBudgets.filter((b) => actualDates.has(b.log_date))

  // 5. 集計
  const actual = actualLogs.reduce((sum, log) => sum + log.total_sales, 0)
  const budget = matchedBudgets.reduce((sum, b) => sum + b.amount, 0)
  const fullBudget = operatingBudgets.reduce((sum, b) => sum + b.amount, 0)

  // 6. 予算ゼロの場合はnull（設定ミス）
  if (budget === 0 && matchedBudgets.length === 0) return null

  const diffAmount = actual - budget
  const diffPct = budget > 0 ? Math.round((actual / budget) * 100) : 0
  const remaining = budget - actual

  return {
    actual,
    budget,
    fullBudget,
    diffAmount,
    diffPct,
    remaining,
    isInProgress,
    actualDays: actualLogs.length,
    budgetDays: matchedBudgets.length,
    fullBudgetDays: operatingBudgets.length,
  }
}
