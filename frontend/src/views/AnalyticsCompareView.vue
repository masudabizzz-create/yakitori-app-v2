<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDailyLogStore } from '@/stores/dailyLog'
import { useAuthStore } from '@/stores/auth'
import VisitingBanner from '@/components/VisitingBanner.vue'
import {
  summarize,
  courseShares,
  calcPeriodComparison,
  calcRealCustomerMetrics,
  calcSufficiency,
  alignToPeriod,
  type CompareItem,
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
import { ChevronLeft } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const dailyLogStore = useDailyLogStore()
const auth = useAuthStore()

// ─── スコープ・オフセット（ページ内ローカル状態）──────────────────
// 遷移元のスコープを初期値として引き継ぐが、ページ内の変更はここで完結
const scope = ref<Scope>((route.query.scope as Scope) ?? 'week')
const offset = ref(Number(route.query.offset ?? 0))

const SCOPES: Scope[] = ['day', 'week', 'month', 'quarter', 'year']

// ─── ローカルデータ状態 ───────────────────────────────────────────
const loading = ref(false)
const loadError = ref('')
const currentLogs = ref<DailyLog[]>([])
const prevLogs    = ref<DailyLog[]>([])
const yoyLogs     = ref<DailyLog[]>([])
const trendLogs   = ref<DailyLog[]>([])

// ─── 期間 ─────────────────────────────────────────────────────────
const currentPeriod = computed(() => getPeriodRange(scope.value, offset.value))
const prevPeriod    = computed(() => getPrevPeriod(scope.value, offset.value))
const yoyPeriod     = computed(() => getYoyPeriod(scope.value, offset.value))

const isInProgress = computed(() => currentPeriod.value.to >= jstTodayYmd())

const alignedPrevLogs = computed(() =>
  isInProgress.value ? alignToPeriod(currentLogs.value, prevLogs.value) : prevLogs.value,
)
const alignedYoyLogs = computed(() =>
  isInProgress.value ? alignToPeriod(currentLogs.value, yoyLogs.value) : yoyLogs.value,
)

// ─── 集計 ─────────────────────────────────────────────────────────
const currSum   = computed(() => summarize(currentLogs.value))
const prevSum   = computed(() => summarize(alignedPrevLogs.value))
const yoySum    = computed(() => summarize(alignedYoyLogs.value))
const currRcm   = computed(() => calcRealCustomerMetrics(currentLogs.value))
const prevRcm   = computed(() => calcRealCustomerMetrics(alignedPrevLogs.value))
const currShares = computed(() => courseShares(currSum.value))
const prevShares = computed(() => courseShares(prevSum.value))
const yoyShares  = computed(() => courseShares(yoySum.value))
const sufficiency = computed(() =>
  calcSufficiency(currentLogs.value, alignedPrevLogs.value, alignedYoyLogs.value),
)
const comparison = computed(() =>
  sufficiency.value.hasSufficientPrev
    ? calcPeriodComparison(currentLogs.value, alignedPrevLogs.value)
    : null,
)
const yoyComparison = computed(() =>
  sufficiency.value.hasSufficientYoy
    ? calcPeriodComparison(currentLogs.value, alignedYoyLogs.value)
    : null,
)

// ─── データ読み込み ────────────────────────────────────────────────
async function loadData() {
  loading.value = true
  loadError.value = ''
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
      yp ? dailyLogStore.fetchByDateRange(tenantId, yp.from, yp.to) : Promise.resolve([] as DailyLog[]),
    ])

    trendLogs.value  = trendData
    currentLogs.value = trendData.filter(l => l.log_date >= cp.from && l.log_date <= cp.to)
    prevLogs.value   = prevData
    yoyLogs.value    = yoyData
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '読み込みに失敗しました'
  } finally {
    loading.value = false
    const anchor = route.query.anchor as string
    if (anchor) {
      nextTick(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }
}

onMounted(loadData)
watch([scope, offset], loadData)

// ─── ユーティリティ ────────────────────────────────────────────────
function pctClass(item: CompareItem | null | undefined) {
  if (!item) return 'text-neutral-400 dark:text-neutral-500'
  if (item.direction === '↑') return 'text-green-600 dark:text-green-400'
  if (item.direction === '↓') return 'text-red-500 dark:text-red-400'
  return 'text-neutral-500 dark:text-neutral-400'
}

function pctLabel(item: CompareItem | null | undefined): string {
  if (!item) return '—'
  const sign = item.pct > 0 ? '+' : ''
  return `${item.direction}${sign}${item.pct}%`
}

/** 増減実数を単位付き文字列で返す */
function diffLabel(item: CompareItem | null | undefined, unit: string): string {
  if (!item || item.prev === 0) return ''
  const sign = item.diff > 0 ? '+' : ''
  if (unit === '¥') return `${sign}¥${Math.abs(item.diff).toLocaleString()}`
  return `${sign}${item.diff.toLocaleString()}${unit}`
}

// ─── 比較行データ定義 ─────────────────────────────────────────────
interface CompareRow {
  id: string
  label: string
  currFmt: string
  prevFmt: string | null
  yoyFmt:  string | null
  prevComp: CompareItem | null
  yoyComp:  CompareItem | null
  unit: string
}

const mainRows = computed<CompareRow[]>(() => {
  const c = comparison.value
  const y = yoyComparison.value
  const hasPrev = sufficiency.value.hasSufficientPrev
  const hasYoy  = sufficiency.value.hasSufficientYoy

  return [
    {
      id: 'sales',
      label: '合計売上',
      currFmt: `¥${currSum.value.totalSales.toLocaleString()}`,
      prevFmt: hasPrev ? `¥${prevSum.value.totalSales.toLocaleString()}` : null,
      yoyFmt:  hasYoy  ? `¥${yoySum.value.totalSales.toLocaleString()}`  : null,
      prevComp: c?.sales ?? null,
      yoyComp:  y?.sales ?? null,
      unit: '¥',
    },
    {
      id: 'avgSales',
      label: '日平均売上',
      currFmt: `¥${currSum.value.avgSales.toLocaleString()}`,
      prevFmt: hasPrev ? `¥${prevSum.value.avgSales.toLocaleString()}` : null,
      yoyFmt:  hasYoy  ? `¥${yoySum.value.avgSales.toLocaleString()}`  : null,
      prevComp: null,  // 日平均は絶対差よりも±%のみ参考値
      yoyComp:  null,
      unit: '¥',
    },
    {
      id: 'skewers',
      label: '合計串本数',
      currFmt: `${currSum.value.totalSkewers.toLocaleString()}本`,
      prevFmt: hasPrev ? `${prevSum.value.totalSkewers.toLocaleString()}本` : null,
      yoyFmt:  hasYoy  ? `${yoySum.value.totalSkewers.toLocaleString()}本`  : null,
      prevComp: c?.skewers ?? null,
      yoyComp:  y?.skewers ?? null,
      unit: '本',
    },
    {
      id: 'groups',
      label: '合計組数',
      currFmt: currRcm.value.sampleCount > 0 ? `${currRcm.value.totalGroups}組` : '—',
      prevFmt: hasPrev && prevRcm.value.sampleCount > 0 ? `${prevRcm.value.totalGroups}組` : null,
      yoyFmt:  null,
      prevComp: c?.realGroups.prev && c.realGroups.prev > 0 ? c.realGroups : null,
      yoyComp:  null,
      unit: '組',
    },
    {
      id: 'guests',
      label: '合計客数',
      currFmt: currRcm.value.sampleCount > 0 ? `${currRcm.value.totalGuests}名` : '—',
      prevFmt: hasPrev && prevRcm.value.sampleCount > 0 ? `${prevRcm.value.totalGuests}名` : null,
      yoyFmt:  null,
      prevComp: c?.realGuests.prev && c.realGuests.prev > 0 ? c.realGuests : null,
      yoyComp:  null,
      unit: '名',
    },
    {
      id: 'unitPrice',
      label: '客単価',
      currFmt: currRcm.value.sampleCount > 0 ? `¥${currRcm.value.avgSpendPerGuest.toLocaleString()}` : '—',
      prevFmt: hasPrev && prevRcm.value.sampleCount > 0 ? `¥${prevRcm.value.avgSpendPerGuest.toLocaleString()}` : null,
      yoyFmt:  null,
      prevComp: c?.realUnitPrice.prev && c.realUnitPrice.prev > 0 ? c.realUnitPrice : null,
      yoyComp:  null,
      unit: '¥',
    },
    {
      id: 'drink',
      label: 'ドリンク比率',
      currFmt: `${currSum.value.avgDrink}%`,
      prevFmt: hasPrev ? `${prevSum.value.avgDrink}%` : null,
      yoyFmt:  hasYoy  ? `${yoySum.value.avgDrink}%`  : null,
      prevComp: c?.drinkRatio ?? null,
      yoyComp:  y?.drinkRatio ?? null,
      unit: '%',
    },
  ]
})
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-8">
    <!-- ヘッダー -->
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
      <VisitingBanner />
      <div class="max-w-lg mx-auto px-4 pt-3 pb-1 flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-0.5 text-sm text-neutral-400 dark:text-neutral-500
                 hover:text-neutral-600 dark:hover:text-neutral-300 shrink-0"
          @click="router.back()"
        >
          <ChevronLeft :size="16" />戻る
        </button>
        <h1 class="text-base font-semibold text-neutral-900 dark:text-neutral-50 flex-1 truncate">
          前期比較
        </h1>
      </div>
      <!-- スコープタブ -->
      <div class="max-w-lg mx-auto px-4 pb-2 flex gap-1.5">
        <button
          v-for="s in SCOPES"
          :key="s"
          type="button"
          class="flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          :class="scope === s
            ? 'bg-brand-500 text-white border-brand-500'
            : 'bg-card dark:bg-card-dark text-neutral-500 dark:text-neutral-400 border-edge dark:border-edge-dark'"
          @click="scope = s; offset = 0"
        >
          {{ SCOPE_LABELS[s] }}
        </button>
      </div>
    </header>

    <main class="max-w-lg mx-auto px-4 py-4 space-y-4">
      <!-- 期間ヘッダー -->
      <div class="bg-brand-500/10 dark:bg-brand-500/20 border border-brand-500/20 rounded-2xl px-4 py-3">
        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p class="text-[10px] text-neutral-400 dark:text-neutral-500 mb-0.5">今期</p>
            <p class="font-semibold text-brand-600 dark:text-brand-400 leading-tight">{{ currentPeriod.label }}</p>
            <p v-if="isInProgress" class="text-[10px] text-brand-400 dark:text-brand-500 mt-0.5">進行中（{{ currentLogs.length }}日）</p>
          </div>
          <div>
            <p class="text-[10px] text-neutral-400 dark:text-neutral-500 mb-0.5">前期</p>
            <p class="font-medium text-neutral-600 dark:text-neutral-300 leading-tight">{{ prevPeriod.label }}</p>
            <p v-if="isInProgress && sufficiency.hasSufficientPrev" class="text-[10px] text-neutral-400 mt-0.5">{{ alignedPrevLogs.length }}日分</p>
          </div>
          <div>
            <p class="text-[10px] text-neutral-400 dark:text-neutral-500 mb-0.5">昨対</p>
            <p v-if="yoyPeriod" class="font-medium text-neutral-600 dark:text-neutral-300 leading-tight">{{ yoyPeriod.label }}</p>
            <p v-else class="text-neutral-300 dark:text-neutral-600">—</p>
            <p v-if="isInProgress && yoyPeriod && sufficiency.hasSufficientYoy" class="text-[10px] text-neutral-400 mt-0.5">{{ alignedYoyLogs.length }}日分</p>
          </div>
        </div>
        <p v-if="isInProgress" class="mt-2 text-[10px] text-center text-brand-500 dark:text-brand-400">
          ※ 進行中のため前期・昨対も同経過日数で比較
        </p>
      </div>

      <!-- ローディング -->
      <p v-if="loading" class="text-center text-neutral-400 dark:text-neutral-500 py-12">読み込み中...</p>
      <p v-else-if="loadError" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
        {{ loadError }}
      </p>

      <template v-else>
        <!-- ① 主要指標テーブル -->
        <section id="sales" class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
          <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            主要指標
          </h2>
          <!-- 列ヘッダー -->
          <div class="grid grid-cols-4 px-4 py-1.5 text-[10px] text-neutral-400 dark:text-neutral-500 border-b border-edge dark:border-edge-dark bg-black/[0.02] dark:bg-white/[0.02]">
            <span>指標</span>
            <span class="text-right">今期</span>
            <span class="text-right">前期 <span class="text-[9px]">(差)</span></span>
            <span class="text-right">昨対 <span class="text-[9px]">(差)</span></span>
          </div>
          <!-- 各指標行 -->
          <div
            v-for="row in mainRows"
            :key="row.id"
            class="grid grid-cols-4 px-4 py-2.5 border-t border-edge dark:border-edge-dark items-start"
          >
            <!-- 指標名 -->
            <span class="text-xs text-neutral-600 dark:text-neutral-300 pt-0.5">{{ row.label }}</span>

            <!-- 今期 -->
            <span class="text-xs font-semibold text-right tabular-nums text-neutral-900 dark:text-neutral-50">{{ row.currFmt }}</span>

            <!-- 前期 + 差 -->
            <div class="text-right space-y-0.5">
              <template v-if="row.prevFmt">
                <p class="text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">{{ row.prevFmt }}</p>
                <p v-if="row.prevComp" class="text-[10px] font-semibold tabular-nums" :class="pctClass(row.prevComp)">
                  {{ pctLabel(row.prevComp) }}
                </p>
                <p v-if="row.prevComp && diffLabel(row.prevComp, row.unit)" class="text-[9px] tabular-nums" :class="pctClass(row.prevComp)">
                  {{ diffLabel(row.prevComp, row.unit) }}
                </p>
              </template>
              <span v-else class="text-[10px] text-neutral-300 dark:text-neutral-600">データ不足</span>
            </div>

            <!-- 昨対 + 差 -->
            <div class="text-right space-y-0.5">
              <template v-if="row.yoyFmt">
                <p class="text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">{{ row.yoyFmt }}</p>
                <p v-if="row.yoyComp" class="text-[10px] font-semibold tabular-nums" :class="pctClass(row.yoyComp)">
                  {{ pctLabel(row.yoyComp) }}
                </p>
                <p v-if="row.yoyComp && diffLabel(row.yoyComp, row.unit)" class="text-[9px] tabular-nums" :class="pctClass(row.yoyComp)">
                  {{ diffLabel(row.yoyComp, row.unit) }}
                </p>
              </template>
              <span v-else-if="yoyPeriod" class="text-[10px] text-neutral-300 dark:text-neutral-600">データなし</span>
              <span v-else class="text-[10px] text-neutral-300 dark:text-neutral-600">—</span>
            </div>
          </div>
        </section>

        <!-- ② コース内訳比較 -->
        <section id="courses" class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
          <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            コース内訳
          </h2>
          <div class="grid grid-cols-4 px-4 py-1.5 text-[10px] text-neutral-400 dark:text-neutral-500 border-b border-edge dark:border-edge-dark bg-black/[0.02] dark:bg-white/[0.02]">
            <span>コース</span>
            <span class="text-right">今期</span>
            <span class="text-right">前期</span>
            <span class="text-right">昨対</span>
          </div>
          <div
            v-for="(c, i) in currShares"
            :key="c.label"
            class="grid grid-cols-4 px-4 py-2 border-t border-edge dark:border-edge-dark items-center"
          >
            <span class="text-xs text-neutral-600 dark:text-neutral-300">{{ c.label }}</span>
            <div class="text-right">
              <p class="text-xs font-semibold tabular-nums text-brand-500">{{ c.count }}</p>
              <p class="text-[10px] text-neutral-400">{{ c.rate }}%</p>
            </div>
            <div class="text-right">
              <template v-if="sufficiency.hasSufficientPrev">
                <p class="text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">{{ prevShares[i]?.count }}</p>
                <p class="text-[10px] text-neutral-400">{{ prevShares[i]?.rate }}%</p>
              </template>
              <span v-else class="text-[10px] text-neutral-300 dark:text-neutral-600">—</span>
            </div>
            <div class="text-right">
              <template v-if="sufficiency.hasSufficientYoy && yoyPeriod">
                <p class="text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">{{ yoyShares[i]?.count }}</p>
                <p class="text-[10px] text-neutral-400">{{ yoyShares[i]?.rate }}%</p>
              </template>
              <span v-else class="text-[10px] text-neutral-300 dark:text-neutral-600">—</span>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
