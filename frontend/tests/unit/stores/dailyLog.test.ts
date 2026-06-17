import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// vi.mock はファイル先頭にホイストされるため、変数定義より前に評価される。
// vi.hoisted() を使って mock 関数をホイスト対象と同じスコープで初期化する。
const { mockRpc, mockSingle, mockEq, mockSelect, mockFrom } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockSingle: vi.fn(),
  mockEq: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
  },
}))

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

// ============================================================
// 異常系・境界値テスト（フェーズ0追加）
// ============================================================

describe('buildSubmitPayload - 異常系・境界値', () => {
  const skewers: Skewer[] = [
    makeSkewer('reg', 'レギュラー'),
  ]

  const ctx = {
    tenantId: 't1',
    skewers,
    perCourse: { casual: 10, standard: 15, premium: 20 },
    now: new Date(2026, 4, 22),
  }

  it('売上が0の場合でも正しく処理される', () => {
    const form = { ...baseForm, totalSales: 0, drinkRatio: 0 }
    const { logRow } = buildSubmitPayload(form, ctx)
    expect(logRow.total_sales).toBe(0)
    expect(logRow.drink_sales).toBe(0)
  })

  // TODO: フェーズ1で範囲チェック実装後、このテストを修正
  // 期待値: バリデーションエラーまたは0にクランプ
  it.todo('売上が負数の場合は拒否されるべき（現状は通過）')

  it('売上が負数の場合でも処理される（暫定: フェーズ1で修正予定）', () => {
    const form = { ...baseForm, totalSales: -10000 }
    const { logRow } = buildSubmitPayload(form, ctx)
    expect(logRow.total_sales).toBe(-10000) // 暫定: 現状通過
  })

  it('極端に大きい売上でも処理される', () => {
    const form = { ...baseForm, totalSales: 999999999 }
    const { logRow } = buildSubmitPayload(form, ctx)
    expect(logRow.total_sales).toBe(999999999)
  })

  it('コース数が0でも処理される', () => {
    const form = { ...baseForm, courseCasual: 0, courseStandard: 0, coursePremium: 0 }
    const { logRow } = buildSubmitPayload(form, ctx)
    expect(logRow.course_casual).toBe(0)
    expect(logRow.total_skewers).toBe(5) // 追加串のみ
  })

  it('組数・客数がnullの場合、logRowに含まれない', () => {
    const form = { ...baseForm, groupsCount: null, guestsCount: null }
    const { logRow } = buildSubmitPayload(form, ctx)
    expect(logRow.groups_count).toBeUndefined()
    expect(logRow.guests_count).toBeUndefined()
  })

  it('組数・客数が0の場合、logRowに含まれる', () => {
    const form = { ...baseForm, groupsCount: 0, guestsCount: 0 }
    const { logRow } = buildSubmitPayload(form, ctx)
    expect(logRow.groups_count).toBe(0)
    expect(logRow.guests_count).toBe(0)
  })

  it('staffNameが空文字でも処理される', () => {
    const form = { ...baseForm, staffName: '' }
    const { logRow } = buildSubmitPayload(form, ctx)
    expect(logRow.staff_name).toBe('')
  })

  it('memoが空文字でも処理される', () => {
    const form = { ...baseForm, memo: '' }
    const { logRow } = buildSubmitPayload(form, ctx)
    expect(logRow.memo).toBe('')
  })

  // TODO: フェーズ1で範囲チェック実装後、このテストを修正
  // 期待値: バリデーションエラーまたは100にクランプ
  it.todo('drinkRatioが100を超える場合は拒否されるべき（現状は通過）')

  it('drinkRatioが100を超えても処理される（暫定: フェーズ1で修正予定）', () => {
    const form = { ...baseForm, drinkRatio: 150 }
    const { logRow } = buildSubmitPayload(form, ctx)
    expect(logRow.drink_ratio).toBe(150) // 暫定: 現状通過
  })
})

describe('下書き保存→復元の完全一致テスト', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('全フィールドが復元される（groupsCount/guestsCount含む）', () => {
    const store = useDailyLogStore()
    const fullForm: DailyInputForm = {
      ...baseForm,
      groupsCount: 20,
      guestsCount: 60,
    }

    store.saveDraft(fullForm)
    const loaded = store.loadDraft()

    expect(loaded).not.toBeNull()
    expect(loaded!.staffName).toBe(fullForm.staffName)
    expect(loaded!.courseCasual).toBe(fullForm.courseCasual)
    expect(loaded!.courseStandard).toBe(fullForm.courseStandard)
    expect(loaded!.coursePremium).toBe(fullForm.coursePremium)
    expect(loaded!.extraSkewers).toBe(fullForm.extraSkewers)
    expect(loaded!.totalSales).toBe(fullForm.totalSales)
    expect(loaded!.drinkRatio).toBe(fullForm.drinkRatio)
    expect(loaded!.memo).toBe(fullForm.memo)
    expect(loaded!.groupsCount).toBe(20)
    expect(loaded!.guestsCount).toBe(60)
    expect(loaded!.skewerInputs).toEqual(fullForm.skewerInputs)
  })

  it('groupsCount/guestsCountがnullの場合も保存・復元される', () => {
    const store = useDailyLogStore()
    const formWithNull: DailyInputForm = {
      ...baseForm,
      groupsCount: null,
      guestsCount: null,
    }

    store.saveDraft(formWithNull)
    const loaded = store.loadDraft()

    expect(loaded).not.toBeNull()
    expect(loaded!.groupsCount).toBeNull()
    expect(loaded!.guestsCount).toBeNull()
  })

  it('groupsCount/guestsCountが0の場合も保存・復元される', () => {
    const store = useDailyLogStore()
    const formWithZero: DailyInputForm = {
      ...baseForm,
      groupsCount: 0,
      guestsCount: 0,
    }

    store.saveDraft(formWithZero)
    const loaded = store.loadDraft()

    expect(loaded).not.toBeNull()
    expect(loaded!.groupsCount).toBe(0)
    expect(loaded!.guestsCount).toBe(0)
  })

  it('skewerInputsが空オブジェクトの場合も復元される', () => {
    const store = useDailyLogStore()
    const formNoSkewers: DailyInputForm = {
      ...baseForm,
      skewerInputs: {},
    }

    store.saveDraft(formNoSkewers)
    const loaded = store.loadDraft()

    expect(loaded).not.toBeNull()
    expect(loaded!.skewerInputs).toEqual({})
  })
})

// ============================================================
// submitDailyReport - RPC呼び出し検証（フェーズ1.5追加）
// ============================================================

describe('submitDailyReport - RPC呼び出し', () => {
  const TEST_LOG_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

  const skewers: Skewer[] = [
    makeSkewer('reg', 'レギュラー'),
    makeSkewer('yz', '前日仕込み'),
    makeSkewer('byp', '副産物'),
  ]

  const ctx = {
    tenantId: 'tenant-uuid-001',
    skewers,
    perCourse: { casual: 10, standard: 15, premium: 20 },
    now: new Date(2026, 4, 22), // 2026-05-22（金曜）
  }

  const formWithKombu: DailyInputForm = {
    ...baseForm,
    skewerInputs: {
      reg: { value: 3, isKombu: false, isPreparing: false },
      yz: { value: 1, isKombu: true, isPreparing: false },
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    // rpc → { log_id, success }
    mockRpc.mockResolvedValue({
      data: { log_id: TEST_LOG_ID, success: true },
      error: null,
    })

    // from('daily_logs').select('*').eq('id', ...).single()
    mockSingle.mockResolvedValue({
      data: { id: TEST_LOG_ID, log_date: '2026-05-22', total_sales: 100000 },
      error: null,
    })
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
  })

  it('supabase.rpc が submit_daily_report を呼ぶ', async () => {
    const store = useDailyLogStore()
    await store.submitDailyReport(formWithKombu, ctx)
    expect(mockRpc).toHaveBeenCalledOnce()
    expect(mockRpc.mock.calls[0][0]).toBe('submit_daily_report')
  })

  it('p_stock_rows のキー名が isKombu（キャメルケース）で渡される', async () => {
    const store = useDailyLogStore()
    await store.submitDailyReport(formWithKombu, ctx)

    const args = mockRpc.mock.calls[0][1] as Record<string, unknown>
    const stockRows = args.p_stock_rows as Array<{ skewerId: string; stock: number; isKombu: boolean }>

    // is_kombu（スネーク）ではなく isKombu（キャメル）であること
    expect(stockRows.every((r) => 'isKombu' in r)).toBe(true)
    expect(stockRows.every((r) => !('is_kombu' in r))).toBe(true)
  })

  it('昆布締めフラグが正しく変換される（is_kombu=true → isKombu=true）', async () => {
    const store = useDailyLogStore()
    await store.submitDailyReport(formWithKombu, ctx)

    const args = mockRpc.mock.calls[0][1] as Record<string, unknown>
    const stockRows = args.p_stock_rows as Array<{ skewerId: string; stock: number; isKombu: boolean }>

    const yzRow = stockRows.find((r) => r.skewerId === 'yz')
    expect(yzRow).toBeDefined()
    expect(yzRow!.isKombu).toBe(true)

    const regRow = stockRows.find((r) => r.skewerId === 'reg')
    expect(regRow).toBeDefined()
    expect(regRow!.isKombu).toBe(false)
  })

  it('副産物は p_stock_rows に含まれない', async () => {
    const store = useDailyLogStore()
    await store.submitDailyReport(formWithKombu, ctx)

    const args = mockRpc.mock.calls[0][1] as Record<string, unknown>
    const stockRows = args.p_stock_rows as Array<{ skewerId: string }>
    expect(stockRows.find((r) => r.skewerId === 'byp')).toBeUndefined()
  })

  it('RPC引数の主要フィールドが logRow から正しく詰められる', async () => {
    const store = useDailyLogStore()
    await store.submitDailyReport(formWithKombu, ctx)

    const args = mockRpc.mock.calls[0][1] as Record<string, unknown>
    expect(args.p_tenant_id).toBe('tenant-uuid-001')
    expect(args.p_log_date).toBe('2026-05-22')
    expect(args.p_day_of_week).toBe('金曜')
    expect(args.p_total_sales).toBe(100000)
    expect(args.p_drink_ratio).toBe(30)
  })

  it('groups_count / guests_count が null のとき p_groups_count / p_guests_count は null', async () => {
    const store = useDailyLogStore()
    const formNoCount: DailyInputForm = { ...formWithKombu, groupsCount: null, guestsCount: null }
    await store.submitDailyReport(formNoCount, ctx)

    const args = mockRpc.mock.calls[0][1] as Record<string, unknown>
    expect(args.p_groups_count).toBeNull()
    expect(args.p_guests_count).toBeNull()
  })

  it('RPC エラー時はエラーがスローされ、submitting が false に戻る', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: '既存日報の修正権限がありません (role: staff_hall)' },
    })

    const store = useDailyLogStore()
    await expect(store.submitDailyReport(formWithKombu, ctx)).rejects.toThrow(
      '既存日報の修正権限がありません',
    )
    expect(store.submitting).toBe(false)
  })

  it('RPC 成功後に stockRows が返される（InputViewの仕込み計算用）', async () => {
    const store = useDailyLogStore()
    const { stockRows } = await store.submitDailyReport(formWithKombu, ctx)

    // stockRows は SubmitStockRow 形式（is_kombu: スネーク）のまま返る
    const yzRow = stockRows.find((r) => r.skewerId === 'yz')
    expect(yzRow).toBeDefined()
    expect(yzRow!.is_kombu).toBe(true) // 呼び出し元は is_kombu（スネーク）で受け取る
  })
})
