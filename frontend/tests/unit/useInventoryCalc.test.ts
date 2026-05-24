import { describe, it, expect } from 'vitest'
import {
  calcPrepRegular,
  calcSundayBoost,
  calcPrepThreshold,
  calcKombuAction,
  calcPrep,
  unitDisplay,
  buildLineMessage,
  calculateOrderEstimate,
  calcEqualOrderQty,
  calcTotalSkewers,
  calcDrinkSales,
  inputToStockSticks,
  kombuActionText,
  formatPrepAmount,
  formatStockDisplay,
  computeCourseBreakdown,
  type PrepResult,
  type LineReportData,
} from '@/composables/useInventoryCalc'
import type { Skewer } from '@/types'

// ============================================================
// テストフィクスチャ
// ============================================================

function makeSkewer(over: Partial<Skewer> = {}): Skewer {
  return {
    id: 'sk-default',
    tenant_id: 't1',
    name: 'テスト串',
    category: 'レギュラー',
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
    ...over,
  }
}

const baseReport: LineReportData = {
  totalSales: 98000,
  drinkRatio: 35,
  courseCasual: 2,
  courseStandard: 3,
  coursePremium: 1,
  extraSkewers: 5,
  totalSkewers: 110,
  memo: '',
}

// ============================================================
// 仕込み計算 - レギュラー・つくね
// ============================================================

describe('仕込み計算 - レギュラー・つくね', () => {
  it('理想在庫を下回るとき仕込み量を単位の倍数で返す', () => {
    // needed = 100 - 65 = 35 → ceil(35/20) = 2 → 2*20 = 40
    expect(calcPrepRegular(65, 100, 20)).toBe(40)
    // つくね単位40: needed = 120 - 40 = 80 → ceil(80/40) = 2 → 2*40 = 80
    expect(calcPrepRegular(40, 120, 40)).toBe(80)
  })

  it('在庫が理想以上のとき 0 を返す', () => {
    expect(calcPrepRegular(100, 100, 20)).toBe(0)
    expect(calcPrepRegular(150, 100, 20)).toBe(0)
  })

  it('日曜ブースト ON・月曜のとき理想在庫にブーストを加算する', () => {
    // 月曜(dow=1): daysUntilSunday=6 → 60 + round(60 * 1/6) = 60 + 10 = 70
    expect(calcSundayBoost(60, 1)).toBe(70)

    // calcPrep 統合: レギュラー ideal_mon=60, stock=0, 翌日=月曜
    const skewer = makeSkewer({ id: 'reg1', category: 'レギュラー', ideal_mon: 60, unit: 20 })
    const results = calcPrep([skewer], { reg1: 0 }, 1, { sundayBoostEnabled: true })
    // boostedIdeal=70 → needed=70 → bags=ceil(70/20)=4 → prepAmount=80
    expect(results[0].prepAmount).toBe(80)
    expect(results[0].bags).toBe(4)
  })

  it('日曜ブースト OFF のとき補正しない', () => {
    const skewer = makeSkewer({ id: 'reg1', category: 'レギュラー', ideal_mon: 60, unit: 20 })
    const results = calcPrep([skewer], { reg1: 0 }, 1, { sundayBoostEnabled: false })
    // ideal=60 → needed=60 → bags=ceil(60/20)=3 → prepAmount=60
    expect(results[0].prepAmount).toBe(60)
    expect(results[0].bags).toBe(3)
  })

  it('日曜ブーストはつくねには適用されない', () => {
    const skewer = makeSkewer({ id: 'tsu1', category: 'つくね', ideal_mon: 60, unit: 40 })
    const results = calcPrep([skewer], { tsu1: 0 }, 1, { sundayBoostEnabled: true })
    // ブーストなし: needed=60 → bags=ceil(60/40)=2 → prepAmount=80
    expect(results[0].prepAmount).toBe(80)
  })
})

// ============================================================
// 仕込み計算 - スペシャル・その他仕込み（閾値）
// ============================================================

describe('仕込み計算 - スペシャル・その他仕込み（閾値）', () => {
  // calcPrepThreshold(stock, threshold1, prepAmount1, threshold2, prepAmount2)
  it('在庫が threshold2 以下のとき prepAmount2 を返す', () => {
    expect(calcPrepThreshold(5, 20, 100, 10, 200)).toBe(200)
    expect(calcPrepThreshold(10, 20, 100, 10, 200)).toBe(200) // 境界
  })

  it('在庫が threshold1 以下 threshold2 超のとき prepAmount1 を返す', () => {
    expect(calcPrepThreshold(15, 20, 100, 10, 200)).toBe(100)
    expect(calcPrepThreshold(20, 20, 100, 10, 200)).toBe(100) // 境界
  })

  it('在庫が threshold1 超のとき 0 を返す', () => {
    expect(calcPrepThreshold(25, 20, 100, 10, 200)).toBe(0)
  })

  it('calcPrep でスペシャルの閾値計算が反映される', () => {
    const skewer = makeSkewer({
      id: 'sp1',
      category: 'スペシャル',
      threshold1: 20,
      prep_amount1: 100,
      threshold2: 10,
      prep_amount2: 200,
    })
    expect(calcPrep([skewer], { sp1: 5 }, 1, { sundayBoostEnabled: true })[0].prepAmount).toBe(200)
    expect(calcPrep([skewer], { sp1: 15 }, 1, { sundayBoostEnabled: true })[0].prepAmount).toBe(100)
    expect(calcPrep([skewer], { sp1: 25 }, 1, { sundayBoostEnabled: true })[0].prepAmount).toBe(0)
    // 閾値方式は bags を使わない
    expect(calcPrep([skewer], { sp1: 5 }, 1, { sundayBoostEnabled: true })[0].bags).toBe(0)
  })
})

// ============================================================
// 仕込み計算 - 前日仕込み（昆布締め）
// ============================================================

describe('仕込み計算 - 前日仕込み（昆布締め）', () => {
  // calcKombuAction(stock, isKombu, ideal, threshold2)
  it('isKombu=true のとき skewer_kombu を返す', () => {
    expect(calcKombuAction(0, true, 20, 10)).toBe('skewer_kombu')
    expect(calcKombuAction(100, true, 20, 10)).toBe('skewer_kombu')
  })

  it('在庫が理想以上のとき none を返す', () => {
    expect(calcKombuAction(20, false, 20, 10)).toBe('none')
    expect(calcKombuAction(30, false, 20, 10)).toBe('none')
  })

  it('在庫が threshold2 超のとき kombu を返す', () => {
    // stock=15: stock<ideal(20) かつ stock>threshold2(10)
    expect(calcKombuAction(15, false, 20, 10)).toBe('kombu')
  })

  it('それ以外のとき skewer_direct を返す', () => {
    expect(calcKombuAction(5, false, 20, 10)).toBe('skewer_direct')
    expect(calcKombuAction(10, false, 20, 10)).toBe('skewer_direct') // 境界(threshold2ちょうど)
  })

  it('calcPrep で前日仕込みの action と prepAmount を返す', () => {
    const skewer = makeSkewer({
      id: 'yz1',
      category: '前日仕込み',
      ideal_mon: 20,
      threshold2: 10,
      prep_method_name: '昆布締め',
    })
    // stock=15 → kombu, prepAmount=1（action≠none）
    const r1 = calcPrep([skewer], { yz1: 15 }, 1, { sundayBoostEnabled: true })[0]
    expect(r1.action).toBe('kombu')
    expect(r1.prepAmount).toBe(1)
    expect(r1.bags).toBe(0)

    // stock=25（理想以上）→ none, prepAmount=0
    const r2 = calcPrep([skewer], { yz1: 25 }, 1, { sundayBoostEnabled: true })[0]
    expect(r2.action).toBe('none')
    expect(r2.prepAmount).toBe(0)

    // 昆布締め済みフラグ → skewer_kombu
    const r3 = calcPrep([skewer], { yz1: 5 }, 1, {
      sundayBoostEnabled: true,
      kombuFlags: { yz1: true },
    })[0]
    expect(r3.action).toBe('skewer_kombu')
    expect(r3.prepAmount).toBe(1)
  })
})

// ============================================================
// calcPrep - 副産物スキップ
// ============================================================

describe('calcPrep - 全体挙動', () => {
  it('副産物は結果に含まれない', () => {
    const skewers = [
      makeSkewer({ id: 'reg1', category: 'レギュラー', ideal_mon: 100 }),
      makeSkewer({ id: 'byp1', category: '副産物' }),
    ]
    const results = calcPrep(skewers, { reg1: 0, byp1: 0 }, 1, { sundayBoostEnabled: false })
    expect(results).toHaveLength(1)
    expect(results[0].skewerId).toBe('reg1')
  })

  it('在庫未指定の串は stock=0 として計算する', () => {
    const skewer = makeSkewer({ id: 'reg1', category: 'レギュラー', ideal_mon: 100, unit: 20 })
    const results = calcPrep([skewer], {}, 1, { sundayBoostEnabled: false })
    expect(results[0].stock).toBe(0)
    expect(results[0].prepAmount).toBe(100)
  })
})

// ============================================================
// 単位変換表示
// ============================================================

describe('unitDisplay', () => {
  it('レギュラー・前日仕込みは P 単位（20本=1P, 四捨五入）', () => {
    expect(unitDisplay(40, 'レギュラー')).toBe('2P')
    expect(unitDisplay(100, 'レギュラー')).toBe('5P')
    expect(unitDisplay(15, '前日仕込み')).toBe('1P') // round(15/20)=1
  })

  it('つくねは割り切れれば B、割り切れなければ本', () => {
    expect(unitDisplay(80, 'つくね')).toBe('2B')
    expect(unitDisplay(60, 'つくね')).toBe('60本')
  })

  it('その他カテゴリは本単位', () => {
    expect(unitDisplay(15, 'スペシャル')).toBe('15本')
    expect(unitDisplay(30, 'その他仕込み')).toBe('30本')
  })
})

// ============================================================
// 発注推定計算
// ============================================================

describe('発注推定計算', () => {
  it('平日上振れ率を正しく適用する', () => {
    const skewer = makeSkewer({
      id: 's1',
      course_type: 'all_courses',
      weight_per_stick_g: 10,
      yield_rate: 1,
      order_unit_g: 100,
    })
    const result = calculateOrderEstimate({
      skewers: [skewer],
      dailyData: [
        { dayOfWeek: 1, courseCasual: 10, courseStandard: 0, coursePremium: 0, isHoliday: false },
      ],
      stocks: {},
      schedules: [],
      upliftWeekday: 0.2,
      upliftHoliday: 0.15,
    })
    const item = result.groups[0].items[0]
    // dayUsage=10, uplifted=10*1.2=12, requiredG=round(12*10/1)=120, orderQty=ceil(120/100)=2
    expect(item.totalUsage).toBe(10)
    expect(item.upliftedUsage).toBe(12)
    expect(item.orderQty).toBe(2)
  })

  it('祝日上振れ率を正しく適用する', () => {
    const skewer = makeSkewer({
      id: 's1',
      weight_per_stick_g: 10,
      yield_rate: 1,
      order_unit_g: 100,
    })
    const result = calculateOrderEstimate({
      skewers: [skewer],
      dailyData: [
        { dayOfWeek: 1, courseCasual: 10, courseStandard: 0, coursePremium: 0, isHoliday: true },
      ],
      stocks: {},
      schedules: [],
      upliftWeekday: 0.2,
      upliftHoliday: 0.5,
    })
    // 祝日 → rate=0.5 → uplifted=10*1.5=15
    expect(result.groups[0].items[0].upliftedUsage).toBe(15)
  })

  it('在庫控除後の発注量を正しく算出する', () => {
    const skewer = makeSkewer({
      id: 's1',
      weight_per_stick_g: 10,
      yield_rate: 1,
      order_unit_g: 100,
    })
    const base = {
      skewers: [skewer],
      dailyData: [
        { dayOfWeek: 1, courseCasual: 10, courseStandard: 0, coursePremium: 0, isHoliday: false },
      ],
      schedules: [],
      upliftWeekday: 0,
      upliftHoliday: 0,
    }
    // uplifted=10, requiredG=round(10*10/1)=100, orderQty=ceil(100/100)=1
    // 在庫10本 → remainAfterG=max(0,100-10*10/1)=0 → orderQtyWithStock=0
    const withStock = calculateOrderEstimate({ ...base, stocks: { s1: 10 } })
    expect(withStock.groups[0].items[0].orderQty).toBe(1)
    expect(withStock.groups[0].items[0].orderQtyWithStock).toBe(0)

    // 在庫未指定 → orderQtyWithStock は null
    const noStock = calculateOrderEstimate({ ...base, stocks: {} })
    expect(noStock.groups[0].items[0].orderQtyWithStock).toBeNull()
  })

  it('複数スケジュール時の均等発注量を正しく算出する', () => {
    const skewer = makeSkewer({
      id: 's1',
      course_type: 'all_courses',
      weight_per_stick_g: 10,
      yield_rate: 1,
      order_unit_g: 100,
    })
    const result = calculateOrderEstimate({
      skewers: [skewer],
      dailyData: [
        { dayOfWeek: 1, courseCasual: 10, courseStandard: 0, coursePremium: 0, isHoliday: false },
        { dayOfWeek: 4, courseCasual: 20, courseStandard: 0, coursePremium: 0, isHoliday: false },
      ],
      stocks: {},
      schedules: [
        { deadlineDow: 0, deliveryDow: 1, upliftWeekday: 0, upliftHoliday: 0 },
        { deadlineDow: 3, deliveryDow: 4, upliftWeekday: 0, upliftHoliday: 0 },
      ],
    })
    // group0(納品月: カバー曜日1,2,3) → dow1のみ → usage=10 → requiredG=100 → orderQty=1
    // group1(納品木: カバー曜日4,5,6,0) → dow4のみ → usage=20 → requiredG=200 → orderQty=2
    expect(result.groups[0].items[0].orderQty).toBe(1)
    expect(result.groups[1].items[0].orderQty).toBe(2)

    // 均等発注量 = round((1+2)/2) = round(1.5) = 2
    const equal = calcEqualOrderQty(result.groups)
    expect(equal).toHaveLength(1)
    expect(equal[0].avgOrderQty).toBe(2)
  })

  it('weightPerStickG=0 のとき発注量を計算しない', () => {
    const skewer = makeSkewer({
      id: 's1',
      weight_per_stick_g: 0,
      order_unit_g: 100,
    })
    const result = calculateOrderEstimate({
      skewers: [skewer],
      dailyData: [
        { dayOfWeek: 1, courseCasual: 10, courseStandard: 0, coursePremium: 0, isHoliday: false },
      ],
      stocks: {},
      schedules: [],
    })
    const item = result.groups[0].items[0]
    expect(item.requiredMaterialG).toBeNull()
    expect(item.orderQty).toBeNull()
    expect(item.orderQtyWithStock).toBeNull()
  })

  it('specific_courses は対象コースのみ集計する', () => {
    const skewer = makeSkewer({
      id: 's1',
      course_type: 'specific_courses',
      target_courses: ['premium'],
      weight_per_stick_g: 10,
      yield_rate: 1,
      order_unit_g: 100,
    })
    const result = calculateOrderEstimate({
      skewers: [skewer],
      dailyData: [
        { dayOfWeek: 1, courseCasual: 5, courseStandard: 7, coursePremium: 3, isHoliday: false },
      ],
      stocks: {},
      schedules: [],
      upliftWeekday: 0,
      upliftHoliday: 0,
    })
    // premium のみ → dayUsage=3
    expect(result.groups[0].items[0].totalUsage).toBe(3)
  })
})

// ============================================================
// LINE メッセージフォーマット（実コード コード.gs 準拠）
// ============================================================

describe('LINE メッセージフォーマット', () => {
  const fixedNow = new Date(2026, 4, 21, 22, 0, 0) // 2026/05/21

  it('仕込みありの串を正しくフォーマットする', () => {
    const prep: PrepResult[] = [
      { skewerId: 's1', name: 'もも', category: 'レギュラー', stock: 100, prepAmount: 60, bags: 3 },
    ]
    const msg = buildLineMessage(prep, baseReport, '田中', fixedNow)
    // レギュラーは bags をそのまま P 表示、在庫は unitDisplay
    expect(msg).toContain('◆ もも  3P\t(在庫5P)')
    expect(msg).toContain('🍢 明日の仕込み')
  })

  it('仕込みなしの串を正しくフォーマットする', () => {
    const prep: PrepResult[] = [
      { skewerId: 's1', name: 'もも', category: 'レギュラー', stock: 200, prepAmount: 0, bags: 0 },
    ]
    const msg = buildLineMessage(prep, baseReport, '田中', fixedNow)
    expect(msg).toContain('  もも  仕込みなし\t(在庫10P)')
    // 仕込みありが0件のとき
    expect(msg).toContain('✅ 本日は全串仕込みなし')
  })

  it('前日仕込みのアクションを正しく表示する', () => {
    const make = (action: PrepResult['action']): PrepResult[] => [
      {
        skewerId: 'y1',
        name: 'ぼんじり',
        category: '前日仕込み',
        stock: 15,
        prepAmount: 1,
        bags: 0,
        action,
        prepMethodName: '昆布締め',
      },
    ]
    expect(buildLineMessage(make('kombu'), baseReport, '田中', fixedNow)).toContain('昆布締め開始')
    expect(buildLineMessage(make('skewer_kombu'), baseReport, '田中', fixedNow)).toContain(
      '串うち（昆布締め済み）',
    )
    expect(buildLineMessage(make('skewer_direct'), baseReport, '田中', fixedNow)).toContain(
      '昆布締めなし・直接串うち',
    )
  })

  it('メモなし時は区切り線（📝セクション）を出力しない', () => {
    const msg = buildLineMessage([], { ...baseReport, memo: '' }, '田中', fixedNow)
    expect(msg).not.toContain('📝')
  })

  it('メモあり時は📝セクションを出力する', () => {
    const msg = buildLineMessage([], { ...baseReport, memo: '今日は忙しかった' }, '田中', fixedNow)
    expect(msg).toContain('📝 今日は忙しかった')
  })

  it('実績セクションを実コード準拠で出力する（見出しに「今日」を含まない）', () => {
    const msg = buildLineMessage([], baseReport, '田中', fixedNow)
    expect(msg).toContain('の実績')
    expect(msg).not.toContain('今日') // 実コードは「📊 yyyy/MM/dd(曜)の実績」
    expect(msg).toContain('C2組 / S3組 / P1組  追加5本')
    expect(msg).toContain('焼師 田中')
  })
})

// ============================================================
// 営業後入力 関連の計算
// ============================================================

describe('calcTotalSkewers', () => {
  it('コース組数×コース串本数 + 追加串 で合計を算出する', () => {
    // 2*10 + 3*15 + 1*20 + 5 = 20 + 45 + 20 + 5 = 90
    expect(
      calcTotalSkewers(
        { casual: 2, standard: 3, premium: 1, extra: 5 },
        { casual: 10, standard: 15, premium: 20 },
      ),
    ).toBe(90)
  })

  it('すべて0なら0を返す', () => {
    expect(
      calcTotalSkewers(
        { casual: 0, standard: 0, premium: 0, extra: 0 },
        { casual: 10, standard: 15, premium: 20 },
      ),
    ).toBe(0)
  })
})

describe('calcDrinkSales', () => {
  it('総売上 × ドリンク比率 / 100 を四捨五入する', () => {
    expect(calcDrinkSales(100000, 30)).toBe(30000)
    expect(calcDrinkSales(98000, 35)).toBe(34300)
  })

  it('端数は四捨五入する', () => {
    // 10001 * 33 / 100 = 3300.33 → 3300
    expect(calcDrinkSales(10001, 33)).toBe(3300)
  })
})

describe('inputToStockSticks', () => {
  it('レギュラー・前日仕込みは入力P × 20', () => {
    expect(inputToStockSticks('レギュラー', 3, false)).toBe(60)
    expect(inputToStockSticks('前日仕込み', 2, false)).toBe(40)
  })

  it('つくねは入力B × 40', () => {
    expect(inputToStockSticks('つくね', 2, false)).toBe(80)
  })

  it('スペシャルは入力本数そのまま', () => {
    expect(inputToStockSticks('スペシャル', 15, false)).toBe(15)
  })

  it('その他仕込みは仕込み中=999 / なし=0', () => {
    expect(inputToStockSticks('その他仕込み', 0, true)).toBe(999)
    expect(inputToStockSticks('その他仕込み', 0, false)).toBe(0)
  })
})

// ============================================================
// 表示用フォーマット（仕込みダッシュボード）
// ============================================================

describe('kombuActionText', () => {
  it('各アクションを正しい表示文字列にする', () => {
    expect(kombuActionText('skewer_kombu', '昆布締め')).toBe('串うち（昆布締め済み）')
    expect(kombuActionText('kombu', '昆布締め')).toBe('昆布締め開始')
    expect(kombuActionText('skewer_direct', '昆布締め')).toBe('昆布締めなし・直接串うち')
    expect(kombuActionText('none', '昆布締め')).toBe('仕込みなし')
  })

  it('仕込み方法名を反映する', () => {
    expect(kombuActionText('kombu', '塩漬け')).toBe('塩漬け開始')
  })
})

describe('formatPrepAmount', () => {
  const mk = (over: Partial<PrepResult>): PrepResult => ({
    skewerId: 's',
    name: 'x',
    category: 'レギュラー',
    stock: 0,
    prepAmount: 0,
    bags: 0,
    ...over,
  })

  it('レギュラーは bags を P 表示する', () => {
    expect(formatPrepAmount(mk({ category: 'レギュラー', prepAmount: 60, bags: 3 }))).toBe('3P')
  })

  it('つくねは B 表示する', () => {
    expect(formatPrepAmount(mk({ category: 'つくね', prepAmount: 80, bags: 2 }))).toBe('2B')
  })

  it('スペシャル・その他仕込みは本表示する', () => {
    expect(formatPrepAmount(mk({ category: 'スペシャル', prepAmount: 30 }))).toBe('30本')
    expect(formatPrepAmount(mk({ category: 'その他仕込み', prepAmount: 20 }))).toBe('20本')
  })

  it('仕込み量0は「仕込みなし」を返す', () => {
    expect(formatPrepAmount(mk({ category: 'レギュラー', prepAmount: 0, bags: 0 }))).toBe('仕込みなし')
  })

  it('前日仕込みはアクション文字列を返す', () => {
    expect(
      formatPrepAmount(
        mk({ category: '前日仕込み', action: 'kombu', prepMethodName: '昆布締め', prepAmount: 1 }),
      ),
    ).toBe('昆布締め開始')
    expect(
      formatPrepAmount(
        mk({ category: '前日仕込み', action: 'none', prepMethodName: '昆布締め', prepAmount: 0 }),
      ),
    ).toBe('仕込みなし')
    expect(
      formatPrepAmount(
        mk({
          category: '前日仕込み',
          action: 'skewer_kombu',
          prepMethodName: '昆布締め',
          prepAmount: 1,
        }),
      ),
    ).toBe('串うち（昆布締め済み）')
  })
})

describe('formatStockDisplay', () => {
  it('レギュラー・前日仕込みは P 表示する', () => {
    expect(formatStockDisplay('レギュラー', 100)).toBe('5P')
    expect(formatStockDisplay('前日仕込み', 20)).toBe('1P')
  })

  it('つくねは B 表示する', () => {
    expect(formatStockDisplay('つくね', 80)).toBe('2B')
  })

  it('スペシャルは本表示する', () => {
    expect(formatStockDisplay('スペシャル', 15)).toBe('15本')
  })

  it('その他仕込みは 999=仕込み中 / それ以外=なし', () => {
    expect(formatStockDisplay('その他仕込み', 999)).toBe('仕込み中')
    expect(formatStockDisplay('その他仕込み', 0)).toBe('なし')
  })
})

// ============================================================
// コース内訳按分（発注推定）
// ============================================================

describe('computeCourseBreakdown', () => {
  it('比率どおりに按分する（合計100%）', () => {
    expect(computeCourseBreakdown(100, { casual: 34, standard: 33, premium: 33 })).toEqual({
      casual: 34,
      standard: 33,
      premium: 33,
    })
  })

  it('端数は casual/standard を四捨五入し premium で帳尻を合わせる', () => {
    // total=10, 34/33/33 → casual=round(3.4)=3, standard=round(3.3)=3, premium=10-3-3=4
    expect(computeCourseBreakdown(10, { casual: 34, standard: 33, premium: 33 })).toEqual({
      casual: 3,
      standard: 3,
      premium: 4,
    })
  })

  it('total=0 のとき全て0を返す', () => {
    expect(computeCourseBreakdown(0, { casual: 34, standard: 33, premium: 33 })).toEqual({
      casual: 0,
      standard: 0,
      premium: 0,
    })
  })

  it('比率合計が0のとき全て0を返す', () => {
    expect(computeCourseBreakdown(10, { casual: 0, standard: 0, premium: 0 })).toEqual({
      casual: 0,
      standard: 0,
      premium: 0,
    })
  })

  it('比率が偏っていても按分する', () => {
    expect(computeCourseBreakdown(10, { casual: 50, standard: 50, premium: 0 })).toEqual({
      casual: 5,
      standard: 5,
      premium: 0,
    })
  })
})
