<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
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
} from '@/composables/useAnalytics'
import {
  getPeriodRange,
  getPrevPeriod,
  getYoyPeriod,
  getTrendFetchRange,
  SCOPE_LABELS,
  type Scope,
} from '@/composables/usePeriodRange'
import type { DailyLog } from '@/types'
import { ChevronLeft } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const dailyLogStore = useDailyLogStore()
const auth = useAuthStore()

// ─── クエリパラメータ ─────────────────────────────────────────────
const scope = computed<Scope>(() => (route.query.scope as Scope) ?? 'week')
const offset = computed(() => Number(route.query.offset ?? 0))

// ─── 状態 ─────────────────────────────────────────────────────────
const loading = ref(false)
const loadError = ref('')
const currentLogs = ref<DailyLog[]>([])
const prevLogs = ref<DailyLog[]>([])
const yoyLogs = ref<DailyLog[]>([])
const trendLogs = ref<DailyLog[]>([])

// ─── 期間 ─────────────────────────────────────────────────────────
const currentPeriod = computed(() => getPeriodRange(scope.value, offset.value))
const prevPeriod = computed(() => getPrevPeriod(scope.value, offset.value))
const yoyPeriod = computed(() => getYoyPeriod(scope.value, offset.value))

// ─── 集計 ─────────────────────────────────────────────────────────
const currSum = computed(() => summarize(currentLogs.value))
const prevSum = computed(() => summarize(prevLogs.value))
const yoySum = computed(() => summarize(yoyLogs.value))
const sufficiency = computed(() =>
  calcSufficiency(currentLogs.value, prevLogs.value, yoyLogs.value),
)
const comparison = computed(() =>
  sufficiency.value.hasSufficientPrev
    ? calcPeriodComparison(currentLogs.value, prevLogs.value)
    : null,
)
const yoyComparison = computed(() =>
  sufficiency.value.hasSufficientYoy
    ? calcPeriodComparison(currentLogs.value, yoyLogs.value)
    : null,
)
const currRcm = computed(() => calcRealCustomerMetrics(currentLogs.value))
const prevRcm = computed(() => calcRealCustomerMetrics(prevLogs.value))
const currShares = computed(() => courseShares(currSum.value))
const prevShares = computed(() => courseShares(prevSum.value))

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
    // スクロール位置合わせ
    const anchor = route.query.anchor as string
    if (anchor) {
      nextTick(() => {
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }
}

onMounted(loadData)

// ─── ユーティリティ ────────────────────────────────────────────────
function pctBadgeClass(pct: number | null) {
  if (pct === null) return 'text-neutral-400 dark:text-neutral-500'
  if (pct > 3) return 'text-green-600 dark:text-green-400'
  if (pct < -3) return 'text-red-500 dark:text-red-400'
  return 'text-neutral-500 dark:text-neutral-400'
}

function pctLabel(pct: number | null): string {
  if (pct === null) return '—'
  return `${pct > 0 ? '+' : ''}${pct}%`
}

// ドリンク推移バー表示用（直近10件）
const drinkHistory = computed(() =>
  [...trendLogs.value]
    .filter((l) => l.log_date >= prevPeriod.value.from)
    .slice(0, 15)
    .reverse(),
)
function shortDate(ymd: string) {
  const p = ymd.split('-')
  return `${Number(p[1])}/${Number(p[2])}`
}
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-8">
    <!-- ヘッダー -->
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
      <VisitingBanner />
      <div class="max-w-lg mx-auto px-4 pt-3 pb-2.5 flex items-center gap-2">
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
    </header>

    <main class="max-w-lg mx-auto px-4 py-4 space-y-4">
      <!-- 期間ヘッダー -->
      <div class="bg-brand-500/10 dark:bg-brand-500/20 border border-brand-500/20 rounded-2xl px-4 py-3 space-y-1">
        <div class="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span>{{ SCOPE_LABELS[scope] }}スコープ</span>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p class="text-[10px] text-neutral-400 dark:text-neutral-500 mb-0.5">今期</p>
            <p class="font-semibold text-brand-600 dark:text-brand-400">{{ currentPeriod.label }}</p>
          </div>
          <div>
            <p class="text-[10px] text-neutral-400 dark:text-neutral-500 mb-0.5">前期</p>
            <p class="font-medium text-neutral-600 dark:text-neutral-300">{{ prevPeriod.label }}</p>
          </div>
          <div>
            <p class="text-[10px] text-neutral-400 dark:text-neutral-500 mb-0.5">昨対</p>
            <p v-if="yoyPeriod" class="font-medium text-neutral-600 dark:text-neutral-300">
              {{ yoyPeriod.label }}
            </p>
            <p v-else class="text-neutral-300 dark:text-neutral-600">—</p>
          </div>
        </div>
      </div>

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

      <template v-else>
        <!-- ① 主要指標テーブル -->
        <section
          id="sales"
          class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
        >
          <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            主要指標
          </h2>
          <!-- 列ヘッダー -->
          <div class="grid grid-cols-4 px-4 py-1.5 text-[10px] text-neutral-400 dark:text-neutral-500 border-b border-edge dark:border-edge-dark">
            <span>指標</span>
            <span class="text-right">今期</span>
            <span class="text-right">前期</span>
            <span class="text-right">昨対</span>
          </div>
          <!-- 各指標行 -->
          <template v-for="row in [
            {
              label: '合計売上',
              curr: `¥${currSum.totalSales.toLocaleString()}`,
              prev: currSum.totalSales > 0 ? `¥${prevSum.totalSales.toLocaleString()}` : null,
              prevPct: comparison?.sales.pct ?? null,
              yoy: yoyComparison ? `¥${yoySum.totalSales.toLocaleString()}` : null,
              yoyPct: yoyComparison?.sales.pct ?? null,
            },
            {
              label: '日平均売上',
              curr: `¥${currSum.avgSales.toLocaleString()}`,
              prev: sufficiency.hasSufficientPrev ? `¥${prevSum.avgSales.toLocaleString()}` : null,
              prevPct: null,
              yoy: sufficiency.hasSufficientYoy ? `¥${yoySum.avgSales.toLocaleString()}` : null,
              yoyPct: null,
            },
            {
              label: '串本数',
              curr: `${currSum.totalSkewers}本`,
              prev: sufficiency.hasSufficientPrev ? `${prevSum.totalSkewers}本` : null,
              prevPct: null,
              yoy: sufficiency.hasSufficientYoy ? `${yoySum.totalSkewers}本` : null,
              yoyPct: null,
            },
          ]" :key="row.label">
            <div class="grid grid-cols-4 px-4 py-2.5 border-t border-edge dark:border-edge-dark items-center">
              <span class="text-xs text-neutral-600 dark:text-neutral-300">{{ row.label }}</span>
              <span class="text-xs font-semibold text-right tabular-nums text-neutral-900 dark:text-neutral-50">{{ row.curr }}</span>
              <div class="text-right">
                <template v-if="row.prev">
                  <span class="text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">{{ row.prev }}</span>
                  <span
                    v-if="row.prevPct !== null"
                    class="block text-[10px] font-semibold tabular-nums"
                    :class="pctBadgeClass(row.prevPct)"
                  >{{ pctLabel(row.prevPct) }}</span>
                </template>
                <span v-else class="text-[10px] text-neutral-300 dark:text-neutral-600">データ不足</span>
              </div>
              <div class="text-right">
                <template v-if="row.yoy">
                  <span class="text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">{{ row.yoy }}</span>
                  <span
                    v-if="row.yoyPct !== null"
                    class="block text-[10px] font-semibold tabular-nums"
                    :class="pctBadgeClass(row.yoyPct)"
                  >{{ pctLabel(row.yoyPct) }}</span>
                </template>
                <span v-else-if="yoyPeriod" class="text-[10px] text-neutral-300 dark:text-neutral-600">データなし</span>
                <span v-else class="text-[10px] text-neutral-300 dark:text-neutral-600">—</span>
              </div>
            </div>
          </template>
          <!-- 組数・客数・客単価 -->
          <template v-if="currRcm.sampleCount > 0">
            <div
              v-for="row in [
                {
                  label: '組数/日',
                  curr: `${currRcm.avgGroupsPerDay}組`,
                  prev: prevRcm.sampleCount > 0 ? `${prevRcm.avgGroupsPerDay}組` : null,
                  yoy: null,
                },
                {
                  label: '客数/日',
                  curr: `${currRcm.avgGuestsPerDay}名`,
                  prev: prevRcm.sampleCount > 0 ? `${prevRcm.avgGuestsPerDay}名` : null,
                  yoy: null,
                },
                {
                  label: '客単価',
                  curr: `¥${currRcm.avgSpendPerGuest.toLocaleString()}`,
                  prev: prevRcm.sampleCount > 0 ? `¥${prevRcm.avgSpendPerGuest.toLocaleString()}` : null,
                  yoy: null,
                },
              ]"
              :key="row.label"
              class="grid grid-cols-4 px-4 py-2.5 border-t border-edge dark:border-edge-dark items-center"
            >
              <span class="text-xs text-neutral-600 dark:text-neutral-300">{{ row.label }}</span>
              <span class="text-xs font-semibold text-right tabular-nums text-neutral-900 dark:text-neutral-50">{{ row.curr }}</span>
              <span class="text-[10px] tabular-nums text-right text-neutral-500 dark:text-neutral-400">
                {{ row.prev ?? '—' }}
              </span>
              <span class="text-[10px] text-right text-neutral-300 dark:text-neutral-600">
                {{ yoyPeriod ? 'データなし' : '—' }}
              </span>
            </div>
          </template>
        </section>

        <!-- ② コース内訳比較 -->
        <section
          id="courses"
          class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
        >
          <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            コース内訳
          </h2>
          <div class="grid grid-cols-4 px-4 py-1.5 text-[10px] text-neutral-400 dark:text-neutral-500 border-b border-edge dark:border-edge-dark">
            <span>コース</span>
            <span class="text-right">今期</span>
            <span class="text-right">前期</span>
            <span class="text-right">昨対</span>
          </div>
          <div
            v-for="(c, i) in currShares"
            :key="c.label"
            class="grid grid-cols-4 px-4 py-2.5 border-t border-edge dark:border-edge-dark items-center"
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
              <span v-if="yoyPeriod && sufficiency.hasSufficientYoy">
                <p class="text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
                  {{ courseShares(yoySum)[i]?.count }}
                </p>
              </span>
              <span v-else class="text-[10px] text-neutral-300 dark:text-neutral-600">—</span>
            </div>
          </div>
        </section>

        <!-- ③ ドリンク比率比較 + 推移 -->
        <section
          id="drink"
          class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
        >
          <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            ドリンク比率
          </h2>
          <!-- 今期 vs 前期 vs 昨対 バー -->
          <div class="px-4 py-3 space-y-2.5">
            <div
              v-for="item in [
                { label: '今期', avg: currSum.avgDrink, show: true },
                { label: '前期', avg: prevSum.avgDrink, show: sufficiency.hasSufficientPrev },
                { label: '昨対', avg: yoySum.avgDrink, show: sufficiency.hasSufficientYoy },
              ]"
              :key="item.label"
              class="flex items-center gap-2"
            >
              <span class="w-7 text-[10px] text-neutral-500 dark:text-neutral-400 shrink-0">{{ item.label }}</span>
              <template v-if="item.show">
                <div class="flex-1 h-4 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-green-500 rounded-full"
                    :style="{ width: `${Math.min(item.avg, 100)}%` }"
                  />
                </div>
                <span class="w-8 text-[10px] tabular-nums text-right text-neutral-600 dark:text-neutral-300">{{ item.avg }}%</span>
              </template>
              <span v-else class="text-[10px] text-neutral-300 dark:text-neutral-600">データなし</span>
            </div>
          </div>
          <!-- 推移バー -->
          <div v-if="drinkHistory.length > 0" class="border-t border-edge dark:border-edge-dark px-4 py-3">
            <p class="text-[10px] text-neutral-400 dark:text-neutral-500 mb-2">推移（前期〜今期）</p>
            <div class="space-y-1.5">
              <div v-for="r in drinkHistory" :key="r.id" class="flex items-center gap-2">
                <span class="w-8 text-[9px] text-neutral-400 dark:text-neutral-500 tabular-nums">
                  {{ shortDate(r.log_date) }}
                </span>
                <div class="flex-1 h-3.5 bg-neutral-100 dark:bg-neutral-800 rounded overflow-hidden">
                  <div
                    class="h-full bg-green-500"
                    :style="{ width: `${Math.min(r.drink_ratio, 100)}%` }"
                  />
                </div>
                <span class="w-6 text-[9px] tabular-nums text-right text-neutral-400 dark:text-neutral-500">
                  {{ r.drink_ratio }}%
                </span>
              </div>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
