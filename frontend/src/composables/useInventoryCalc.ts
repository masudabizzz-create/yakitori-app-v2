/**
 * useInventoryCalc.ts
 * 仕込み計算・発注推定計算・LINEメッセージ生成
 *
 * 既存 GAS（コード.gs）の calcPrep / calculateOrderEstimate / buildLineMessage /
 * unitDisplay を一字一句忠実に TypeScript へ移植したもの。
 * 計算式・丸め方・分岐条件は変更しない。
 *
 * v2 での適応点（計算ロジックは不変、データ参照のみ）:
 *   - GAS は stocks を配列インデックスで参照していたが、v2 は skewer.id（UUID）で参照する
 *   - GAS の skewer.idealByDay[] / threshold / prep1 等を、v2 の Skewer 型のカラムから取得する
 */
import type { Skewer, SkewerCategory, KombuAction } from '@/types'

// 再エクスポート（呼び出し側の利便のため）
export type { SkewerCategory, KombuAction }

// ============================================================
// 型定義
// ============================================================

/** calcPrep の1串あたりの結果（GAS calcPrep の results 要素に対応） */
export interface PrepResult {
  skewerId: string
  name: string
  category: SkewerCategory
  stock: number
  prepAmount: number
  bags: number
  /** 前日仕込みのみ */
  action?: KombuAction
  /** 前日仕込みのみ */
  prepMethodName?: string
}

export interface CalcPrepOptions {
  /** 日曜ブースト有効フラグ（settings.sunday_boost_enabled） */
  sundayBoostEnabled: boolean
  /** skewerId -> 昆布締め済みフラグ（前日仕込み用、GAS の bonboriKombu に対応） */
  kombuFlags?: Record<string, boolean>
}

/** buildLineMessage に渡す実績データ */
export interface LineReportData {
  totalSales: number
  drinkRatio: number
  courseCasual: number
  courseStandard: number
  coursePremium: number
  extraSkewers: number
  totalSkewers: number
  memo?: string
}

/** 発注推定: 1日分の入力 */
export interface OrderEstimateDay {
  dayOfWeek: number
  courseCasual: number
  courseStandard: number
  coursePremium: number
  isHoliday: boolean
}

/** 発注推定: 発注スケジュール */
export interface OrderEstimateSchedule {
  deadlineDow: number
  deliveryDow: number
  upliftWeekday: number
  upliftHoliday: number
}

export interface OrderEstimateParams {
  skewers: Skewer[]
  dailyData: OrderEstimateDay[]
  /** skewerId -> 現在庫本数。未指定の串は在庫控除なし */
  stocks: Record<string, number>
  schedules: OrderEstimateSchedule[]
  /** schedules が空のときのフォールバック上振れ率 */
  upliftWeekday?: number
  upliftHoliday?: number
}

/** 発注推定: 1串あたりの結果 */
export interface OrderEstimateItem {
  skewerId: string
  name: string
  category: string
  totalUsage: number
  upliftedUsage: number
  requiredMaterialG: number | null
  orderQty: number | null
  orderUnitLabel: string
  orderQtyWithStock: number | null
}

/** 発注推定: 納品回ごとのグループ */
export interface OrderEstimateGroup {
  scheduleIdx: number
  deliveryDow: number
  coverDayDows: number[]
  label?: string
  items: OrderEstimateItem[]
}

export interface OrderEstimateResult {
  groups: OrderEstimateGroup[]
}

/** 均等発注量: 1串あたりの結果 */
export interface EqualOrderQty {
  skewerId: string
  name: string
  orderUnitLabel: string
  avgOrderQty: number | null
  avgOrderQtyWithStock: number | null
}

// ============================================================
// 曜日別理想在庫の取得
// ============================================================

/** dayOfWeek（0=日, 1=月, ..., 6=土）に対応する理想在庫を返す */
const IDEAL_KEYS = [
  'ideal_sun', 'ideal_mon', 'ideal_tue', 'ideal_wed', 'ideal_thu', 'ideal_fri', 'ideal_sat',
] as const

export function idealByDow(skewer: Skewer, dayOfWeek: number): number {
  return Number(skewer[IDEAL_KEYS[dayOfWeek]] ?? 0)
}

// ============================================================
// 仕込み計算 — 純粋関数（テスト対象 / upgrade-spec §8 準拠）
// ============================================================

/**
 * レギュラー・つくね: 理想在庫を下回る分を単位の倍数で切り上げる。
 * GAS: needed = ideal - stock; if (needed > 0) prepAmount = ceil(needed/unit) * unit
 */
export function calcPrepRegular(stock: number, ideal: number, unit: number): number {
  const needed = ideal - stock
  if (needed <= 0) return 0
  return Math.ceil(needed / unit) * unit
}

/**
 * 日曜ブースト（レギュラーのみ・dayOfWeek≠0 のとき呼ぶ）。
 * GAS: ideal += Math.round(baseIdeal * (1 / daysUntilSunday)); daysUntilSunday = 7 - dayOfWeek
 */
export function calcSundayBoost(ideal: number, dayOfWeek: number): number {
  const daysUntilSunday = 7 - dayOfWeek
  return ideal + Math.round(ideal * (1 / daysUntilSunday))
}

/**
 * スペシャル・その他仕込み: 閾値方式。
 * GAS: if (stock <= threshold2) prep2; else if (stock <= threshold1) prep1; else 0
 */
export function calcPrepThreshold(
  stock: number,
  threshold1: number,
  prepAmount1: number,
  threshold2: number,
  prepAmount2: number,
): number {
  if (stock <= threshold2) return prepAmount2
  if (stock <= threshold1) return prepAmount1
  return 0
}

/**
 * 前日仕込み: 昆布締めアクション判定。
 * GAS: kombu→skewer_kombu / stock>=ideal→none / stock>threshold2→kombu / else→skewer_direct
 */
export function calcKombuAction(
  stock: number,
  isKombu: boolean,
  ideal: number,
  threshold2: number,
): KombuAction {
  if (isKombu) return 'skewer_kombu'
  if (stock >= ideal) return 'none'
  if (stock > threshold2) return 'kombu'
  return 'skewer_direct'
}

// ============================================================
// 仕込み計算 — calcPrep オーケストレーター（GAS calcPrep の忠実移植）
// ============================================================

/**
 * 翌日分の仕込み指示を生成する。
 * @param skewers   対象の串（有効な串。副産物は内部でスキップ）
 * @param stocks    skewerId -> 在庫本数
 * @param dayOfWeek 翌日の曜日（0=日, 1=月, ..., 6=土）
 * @param options   sundayBoostEnabled / kombuFlags
 */
export function calcPrep(
  skewers: Skewer[],
  stocks: Record<string, number>,
  dayOfWeek: number,
  options: CalcPrepOptions,
): PrepResult[] {
  const kombuFlags = options.kombuFlags ?? {}
  const sundayBoost = options.sundayBoostEnabled

  // 日曜まで残り日数（GAS: dayOfWeek === 0 ? 0 : 7 - dayOfWeek）
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek

  const results: PrepResult[] = []

  for (const s of skewers) {
    const stock = Number(stocks[s.id] ?? 0)

    // 副産物は完全にスキップ
    if (s.category === '副産物') continue

    // 前日仕込み
    if (s.category === '前日仕込み') {
      const kombu = kombuFlags[s.id] || false
      const ideal = idealByDow(s, dayOfWeek)
      const action = calcKombuAction(stock, kombu, ideal, s.threshold2)
      results.push({
        skewerId: s.id,
        name: s.name,
        category: '前日仕込み',
        prepMethodName: s.prep_method_name || '昆布締め',
        stock,
        prepAmount: action !== 'none' ? 1 : 0,
        bags: 0,
        action,
      })
      continue
    }

    let prepAmount = 0
    let bags = 0

    if (s.category === 'レギュラー' || s.category === 'つくね') {
      // 曜日別理想在庫を使用
      const baseIdeal = idealByDow(s, dayOfWeek)
      let ideal = baseIdeal
      if (s.category === 'レギュラー' && sundayBoost && daysUntilSunday > 0) {
        ideal = calcSundayBoost(baseIdeal, dayOfWeek)
      }
      const unit = s.unit || (s.category === 'つくね' ? 40 : 20)
      const needed = ideal - stock
      if (needed > 0) {
        bags = Math.ceil(needed / unit)
        prepAmount = bags * unit
      }
    } else {
      // スペシャル・その他仕込み（閾値計算）
      prepAmount = calcPrepThreshold(
        stock,
        s.threshold1,
        s.prep_amount1,
        s.threshold2,
        s.prep_amount2,
      )
    }

    results.push({
      skewerId: s.id,
      name: s.name,
      category: s.category,
      stock,
      prepAmount,
      bags,
    })
  }

  return results
}

// ============================================================
// 単位変換表示（GAS unitDisplay の忠実移植）
// ============================================================

/**
 * 仕込み量・在庫を表示用文字列に変換する。
 * GAS: レギュラー/前日仕込み → round(amount/20)+'P' / つくね → B または 本 / その他 → 本
 */
export function unitDisplay(amount: number, category: string): string {
  if (category === 'レギュラー' || category === '前日仕込み') {
    return Math.round(amount / 20) + 'P'
  }
  if (category === 'つくね') {
    return amount % 40 === 0 ? amount / 40 + 'B' : amount + '本'
  }
  return amount + '本'
}

// ============================================================
// 表示用フォーマット（仕込みダッシュボード等で使用）
// ============================================================

/** 前日仕込みのアクションを表示文字列にする */
export function kombuActionText(action: KombuAction, methodName: string): string {
  switch (action) {
    case 'skewer_kombu':
      return `串うち（${methodName}済み）`
    case 'kombu':
      return `${methodName}開始`
    case 'skewer_direct':
      return `${methodName}なし・直接串うち`
    case 'none':
      return '仕込みなし'
  }
}

/**
 * calcPrep の結果を「仕込み推奨量」の表示文字列にする。
 * buildLineMessage の「仕込みあり」行と同じ規則。
 */
export function formatPrepAmount(result: PrepResult): string {
  if (result.category === '前日仕込み') {
    return kombuActionText(result.action ?? 'none', result.prepMethodName ?? '昆布締め')
  }
  if (result.prepAmount === 0) return '仕込みなし'
  if (result.category === 'レギュラー') return `${result.bags}P`
  return unitDisplay(result.prepAmount, result.category)
}

/**
 * 在庫を表示文字列にする。
 * その他仕込みは 999=「仕込み中」/ それ以外=「なし」。
 */
export function formatStockDisplay(category: SkewerCategory, stock: number): string {
  if (category === 'その他仕込み') return stock >= 999 ? '仕込み中' : 'なし'
  return unitDisplay(stock, category)
}

// ============================================================
// LINEメッセージ生成（GAS buildLineMessage の忠実移植）
// ============================================================

/**
 * LINE通知メッセージを生成する。
 * @param prepResults calcPrep の結果
 * @param reportData  当日の実績
 * @param staffName   焼師名
 * @param now         基準日時（省略時は現在時刻。翌日 = now + 1日）
 */
export function buildLineMessage(
  prepResults: PrepResult[],
  reportData: LineReportData,
  staffName: string,
  now: Date = new Date(),
): string {
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const weekDays = ['日', '月', '火', '水', '木', '金', '土']
  const fmt = (d: Date): string =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/` +
    `${String(d.getDate()).padStart(2, '0')}(${weekDays[d.getDay()]})`
  const tomorrowLabel = fmt(tomorrow)
  const todayLabel = fmt(now)

  const SEP = '──────────────'

  // 仕込みあり / 仕込みなし
  const needPrep = prepResults.filter((r) => r.prepAmount > 0)
  const noPrep = prepResults.filter((r) => r.prepAmount === 0)

  let msg = `🍢 明日の仕込み ${tomorrowLabel}\n${SEP}\n`

  if (needPrep.length === 0) {
    msg += `✅ 本日は全串仕込みなし\n`
  } else {
    needPrep.forEach((item) => {
      if (item.category === 'レギュラー') {
        msg += `◆ ${item.name}  ${item.bags}P\t(在庫${unitDisplay(item.stock, 'レギュラー')})\n`
      } else if (item.category === '前日仕込み') {
        const pm = item.prepMethodName || '昆布締め'
        const actionText = kombuActionText(item.action ?? 'skewer_direct', pm)
        msg += `◆ ${item.name}  ${actionText}\t(在庫${unitDisplay(item.stock, '前日仕込み')})\n`
      } else {
        msg += `◆ ${item.name}  ${unitDisplay(item.prepAmount, item.category)}\t(在庫${unitDisplay(item.stock, item.category)})\n`
      }
    })
  }

  // 仕込みなし（在庫数も表示）
  if (noPrep.length > 0) {
    msg += `${SEP}\n`
    noPrep.forEach((item) => {
      msg += `  ${item.name}  仕込みなし\t(在庫${unitDisplay(item.stock, item.category)})\n`
    })
  }

  // 当日の実績
  const totalSales = Number(reportData.totalSales || 0)
  const drinkRatio = Number(reportData.drinkRatio || 0)
  const casual = Number(reportData.courseCasual || 0)
  const standard = Number(reportData.courseStandard || 0)
  const premium = Number(reportData.coursePremium || 0)
  const extra = Number(reportData.extraSkewers || 0)
  const total = Number(reportData.totalSkewers || 0)

  msg += `${SEP}\n`
  msg += `📊 ${todayLabel}の実績\n`
  msg += `売上 ¥${totalSales.toLocaleString()}  ドリンク ${drinkRatio}%\n`
  msg += `C${casual}組 / S${standard}組 / P${premium}組  追加${extra}本\n`
  msg += `合計 ${total}本  焼師 ${staffName}`

  if (reportData.memo) {
    msg += `\n${SEP}\n📝 ${reportData.memo}`
  }

  return msg
}

// ============================================================
// 発注推定計算（GAS calculateOrderEstimate の忠実移植）
// ============================================================

export function calculateOrderEstimate(params: OrderEstimateParams): OrderEstimateResult {
  const skewers = params.skewers
  const dailyData = params.dailyData ?? []
  const stocks = params.stocks ?? {}
  const schedules = params.schedules ?? []

  // 納品スケジュール idx がカバーする曜日リストを返す
  function coverageDows(idx: number): number[] {
    if (schedules.length <= 1) return [0, 1, 2, 3, 4, 5, 6]
    const myDow = schedules[idx].deliveryDow
    const dows = schedules
      .map((s) => s.deliveryDow)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => a - b)
    const myPos = dows.indexOf(myDow)
    if (myPos < 0) return [0, 1, 2, 3, 4, 5, 6]
    const nextDow = dows[(myPos + 1) % dows.length]
    const days: number[] = []
    let d = myDow
    while (d !== nextDow) {
      days.push(d)
      d = (d + 1) % 7
    }
    return days
  }

  // dailyData のサブセットと上振れ率から串ごとの発注データを計算
  function computeItems(
    filteredDays: OrderEstimateDay[],
    upliftWeekday: number,
    upliftHoliday: number,
  ): OrderEstimateItem[] {
    const safeNum = (n: number | null): number | null =>
      n === null || isNaN(n) ? null : n

    return skewers.map((s) => {
      const courseType = s.course_type || 'all_courses'
      const targetCourses = s.target_courses ?? []
      let totalUsage = 0
      let upliftedUsage = 0

      filteredDays.forEach((day) => {
        const casual = Number(day.courseCasual || 0)
        const standard = Number(day.courseStandard || 0)
        const premium = Number(day.coursePremium || 0)
        let dayUsage = 0
        if (courseType === 'all_courses') {
          dayUsage = casual + standard + premium
        } else if (courseType === 'specific_courses') {
          if (targetCourses.indexOf('casual') >= 0) dayUsage += casual
          if (targetCourses.indexOf('standard') >= 0) dayUsage += standard
          if (targetCourses.indexOf('premium') >= 0) dayUsage += premium
        }
        totalUsage += dayUsage
        const rate = day.isHoliday ? upliftHoliday : upliftWeekday
        upliftedUsage += dayUsage * (1 + (isNaN(rate) ? 0 : rate))
      })

      upliftedUsage = Math.round(upliftedUsage)
      const wg = Number(s.weight_per_stick_g || 0)
      const yr = Number(s.yield_rate || 1) || 1
      const ug = Number(s.order_unit_g || 0)
      let requiredMaterialG: number | null = null
      let orderQty: number | null = null
      let orderQtyWithStock: number | null = null

      if (wg > 0 && ug > 0) {
        const safeUplift = isNaN(upliftedUsage) ? 0 : upliftedUsage
        requiredMaterialG = Math.round((safeUplift * wg) / yr)
        orderQty = Math.ceil(requiredMaterialG / ug)
        const stockVal = Number(stocks[s.id] !== undefined ? stocks[s.id] : -1)
        if (stockVal >= 0) {
          const remainAfterG = Math.max(0, requiredMaterialG - (stockVal * wg) / yr)
          orderQtyWithStock = Math.ceil(remainAfterG / ug)
        }
      }

      return {
        skewerId: s.id,
        name: String(s.name || ''),
        category: String(s.category || ''),
        totalUsage: Number(totalUsage) || 0,
        upliftedUsage: Number(isNaN(upliftedUsage) ? 0 : upliftedUsage),
        requiredMaterialG: safeNum(requiredMaterialG),
        orderQty: safeNum(orderQty),
        orderUnitLabel: String(s.order_unit_label || ''),
        orderQtyWithStock: safeNum(orderQtyWithStock),
      }
    })
  }

  // スケジュールなし: 全日・単一上振れ率で計算（後方互換）
  if (schedules.length === 0) {
    const uw = isNaN(Number(params.upliftWeekday)) ? 0.1 : Number(params.upliftWeekday)
    const uh = isNaN(Number(params.upliftHoliday)) ? 0.15 : Number(params.upliftHoliday)
    return {
      groups: [
        {
          scheduleIdx: 0,
          deliveryDow: -1,
          coverDayDows: [],
          label: '発注推奨量',
          items: computeItems(dailyData, uw, uh),
        },
      ],
    }
  }

  // 複数スケジュール: 各回のカバー日で分けて計算
  const groups = schedules.map((sch, idx) => {
    const coverDows = coverageDows(idx)
    const filteredDays = dailyData.filter((d) => coverDows.indexOf(d.dayOfWeek) >= 0)
    const uw = isNaN(Number(sch.upliftWeekday)) ? 0.1 : Number(sch.upliftWeekday)
    const uh = isNaN(Number(sch.upliftHoliday)) ? 0.15 : Number(sch.upliftHoliday)
    return {
      scheduleIdx: idx,
      deliveryDow: Number(sch.deliveryDow),
      coverDayDows: coverDows,
      items: computeItems(filteredDays, uw, uh),
    }
  })

  return { groups }
}

// ============================================================
// 均等発注量（GAS order.html の最下部表示ロジックを移植）
// ============================================================

/**
 * 複数スケジュール時、各串の発注量をスケジュール数で平均する。
 * order.html: requiredMaterialG が null の grp item はスキップ、
 *             avg = round(Σ orderQty / 有効件数)
 */
export function calcEqualOrderQty(groups: OrderEstimateGroup[]): EqualOrderQty[] {
  if (groups.length <= 1) return []

  const map = new Map<
    string,
    { name: string; label: string; qtys: (number | null)[]; stockQtys: (number | null)[] }
  >()

  for (const g of groups) {
    for (const it of g.items) {
      if (it.requiredMaterialG == null) continue
      if (!map.has(it.skewerId)) {
        map.set(it.skewerId, {
          name: it.name,
          label: it.orderUnitLabel || '',
          qtys: [],
          stockQtys: [],
        })
      }
      const e = map.get(it.skewerId)!
      e.qtys.push(it.orderQty != null ? Number(it.orderQty) : null)
      e.stockQtys.push(it.orderQtyWithStock != null ? Number(it.orderQtyWithStock) : null)
    }
  }

  const result: EqualOrderQty[] = []
  for (const [skewerId, sm] of map) {
    const validQ = sm.qtys.filter((q): q is number => q !== null)
    const avg =
      validQ.length > 0
        ? Math.round(validQ.reduce((a, b) => a + b, 0) / validQ.length)
        : null
    const validS = sm.stockQtys.filter((q): q is number => q !== null)
    const avgS =
      validS.length > 0
        ? Math.round(validS.reduce((a, b) => a + b, 0) / validS.length)
        : null
    result.push({
      skewerId,
      name: sm.name,
      orderUnitLabel: sm.label,
      avgOrderQty: avg,
      avgOrderQtyWithStock: avgS,
    })
  }
  return result
}

// ============================================================
// 営業後入力 関連の計算（current-spec §3 / GAS submitDailyReport 準拠）
// ============================================================

/**
 * 合計串本数を計算する。
 * current-spec §3:
 *   totalSkewers = casual×casualSkewers + standard×standardSkewers
 *                + premium×premiumSkewers + extraSkewers
 */
export function calcTotalSkewers(
  courses: { casual: number; standard: number; premium: number; extra: number },
  perCourse: { casual: number; standard: number; premium: number },
): number {
  return (
    courses.casual * perCourse.casual +
    courses.standard * perCourse.standard +
    courses.premium * perCourse.premium +
    courses.extra
  )
}

/**
 * ドリンク売上を計算する。
 * GAS submitDailyReport: drinkSales = round(totalSales × drinkRatio / 100)
 */
export function calcDrinkSales(totalSales: number, drinkRatio: number): number {
  return Math.round((totalSales * drinkRatio) / 100)
}

/**
 * カテゴリ別の入力値を在庫本数（本）に変換する。
 * GAS processFormResponse 準拠（20・40 をハードコード）:
 *   - レギュラー / 前日仕込み: 入力P × 20
 *   - つくね:                入力B × 40
 *   - スペシャル:            入力本数そのまま
 *   - その他仕込み:          仕込み中=999 / なし=0
 *
 * @param category    串カテゴリ
 * @param rawValue    入力値（P / B / 本。その他仕込みでは無視）
 * @param isPreparing その他仕込みの「仕込み中」チェック状態
 */
export function inputToStockSticks(
  category: SkewerCategory,
  rawValue: number,
  isPreparing: boolean,
): number {
  if (category === 'その他仕込み') return isPreparing ? 999 : 0
  if (category === 'レギュラー' || category === '前日仕込み') return rawValue * 20
  if (category === 'つくね') return rawValue * 40
  return rawValue // スペシャル
}

export interface CourseBreakdown {
  casual: number
  standard: number
  premium: number
}

/**
 * 来客総数とコース比率からコース別組数を按分する。
 * GAS order.html computeBreakdown の忠実移植:
 *   casual   = round(total × casual比率 / 比率合計)
 *   standard = round(total × standard比率 / 比率合計)
 *   premium  = max(0, total - casual - standard)
 */
export function computeCourseBreakdown(
  total: number,
  ratios: { casual: number; standard: number; premium: number },
): CourseBreakdown {
  const sum = ratios.casual + ratios.standard + ratios.premium
  if (sum === 0 || total === 0) return { casual: 0, standard: 0, premium: 0 }
  const casual = Math.round((total * ratios.casual) / sum)
  const standard = Math.round((total * ratios.standard) / sum)
  const premium = Math.max(0, total - casual - standard)
  return { casual, standard, premium }
}
