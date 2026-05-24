import { describe, it, expect } from 'vitest'
import { isHoliday, isHolidayYmd } from '@/composables/useHolidays'

describe('useHolidays', () => {
  it('元日（1/1）を祝日と判定する', () => {
    expect(isHolidayYmd('2026-01-01')).toBe(true)
  })

  it('祝日でない平日を祝日と判定しない', () => {
    // 2026-01-05 は月曜だが成人の日（第2月曜=1/12）ではない
    expect(isHolidayYmd('2026-01-05')).toBe(false)
  })

  it('Date を直接渡して判定できる', () => {
    expect(isHoliday(new Date(2026, 0, 1))).toBe(true)
    expect(isHoliday(new Date(2026, 0, 5))).toBe(false)
  })

  it('不正な日付文字列は false を返す', () => {
    expect(isHolidayYmd('')).toBe(false)
  })
})
