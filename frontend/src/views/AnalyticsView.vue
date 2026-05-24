<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useDailyLogStore } from '@/stores/dailyLog'
import {
  summarize,
  calcTrend,
  weekdayAvgSales,
  courseShares,
} from '@/composables/useAnalytics'

const dailyLogStore = useDailyLogStore()

const PERIODS = [7, 14, 30, 90]
const activePeriod = ref(7)
const activeTab = ref<'analysis' | 'log'>('analysis')
const loadError = ref('')

const logs = computed(() => dailyLogStore.logs)
const summary = computed(() => summarize(logs.value))
const trend = computed(() => calcTrend(logs.value))
const weekdays = computed(() => weekdayAvgSales(logs.value))
const shares = computed(() => courseShares(summary.value))

// 曜日別バーの最大値（日曜含む7曜日基準・GAS踏襲）
const maxDowAvg = computed(() => Math.max(...weekdays.value.map((w) => w.avg), 1))
// 月〜土のみ表示
const weekdaysMonToSat = computed(() => weekdays.value.slice(0, 6))
// ドリンク比率推移（直近10件を古い順に）
const recentDrink = computed(() => logs.value.slice(0, 10).reverse())
// 日次ログの売上着色用
const maxSales = computed(() => Math.max(...logs.value.map((r) => r.total_sales), 1))

function shortDate(ymd: string): string {
  const parts = ymd.split('-')
  return `${Number(parts[1])}/${Number(parts[2])}`
}

async function loadPeriod(days: number) {
  activePeriod.value = days
  loadError.value = ''
  try {
    await dailyLogStore.fetchRecentLogs(days)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '読み込みに失敗しました'
  }
}

onMounted(() => loadPeriod(7))
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-8">
    <!-- ヘッダー -->
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
      <div class="max-w-lg mx-auto px-4 py-4 flex items-center gap-3 pr-12">
        <router-link to="/" class="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 text-sm">‹ ホーム</router-link>
        <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">分析・集計</h1>
      </div>
      <!-- タブ -->
      <div class="max-w-lg mx-auto px-4 flex">
        <button
          type="button"
          class="flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'analysis' ? 'border-brand-500 text-brand-500' : 'border-transparent text-neutral-400 dark:text-neutral-500'"
          @click="activeTab = 'analysis'"
        >
          📊 分析
        </button>
        <button
          type="button"
          class="flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'log' ? 'border-brand-500 text-brand-500' : 'border-transparent text-neutral-400 dark:text-neutral-500'"
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

      <p v-if="dailyLogStore.loadingLogs" class="text-center text-neutral-400 dark:text-neutral-500 py-12">
        読み込み中...
      </p>
      <p v-else-if="loadError" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
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
          <!-- サマリーカード -->
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3">
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
                  'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20': trend.direction === '↑',
                  'bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20': trend.direction === '↓',
                  'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border-neutral-500/20': trend.direction === '→',
                }"
              >
                <template v-if="trend.direction === '↑'">↑ {{ trend.pct }}%</template>
                <template v-else-if="trend.direction === '↓'">↓ {{ Math.abs(trend.pct) }}%</template>
                <template v-else>→ 横ばい</template>
              </span>
            </div>
            <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3">
              <p class="text-xs text-neutral-500 dark:text-neutral-400">合計串本数</p>
              <p class="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50 mt-1">
                {{ summary.totalSkewers.toLocaleString() }}<span class="text-sm text-neutral-400 dark:text-neutral-500">本</span>
              </p>
              <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">平均 {{ summary.avgSkewers }}本/日</p>
            </div>
          </div>

          <!-- ドリンク比率平均 -->
          <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3">
            <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">ドリンク比率（平均）</p>
            <div class="h-6 bg-black/[0.05] dark:bg-white/[0.06] rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 flex items-center justify-end px-2"
                :style="{ width: `${Math.min(summary.avgDrink, 100)}%` }"
              >
                <span class="text-xs text-white font-bold tabular-nums">{{ summary.avgDrink }}%</span>
              </div>
            </div>
          </div>

          <!-- コース内訳 -->
          <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
            <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">コース内訳</h2>
            <div class="grid grid-cols-3 divide-x divide-edge dark:divide-edge-dark">
              <div v-for="c in shares" :key="c.label" class="px-2 py-3 text-center">
                <p class="text-2xl font-bold tabular-nums text-brand-500">{{ c.count }}</p>
                <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{{ c.label }}</p>
                <p class="text-xs text-neutral-400 dark:text-neutral-500">{{ c.rate }}%</p>
              </div>
            </div>
          </section>

          <!-- 曜日別平均売上 -->
          <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
            <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">曜日別 平均売上</h2>
            <div class="px-4 py-3 space-y-2">
              <div v-for="w in weekdaysMonToSat" :key="w.dow" class="flex items-center gap-2">
                <span class="w-8 text-xs text-neutral-500 dark:text-neutral-400">{{ w.dow.replace('曜', '') }}</span>
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

          <!-- ドリンク比率推移 -->
          <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
            <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              ドリンク比率 推移（直近10日）
            </h2>
            <div class="px-4 py-3 space-y-2">
              <div v-for="r in recentDrink" :key="r.id" class="flex items-center gap-2">
                <span class="w-10 text-xs text-neutral-500 dark:text-neutral-400">{{ shortDate(r.log_date) }}</span>
                <div class="flex-1 h-5 bg-black/[0.05] dark:bg-white/[0.06] rounded overflow-hidden">
                  <div
                    class="h-full bg-green-500 flex items-center justify-end px-1.5"
                    :style="{ width: `${Math.min(r.drink_ratio, 100)}%` }"
                  >
                    <span class="text-[10px] text-white font-medium tabular-nums">{{ r.drink_ratio }}%</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 日次ログテーブル -->
          <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
            <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">日次ログ</h2>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-xs text-neutral-500 dark:text-neutral-400 bg-black/[0.03] dark:bg-white/[0.04]">
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
                  <tr v-for="r in logs" :key="r.id" class="border-t border-edge dark:border-edge-dark">
                    <td class="px-2 py-2 text-neutral-500 dark:text-neutral-400">{{ shortDate(r.log_date) }}</td>
                    <td class="px-2 py-2 text-center">
                      <span
                        :class="
                          r.day_of_week === '日曜'
                            ? 'text-red-500'
                            : r.day_of_week === '土曜'
                              ? 'text-blue-500 dark:text-blue-400'
                              : 'text-neutral-500 dark:text-neutral-400'
                        "
                      >{{ r.day_of_week.replace('曜', '') }}</span>
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
                    <td class="px-2 py-2 text-center tabular-nums text-neutral-500 dark:text-neutral-400">{{ r.total_skewers }}</td>
                    <td class="px-2 py-2 text-center tabular-nums text-neutral-500 dark:text-neutral-400">
                      {{ r.course_casual + r.course_standard + r.course_premium }}
                    </td>
                    <td class="px-2 py-2 text-center tabular-nums text-neutral-500 dark:text-neutral-400">{{ r.drink_ratio }}%</td>
                    <td class="px-2 py-2 text-neutral-500 dark:text-neutral-400">{{ r.staff_name }}</td>
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
                <span class="text-sm text-neutral-400 dark:text-neutral-500">{{ r.day_of_week }}</span>
              </p>
              <p class="text-lg font-bold tabular-nums text-brand-500">
                ¥{{ r.total_sales.toLocaleString() }}
              </p>
            </div>
            <div class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              <span>串 {{ r.total_skewers }}本</span>
              <span>C{{ r.course_casual }} / S{{ r.course_standard }} / P{{ r.course_premium }}</span>
              <span>ドリンク {{ r.drink_ratio }}%</span>
              <span>焼師 {{ r.staff_name }}</span>
            </div>
            <p v-if="r.memo" class="mt-2 text-sm text-neutral-600 dark:text-neutral-300 bg-black/[0.03] dark:bg-white/[0.04] rounded-lg px-3 py-2">
              📝 {{ r.memo }}
            </p>
          </article>
        </div>
      </template>
    </main>
  </div>
</template>
