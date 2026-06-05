import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Supabase クライアントはモック（このテストは純粋ロジックと localStorage のみ検証）
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { useDailyLogStore, buildSubmitPayload } from '@/stores/dailyLog'
import type { DailyInputForm, Skewer, SkewerCategory } from '@/types'

// ============================================================
// フィクスチャ
// ============================================================

function makeSkewer(id: string, category: SkewerCategory): Skewer {
  return {
    id,
    tenant_id: 't1',
    name: id,
    category,
    ideal_mon: 0,
    ideal_tue: 0,
    ideal_wed: 0,
    ideal_thu: 0,
    ideal_fri: 0,
    ideal_sat: 0,
    ideal_sun: 0,
    unit: 20,
    threshold1: 0,
    prep_amount1: 0,
    threshold2: 0,
    prep_amount2: 0,
    is_active: true,
    prep_method_name: '昆布締め',
    course_type: 'all_courses',
    target_courses: [],
    weight_per_stick_g: 0,
    yield_rate: 1,
    order_unit_label: '',
    order_unit_g: 0,
    sort_order: 0,
    created_at: '',
  }
}

const baseForm: DailyInputForm = {
  staffName: '田中',
  courseCasual: 2,
  courseStandard: 3,
  coursePremium: 1,
  extraSkewers: 5,
  totalSales: 100000,
  drinkRatio: 30,
  memo: 'テストメモ',
  skewerInputs: {
    reg: { value: 3, isKombu: false, isPreparing: false },
    tsu: { value: 2, isKombu: false, isPreparing: false },
    sp: { value: 15, isKombu: false, isPreparing: false },
    yz: { value: 1, isKombu: true, isPreparing: false },
    oth: { value: 0, isKombu: false, isPreparing: true },
  },
}

// ============================================================
// buildSubmitPayload
// ============================================================

describe('buildSubmitPayload', () => {
  const skewers: Skewer[] = [
    makeSkewer('reg', 'レギュラー'),
    makeSkewer('tsu', 'つくね'),
    makeSkewer('sp', 'スペシャル'),
    makeSkewer('yz', '前日仕込み'),
    makeSkewer('oth', 'その他仕込み'),
    makeSkewer('byp', '副産物'),
  ]

  const ctx = {
    tenantId: 't1',
    skewers,
    perCourse: { casual: 10, standard: 15, premium: 20 },
    now: new Date(2026, 4, 22), // 2026-05-22（金曜）
  }

  it('logRow に日付・曜日・合計串・ドリンク売上を正しく設定する', () => {
    const { logRow } = buildSubmitPayload(baseForm, ctx)
    expect(logRow.tenant_id).toBe('t1')
    expect(logRow.log_date).toBe('2026-05-22')
    expect(logRow.day_of_week).toBe('金曜')
    expect(logRow.staff_name).toBe('田中')
    // 合計串: 2*10 + 3*15 + 1*20 + 5 = 90
    expect(logRow.total_skewers).toBe(90)
    // ドリンク売上: round(100000 * 30 / 100) = 30000
    expect(logRow.drink_sales).toBe(30000)
    expect(logRow.memo).toBe('テストメモ')
  })

  it('副産物は在庫行に含めない', () => {
    const { stockRows } = buildSubmitPayload(baseForm, ctx)
    expect(stockRows).toHaveLength(5)
    expect(stockRows.find((r) => r.skewerId === 'byp')).toBeUndefined()
  })

  it('カテゴリ別に在庫本数を正しく換算する', () => {
    const { stockRows } = buildSubmitPayload(baseForm, ctx)
    const byId = Object.fromEntries(stockRows.map((r) => [r.skewerId, r]))
    expect(byId.reg.stock).toBe(60) // 3P × 20
    expect(byId.tsu.stock).toBe(80) // 2B × 40
    expect(byId.sp.stock).toBe(15) // 本そのまま
    expect(byId.yz.stock).toBe(20) // 1P × 20
    expect(byId.yz.is_kombu).toBe(true) // 昆布締め済み
    expect(byId.oth.stock).toBe(999) // 仕込み中
  })

  it('入力のない串は stock=0 として扱う', () => {
    const formNoInput: DailyInputForm = { ...baseForm, skewerInputs: {} }
    const { stockRows } = buildSubmitPayload(formNoInput, ctx)
    const byId = Object.fromEntries(stockRows.map((r) => [r.skewerId, r]))
    expect(byId.reg.stock).toBe(0)
    expect(byId.oth.stock).toBe(0) // isPreparing=false → 0
  })
})

// ============================================================
// buildSubmitPayload - logDate オプション
// ============================================================

describe('buildSubmitPayload - logDate 指定', () => {
  const skewers: Skewer[] = [
    makeSkewer('reg', 'レギュラー'),
  ]

  it('logDate を指定するとその日付が log_date に使われる', () => {
    const ctx = {
      tenantId: 't1',
      skewers,
      perCourse: { casual: 10, standard: 15, premium: 20 },
      now: new Date(2026, 5, 3, 1, 30, 0), // 2026-06-03 01:30（深夜）
      logDate: '2026-06-02', // 前日を明示指定
    }
    const { logRow } = buildSubmitPayload(baseForm, ctx)
    expect(logRow.log_date).toBe('2026-06-02')
  })

  it('logDate に対応する曜日が day_of_week に設定される', () => {
    const ctx = {
      tenantId: 't1',
      skewers,
      perCourse: { casual: 10, standard: 15, premium: 20 },
      now: new Date(2026, 5, 3, 1, 30, 0), // 水曜深夜
      logDate: '2026-06-02', // 火曜
    }
    const { logRow } = buildSubmitPayload(baseForm, ctx)
    expect(logRow.day_of_week).toBe('火曜')
  })

  it('logDate 省略時は now の日付が log_date に使われる', () => {
    const ctx = {
      tenantId: 't1',
      skewers,
      perCourse: { casual: 10, standard: 15, premium: 20 },
      now: new Date(2026, 5, 3, 22, 0, 0), // 2026-06-03 22:00 水曜
    }
    const { logRow } = buildSubmitPayload(baseForm, ctx)
    expect(logRow.log_date).toBe('2026-06-03')
    expect(logRow.day_of_week).toBe('水曜')
  })

  it('logDate に月初（月跨ぎ前日）を指定できる', () => {
    const ctx = {
      tenantId: 't1',
      skewers,
      perCourse: { casual: 10, standard: 15, premium: 20 },
      now: new Date(2026, 6, 1, 0, 30, 0), // 2026-07-01 00:30（深夜）
      logDate: '2026-06-30', // 前月末
    }
    const { logRow } = buildSubmitPayload(baseForm, ctx)
    expect(logRow.log_date).toBe('2026-06-30')
    expect(logRow.day_of_week).toBe('火曜')
  })

  // 曜日ズレ問題の確認：2026-05-25 は実カレンダーで月曜日
  it('logDate 2026-05-25 の曜日は月曜', () => {
    const ctx = {
      tenantId: 't1',
      skewers,
      perCourse: { casual: 10, standard: 15, premium: 20 },
      now: new Date(),
      logDate: '2026-05-25',
    }
    const { logRow } = buildSubmitPayload(baseForm, ctx)
    expect(logRow.log_date).toBe('2026-05-25')
    expect(logRow.day_of_week).toBe('月曜')
  })

  it('logDate 2026-05-31 の曜日は日曜', () => {
    const ctx = {
      tenantId: 't1',
      skewers,
      perCourse: { casual: 10, standard: 15, premium: 20 },
      now: new Date(),
      logDate: '2026-05-31',
    }
    const { logRow } = buildSubmitPayload(baseForm, ctx)
    expect(logRow.log_date).toBe('2026-05-31')
    expect(logRow.day_of_week).toBe('日曜')
  })
})

// ============================================================
// localStorage 下書き
// ============================================================

describe('dailyLog ストア - 下書き', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('初期状態が正しい', () => {
    const store = useDailyLogStore()
    expect(store.submitting).toBe(false)
    expect(store.latestLog).toBeNull()
    expect(store.latestStocks).toEqual([])
  })

  it('saveDraft で保存し loadDraft で復元できる', () => {
    const store = useDailyLogStore()
    store.saveDraft(baseForm)
    const loaded = store.loadDraft()
    expect(loaded).not.toBeNull()
    expect(loaded!.staffName).toBe('田中')
    expect(loaded!.courseCasual).toBe(2)
    expect(loaded!.skewerInputs.reg.value).toBe(3)
  })

  it('clearDraft で下書きを削除する', () => {
    const store = useDailyLogStore()
    store.saveDraft(baseForm)
    store.clearDraft()
    expect(store.loadDraft()).toBeNull()
  })

  it('下書きが無いとき loadDraft は null を返す', () => {
    const store = useDailyLogStore()
    expect(store.loadDraft()).toBeNull()
  })

  it('不正なJSONが保存されていても loadDraft は null を返す', () => {
    localStorage.setItem('yakitori_input_draft_v2', '{壊れたJSON')
    const store = useDailyLogStore()
    expect(store.loadDraft()).toBeNull()
  })
})
