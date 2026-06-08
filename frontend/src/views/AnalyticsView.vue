<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDailyLogStore } from '@/stores/dailyLog'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import VisitingBanner from '@/components/VisitingBanner.vue'
import {
  summarize,
  courseShares,
  calcPeriodComparison,
  calcRealCustomerMetrics,
  calcSalesTrendLine,
  calcSufficiency,
  alignToPeriod,
  getAnalyticsSummary,
} from '@/composables/useAnalytics'
import {
  getPeriodRange,
  getPrevPeriod,
  getYoyPeriod,
  getTrendFetchRange,
  jstTodayYmd,
  SCOPE_LABELS,
  type Scope,
} from '@/composables/usePeriodRange'
import type { DailyLog } from '@/types'
import {
  ChevronLeft,
  ChevronRight,
  BarChart2,
  ClipboardList,
  TrendingUp,
} from 'lucide-vue-next'
import PeriodPicker from '@/components/PeriodPicker.vue'

const router = useRouter()
const dailyLogStore = useDailyLogStore()
const settingsStore = useSettingsStore()
const auth = useAuthStore()

// ─── 状態 ─────────────────────────────────────────────────────────
const scope = ref<Scope>('week')
const offset = ref(0)
const activeTab = ref<'analysis' | 'log'>('analysis')
const loading = ref(false)
const loadError = ref('')

const currentLogs = ref<DailyLog[]>([])
const prevLogs = ref<DailyLog[]>([])
const yoyLogs = ref<DailyLog[]>([])
const trendLogs = ref<DailyLog[]>([])

/** 日次ログ行の展開状態 */
const expandedRows = ref<Set<string>>(new Set())
function toggleRow(id: string) {
  const next = new Set(expandedRows.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expandedRows.value = next
}

/** 期間ピッカー表示状態 */
const showPeriodPicker = ref(false)

// ─── 期間計算 ─────────────────────────────────────────────────────
const currentPeriod = computed(() => getPeriodRange(scope.value, offset.value))

/** 今期が進行中か（末日が今日以降） */
const isInProgress = computed(() => currentPeriod.value.to >= jstTodayYmd())

/** 進行中なら前期・昨対ログを今期経過営業日数に揃える */
const alignedPrevLogs = computed(() =>
  isInProgress.value ? alignToPeriod(currentLogs.value, prevLogs.value) : prevLogs.value,
)
const alignedYoyLogs = computed(() =>
  isInProgress.value ? alignToPeriod(currentLogs.value, yoyLogs.value) : yoyLogs.value,
)

// ─── 集計 ─────────────────────────────────────────────────────────
const summary = computed(() => summarize(currentLogs.value))
const shares = computed(() => courseShares(summary.value))
const rcm = computed(() => calcRealCustomerMetrics(currentLogs.value))
const sufficiency = computed(() =>
  calcSufficiency(currentLogs.value, alignedPrevLogs.value, alignedYoyLogs.value),
)
const comparison = computed(() =>
  sufficiency.value.hasSufficientPrev
    ? calcPeriodComparison(currentLogs.value, alignedPrevLogs.value)
    : null,
)
const trendData = computed(() => calcSalesTrendLine(trendLogs.value, scope.value))

// AI JSON（将来用）
const analyticsSummaryJson = computed(() =>
  getAnalyticsSummary(
    currentLogs.value,
    alignedPrevLogs.value,
    scope.value,
    alignedYoyLogs.value,
    currentPeriod.value.label,
  ),
)
defineExpose({ analyticsSummaryJson })

// 月次目標
const monthlyTarget = computed(() => settingsStore.settings?.monthly_sales_target ?? 0)
const currentMonthSales = computed(() => {
  const ym = new Date().toISOString().slice(0, 7)
  return currentLogs.value
    .filter((r) => r.log_date.startsWith(ym))
    .reduce((a, r) => a + r.total_sales, 0)
})
const monthlyProgress = computed(() =>
  monthlyTarget.value > 0
    ? Math.min(Math.round((currentMonthSales.value / monthlyTarget.value) * 100), 100)
    : 0,
)

// ─── データ読み込み ────────────────────────────────────────────────
async function loadData() {
  loading.value = true
  loadError.value = ''
  expandedRows.value = new Set()
  try {
    const tenantId = auth.effectiveTenantId
    if (!tenantId) throw new Error('テナントが未選択です')

    const cp = getPeriodRange(scope.value, offset.value)
    const pp = getPrevPeriod(scope.value, offset.value)
    const yp = getYoyPeriod(scope.value, offset.value)
    const tr = getTrendFetchRange(scope.value, offset.value)

    const [trendData, prevData, yoyData] = await Promise.all([
      dailyLogStore.fetchByDateRange(tenantId, tr.from, tr.to),
      dailyLogStore.fetchByDateRange(tenantId, pp.from, pp.to),
      yp
        ? dailyLogStore.fetchByDateRange(tenantId, yp.from, yp.to)
        : Promise.resolve([] as DailyLog[]),
    ])

    trendLogs.value = trendData
    currentLogs.value = trendData.filter(
      (l) => l.log_date >= cp.from && l.log_date <= cp.to,
    )
    prevLogs.value = prevData
    yoyLogs.value = yoyData
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '読み込みに失敗しました'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await settingsStore.fetchSettings()
  await loadData()
})

watch([scope, offset], loadData)

// ─── 期間ナビ ─────────────────────────────────────────────────────
function goBack() { offset.value++ }
function goForward() { if (offset.value > 0) offset.value-- }
function changeScope(s: Scope) {
  scope.value = s
  offset.value = 0
}

// ─── 前期比較ページへ遷移 ─────────────────────────────────────────
function goCompare(anchor = '') {
  router.push({
    name: 'analytics-compare',
    query: {
      scope: scope.value,
      offset: String(offset.value),
      ...(anchor ? { anchor } : {}),
    },
  })
}

// ─── ユーティリティ ────────────────────────────────────────────────
function shortDate(ymd: string): string {
  const p = ymd.split('-')
  return `${Number(p[1])}/${Number(p[2])}`
}

function compBadgeClass(direction: '↑' | '↓' | '→') {
  if (direction === '↑')
    return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
  if (direction === '↓')
    return 'bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20'
  return 'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border-neutral-500/20'
}

// 客数: 実入力があればそちら、なければコース合計
function logGuests(r: DailyLog): number | null {
  return r.guests_count ?? null
}
function logGuestDisplay(r: DailyLog): string {
  const g = logGuests(r)
  return g !== null ? `${g}名` : `${r.course_casual + r.course_standard + r.course_premium}組`
}
// 客単価: guests_count があれば使用、なければコース合計ベース
function logUnitPrice(r: DailyLog): string {
  const guests = r.guests_count
  const groups = r.groups_count
  const base = guests ?? groups ?? (r.course_casual + r.course_standard + r.course_premium)
  return base > 0 ? `¥${Math.round(r.total_sales / base).toLocaleString()}` : '—'
}

// 天気コード → 簡易ラベル
function weatherLabel(code: number | null | undefined): string {
  if (code == null) return ''
  if (code === 0) return '快晴'
  if (code <= 3) return '晴れ'
  if (code <= 49) return '霧'
  if (code <= 69) return '雨'
  if (code <= 79) return '雪'
  if (code <= 99) return '雷雨'
  return ''
}

// 折れ線グラフ SVG ポイント計算
const CHART_W = 300
const CHART_H = 70
const trendMax = computed(() => Math.max(...trendData.value.map((d) => d.avgSales), 1))

function chartPoints(): string {
  const data = trendData.value
  if (data.length < 2) return ''
  return data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * CHART_W
      const y = CHART_H - (d.avgSales / trendMax.value) * CHART_H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function chartAreaPath(): string {
  const data = trendData.value
  if (data.length < 2) return ''
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * CHART_W
    const y = CHART_H - (d.avgSales / trendMax.value) * CHART_H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} L ${CHART_W},${CHART_H} L 0,${CHART_H} Z`
}

function chartX(i: number, total: number): number {
  return total <= 1 ? CHART_W / 2 : (i / (total - 1)) * CHART_W
}
function chartY(avgSales: number): number {
  return CHART_H - (avgSales / trendMax.value) * CHART_H
}

// Y軸グリッドライン生成（5本）
const chartGridLines = computed(() => {
  const max = trendMax.value
  const lines: Array<{ y: number; value: number; label: string }> = []
  for (let i = 0; i <= 4; i++) {
    const value = (max / 4) * i
    const y = CHART_H - (value / max) * CHART_H
    const label = value >= 1000 ? `¥${Math.round(value / 1000)}k` : `¥${Math.round(value)}`
    lines.push({ y, value, label })
  }
  return lines
})

const SCOPES: Scope[] = ['day', 'week', 'month', 'quarter', 'year']
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-8">
    <!-- ヘッダー -->
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
      <VisitingBanner />
      <div class="max-w-lg mx-auto px-4 pt-3 pb-1 flex items-center gap-2">
        <router-link
          to="/"
          class="flex items-center gap-0.5 text-sm text-neutral-400 dark:text-neutral-500
                 hover:text-neutral-600 dark:hover:text-neutral-300 shrink-0"
        >
          <ChevronLeft :size="16" />ホーム
        </router-link>
        <h1 class="text-base font-semibold text-neutral-900 dark:text-neutral-50 flex-1 truncate">
          分析・集計
        </h1>
      </div>
      <!-- タブ -->
      <div class="max-w-lg mx-auto px-4 flex">
        <button
          type="button"
          class="flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5"
          :class="activeTab === 'analysis'
            ? 'border-brand-500 text-brand-500'
            : 'border-transparent text-neutral-400 dark:text-neutral-500'"
          @click="activeTab = 'analysis'"
        >
          <BarChart2 :size="14" />分析
        </button>
        <button
          type="button"
          class="flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5"
          :class="activeTab === 'log'
            ? 'border-brand-500 text-brand-500'
            : 'border-transparent text-neutral-400 dark:text-neutral-500'"
          @click="activeTab = 'log'"
        >
          <ClipboardList :size="14" />ログ
        </button>
      </div>
    </header>

    <main class="max-w-lg mx-auto px-4 py-4 space-y-3">
      <!-- スコープ選択 -->
      <div class="flex gap-1.5">
        <button
          v-for="s in SCOPES"
          :key="s"
          type="button"
          class="flex-1 py-2 rounded-xl text-xs font-medium border transition-colors"
          :class="scope === s
            ? 'bg-brand-500 text-white border-brand-500'
            : 'bg-card dark:bg-card-dark text-neutral-500 dark:text-neutral-400 border-edge dark:border-edge-dark'"
          @click="changeScope(s)"
        >
          {{ SCOPE_LABELS[s] }}
        </button>
      </div>

      <!-- 期間ナビ -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 dark:text-neutral-400
                 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          @click="goBack"
        >
          <ChevronLeft :size="16" />
        </button>
        <button
          type="button"
          class="flex-1 text-center text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate
                 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg py-1.5 transition-colors"
          @click="showPeriodPicker = true"
        >
          {{ currentPeriod.label }}
        </button>
        <button
          type="button"
          class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          :class="offset > 0
            ? 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            : 'text-neutral-200 dark:text-neutral-700 cursor-not-allowed'"
          :disabled="offset === 0"
          @click="goForward"
        >
          <ChevronRight :size="16" />
        </button>
      </div>

      <!-- 期間ピッカー -->
      <PeriodPicker
        :scope="scope"
        v-model="offset"
        :open="showPeriodPicker"
        @cancel="showPeriodPicker = false"
        @update:modelValue="showPeriodPicker = false"
      />

      <!-- ローディング -->
      <p v-if="loading" class="text-center text-neutral-400 dark:text-neutral-500 py-12">
        読み込み中...
      </p>
      <p
        v-else-if="loadError"
        class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"
      >
        {{ loadError }}
      </p>
      <div
        v-else-if="currentLogs.length === 0"
        class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-6 py-12 text-center space-y-3"
      >
        <ClipboardList :size="36" class="mx-auto text-neutral-300 dark:text-neutral-600" />
        <p class="text-sm text-neutral-400 dark:text-neutral-500">この期間のデータがありません</p>
      </div>

      <template v-else>
        <!-- ===== 分析タブ ===== -->
        <div v-show="activeTab === 'analysis'" class="space-y-3">

          <!-- 月次目標 -->
          <section
            v-if="monthlyTarget > 0 && (scope === 'month' || scope === 'day' || scope === 'week')"
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3"
          >
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs text-neutral-500 dark:text-neutral-400">今月の達成率</p>
              <p class="text-sm font-bold tabular-nums"
                :class="monthlyProgress >= 100 ? 'text-green-600 dark:text-green-400' : 'text-brand-500'">
                {{ monthlyProgress }}%
              </p>
            </div>
            <div class="h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500"
                :class="monthlyProgress >= 100 ? 'bg-green-500' : 'bg-brand-500'"
                :style="{ width: `${monthlyProgress}%` }"
              />
            </div>
            <div class="flex justify-between mt-1 text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
              <span>¥{{ currentMonthSales.toLocaleString() }}</span>
              <span>目標 ¥{{ monthlyTarget.toLocaleString() }}</span>
            </div>
          </section>

          <!-- ① 今期累計サマリー（売上・串） -->
          <div class="grid grid-cols-2 gap-3">
            <!-- 合計売上 -->
            <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3 space-y-1">
              <p class="text-xs text-neutral-500 dark:text-neutral-400">合計売上</p>
              <p class="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                ¥{{ summary.totalSales.toLocaleString() }}
              </p>
              <p class="text-xs text-neutral-400 dark:text-neutral-500">
                平均 ¥{{ summary.avgSales.toLocaleString() }}/日
              </p>
              <button
                v-if="comparison"
                type="button"
                class="inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-opacity hover:opacity-80"
                :class="compBadgeClass(comparison.sales.direction)"
                @click="goCompare('sales')"
              >
                {{ comparison.sales.direction }}{{ comparison.sales.pct > 0 ? '+' : '' }}{{ comparison.sales.pct }}%
              </button>
              <span v-else-if="currentLogs.length > 0" class="inline-block text-[10px] text-neutral-300 dark:text-neutral-600">データ不足</span>
            </div>
            <!-- 合計串本数 -->
            <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3 space-y-1">
              <p class="text-xs text-neutral-500 dark:text-neutral-400">合計串本数</p>
              <p class="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                {{ summary.totalSkewers.toLocaleString() }}<span class="text-sm text-neutral-400 dark:text-neutral-500">本</span>
              </p>
              <p class="text-xs text-neutral-400 dark:text-neutral-500">
                平均 {{ summary.avgSkewers }}本/日
              </p>
              <button
                v-if="comparison"
                type="button"
                class="inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-opacity hover:opacity-80"
                :class="compBadgeClass(comparison.skewers.direction)"
                @click="goCompare('skewers')"
              >
                {{ comparison.skewers.direction }}{{ comparison.skewers.pct > 0 ? '+' : '' }}{{ comparison.skewers.pct }}%
              </button>
              <span v-else-if="currentLogs.length > 0" class="inline-block text-[10px] text-neutral-300 dark:text-neutral-600">データ不足</span>
            </div>
          </div>

          <!-- ① 下段: 組数・客数・客単価 -->
          <div
            v-if="rcm.sampleCount > 0"
            class="grid grid-cols-3 gap-2"
          >
            <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-3 py-2.5 text-center space-y-0.5">
              <p class="text-[10px] text-neutral-400 dark:text-neutral-500">合計組数</p>
              <p class="text-lg font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                {{ rcm.totalGroups }}<span class="text-[10px] text-neutral-400">組</span>
              </p>
              <p class="text-[10px] text-neutral-400 dark:text-neutral-500">平均 {{ rcm.avgGroupsPerDay }}組/日</p>
              <button
                v-if="comparison && comparison.realGroups.prev > 0"
                type="button"
                class="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border transition-opacity hover:opacity-80"
                :class="compBadgeClass(comparison.realGroups.direction)"
                @click="goCompare('groups')"
              >
                {{ comparison.realGroups.direction }}{{ comparison.realGroups.pct > 0 ? '+' : '' }}{{ comparison.realGroups.pct }}%
              </button>
            </div>
            <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-3 py-2.5 text-center space-y-0.5">
              <p class="text-[10px] text-neutral-400 dark:text-neutral-500">合計客数</p>
              <p class="text-lg font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                {{ rcm.totalGuests }}<span class="text-[10px] text-neutral-400">名</span>
              </p>
              <p class="text-[10px] text-neutral-400 dark:text-neutral-500">平均 {{ rcm.avgGuestsPerDay }}名/日</p>
              <button
                v-if="comparison && comparison.realGuests.prev > 0"
                type="button"
                class="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border transition-opacity hover:opacity-80"
                :class="compBadgeClass(comparison.realGuests.direction)"
                @click="goCompare('guests')"
              >
                {{ comparison.realGuests.direction }}{{ comparison.realGuests.pct > 0 ? '+' : '' }}{{ comparison.realGuests.pct }}%
              </button>
            </div>
            <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-3 py-2.5 text-center space-y-0.5">
              <p class="text-[10px] text-neutral-400 dark:text-neutral-500">客単価</p>
              <p class="text-lg font-bold tabular-nums text-brand-500">
                ¥{{ rcm.avgSpendPerGuest.toLocaleString() }}
              </p>
              <button
                v-if="comparison && comparison.realUnitPrice.prev > 0"
                type="button"
                class="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border transition-opacity hover:opacity-80"
                :class="compBadgeClass(comparison.realUnitPrice.direction)"
                @click="goCompare('unitPrice')"
              >
                {{ comparison.realUnitPrice.direction }}{{ comparison.realUnitPrice.pct > 0 ? '+' : '' }}{{ comparison.realUnitPrice.pct }}%
              </button>
            </div>
          </div>

          <!-- ② 売上推移折れ線グラフ -->
          <section
            v-if="trendData.length >= 2"
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3"
          >
            <div class="flex items-center gap-2 mb-3">
              <TrendingUp :size="14" class="text-brand-500 shrink-0" />
              <p class="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                売上推移（1日あたり平均）
              </p>
            </div>
            <!-- SVG 折れ線 -->
            <div class="flex gap-1">
              <!-- Y軸ラベル -->
              <div class="flex flex-col justify-between shrink-0" style="width: 32px;">
                <span
                  v-for="line in chartGridLines.slice().reverse()"
                  :key="line.value"
                  class="text-[9px] text-neutral-400 dark:text-neutral-500 tabular-nums text-right"
                >{{ line.label }}</span>
              </div>
              <!-- グラフ本体 -->
              <svg
                :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
                class="flex-1"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgb(8,145,178)" stop-opacity="0.3" />
                    <stop offset="100%" stop-color="rgb(8,145,178)" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <!-- 横グリッドライン -->
                <line
                  v-for="line in chartGridLines"
                  :key="line.value"
                  x1="0"
                  :y1="line.y"
                  :x2="CHART_W"
                  :y2="line.y"
                  stroke="currentColor"
                  stroke-width="0.5"
                  class="text-neutral-200 dark:text-neutral-700"
                  stroke-dasharray="2,2"
                />
                <!-- エリア塗り -->
                <path :d="chartAreaPath()" fill="url(#chartGrad)" />
                <!-- ライン -->
                <polyline
                  :points="chartPoints()"
                  fill="none"
                  stroke="rgb(8,145,178)"
                  stroke-width="2"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
                <!-- データポイント -->
                <circle
                  v-for="(pt, i) in trendData"
                  :key="i"
                  :cx="chartX(i, trendData.length)"
                  :cy="chartY(pt.avgSales)"
                  r="3"
                  fill="rgb(8,145,178)"
                  :opacity="pt.count < 3 ? 0.4 : 1"
                />
              </svg>
            </div>
            <!-- X軸ラベル（間引き表示） -->
            <div class="flex gap-1 mt-1">
              <div class="shrink-0" style="width: 32px;"></div>
              <div class="flex justify-between flex-1 px-0.5">
                <template v-for="(pt, i) in trendData" :key="i">
                  <span
                    v-if="i === 0 || i === trendData.length - 1 || (trendData.length <= 8) || i % Math.ceil(trendData.length / 6) === 0"
                    class="text-[9px] text-neutral-400 dark:text-neutral-500 tabular-nums"
                    :style="{ opacity: pt.count < 3 ? 0.5 : 1 }"
                  >{{ pt.label }}</span>
                </template>
              </div>
            </div>
          </section>

          <!-- ③ コース内訳 -->
          <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
            <div class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-between">
              <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">コース内訳</h2>
              <button
                v-if="comparison"
                type="button"
                class="text-[11px] text-brand-500 hover:opacity-70 transition-opacity"
                @click="goCompare('courses')"
              >前期比 ›</button>
            </div>
            <div class="grid grid-cols-3 divide-x divide-edge dark:divide-edge-dark">
              <div v-for="c in shares" :key="c.label" class="px-2 py-3 text-center">
                <p class="text-2xl font-bold tabular-nums text-brand-500">{{ c.count }}</p>
                <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{{ c.label }}</p>
                <p class="text-xs text-neutral-400 dark:text-neutral-500">{{ c.rate }}%</p>
              </div>
            </div>
          </section>

          <!-- ④ ドリンク比率 -->
          <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3">
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-semibold text-neutral-700 dark:text-neutral-200">ドリンク比率（平均）</p>
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold tabular-nums text-neutral-700 dark:text-neutral-200">
                  {{ summary.avgDrink }}%
                </span>
                <button
                  v-if="comparison"
                  type="button"
                  class="text-[11px] text-brand-500 hover:opacity-70 transition-opacity"
                  @click="goCompare('drink')"
                >前期比 ›</button>
              </div>
            </div>
            <div class="h-5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 rounded-full flex items-center justify-end px-2"
                :style="{ width: `${Math.min(summary.avgDrink, 100)}%` }"
              >
                <span v-if="summary.avgDrink >= 15" class="text-[10px] text-white font-medium tabular-nums">
                  {{ summary.avgDrink }}%
                </span>
              </div>
            </div>
          </div>

          <!-- ⑤ 日次ログ（展開行付き） -->
          <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
            <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              日次ログ
            </h2>
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-[10px] text-neutral-500 dark:text-neutral-400 bg-black/[0.03] dark:bg-white/[0.04]">
                    <th class="px-2 py-1.5 text-left">日付</th>
                    <th class="px-1 py-1.5">曜</th>
                    <th class="px-2 py-1.5 text-right">売上</th>
                    <th class="px-2 py-1.5 text-center">コース</th>
                    <th class="px-2 py-1.5 text-center">客数</th>
                    <th class="px-2 py-1.5 text-right">客単価</th>
                    <th class="px-2 py-1.5 text-left">担当</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="r in currentLogs" :key="r.id">
                    <!-- メイン行 -->
                    <tr
                      class="border-t border-edge dark:border-edge-dark cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/30 transition-colors"
                      @click="toggleRow(r.id)"
                    >
                      <td class="px-2 py-2 text-neutral-500 dark:text-neutral-400">
                        {{ shortDate(r.log_date) }}
                      </td>
                      <td class="px-1 py-2 text-center">
                        <span :class="r.day_of_week === '日曜' ? 'text-red-500' : r.day_of_week === '土曜' ? 'text-blue-500 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-400'">
                          {{ r.day_of_week.replace('曜', '') }}
                        </span>
                      </td>
                      <td class="px-2 py-2 text-right font-medium tabular-nums"
                        :class="r.total_sales >= Math.max(...currentLogs.map(l => l.total_sales)) * 0.85
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-neutral-700 dark:text-neutral-200'">
                        ¥{{ r.total_sales.toLocaleString() }}
                      </td>
                      <td class="px-2 py-2 text-center tabular-nums text-neutral-500 dark:text-neutral-400">
                        {{ r.course_casual + r.course_standard + r.course_premium }}
                      </td>
                      <td class="px-2 py-2 text-center text-neutral-500 dark:text-neutral-400">
                        {{ logGuestDisplay(r) }}
                      </td>
                      <td class="px-2 py-2 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                        {{ logUnitPrice(r) }}
                      </td>
                      <td class="px-2 py-2 text-neutral-400 dark:text-neutral-500 truncate max-w-[4rem]">
                        {{ r.staff_name }}
                      </td>
                    </tr>
                    <!-- 展開行 -->
                    <tr
                      v-if="expandedRows.has(r.id)"
                      class="border-t border-edge dark:border-edge-dark bg-neutral-50/50 dark:bg-neutral-900/20"
                    >
                      <td colspan="7" class="px-4 py-2.5">
                        <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                          <!-- 外的要因 -->
                          <div v-if="r.weather_code != null" class="col-span-2 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span v-if="weatherLabel(r.weather_code)">天気: {{ weatherLabel(r.weather_code) }}</span>
                            <span v-if="r.temp_avg != null">気温: {{ r.temp_avg }}°C</span>
                            <span v-if="r.precip_mm != null">降水: {{ r.precip_mm }}mm</span>
                            <span v-if="r.humidity_avg != null">湿度: {{ r.humidity_avg }}%</span>
                            <span v-if="r.is_holiday" class="text-red-500">祝日</span>
                            <span v-if="r.is_pre_holiday" class="text-amber-500">祝前日</span>
                          </div>
                          <!-- 串・ドリンク・コース内訳 -->
                          <span>串本数: {{ r.total_skewers }}本</span>
                          <span>ドリンク: {{ r.drink_ratio }}%</span>
                          <span class="col-span-2">
                            C{{ r.course_casual }} / S{{ r.course_standard }} / P{{ r.course_premium }}
                            <template v-if="r.groups_count != null"> · {{ r.groups_count }}組</template>
                            <template v-if="r.guests_count != null"> {{ r.guests_count }}名</template>
                          </span>
                          <span v-if="r.memo" class="col-span-2 text-neutral-600 dark:text-neutral-300 italic">
                            「{{ r.memo }}」
                          </span>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- ===== ログタブ ===== -->
        <div v-show="activeTab === 'log'" class="space-y-3">
          <article
            v-for="r in currentLogs"
            :key="r.id"
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3"
          >
            <div class="flex items-center justify-between">
              <p class="font-bold text-neutral-900 dark:text-neutral-50">
                {{ shortDate(r.log_date) }}
                <span class="text-sm text-neutral-400 dark:text-neutral-500">{{ r.day_of_week }}</span>
              </p>
              <p class="text-lg font-bold tabular-nums text-brand-500">
                ¥{{ r.total_sales.toLocaleString() }}
              </p>
            </div>
            <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              <span>C{{ r.course_casual }} / S{{ r.course_standard }} / P{{ r.course_premium }}</span>
              <span>串 {{ r.total_skewers }}本</span>
              <span>ドリンク {{ r.drink_ratio }}%</span>
              <span>焼師 {{ r.staff_name }}</span>
            </div>
            <p
              v-if="r.memo"
              class="mt-2 text-sm text-neutral-600 dark:text-neutral-300 bg-black/[0.03] dark:bg-white/[0.04] rounded-lg px-3 py-2"
            >
              {{ r.memo }}
            </p>
          </article>
          <p v-if="currentLogs.every(r => !r.memo)" class="text-xs text-center text-neutral-400 dark:text-neutral-500 py-6">
            この期間にメモはありません
          </p>
        </div>
      </template>
    </main>
  </div>
</template>
