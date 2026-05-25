<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useSkewersStore } from '@/stores/skewers'
import { useSettingsStore } from '@/stores/settings'
import { useDailyLogStore } from '@/stores/dailyLog'
import { useAuthStore } from '@/stores/auth'
import { usePrepLogsStore } from '@/stores/prepLogs'
import { calcPrep, type PrepResult } from '@/composables/useInventoryCalc'
import { supabase } from '@/lib/supabase'
import type { SkewerCategory } from '@/types'
import CategoryTabs from '@/components/CategoryTabs.vue'
import PrepCard from '@/components/PrepCard.vue'

const skewersStore = useSkewersStore()
const settingsStore = useSettingsStore()
const dailyLogStore = useDailyLogStore()
const auth = useAuthStore()
const prepLogsStore = usePrepLogsStore()

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

// ─── 完了メッセージ ────────────────────────────────────────────

const COMPLETION_MESSAGES = [
  'お疲れ様でした！今日の仕込み完了です 🎉',
  '完璧な仕込みです！今日もありがとう 🍢',
  '仕込み終了！あとは焼くだけ 🔥',
  '全品目クリア！さすがです 👏',
  '今日も仕込み完了！お疲れ様でした ✨',
  '仕込みマスター！今日も完璧です 🏆',
  '全部終わりました！ゆっくり休んでください 😊',
  '仕込み完了！今夜もおいしい串が焼けます 🍡',
  'お見事！全品目の仕込みが終わりました 🎊',
  '今日の仕込みは以上です！お疲れ様 💪',
]

const showCompletionMsg = ref(false)
const completionMessage = ref('')
const hasInitialized = ref(false)

// ─── タイマーモード ────────────────────────────────────────────

const TIMER_KEY = 'yakitori_timer_mode_v1'
const timerEnabled = ref(
  typeof localStorage !== 'undefined' ? localStorage.getItem(TIMER_KEY) === '1' : false,
)
function toggleTimer() {
  timerEnabled.value = !timerEnabled.value
  try { localStorage.setItem(TIMER_KEY, timerEnabled.value ? '1' : '0') } catch { /* ignore */ }
}

// ─── Realtime ────────────────────────────────────────────────
// prep_logs と daily_log_stocks の変更を Supabase Realtime で監視し、
// 複数端末で仕込み完了状態・在庫データを即時同期する。

const realtimeStatus = ref<'connecting' | 'connected' | 'disconnected'>('connecting')
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null

const statusLabel = computed(() => {
  if (realtimeStatus.value === 'connected') return 'リアルタイム同期中'
  if (realtimeStatus.value === 'connecting') return '接続中...'
  return 'オフライン'
})
const statusDotClass = computed(() => {
  if (realtimeStatus.value === 'connected') return 'bg-green-500'
  if (realtimeStatus.value === 'connecting') return 'bg-amber-400 animate-pulse'
  return 'bg-red-500'
})
const statusTextClass = computed(() => {
  if (realtimeStatus.value === 'connected') return 'text-green-600 dark:text-green-400'
  if (realtimeStatus.value === 'connecting') return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500 dark:text-red-400'
})

// ─── 追加仕込みモーダル ─────────────────────────────────────────

const showExtraModal = ref(false)
const extraForm = ref({ skewerId: '', amount: 0, note: '' })
const extraSaving = ref(false)
const extraError = ref('')

// ─── 日付ヘルパー ─────────────────────────────────────────────

function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function formatMd(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW_SHORT[d.getDay()]})`
}
function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── 基本算出 ─────────────────────────────────────────────────

const businessDate = computed(() => {
  const log = dailyLogStore.latestLog
  return log ? parseLocalDate(log.log_date) : null
})
const nextDate = computed(() => {
  if (!businessDate.value) return null
  const d = new Date(businessDate.value)
  d.setDate(d.getDate() + 1)
  return d
})
const prepDate = computed(() => (nextDate.value ? toYmd(nextDate.value) : null))
const nextIsSunday = computed(() => nextDate.value?.getDay() === 0)

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
  return calcPrep(skewersStore.skewers, stockMap, businessDate.value.getDay(), {
    sundayBoostEnabled: s.sunday_boost_enabled,
    kombuFlags,
  })
})

// ─── 進捗カウンター ────────────────────────────────────────────

const totalPrepItems = computed(
  () => prepResults.value.filter((r) => r.prepAmount > 0).length,
)
const completedPrepCount = computed(
  () =>
    prepResults.value.filter(
      (r) => r.prepAmount > 0 && prepLogsStore.completedSkewerIds.has(r.skewerId),
    ).length,
)
const pendingCount = computed(() => totalPrepItems.value - completedPrepCount.value)
const progressPct = computed(() =>
  totalPrepItems.value > 0
    ? Math.round((completedPrepCount.value / totalPrepItems.value) * 100)
    : 0,
)

// 全完了メッセージ: hasInitialized 後に pendingCount が 0 になったとき
watch(completedPrepCount, (newVal) => {
  if (!hasInitialized.value) return
  if (newVal > 0 && pendingCount.value === 0 && totalPrepItems.value > 0) {
    completionMessage.value =
      COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)]
    showCompletionMsg.value = true
  }
})

// ─── カテゴリ / ソート ────────────────────────────────────────

const categories = computed(() => {
  const present = new Set(prepResults.value.map((r) => r.category))
  return ['すべて', ...CATEGORY_ORDER.filter((c) => present.has(c))]
})

const filteredResults = computed(() =>
  activeTab.value === 'すべて'
    ? prepResults.value
    : prepResults.value.filter((r) => r.category === activeTab.value),
)

/** 未完了（仕込み必要）→ 仕込み不要 → 完了済み の順 */
const sortedResults = computed(() => {
  const pending = filteredResults.value.filter(
    (r) => r.prepAmount > 0 && !prepLogsStore.completedSkewerIds.has(r.skewerId),
  )
  const noPrep = filteredResults.value.filter((r) => r.prepAmount === 0)
  const done = filteredResults.value.filter(
    (r) => r.prepAmount > 0 && prepLogsStore.completedSkewerIds.has(r.skewerId),
  )
  return [...pending, ...noPrep, ...done]
})

// ─── 完了アクション ────────────────────────────────────────────

const completeError = ref('')

async function handleComplete(result: PrepResult, durationSeconds?: number) {
  const tenantId = auth.appUser?.tenant_id
  const userId = auth.appUser?.id ?? null
  if (!tenantId || !prepDate.value) return
  completeError.value = ''
  try {
    await prepLogsStore.recordCompletion({
      tenantId,
      logDate: prepDate.value,
      skewerId: result.skewerId,
      skewerName: result.name,
      prepAmount: result.prepAmount,
      stickCount: result.prepAmount, // prepAmount = 本数（calcPrep の出力）
      userId,
      durationSeconds,
      type: 'normal',
    })
  } catch (e) {
    completeError.value = e instanceof Error ? e.message : '記録に失敗しました'
  }
}

// ─── 取り消し ─────────────────────────────────────────────────

async function handleUndo(result: PrepResult) {
  const tenantId = auth.appUser?.tenant_id
  if (!tenantId || !prepDate.value) return
  completeError.value = ''
  try {
    await prepLogsStore.undoCompletion(tenantId, prepDate.value, result.skewerId)
  } catch (e) {
    completeError.value = e instanceof Error ? e.message : '取り消しに失敗しました'
  }
}

// ─── 追加仕込み ────────────────────────────────────────────────

const extraSkewers = computed(() =>
  skewersStore.skewers.filter((s) => s.is_active && s.category !== '副産物'),
)

async function submitExtraPrep() {
  const tenantId = auth.appUser?.tenant_id
  const userId = auth.appUser?.id ?? null
  if (!tenantId || !prepDate.value) return
  const skewer = extraSkewers.value.find((s) => s.id === extraForm.value.skewerId)
  if (!skewer) { extraError.value = '串を選択してください'; return }
  if (!extraForm.value.amount || extraForm.value.amount <= 0) {
    extraError.value = '数量を入力してください'; return
  }
  extraSaving.value = true
  extraError.value = ''
  try {
    await prepLogsStore.recordCompletion({
      tenantId,
      logDate: prepDate.value,
      skewerId: skewer.id,
      skewerName: skewer.name,
      prepAmount: extraForm.value.amount,
      stickCount: extraForm.value.amount,
      userId,
      type: 'extra',
      note: extraForm.value.note.trim() || undefined,
    })
    extraForm.value = { skewerId: '', amount: 0, note: '' }
    showExtraModal.value = false
  } catch (e) {
    extraError.value = e instanceof Error ? e.message : '記録に失敗しました'
  } finally {
    extraSaving.value = false
  }
}

// ─── マウント ─────────────────────────────────────────────────

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

    // prep_logs を取得（仕込み対象日が確定してから）
    const tenantId = auth.appUser?.tenant_id
    if (tenantId && prepDate.value) {
      await prepLogsStore.fetchByDate(tenantId, prepDate.value)
    }

    // ── Realtime 購読開始 ──────────────────────────────────────
    if (tenantId) {
      realtimeChannel = supabase
        .channel(`dashboard:${tenantId}`)
        // prep_logs の変更 → 完了ステータスを即時更新
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'prep_logs' },
          async () => {
            const pd = prepDate.value
            if (pd) await prepLogsStore.fetchByDate(tenantId, pd)
          },
        )
        // daily_log_stocks の変更 → 在庫データ + 仕込み量を再計算
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'daily_log_stocks' },
          async () => {
            await dailyLogStore.fetchLatest()
            const pd = prepDate.value
            if (pd) await prepLogsStore.fetchByDate(tenantId, pd)
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            realtimeStatus.value = 'connected'
          } else if (
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            realtimeStatus.value = 'disconnected'
          }
        })
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '読み込みに失敗しました'
  } finally {
    loading.value = false
    hasInitialized.value = true
  }
})

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
})
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-24">
    <!-- ヘッダー -->
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
      <!-- タイトル行 -->
      <div class="max-w-lg mx-auto px-4 py-4 flex items-center gap-3 pr-12">
        <router-link to="/" class="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 text-sm">‹ ホーム</router-link>
        <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">仕込みダッシュボード</h1>
      </div>
      <!-- 接続状態 + タイマー切替行 -->
      <div class="max-w-lg mx-auto px-4 pb-2 flex items-center justify-between">
        <!-- 接続状態インジケーター -->
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full shrink-0" :class="statusDotClass"></span>
          <span class="text-xs" :class="statusTextClass">{{ statusLabel }}</span>
        </div>
        <!-- タイマー切替 -->
        <button
          type="button"
          class="text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
          :class="timerEnabled
            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
            : 'text-neutral-400 dark:text-neutral-500 border-edge dark:border-edge-dark'"
          @click="toggleTimer"
        >
          ⏱ {{ timerEnabled ? 'タイマーON' : 'タイマーOFF' }}
        </button>
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

        <!-- 進捗バー + カウンター -->
        <section
          v-if="totalPrepItems > 0"
          class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-4 space-y-3"
        >
          <!-- 進捗ヘッダー -->
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              仕込み進捗
            </p>
            <p class="text-sm font-bold tabular-nums"
              :class="pendingCount === 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-brand-500'"
            >
              {{ completedPrepCount }} / {{ totalPrepItems }} 品目完了
            </p>
          </div>

          <!-- プログレスバー -->
          <div class="h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="pendingCount === 0 ? 'bg-green-500' : 'bg-brand-500'"
              :style="{ width: `${progressPct}%` }"
            />
          </div>

          <!-- 合計本数 + 残件数 -->
          <div class="flex items-center justify-between text-sm">
            <p class="text-neutral-500 dark:text-neutral-400">
              🔪 仕込みが必要な品目:
              <span
                class="font-bold ml-1"
                :class="pendingCount === 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-brand-500'"
              >
                {{ pendingCount }}件
              </span>
            </p>
            <p
              v-if="prepLogsStore.totalStickCount > 0"
              class="text-neutral-700 dark:text-neutral-200 font-semibold tabular-nums"
            >
              🍢 計 {{ prepLogsStore.totalStickCount.toLocaleString() }}本
            </p>
          </div>
        </section>

        <!-- 仕込みなしサマリー（prepItems = 0 のとき） -->
        <div
          v-else
          class="rounded-2xl px-4 py-3 text-sm font-medium border bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
        >
          ✅ 仕込みは不要です
        </div>

        <!-- エラー表示 -->
        <p v-if="completeError" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {{ completeError }}
        </p>

        <!-- カテゴリ絞り込み -->
        <CategoryTabs v-model="activeTab" :tabs="categories" />

        <!-- 仕込みカード一覧 -->
        <div v-if="sortedResults.length > 0" class="space-y-2">
          <PrepCard
            v-for="r in sortedResults"
            :key="r.skewerId"
            :result="r"
            :completed="prepLogsStore.completedSkewerIds.has(r.skewerId)"
            :timer-enabled="timerEnabled"
            @complete="(dur) => handleComplete(r, dur)"
            @undo="handleUndo(r)"
          />
        </div>
        <p v-else class="text-center text-neutral-400 dark:text-neutral-500 text-sm py-8">
          表示する串がありません
        </p>
      </template>
    </main>

    <!-- 追加仕込みボタン（フローティング） -->
    <div
      v-if="!loading && !loadError && dailyLogStore.latestLog"
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-20"
    >
      <button
        type="button"
        class="px-6 py-3.5 bg-neutral-800 dark:bg-neutral-700 hover:bg-neutral-700 dark:hover:bg-neutral-600 text-white text-sm font-semibold rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center gap-2"
        @click="showExtraModal = true; extraError = ''"
      >
        ＋ 追加仕込みを記録
      </button>
    </div>

    <!-- ─── 追加仕込みモーダル ────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="showExtraModal"
        class="fixed inset-0 bg-black/60 flex items-end justify-center z-50 sm:items-center"
        @click.self="showExtraModal = false"
      >
        <div class="bg-card dark:bg-card-dark rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-xl">
          <h3 class="text-base font-bold text-neutral-900 dark:text-neutral-50">追加仕込みを記録</h3>

          <div class="space-y-3">
            <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              串を選択
              <select
                v-model="extraForm.skewerId"
                class="mt-1 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              >
                <option value="">— 選択してください —</option>
                <option v-for="s in extraSkewers" :key="s.id" :value="s.id">
                  {{ s.name }}（{{ s.category }}）
                </option>
              </select>
            </label>

            <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              数量（本）
              <input
                v-model.number="extraForm.amount"
                type="number"
                inputmode="numeric"
                min="1"
                class="mt-1 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>

            <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              メモ（任意）
              <input
                v-model="extraForm.note"
                type="text"
                placeholder="追加した理由など"
                class="mt-1 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
          </div>

          <p v-if="extraError" class="text-xs text-red-500 dark:text-red-400">{{ extraError }}</p>

          <div class="flex gap-3">
            <button
              type="button"
              class="flex-1 py-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-semibold rounded-xl"
              @click="showExtraModal = false"
            >
              キャンセル
            </button>
            <button
              type="button"
              :disabled="extraSaving"
              class="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform"
              @click="submitExtraPrep"
            >
              {{ extraSaving ? '記録中...' : '記録する' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ─── 全完了メッセージ ───────────────────────────────── -->
    <Teleport to="body">
      <Transition name="pop">
        <div
          v-if="showCompletionMsg"
          class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6"
          @click="showCompletionMsg = false"
        >
          <div class="bg-card dark:bg-card-dark rounded-3xl p-8 w-full max-w-xs shadow-2xl text-center space-y-4">
            <p class="text-5xl">🎉</p>
            <p class="text-lg font-bold text-neutral-900 dark:text-neutral-50 leading-snug">
              {{ completionMessage }}
            </p>
            <p v-if="prepLogsStore.totalStickCount > 0" class="text-sm text-neutral-500 dark:text-neutral-400">
              今日の仕込み合計 <span class="font-bold text-brand-500">{{ prepLogsStore.totalStickCount.toLocaleString() }}本</span>
            </p>
            <button
              type="button"
              class="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
              @click="showCompletionMsg = false"
            >
              閉じる
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.pop-enter-active { animation: pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.pop-leave-active { animation: pop-in 0.2s ease-in reverse; }
@keyframes pop-in {
  from { opacity: 0; transform: scale(0.8); }
  to   { opacity: 1; transform: scale(1); }
}
</style>
