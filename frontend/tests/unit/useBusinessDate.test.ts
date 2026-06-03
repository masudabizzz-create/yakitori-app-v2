import { describe, it, expect } from 'vitest'
import {
  resolveBusinessDate,
  formatBusinessDateLabel,
  BUSINESS_START_HOUR,
  BUSINESS_END_HOUR,
} from '@/composables/useBusinessDate'

// ローカル時刻で Date を作るヘルパー
function localDate(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

describe('resolveBusinessDate', () => {
  // ── 自動割り当て: 当日 ──────────────────────────────────────

  it(`${BUSINESS_START_HOUR}:00 は当日を確定返す（needsConfirm: false）`, () => {
    const now = localDate(2026, 6, 3, BUSINESS_START_HOUR, 0)
    const result = resolveBusinessDate(now)
    expect(result.needsConfirm).toBe(false)
    expect(result.date).toBe('2026-06-03')
  })

  it('23:59 は当日を確定返す', () => {
    const now = localDate(2026, 6, 3, 23, 59)
    const result = resolveBusinessDate(now)
    expect(result.needsConfirm).toBe(false)
    expect(result.date).toBe('2026-06-03')
  })

  // ── 自動割り当て: 前日 ──────────────────────────────────────

  it('0:00 は前日を確定返す（日跨ぎ深夜）', () => {
    const now = localDate(2026, 6, 3, 0, 0)
    const result = resolveBusinessDate(now)
    expect(result.needsConfirm).toBe(false)
    expect(result.date).toBe('2026-06-02')
  })

  it(`${BUSINESS_END_HOUR - 1}:59 は前日を確定返す`, () => {
    const now = localDate(2026, 6, 3, BUSINESS_END_HOUR - 1, 59)
    const result = resolveBusinessDate(now)
    expect(result.needsConfirm).toBe(false)
    expect(result.date).toBe('2026-06-02')
  })

  // ── 要確認 ─────────────────────────────────────────────────

  it(`${BUSINESS_END_HOUR}:00 ちょうどは要確認`, () => {
    const now = localDate(2026, 6, 3, BUSINESS_END_HOUR, 0)
    const result = resolveBusinessDate(now)
    expect(result.needsConfirm).toBe(true)
    if (!result.needsConfirm) return
    expect(result.candidates[0]).toBe('2026-06-03') // 今日
    expect(result.candidates[1]).toBe('2026-06-02') // 前日
  })

  it('20:59 は要確認', () => {
    const now = localDate(2026, 6, 3, 20, 59)
    const result = resolveBusinessDate(now)
    expect(result.needsConfirm).toBe(true)
    if (!result.needsConfirm) return
    expect(result.candidates[0]).toBe('2026-06-03')
    expect(result.candidates[1]).toBe('2026-06-02')
  })

  it('要確認のデフォルト date は今日', () => {
    const now = localDate(2026, 6, 3, 12, 0)
    const result = resolveBusinessDate(now)
    expect(result.needsConfirm).toBe(true)
    expect(result.date).toBe('2026-06-03')
  })

  // ── 月跨ぎ ─────────────────────────────────────────────────

  it('月初 0:00 の前日は前月末日になる（月跨ぎ）', () => {
    const now = localDate(2026, 7, 1, 0, 0) // 7月1日 0:00
    const result = resolveBusinessDate(now)
    expect(result.needsConfirm).toBe(false)
    expect(result.date).toBe('2026-06-30') // 前日 = 6月30日
  })

  it('年跨ぎ: 1月1日 0:00 の前日は前年12月31日', () => {
    const now = localDate(2027, 1, 1, 0, 0)
    const result = resolveBusinessDate(now)
    expect(result.needsConfirm).toBe(false)
    expect(result.date).toBe('2026-12-31')
  })

  // ── 境界値ペア ──────────────────────────────────────────────

  it('20:59 は要確認、21:00 は当日確定（境界を跨ぐ）', () => {
    const before = localDate(2026, 6, 3, 20, 59)
    const on = localDate(2026, 6, 3, 21, 0)

    const r1 = resolveBusinessDate(before)
    const r2 = resolveBusinessDate(on)

    expect(r1.needsConfirm).toBe(true)
    expect(r2.needsConfirm).toBe(false)
    expect(r2.date).toBe('2026-06-03')
  })

  it('2:59 は前日確定、3:00 は要確認（境界を跨ぐ）', () => {
    const before = localDate(2026, 6, 3, 2, 59)
    const on = localDate(2026, 6, 3, 3, 0)

    const r1 = resolveBusinessDate(before)
    const r2 = resolveBusinessDate(on)

    expect(r1.needsConfirm).toBe(false)
    expect(r1.date).toBe('2026-06-02')
    expect(r2.needsConfirm).toBe(true)
  })
})

describe('formatBusinessDateLabel', () => {
  it('水曜日の日付を正しくフォーマットする', () => {
    expect(formatBusinessDateLabel('2026-06-03')).toBe('6/3（水）')
  })

  it('月曜日の日付をフォーマットする', () => {
    expect(formatBusinessDateLabel('2026-06-01')).toBe('6/1（月）')
  })

  it('月初（1日）を正しく扱う', () => {
    expect(formatBusinessDateLabel('2026-07-01')).toBe('7/1（水）')
  })

  it('年末の日付をフォーマットする', () => {
    expect(formatBusinessDateLabel('2026-12-31')).toBe('12/31（木）')
  })
})
