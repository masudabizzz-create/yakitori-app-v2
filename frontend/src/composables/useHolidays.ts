/**
 * useHolidays.ts
 * 日本の祝日判定。
 *
 * japanese-holidays パッケージで算出する（オフライン・APIキー不要）。
 * 振替休日・春分の日・秋分の日も正しく判定される。
 */
import * as JapaneseHolidays from 'japanese-holidays'

/** Date が日本の祝日（振替休日含む）か判定する */
export function isHoliday(date: Date): boolean {
  return JapaneseHolidays.isHoliday(date, true) !== undefined
}

/** 'yyyy-MM-dd' 形式の日付文字列が祝日か判定する */
export function isHolidayYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return false
  return isHoliday(new Date(y, m - 1, d))
}

/** 祝日名を返す（祝日でなければ空文字） */
export function holidayName(date: Date): string {
  return JapaneseHolidays.isHoliday(date, true) ?? ''
}
