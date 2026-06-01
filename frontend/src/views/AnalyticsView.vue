<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useDailyLogStore } from '@/stores/dailyLog'
import { useSettingsStore } from '@/stores/settings'
import VisitingBanner from '@/components/VisitingBanner.vue'
import {
  summarize,
  calcTrend,
  weekdayAvgSales,
  courseShares,
  calcPeriodComparison,
  calcCustomerMetrics,
  detectAnomalies,
  getAnalyticsSummary,
} from '@/composables/useAnalytics'

const dailyLogStore = useDailyLogStore()
const settingsStore = useSettingsStore()

const PERIODS = [7, 14, 30, 90]
const activePeriod = ref(7)
const activeTab = ref<'analysis' | 'log'>('analysis')
const loadError = ref('')

// ── ログ分割: 今期 / 前期 ────────────────────────────────────────
// fetchRecentLogs(days * 2) で2倍取得し、前半=今期 / 後半=前期 に分ける
const logs = computed(() => dailyLogStore.logs.slice(0, activePeriod.value))
const prevLogs = computed(() => dailyLogStore.logs.slice(activePeriod.value))

// ── 既存集計（変更なし） ─────────────────────────────────────────
const summary = computed(() => summarize(logs.value))
const trend = computed(() => calcTrend(logs.value))
const weekdays = computed(() => weekdayAvgSales(logs.value))
const shares = computed(() => courseShares(summary.value))
const maxDowAvg = computed(() => Math.max(...weekdays.value.map((w) => w.avg), 1))
const weekdaysMonToSat = computed(() => weekdays.value.slice(0, 6))
const recentDrink = computed(() => logs.value.slice(0, 10).reverse())
const maxSales = computed(() => Math.max(...logs.value.map((r) => r.total_sales), 1))

// ── 新規集計 ─────────────────────────────────────────────────────
const comparison = computed(() =>
  prevLogs.value.length > 0 ? calcPeriodComparison(logs.value, prevLogs.value) : null,
)
const customerMetrics = computed(() => calcCustomerMetrics(logs.value))
const anomalies = computed(() => detectAnomalies(logs.value))

// AI 搭載準備: 構造化 JSON（Claude API に渡せる形式）
// 将来の AI 分析機能で使用: getAnalyticsSummary の返り値をそのまま API に送れる
const analyticsSummaryJson = computed(() =>
  getAnalyticsSummary(logs.value, prevLogs.value),
)

// 外部から参照できるようにエクスポート（将来の AI 統合用）
defineExpose({ analyticsSummaryJson })

// ── 月次目標達成率 ────────────────────────────────────────────────
const monthlyTarget = computed(() => settingsStore.settings?.monthly_sales_target ?? 0)

// 今月の売上: logs の中から当月のものだけ合計
const currentMonthSales = computed(() => {
  const ym = new Date().toISOString().slice(0, 7) // "2026-06"
  return logs.value
    .filter((r) => r.log_date.startsWith(ym))
    .reduce((a, r) => a + r.total_sales, 0)
})

const monthlyProgress = computed(() =>
  monthlyTarget.value > 0
    ? Math.min(Math.round((currentMonthSales.value / monthlyTarget.value) * 100), 100)
    : 0,
)

// ── 串ランキング ──────────────────────────────────────────────────
const skewerStocks = computed(() => dailyLogStore.skewerStocks)

// ── データ読み込み ────────────────────────────────────────────────
async function loadPeriod(days: number) {
  activePeriod.value = days
  loadError.value = ''
  try {
    // 2倍取得して前期比較に使う
    await dailyLogStore.fetchRecentLogs(days * 2)
    // 串在庫集計（今期分のlog IDで取得）
    const logIds = dailyLogStore.logs.slice(0, days).map((l) => l.id)
    await dailyLogStore.fetchSkewerStocks(logIds)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '読み込みに失敗しました'
  }
}

onMounted(async () => {
  await settingsStore.fetchSettings()
  await loadPeriod(7)
})

// 期間変更時に串在庫も再取得
watch(logs, (newLogs) => {
  // logs が更新されたら logIds を再計算して再フェッチ（二重実行防止は loadPeriod 内で対処）
  const logIds = newLogs.map((l) => l.id)
  if (logIds.length > 0 && !dailyLogStore.loadingStocks) {
    dailyLogStore.fetchSkewerStocks(logIds)
  }
})

// ── ユーティリティ ────────────────────────────────────────────────
function shortDate(ymd: string): string {
  const parts = ymd.split('-')
  return `${Number(parts[1])}/${Number(parts[2])}`
}

function compBadgeClass(direction: '↑' | '↓' | '→') {
  if (direction === '↑')
    return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
  if (direction === '↓')
    return 'bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20'
  return 'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border-neutral-500/20'
}
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-8">
    <!-- ヘッダー -->
    <header
      class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10"
    >
      <VisitingBanner />
      <div class="max-w-lg mx-auto px-4 py-4 flex items-center gap-3 pr-12">
        <router-link
          to="/"
          class="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 text-sm"
          >‹ ホーム</router-link
        >
        <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">分析・集計</h1>
      </div>
      <!-- タブ -->
      <div class="max-w-lg mx-auto px-4 flex">
        <button
          type="button"
          class="flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors"
          :class="
            activeTab === 'analysis'
              ? 'border-brand-500 text-brand-500'
              : 'border-transparent text-neutral-400 dark:text-neutral-500'
          "
          @click="activeTab = 'analysis'"
        >
          📊 分析
        </button>
        <button
          type="button"
          class="flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors"
          :class="
            activeTab === 'log'
              ? 'border-brand-500 text-brand-500'
              : 'border-transparent text-neutral-400 dark:text-neutral-500'
          "
          @click="activeTab = 'log'"
        >
          📋 ログ
        </button>
      </div>
    </header>

    <main class="max-w-lg mx-auto px-4 py-5 space-y-4">
      <!-- 期間選択 -->
      <div class="flex gap-2">
        <button
          v-for="p in PERIODS"
          :key="p"
          type="button"
          class="flex-1 min-h-tap rounded-xl text-sm font-medium border active:scale-95 transition-transform"
          :class="
            activePeriod === p
              ? 'bg-brand-500 text-white border-brand-500'
              : 'bg-card dark:bg-card-dark text-neutral-500 dark:text-neutral-400 border-edge dark:border-edge-dark'
          "
          @click="loadPeriod(p)"
        >
          {{ p }}日
        </button>
      </div>

      <p
        v-if="dailyLogStore.loadingLogs"
        class="text-center text-neutral-400 dark:text-neutral-500 py-12"
      >
        読み込み中...
      </p>
      <p
        v-else-if="loadError"
        class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"
      >
        {{ loadError }}
      </p>
      <div
        v-else-if="logs.length === 0"
        class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-6 py-12 text-center text-neutral-400 dark:text-neutral-500"
      >
        <p class="text-4xl mb-3">📭</p>
        <p class="text-sm">データがありません</p>
      </div>

      <template v-else>
        <!-- ===== 分析タブ ===== -->
        <div v-show="activeTab === 'analysis'" class="space-y-4">

          <!-- ① 月次目標達成率（設定済み時のみ表示） -->
          <section
            v-if="monthlyTarget > 0"
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3"
          >
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs text-neutral-500 dark:text-neutral-400">今月の売上目標達成率</p>
              <p class="text-sm font-bold tabular-nums" :class="monthlyProgress >= 100 ? 'text-green-600 dark:text-green-400' : 'text-brand-500'">
                {{ monthlyProgress }}%
              </p>
            </div>
            <div class="h-3 bg-black/[0.05] dark:bg-white/[0.06] rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500"
                :class="monthlyProgress >= 100 ? 'bg-green-500' : 'bg-brand-500'"
                :style="{ width: `${monthlyProgress}%` }"
              />
            </div>
            <div class="flex justify-between mt-1.5 text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
              <span>¥{{ currentMonthSales.toLocaleString() }}</span>
              <span>目標 ¥{{ monthlyTarget.toLocaleString() }}</span>
            </div>
          </section>

          <!-- ② 前期比較カード（前期データあり時のみ） -->
          <section
            v-if="comparison"
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
          >
            <h2
              class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200"
            >
              前期比較（直近{{ activePeriod }}日 vs 前{{ activePeriod }}日）
            </h2>
            <div class="grid grid-cols-3 divide-x divide-edge dark:divide-edge-dark">
              <div
                v-for="item in [
                  { label: '売上', data: comparison.sales, fmt: (v: number) => `¥${Math.round(v/1000)}k` },
                  { label: '組数', data: comparison.customers, fmt: (v: number) => `${v}組` },
                  { label: '組単価', data: comparison.unitPrice, fmt: (v: number) => `¥${Math.round(v/100)*100}` },
                ]"
                :key="item.label"
                class="px-2 py-3 text-center"
              >
                <p class="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">{{ item.label }}</p>
                <p class="text-base font-bold tabular-nums text-neutral-900 dark:text-neutral-50 leading-none">
                  {{ item.fmt(item.data.current) }}
                </p>
                <span
                  class="inline-block mt-1.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border tabular-nums"
                  :class="compBadgeClass(item.data.direction)"
                >
                  {{ item.data.direction }}{{ item.data.pct > 0 ? '+' : '' }}{{ item.data.pct }}%
                </span>
              </div>
            </div>
          </section>

          <!-- ③ サマリーカード（既存） -->
          <div class="grid grid-cols-2 gap-3">
            <div
              class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3"
            >
              <p class="text-xs text-neutral-500 dark:text-neutral-400">合計売上</p>
              <p class="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50 mt-1">
                ¥{{ summary.totalSales.toLocaleString() }}
              </p>
              <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
                平均 ¥{{ summary.avgSales.toLocaleString() }}/日
              </p>
              <span
                v-if="trend.direction"
                class="inline-block mt-1.5 text-xs font-medium px-2.5 py-1 rounded-full border"
                :class="{
                  'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20':
                    trend.direction === '↑',
                  'bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20':
                    trend.direction === '↓',
                  'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border-neutral-500/20':
                    trend.direction === '→',
                }"
              >
                <template v-if="trend.direction === '↑'">↑ {{ trend.pct }}%</template>
                <template v-else-if="trend.direction === '↓'">↓ {{ Math.abs(trend.pct) }}%</template>
                <template v-else>→ 横ばい</template>
              </span>
            </div>
            <div
              class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3"
            >
              <p class="text-xs text-neutral-500 dark:text-neutral-400">合計串本数</p>
              <p class="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50 mt-1">
                {{ summary.totalSkewers.toLocaleString()
                }}<span class="text-sm text-neutral-400 dark:text-neutral-500">本</span>
              </p>
              <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
                平均 {{ summary.avgSkewers }}本/日
              </p>
            </div>
          </div>

          <!-- ④ 客数・客単価（新規） -->
          <div class="grid grid-cols-3 gap-3">
            <div
              class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-3 py-3 text-center"
            >
              <p class="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">合計組数</p>
              <p class="text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                {{ customerMetrics.totalCustomers }}<span class="text-xs text-neutral-400">組</span>
              </p>
            </div>
            <div
              class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-3 py-3 text-center"
            >
              <p class="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">1日平均</p>
              <p class="text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                {{ customerMetrics.avgCustomersPerDay }}<span class="text-xs text-neutral-400">組</span>
              </p>
            </div>
            <div
              class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-3 py-3 text-center"
            >
              <p class="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">組単価</p>
              <p class="text-xl font-bold tabular-nums text-brand-500">
                ¥{{ customerMetrics.avgUnitPrice.toLocaleString() }}
              </p>
            </div>
          </div>

          <!-- ⑤ ドリンク比率平均（既存） -->
          <div
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3"
          >
            <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">ドリンク比率（平均）</p>
            <div class="h-6 bg-black/[0.05] dark:bg-white/[0.06] rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 flex items-center justify-end px-2"
                :style="{ width: `${Math.min(summary.avgDrink, 100)}%` }"
              >
                <span class="text-xs text-white font-bold tabular-nums"
                  >{{ summary.avgDrink }}%</span
                >
              </div>
            </div>
          </div>

          <!-- ⑥ コース内訳（既存） -->
          <section
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
          >
            <h2
              class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200"
            >
              コース内訳
            </h2>
            <div class="grid grid-cols-3 divide-x divide-edge dark:divide-edge-dark">
              <div v-for="c in shares" :key="c.label" class="px-2 py-3 text-center">
                <p class="text-2xl font-bold tabular-nums text-brand-500">{{ c.count }}</p>
                <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{{ c.label }}</p>
                <p class="text-xs text-neutral-400 dark:text-neutral-500">{{ c.rate }}%</p>
              </div>
            </div>
          </section>

          <!-- ⑦ 曜日別平均売上（既存） -->
          <section
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
          >
            <h2
              class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200"
            >
              曜日別 平均売上
            </h2>
            <div class="px-4 py-3 space-y-2">
              <div v-for="w in weekdaysMonToSat" :key="w.dow" class="flex items-center gap-2">
                <span class="w-8 text-xs text-neutral-500 dark:text-neutral-400">{{
                  w.dow.replace('曜', '')
                }}</span>
                <div class="flex-1 h-5 bg-black/[0.05] dark:bg-white/[0.06] rounded overflow-hidden">
                  <div
                    class="h-full bg-brand-500 flex items-center justify-end px-1.5"
                    :style="{ width: `${Math.round((w.avg / maxDowAvg) * 100)}%` }"
                  >
                    <span v-if="w.avg > 0" class="text-[10px] text-white font-medium tabular-nums">
                      ¥{{ Math.round(w.avg / 1000) }}k
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ⑧ 異常値アラート（新規） -->
          <section
            v-if="anomalies.length > 0"
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
          >
            <h2
              class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200"
            >
              📍 異常値アラート
            </h2>
            <div class="divide-y divide-edge dark:divide-edge-dark">
              <div
                v-for="a in anomalies"
                :key="a.date"
                class="px-4 py-2.5 flex items-center gap-3"
              >
                <span
                  class="shrink-0 text-sm font-bold w-6 text-center"
                  :class="a.direction === '↑' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'"
                >
                  {{ a.direction }}
                </span>
                <span class="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">
                  {{ shortDate(a.date) }} {{ a.dayOfWeek.replace('曜', '') }}
                </span>
                <span class="flex-1 text-xs text-neutral-700 dark:text-neutral-200 tabular-nums">
                  ¥{{ a.actualSales.toLocaleString() }}
                </span>
                <span
                  class="shrink-0 text-[11px] px-2 py-0.5 rounded-full border font-medium"
                  :class="a.direction === '↑' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20'"
                >
                  {{ a.direction === '↑' ? '平均+' : '平均-' }}{{ a.sigmas }}σ
                </span>
              </div>
            </div>
          </section>

          <!-- ⑨ 串ランキング（在庫記録あり時のみ表示） -->
          <section
            v-if="skewerStocks.length > 0"
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
          >
            <h2
              class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200"
            >
              🔪 串在庫ランキング（売り切れ頻度順）
            </h2>
            <div class="divide-y divide-edge dark:divide-edge-dark">
              <div
                v-for="(s, idx) in skewerStocks.slice(0, 8)"
                :key="s.skewerId"
                class="px-4 py-2.5 flex items-center gap-3"
              >
                <span
                  class="shrink-0 w-5 text-center text-xs font-bold tabular-nums"
                  :class="idx < 3 ? 'text-brand-500' : 'text-neutral-400 dark:text-neutral-500'"
                >
                  {{ idx + 1 }}
                </span>
                <span class="flex-1 text-sm text-neutral-800 dark:text-neutral-100 truncate">{{ s.name }}</span>
                <span class="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">{{ s.category }}</span>
                <div class="shrink-0 text-right">
                  <p class="text-xs font-medium tabular-nums" :class="s.zeroCount > 3 ? 'text-red-500 dark:text-red-400' : 'text-neutral-500 dark:text-neutral-400'">
                    売切 {{ s.zeroCount }}日
                  </p>
                  <p class="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">
                    平均{{ s.avgStock }}P
                  </p>
                </div>
              </div>
            </div>
          </section>

          <!-- ⑩ ドリンク比率推移（既存） -->
          <section
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
          >
            <h2
              class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200"
            >
              ドリンク比率 推移（直近10日）
            </h2>
            <div class="px-4 py-3 space-y-2">
              <div v-for="r in recentDrink" :key="r.id" class="flex items-center gap-2">
                <span class="w-10 text-xs text-neutral-500 dark:text-neutral-400">{{
                  shortDate(r.log_date)
                }}</span>
                <div class="flex-1 h-5 bg-black/[0.05] dark:bg-white/[0.06] rounded overflow-hidden">
                  <div
                    class="h-full bg-green-500 flex items-center justify-end px-1.5"
                    :style="{ width: `${Math.min(r.drink_ratio, 100)}%` }"
                  >
                    <span class="text-[10px] text-white font-medium tabular-nums"
                      >{{ r.drink_ratio }}%</span
                    >
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ⑪ 日次ログテーブル（既存） -->
          <section
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
          >
            <h2
              class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200"
            >
              日次ログ
            </h2>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr
                    class="text-xs text-neutral-500 dark:text-neutral-400 bg-black/[0.03] dark:bg-white/[0.04]"
                  >
                    <th class="px-2 py-2 text-left">日付</th>
                    <th class="px-2 py-2">曜日</th>
                    <th class="px-2 py-2">売上</th>
                    <th class="px-2 py-2">串本数</th>
                    <th class="px-2 py-2">コース計</th>
                    <th class="px-2 py-2">ドリンク%</th>
                    <th class="px-2 py-2">担当</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="r in logs"
                    :key="r.id"
                    class="border-t border-edge dark:border-edge-dark"
                  >
                    <td class="px-2 py-2 text-neutral-500 dark:text-neutral-400">
                      {{ shortDate(r.log_date) }}
                    </td>
                    <td class="px-2 py-2 text-center">
                      <span
                        :class="
                          r.day_of_week === '日曜'
                            ? 'text-red-500'
                            : r.day_of_week === '土曜'
                              ? 'text-blue-500 dark:text-blue-400'
                              : 'text-neutral-500 dark:text-neutral-400'
                        "
                        >{{ r.day_of_week.replace('曜', '') }}</span
                      >
                    </td>
                    <td
                      class="px-2 py-2 text-right font-medium tabular-nums"
                      :class="
                        r.total_sales >= maxSales * 0.85
                          ? 'text-green-600 dark:text-green-400'
                          : r.total_sales > 0 && r.total_sales <= maxSales * 0.4
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-neutral-700 dark:text-neutral-200'
                      "
                    >
                      ¥{{ r.total_sales.toLocaleString() }}
                    </td>
                    <td
                      class="px-2 py-2 text-center tabular-nums text-neutral-500 dark:text-neutral-400"
                    >
                      {{ r.total_skewers }}
                    </td>
                    <td
                      class="px-2 py-2 text-center tabular-nums text-neutral-500 dark:text-neutral-400"
                    >
                      {{ r.course_casual + r.course_standard + r.course_premium }}
                    </td>
                    <td
                      class="px-2 py-2 text-center tabular-nums text-neutral-500 dark:text-neutral-400"
                    >
                      {{ r.drink_ratio }}%
                    </td>
                    <td class="px-2 py-2 text-neutral-500 dark:text-neutral-400">
                      {{ r.staff_name }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- ===== ログタブ ===== -->
        <div v-show="activeTab === 'log'" class="space-y-3">
          <article
            v-for="r in logs"
            :key="r.id"
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3"
          >
            <div class="flex items-center justify-between">
              <p class="font-bold text-neutral-900 dark:text-neutral-50">
                {{ shortDate(r.log_date) }}
                <span class="text-sm text-neutral-400 dark:text-neutral-500">{{
                  r.day_of_week
                }}</span>
              </p>
              <p class="text-lg font-bold tabular-nums text-brand-500">
                ¥{{ r.total_sales.toLocaleString() }}
              </p>
            </div>
            <div
              class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400"
            >
              <span>串 {{ r.total_skewers }}本</span>
              <span
                >C{{ r.course_casual }} / S{{ r.course_standard }} / P{{
                  r.course_premium
                }}</span
              >
              <span>ドリンク {{ r.drink_ratio }}%</span>
              <span>焼師 {{ r.staff_name }}</span>
            </div>
            <p
              v-if="r.memo"
              class="mt-2 text-sm text-neutral-600 dark:text-neutral-300 bg-black/[0.03] dark:bg-white/[0.04] rounded-lg px-3 py-2"
            >
              📝 {{ r.memo }}
            </p>
          </article>
        </div>
      </template>
    </main>
  </div>
</template>
