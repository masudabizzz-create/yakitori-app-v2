import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { calcTotalSkewers, calcDrinkSales, inputToStockSticks } from '@/composables/useInventoryCalc'
import type { DailyInputForm, DailyLog, DailyLogStock, Skewer } from '@/types'

const DRAFT_KEY = 'yakitori_input_draft_v2'

const DOW_NAMES = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜']

/** yyyy-MM-dd（ローカル日付。toISOString はタイムゾーンでズレるため使わない） */
function formatDateYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** daily_log_stocks に保存する1行（skewer_id 解決前） */
export interface SubmitStockRow {
  skewerId: string
  stock: number
  is_kombu: boolean
}

/** daily_logs に upsert する行 */
export interface DailyLogRow {
  tenant_id: string
  log_date: string
  day_of_week: string
  staff_name: string
  recorded_at: string
  course_casual: number
  course_standard: number
  course_premium: number
  extra_skewers: number
  total_skewers: number
  total_sales: number
  drink_sales: number
  drink_ratio: number
  memo: string
}

export interface SubmitContext {
  tenantId: string
  /** 有効な串（副産物含む。副産物は在庫保存対象外として内部で除外） */
  skewers: Skewer[]
  perCourse: { casual: number; standard: number; premium: number }
  /** 基準日時（省略時は現在時刻） */
  now?: Date
}

export interface DailyLogPayload {
  logRow: DailyLogRow
  stockRows: SubmitStockRow[]
}

/**
 * 営業後入力フォームから Supabase 保存用のペイロードを構築する（純粋関数）。
 * GAS submitDailyReport の保存ロジックを移植。
 */
export function buildSubmitPayload(form: DailyInputForm, ctx: SubmitContext): DailyLogPayload {
  const now = ctx.now ?? new Date()

  const totalSkewers = calcTotalSkewers(
    {
      casual: form.courseCasual,
      standard: form.courseStandard,
      premium: form.coursePremium,
      extra: form.extraSkewers,
    },
    ctx.perCourse,
  )
  const drinkSales = calcDrinkSales(form.totalSales, form.drinkRatio)

  const logRow: DailyLogRow = {
    tenant_id: ctx.tenantId,
    log_date: formatDateYmd(now),
    day_of_week: DOW_NAMES[now.getDay()],
    staff_name: form.staffName,
    recorded_at: now.toISOString(),
    course_casual: form.courseCasual,
    course_standard: form.courseStandard,
    course_premium: form.coursePremium,
    extra_skewers: form.extraSkewers,
    total_skewers: totalSkewers,
    total_sales: form.totalSales,
    drink_sales: drinkSales,
    drink_ratio: form.drinkRatio,
    memo: form.memo,
  }

  // 副産物は在庫保存対象外（current-spec §2: daily_log は副産物を除く）
  const stockRows: SubmitStockRow[] = ctx.skewers
    .filter((s) => s.category !== '副産物')
    .map((s) => {
      const input = form.skewerInputs[s.id] ?? { value: 0, isKombu: false, isPreparing: false }
      return {
        skewerId: s.id,
        stock: inputToStockSticks(s.category, input.value, input.isPreparing),
        is_kombu: input.isKombu,
      }
    })

  return { logRow, stockRows }
}

/**
 * 日次ログストア
 */
// ── 串在庫サマリー型 ──────────────────────────────────────────────
export interface SkewerStockSummary {
  skewerId: string
  name: string
  category: string
  /** 期間中の平均在庫本数（P単位） */
  avgStock: number
  /** 在庫が 0 だった日数 */
  zeroCount: number
  /** 記録日数 */
  recordCount: number
}

export const useDailyLogStore = defineStore('dailyLog', () => {
  const submitting = ref(false)
  const latestLog = ref<DailyLog | null>(null)
  const latestStocks = ref<DailyLogStock[]>([])
  const loadingLatest = ref(false)
  const logs = ref<DailyLog[]>([])
  const loadingLogs = ref(false)
  const skewerStocks = ref<SkewerStockSummary[]>([])
  const loadingStocks = ref(false)

  /**
   * 営業後入力を Supabase に保存する。
   * daily_logs は (tenant_id, log_date) で upsert、daily_log_stocks は洗い替え。
   */
  async function submitDailyReport(
    form: DailyInputForm,
    ctx: SubmitContext,
  ): Promise<{ log: DailyLog; stockRows: SubmitStockRow[] }> {
    submitting.value = true
    try {
      const { logRow, stockRows } = buildSubmitPayload(form, ctx)

      const { data: logData, error: logErr } = await supabase
        .from('daily_logs')
        .upsert(logRow, { onConflict: 'tenant_id,log_date' })
        .select()
        .single()
      if (logErr) throw new Error(logErr.message)
      const log = logData as DailyLog

      // 在庫スナップショットを洗い替え
      await supabase.from('daily_log_stocks').delete().eq('daily_log_id', log.id)
      if (stockRows.length > 0) {
        const rows = stockRows.map((r) => ({
          daily_log_id: log.id,
          skewer_id: r.skewerId,
          stock: r.stock,
          is_kombu: r.is_kombu,
        }))
        const { error: stockErr } = await supabase.from('daily_log_stocks').insert(rows)
        if (stockErr) throw new Error(stockErr.message)
      }

      return { log, stockRows }
    } finally {
      submitting.value = false
    }
  }

  /**
   * 最新の daily_log と在庫スナップショット（daily_log_stocks）を取得する。
   * 仕込みダッシュボードで使用。
   */
  async function fetchLatest(): Promise<void> {
    loadingLatest.value = true
    try {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*, daily_log_stocks(*)')
        .order('log_date', { ascending: false })
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (data) {
        const { daily_log_stocks, ...log } = data as DailyLog & {
          daily_log_stocks?: DailyLogStock[]
        }
        latestLog.value = log as DailyLog
        latestStocks.value = daily_log_stocks ?? []
      } else {
        latestLog.value = null
        latestStocks.value = []
      }
    } finally {
      loadingLatest.value = false
    }
  }

  /**
   * 直近 limit 件の daily_log を取得する（log_date 降順 = 新しい順）。
   * 分析・集計で使用。GAS getAnalyticsData と同様、件数（日数ではなく行数）で絞る。
   */
  async function fetchRecentLogs(limit: number): Promise<void> {
    loadingLogs.value = true
    try {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .order('log_date', { ascending: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      logs.value = (data ?? []) as DailyLog[]
    } finally {
      loadingLogs.value = false
    }
  }

  /**
   * 指定した daily_log ID 群の在庫スナップショットを取得し、串ごとに集計する。
   * 分析画面の「串ランキング」で使用。副産物は除外する。
   */
  async function fetchSkewerStocks(logIds: string[]): Promise<void> {
    if (logIds.length === 0) {
      skewerStocks.value = []
      return
    }
    loadingStocks.value = true
    try {
      const { data, error } = await supabase
        .from('daily_log_stocks')
        .select('stock, skewer_id, skewers(name, category)')
        .in('daily_log_id', logIds)
      if (error) throw new Error(error.message)

      // skewer_id ごとに集計
      const agg: Record<
        string,
        { name: string; category: string; stocks: number[] }
      > = {}
      for (const row of (data ?? []) as unknown as Array<{
        stock: number
        skewer_id: string
        skewers: { name: string; category: string } | null
      }>) {
        const id = row.skewer_id
        if (!agg[id]) {
          agg[id] = {
            name: row.skewers?.name ?? '',
            category: row.skewers?.category ?? '',
            stocks: [],
          }
        }
        agg[id].stocks.push(row.stock)
      }

      skewerStocks.value = Object.entries(agg)
        .map(([skewerId, { name, category, stocks }]) => ({
          skewerId,
          name,
          category,
          avgStock: Math.round(stocks.reduce((a, b) => a + b, 0) / stocks.length),
          zeroCount: stocks.filter((s) => s === 0).length,
          recordCount: stocks.length,
        }))
        .filter((s) => s.name && s.category !== '副産物')
        .sort((a, b) => b.zeroCount - a.zeroCount || a.avgStock - b.avgStock)
    } finally {
      loadingStocks.value = false
    }
  }

  // ---------------- localStorage 下書き（オフライン退避） ----------------

  function saveDraft(form: DailyInputForm): void {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
    } catch {
      // 保存失敗は無視（容量超過など）
    }
  }

  function loadDraft(): DailyInputForm | null {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as DailyInputForm
    } catch {
      return null
    }
  }

  function clearDraft(): void {
    localStorage.removeItem(DRAFT_KEY)
  }

  return {
    submitting,
    latestLog,
    latestStocks,
    loadingLatest,
    logs,
    loadingLogs,
    skewerStocks,
    loadingStocks,
    submitDailyReport,
    fetchLatest,
    fetchRecentLogs,
    fetchSkewerStocks,
    saveDraft,
    loadDraft,
    clearDraft,
  }
})
