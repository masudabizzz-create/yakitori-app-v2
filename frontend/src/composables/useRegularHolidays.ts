/**
 * useRegularHolidays.ts
 *
 * 定休日判定ロジック
 * - settings.regular_holidays（曜日コード配列）を基に判定
 * - 空配列 = 定休日なし（全日営業）
 */

import { dowOf } from './usePeriodRange'

/**
 * 指定日が定休日かを判定
 *
 * @param ymd - 日付文字列（YYYY-MM-DD）
 * @param regularHolidays - 定休日の曜日コード配列（0=日, 1=月, ..., 6=土）
 * @returns true = 定休日、false = 営業日
 *
 * @example
 * const regularHolidays = [1]  // 毎週月曜が定休日
 * isRegularHoliday('2026-06-08', regularHolidays)  // 月曜 → true
 * isRegularHoliday('2026-06-09', regularHolidays)  // 火曜 → false
 *
 * const noHolidays = []  // 定休日なし
 * isRegularHoliday('2026-06-08', noHolidays)  // → false（全日営業）
 */
export function isRegularHoliday(ymd: string, regularHolidays: number[]): boolean {
  // 空配列 = 定休日なし（全日営業）
  if (!regularHolidays || regularHolidays.length === 0) return false

  const dow = dowOf(ymd)  // Asia/Tokyo基準の曜日取得
  return regularHolidays.includes(dow)
}
