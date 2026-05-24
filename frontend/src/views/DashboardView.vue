<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSkewersStore } from '@/stores/skewers'
import { useSettingsStore } from '@/stores/settings'
import { useDailyLogStore } from '@/stores/dailyLog'
import { calcPrep, type PrepResult } from '@/composables/useInventoryCalc'
import type { SkewerCategory } from '@/types'
import CategoryTabs from '@/components/CategoryTabs.vue'
import PrepCard from '@/components/PrepCard.vue'

const skewersStore = useSkewersStore()
const settingsStore = useSettingsStore()
const dailyLogStore = useDailyLogStore()

const loading = ref(true)
const loadError = ref('')
const activeTab = ref('すべて')

const DOW_SHORT = ['日', '月', '火', '水', '木', '金', '土']
const CATEGORY_ORDER: SkewerCategory[] = [
  'レギュラー',
  'スペシャル',
  'つくね',
  '前日仕込み',
  'その他仕込み',
]

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    await Promise.all([
      skewersStore.fetchActive(),
      settingsStore.fetchSettings(),
      dailyLogStore.fetchLatest(),
    ])
    if (skewersStore.error) throw new Error(skewersStore.error)
    if (settingsStore.error) throw new Error(settingsStore.error)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '読み込みに失敗しました'
  } finally {
    loading.value = false
  }
})

/** yyyy-MM-dd 文字列をローカル Date に変換（タイムゾーン非依存） */
function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatMd(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW_SHORT[d.getDay()]})`
}

// 最終入力（最新ログ）の営業日
const businessDate = computed(() => {
  const log = dailyLogStore.latestLog
  return log ? parseLocalDate(log.log_date) : null
})

// 翌日（仕込み対象日）
const nextDate = computed(() => {
  if (!businessDate.value) return null
  const d = new Date(businessDate.value)
  d.setDate(d.getDate() + 1)
  return d
})

const nextIsSunday = computed(() => nextDate.value?.getDay() === 0)

/**
 * 仕込み計算。
 * GAS submitDailyReport と同じく、calcPrep には営業日（最新ログ日）の getDay() を渡す。
 * → /input 送信時・LINE通知と同じ結果になる。
 */
const prepResults = computed<PrepResult[]>(() => {
  const log = dailyLogStore.latestLog
  const s = settingsStore.settings
  if (!log || !s || !businessDate.value) return []

  const stockMap: Record<string, number> = {}
  const kombuFlags: Record<string, boolean> = {}
  for (const st of dailyLogStore.latestStocks) {
    stockMap[st.skewer_id] = st.stock
    kombuFlags[st.skewer_id] = st.is_kombu
  }
  // calcPrep は副産物を内部でスキップする
  return calcPrep(skewersStore.skewers, stockMap, businessDate.value.getDay(), {
    sundayBoostEnabled: s.sunday_boost_enabled,
    kombuFlags,
  })
})

// 仕込みが必要な品目数
const needPrepCount = computed(
  () => prepResults.value.filter((r) => r.prepAmount > 0).length,
)

// カテゴリタブ（存在するカテゴリのみ）
const categories = computed(() => {
  const present = new Set(prepResults.value.map((r) => r.category))
  return ['すべて', ...CATEGORY_ORDER.filter((c) => present.has(c))]
})

const filteredResults = computed(() =>
  activeTab.value === 'すべて'
    ? prepResults.value
    : prepResults.value.filter((r) => r.category === activeTab.value),
)
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-8">
    <!-- ヘッダー -->
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark px-4 py-4 sticky top-0 z-10">
      <div class="max-w-lg mx-auto flex items-center gap-3 pr-12">
        <router-link to="/" class="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 text-sm">‹ ホーム</router-link>
        <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">仕込みダッシュボード</h1>
      </div>
    </header>

    <main class="max-w-lg mx-auto px-4 py-5 space-y-4">
      <p v-if="loading" class="text-center text-neutral-400 dark:text-neutral-500 py-12">読み込み中...</p>

      <p v-else-if="loadError" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
        {{ loadError }}
      </p>

      <!-- 営業データなし -->
      <div
        v-else-if="!dailyLogStore.latestLog"
        class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-6 py-12 text-center space-y-3"
      >
        <p class="text-4xl">📋</p>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">まだ営業データがありません</p>
        <router-link
          to="/input"
          class="inline-block px-5 py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
        >
          営業後入力へ
        </router-link>
      </div>

      <template v-else>
        <!-- 対象日 -->
        <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-4">
          <p class="text-xs text-neutral-400 dark:text-neutral-500">
            最終入力 {{ businessDate ? formatMd(businessDate) : '—' }} の記録より
          </p>
          <p class="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mt-1">
            🔪 {{ nextDate ? formatMd(nextDate) : '' }} の仕込み
          </p>
        </section>

        <!-- 日曜（休業）バナー -->
        <div
          v-if="nextIsSunday"
          class="bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-500/25 rounded-2xl px-4 py-3 text-sm font-semibold"
        >
          🛌 明日は日曜日（休業）です
        </div>

        <!-- 仕込み件数サマリー -->
        <div
          class="rounded-2xl px-4 py-3 text-sm font-medium border"
          :class="
            needPrepCount > 0
              ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/20'
              : 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
          "
        >
          <span v-if="needPrepCount > 0">
            🔪 仕込みが必要な品目: {{ needPrepCount }}件
          </span>
          <span v-else>✅ 仕込みは不要です</span>
        </div>

        <!-- カテゴリ絞り込み -->
        <CategoryTabs v-model="activeTab" :tabs="categories" />

        <!-- 仕込みカード一覧 -->
        <div v-if="filteredResults.length > 0" class="space-y-2">
          <PrepCard v-for="r in filteredResults" :key="r.skewerId" :result="r" />
        </div>
        <p v-else class="text-center text-neutral-400 dark:text-neutral-500 text-sm py-8">
          表示する串がありません
        </p>
      </template>
    </main>
  </div>
</template>
