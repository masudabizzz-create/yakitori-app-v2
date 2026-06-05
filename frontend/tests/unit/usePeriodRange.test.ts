import { describe, it, expect } from 'vitest'
import {
  jstTodayYmd,
  getPeriodRange,
  getPrevPeriod,
  getYoyPeriod,
  getTrendFetchRange,
  addDays,
  dowOf,
} from '@/composables/usePeriodRange'

// ─── ヘルパー: テスト用固定日時を生成 ────────────────────────────
// Intl.DateTimeFormat が Asia/Tokyo を参照するため、UTC での入力日時が必要
// 例: JST 2026-06-04 09:00 = UTC 2026-06-04 00:00

function utcDate(y: number, m: number, d: number, hUtc = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hUtc, 0, 0))
}

// ─── jstTodayYmd ─────────────────────────────────────────────────

describe('jstTodayYmd', () => {
  it('UTC 2026-06-04 00:00 → JST 2026-06-04（UTC+9でちょうど9時）', () => {
    expect(jstTodayYmd(utcDate(2026, 6, 4, 0))).toBe('2026-06-04')
  })

  it('UTC 2026-06-03 15:30 → JST 2026-06-04（UTC+9=翌0:30）', () => {
    expect(jstTodayYmd(new Date('2026-06-03T15:30:00Z'))).toBe('2026-06-04')
  })

  it('UTC 2026-06-03 14:59 → JST 2026-06-03（UTC+9=23:59）', () => {
    expect(jstTodayYmd(new Date('2026-06-03T14:59:00Z'))).toBe('2026-06-03')
  })
})

// ─── addDays ─────────────────────────────────────────────────────

describe('addDays', () => {
  it('月跨ぎ', () => {
    expect(addDays('2026-05-31', 1)).toBe('2026-06-01')
  })

  it('年跨ぎ', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('マイナス日数', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('うるう年の2/29', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })
})

// ─── dowOf ───────────────────────────────────────────────────────

describe('dowOf', () => {
  it('2026-06-01 は月曜（1）', () => {
    expect(dowOf('2026-06-01')).toBe(1)
  })

  it('2026-06-07 は日曜（0）', () => {
    expect(dowOf('2026-06-07')).toBe(0)
  })

  // 曜日ズレ問題の確認：2026/5/25 は実カレンダーで月曜日
  it('2026-05-25 は月曜（1）', () => {
    expect(dowOf('2026-05-25')).toBe(1)
  })

  it('2026-05-31 は日曜（0）', () => {
    expect(dowOf('2026-05-31')).toBe(0)
  })
})

// ─── getPeriodRange ───────────────────────────────────────────────

describe('getPeriodRange - day', () => {
  const now = utcDate(2026, 6, 4, 0) // JST 2026-06-04（木）

  it('offset=0 → 今日', () => {
    const r = getPeriodRange('day', 0, now)
    expect(r.from).toBe('2026-06-04')
    expect(r.to).toBe('2026-06-04')
    expect(r.label).toBe('6/4(木)')
  })

  it('offset=1 → 昨日', () => {
    const r = getPeriodRange('day', 1, now)
    expect(r.from).toBe('2026-06-03')
    expect(r.to).toBe('2026-06-03')
  })

  it('月跨ぎ: offset=4 で前月末日', () => {
    const may31 = utcDate(2026, 6, 1, 0) // JST 2026-06-01
    const r = getPeriodRange('day', 1, may31)
    expect(r.from).toBe('2026-05-31')
  })
})

describe('getPeriodRange - week', () => {
  // 2026-06-04 は木曜
  const thu = utcDate(2026, 6, 4, 0)
  // 2026-06-01 は月曜
  const mon = utcDate(2026, 6, 1, 0)
  // 2026-06-07 は日曜
  const sun = utcDate(2026, 6, 7, 0)

  it('木曜基準 offset=0 → その週の月〜日（6/1〜6/7）', () => {
    const r = getPeriodRange('week', 0, thu)
    expect(r.from).toBe('2026-06-01')
    expect(r.to).toBe('2026-06-07')
  })

  it('月曜基準 → 自身が週始め', () => {
    const r = getPeriodRange('week', 0, mon)
    expect(r.from).toBe('2026-06-01')
    expect(r.to).toBe('2026-06-07')
  })

  it('日曜基準 → 同週（月曜から6日前）', () => {
    const r = getPeriodRange('week', 0, sun)
    expect(r.from).toBe('2026-06-01')
    expect(r.to).toBe('2026-06-07')
  })

  it('offset=1 → 先週', () => {
    const r = getPeriodRange('week', 1, thu)
    expect(r.from).toBe('2026-05-25')
    expect(r.to).toBe('2026-05-31')
    expect(r.label).toBe('5/25〜5/31')
  })

  // 曜日ズレ問題の確認：5/25（月）〜5/31（日）の週
  it('5/26（火）基準 offset=0 → 5/25〜5/31', () => {
    const tue = utcDate(2026, 5, 26, 0) // 2026-05-26（火）
    const r = getPeriodRange('week', 0, tue)
    expect(r.from).toBe('2026-05-25')
    expect(r.to).toBe('2026-05-31')
    expect(r.label).toBe('5/25〜5/31')
  })

  it('月跨ぎ週: from と to が異なる月', () => {
    const r = getPeriodRange('week', 1, thu)
    expect(r.from.startsWith('2026-05')).toBe(true)
    expect(r.to.startsWith('2026-05')).toBe(true)
  })
})

describe('getPeriodRange - month', () => {
  const now = utcDate(2026, 6, 15, 0) // JST 2026-06-15

  it('offset=0 → 6月（1日〜30日）', () => {
    const r = getPeriodRange('month', 0, now)
    expect(r.from).toBe('2026-06-01')
    expect(r.to).toBe('2026-06-30')
    expect(r.label).toBe('2026年6月')
  })

  it('offset=1 → 5月（1日〜31日）', () => {
    const r = getPeriodRange('month', 1, now)
    expect(r.from).toBe('2026-05-01')
    expect(r.to).toBe('2026-05-31')
  })

  it('年跨ぎ: 1月で offset=1 → 前年12月', () => {
    const jan = utcDate(2026, 1, 15, 0)
    const r = getPeriodRange('month', 1, jan)
    expect(r.from).toBe('2025-12-01')
    expect(r.to).toBe('2025-12-31')
  })

  it('うるう年: 2024年2月は29日', () => {
    const mar = utcDate(2024, 3, 1, 0)
    const r = getPeriodRange('month', 1, mar)
    expect(r.to).toBe('2024-02-29')
  })

  it('非うるう年: 2026年2月は28日', () => {
    const mar = utcDate(2026, 3, 1, 0)
    const r = getPeriodRange('month', 1, mar)
    expect(r.to).toBe('2026-02-28')
  })
})

describe('getPeriodRange - quarter', () => {
  const q2 = utcDate(2026, 5, 15, 0) // JST 2026-05-15 → Q2

  it('Q2（5月）→ 4〜6月', () => {
    const r = getPeriodRange('quarter', 0, q2)
    expect(r.from).toBe('2026-04-01')
    expect(r.to).toBe('2026-06-30')
    expect(r.label).toBe('2026年Q2（4〜6月）')
  })

  it('offset=1 → Q1（1〜3月）', () => {
    const r = getPeriodRange('quarter', 1, q2)
    expect(r.from).toBe('2026-01-01')
    expect(r.to).toBe('2026-03-31')
  })

  it('Q1で offset=1 → 前年Q4（10〜12月）年跨ぎ', () => {
    const q1 = utcDate(2026, 2, 1, 0) // Feb = Q1
    const r = getPeriodRange('quarter', 1, q1)
    expect(r.from).toBe('2025-10-01')
    expect(r.to).toBe('2025-12-31')
  })

  it('Q4（11月）→ 10〜12月', () => {
    const q4 = utcDate(2026, 11, 1, 0)
    const r = getPeriodRange('quarter', 0, q4)
    expect(r.from).toBe('2026-10-01')
    expect(r.to).toBe('2026-12-31')
  })
})

describe('getPeriodRange - year', () => {
  const now = utcDate(2026, 6, 4, 0)

  it('offset=0 → 2026年', () => {
    const r = getPeriodRange('year', 0, now)
    expect(r.from).toBe('2026-01-01')
    expect(r.to).toBe('2026-12-31')
    expect(r.label).toBe('2026年')
  })

  it('offset=1 → 2025年', () => {
    const r = getPeriodRange('year', 1, now)
    expect(r.from).toBe('2025-01-01')
    expect(r.to).toBe('2025-12-31')
  })
})

// ─── getPrevPeriod ────────────────────────────────────────────────

describe('getPrevPeriod', () => {
  const thu = utcDate(2026, 6, 4, 0) // JST 木曜

  it('day: 前週同曜日（-7日）', () => {
    const r = getPrevPeriod('day', 0, thu)
    expect(r.from).toBe('2026-05-28') // 木 -7 = 前週木
  })

  it('day: offset=1（昨日6/3）の前期 = 昨日の前週同曜日（5/27）', () => {
    const r = getPrevPeriod('day', 1, thu)
    expect(r.from).toBe('2026-05-27') // 6/3 - 7 = 5/27（水曜）
  })

  it('week: 先週', () => {
    const r = getPrevPeriod('week', 0, thu)
    expect(r.from).toBe('2026-05-25')
    expect(r.to).toBe('2026-05-31')
  })

  it('month: 先月', () => {
    const now = utcDate(2026, 6, 1, 0)
    const r = getPrevPeriod('month', 0, now)
    expect(r.from).toBe('2026-05-01')
  })

  it('quarter: 前四半期', () => {
    const q2 = utcDate(2026, 5, 1, 0)
    const r = getPrevPeriod('quarter', 0, q2)
    expect(r.from).toBe('2026-01-01') // Q1
  })

  it('year: 去年', () => {
    const now = utcDate(2026, 6, 1, 0)
    const r = getPrevPeriod('year', 0, now)
    expect(r.from).toBe('2025-01-01')
  })
})

// ─── getYoyPeriod ─────────────────────────────────────────────────

describe('getYoyPeriod', () => {
  const now = utcDate(2026, 6, 15, 0)

  it('month: 前年同月', () => {
    const r = getYoyPeriod('month', 0, now)
    expect(r).not.toBeNull()
    expect(r!.from).toBe('2025-06-01')
    expect(r!.to).toBe('2025-06-30')
    expect(r!.label).toBe('2025年6月')
  })

  it('month: うるう年 2024-02 → 2023-02（28日）', () => {
    const mar24 = utcDate(2024, 3, 1, 0)
    const r = getYoyPeriod('month', 1, mar24) // 1か月前 = 2024-02
    expect(r!.to).toBe('2023-02-28')
  })

  it('month: 2024-02（うるう年）の昨対は 2023-02-28', () => {
    const feb24 = utcDate(2024, 2, 15, 0)
    const r = getYoyPeriod('month', 0, feb24)
    expect(r!.from).toBe('2023-02-01')
    expect(r!.to).toBe('2023-02-28')
  })

  it('quarter: 前年同四半期', () => {
    const q2 = utcDate(2026, 5, 1, 0)
    const r = getYoyPeriod('quarter', 0, q2)
    expect(r!.from).toBe('2025-04-01')
    expect(r!.to).toBe('2025-06-30')
  })

  it('day: null を返す', () => {
    expect(getYoyPeriod('day', 0, now)).toBeNull()
  })

  it('week: null を返す', () => {
    expect(getYoyPeriod('week', 0, now)).toBeNull()
  })

  it('year: null を返す', () => {
    expect(getYoyPeriod('year', 0, now)).toBeNull()
  })
})

// ─── getTrendFetchRange ───────────────────────────────────────────

describe('getTrendFetchRange', () => {
  const now = utcDate(2026, 6, 4, 0)

  it('day: 7日分（6/4 から 7-1=6 日前の月曜週）', () => {
    const r = getTrendFetchRange('day', 0, now)
    expect(r.to).toBe('2026-06-04')
    // from = offset + (7-1) = 6日前
    expect(r.from).toBe('2026-05-29')
  })

  it('month: 12ヶ月分（from が 11ヶ月前の1日）', () => {
    const r = getTrendFetchRange('month', 0, now)
    expect(r.to).toBe('2026-06-30')
    expect(r.from).toBe('2025-07-01')
  })

  it('year: 5年分（from が4年前の1月1日）', () => {
    const r = getTrendFetchRange('year', 0, now)
    expect(r.to).toBe('2026-12-31')
    expect(r.from).toBe('2022-01-01')
  })
})
