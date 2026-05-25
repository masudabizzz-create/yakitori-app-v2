<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSkewersStore } from '@/stores/skewers'
import { useOrderScheduleStore } from '@/stores/orderSchedule'
import {
  calculateOrderEstimate,
  calcEqualOrderQty,
  computeCourseBreakdown,
  type OrderEstimateGroup,
  type EqualOrderQty,
} from '@/composables/useInventoryCalc'
import { isHolidayYmd } from '@/composables/useHolidays'
import TenantSwitcher from '@/components/TenantSwitcher.vue'
import type { DeliveryBlackoutPeriod } from '@/types'

const auth = useAuthStore()
const skewersStore = useSkewersStore()
const orderScheduleStore = useOrderScheduleStore()

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']
const WEEK_PRESETS = ['last', 'this', 'next'] as const
const GUESTS_KEY = 'yakitori_guests_v1'
const RATIO_KEY = 'order_course_ratios'

const loading = ref(true)
const loadError = ref('')
const calculating = ref(false)

const weekStart = ref('')
const activePreset = ref<'last' | 'this' | 'next' | ''>('')
const ratios = reactive({ casual: 34, standard: 33, premium: 33 })
const guestTotals = reactive<Record<string, number>>({})
const useStock = ref(false)
const stockValues = reactive<Record<string, number>>({})

const result = ref<OrderEstimateGroup[] | null>(null)
const equalQty = ref<EqualOrderQty[]>([])

// ---------------- 日付ヘルパー ----------------

function toDateStr(d: Date): string {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, '0')}-` +
    `${String(d.getDate()).padStart(2, '0')}`
  )
}
function getMondayOf(base: Date): Date {
  const dt = new Date(base)
  const day = dt.getDay()
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day))
  return dt
}

// ---------------- 算出プロパティ ----------------

const weekDays = computed(() => {
  if (!weekStart.value) return []
  const [y, m, d] = weekStart.value.split('-').map(Number)
  const mon = new Date(y, m - 1, d)
  const days: { date: string; dow: number; mdLabel: string; isHoliday: boolean }[] = []
  for (let i = 0; i < 7; i++) {
    const dt = new Date(mon)
    dt.setDate(mon.getDate() + i)
    const ds = toDateStr(dt)
    days.push({
      date: ds,
      dow: dt.getDay(),
      mdLabel: `${dt.getMonth() + 1}/${dt.getDate()}`,
      isHoliday: isHolidayYmd(ds),
    })
  }
  return days
})

const ratioSum = computed(() => ratios.casual + ratios.standard + ratios.premium)
const orderSkewers = computed(() =>
  skewersStore.skewers.filter((s) => s.weight_per_stick_g > 0),
)

// ---------------- 今週の発注スケジュール（表示用） ----------------

/** 'yyyy-MM-dd' をローカルDateに変換 */
function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Date を「M/D（曜）」に整形 */
function fmtMdDow(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}（${DOW_LABELS[d.getDay()]}）`
}

/** Date に n 日を加算する */
function addDays(base: Date, n: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}

/** dow → 週内オフセット日数（月=0, 火=1, ..., 土=5, 日=6） */
const dowOffset = (dow: number) => (dow === 0 ? 6 : dow - 1)

/**
 * 指定日が納品不可期間内かチェックし、該当する期間を返す
 */
function getBlackoutFor(date: Date, blackouts: DeliveryBlackoutPeriod[]) {
  const ds = toDateStr(date)
  return blackouts.find((b) => b.start_date <= ds && ds <= b.end_date) ?? null
}

/**
 * 納品不可期間終了後の次の通常納品曜日（delivery_dow）の日付を返す
 */
function nextDeliveryAfterBlackout(deliveryDow: number, blackoutEnd: Date): Date {
  for (let i = 1; i <= 14; i++) {
    const d = addDays(blackoutEnd, i)
    if (d.getDay() === deliveryDow) return d
  }
  return addDays(blackoutEnd, 1) // フォールバック（理論上到達しない）
}

interface WeekScheduleEntry {
  deadlineDate: Date
  deliveryDate: Date
  isIrregular: boolean
  blackoutTitle?: string
  note?: string
}

/**
 * 選択週の発注スケジュール表示。
 * 通常の納品日が納品不可期間に入る場合、イレギュラー納品日または
 * 不可期間終了後の次の通常納品日へ自動調整する。
 */
const weekSchedules = computed<WeekScheduleEntry[]>(() => {
  if (!weekStart.value) return []
  const mon = parseYmd(weekStart.value)
  const blackouts = orderScheduleStore.blackouts

  const entries: WeekScheduleEntry[] = []

  for (const s of orderScheduleStore.schedules) {
    const deadlineDate = addDays(mon, dowOffset(s.deadline_dow))
    const normalDeliveryDate = addDays(mon, dowOffset(s.delivery_dow))

    const blackout = getBlackoutFor(normalDeliveryDate, blackouts)
    if (!blackout) {
      // 通常納品
      entries.push({ deadlineDate, deliveryDate: normalDeliveryDate, isIrregular: false })
    } else {
      const irregularDates = blackout.delivery_irregular_dates ?? []
      if (irregularDates.length > 0) {
        // イレギュラー納品日が登録されている → それを使用
        for (const irr of irregularDates) {
          entries.push({
            deadlineDate,
            deliveryDate: parseYmd(irr.delivery_date),
            isIrregular: true,
            blackoutTitle: blackout.title,
            note: irr.note ?? undefined,
          })
        }
      } else {
        // 未登録 → 不可期間終了後の最初の通常納品曜日
        const nextDate = nextDeliveryAfterBlackout(s.delivery_dow, parseYmd(blackout.end_date))
        entries.push({
          deadlineDate,
          deliveryDate: nextDate,
          isIrregular: false,
          blackoutTitle: blackout.title,
        })
      }
    }
  }

  return entries
})

/**
 * 選択週に重なる納品不可期間（警告バナー用）
 */
const weekBlackouts = computed<DeliveryBlackoutPeriod[]>(() => {
  if (!weekStart.value) return []
  const mon = parseYmd(weekStart.value)
  const sun = addDays(mon, 6)
  const monStr = toDateStr(mon)
  const sunStr = toDateStr(sun)
  return orderScheduleStore.blackouts.filter(
    (b) => b.start_date <= sunStr && b.end_date >= monStr,
  )
})

// ---------------- 操作 ----------------

function ensureGuestKeys() {
  for (const d of weekDays.value) {
    if (!(d.date in guestTotals)) guestTotals[d.date] = 0
  }
}

function selectWeek(which: 'last' | 'this' | 'next') {
  const mon = getMondayOf(new Date())
  if (which === 'last') mon.setDate(mon.getDate() - 7)
  if (which === 'next') mon.setDate(mon.getDate() + 7)
  activePreset.value = which
  weekStart.value = toDateStr(mon)
}

function onWeekStartChange() {
  activePreset.value = ''
}

function breakdownOf(date: string) {
  return computeCourseBreakdown(guestTotals[date] || 0, ratios)
}

watch(weekStart, ensureGuestKeys)

function calc() {
  calculating.value = true
  try {
    const dailyData = weekDays.value.map((d) => {
      const b = breakdownOf(d.date)
      return {
        dayOfWeek: d.dow,
        isHoliday: d.isHoliday,
        courseCasual: b.casual,
        courseStandard: b.standard,
        coursePremium: b.premium,
      }
    })
    const stocks: Record<string, number> = {}
    if (useStock.value) {
      for (const s of orderSkewers.value) stocks[s.id] = stockValues[s.id] || 0
    }
    const schedules = orderScheduleStore.schedules.map((s) => ({
      deadlineDow: s.deadline_dow,
      deliveryDow: s.delivery_dow,
      upliftWeekday: s.uplift_weekday,
      upliftHoliday: s.uplift_holiday,
    }))
    const res = calculateOrderEstimate({
      skewers: skewersStore.skewers,
      dailyData,
      stocks,
      schedules,
    })
    result.value = res.groups
    equalQty.value = calcEqualOrderQty(res.groups)
  } finally {
    calculating.value = false
  }
}

// ---------------- 結果表示ヘルパー ----------------

function groupTitle(group: OrderEstimateGroup): string {
  return group.deliveryDow >= 0
    ? `${DOW_LABELS[group.deliveryDow]}曜納品`
    : (group.label ?? '発注推奨量')
}
function coverageLabel(group: OrderEstimateGroup): string {
  return group.coverDayDows.map((d) => DOW_LABELS[d]).join('・')
}
function visibleItems(group: OrderEstimateGroup) {
  return group.items.filter((it) => it.requiredMaterialG !== null)
}

// ---------------- localStorage ----------------

function loadLocal() {
  try {
    const g = localStorage.getItem(GUESTS_KEY)
    if (g) {
      const parsed = JSON.parse(g) as Record<string, number>
      for (const [k, v] of Object.entries(parsed)) guestTotals[k] = Number(v) || 0
    }
  } catch {
    // 破損データは無視
  }
  try {
    const r = localStorage.getItem(RATIO_KEY)
    if (r) {
      const p = JSON.parse(r) as Partial<typeof ratios>
      if (typeof p.casual === 'number') ratios.casual = p.casual
      if (typeof p.standard === 'number') ratios.standard = p.standard
      if (typeof p.premium === 'number') ratios.premium = p.premium
    }
  } catch {
    // 破損データは無視
  }
}

watch(
  guestTotals,
  () => {
    try {
      localStorage.setItem(GUESTS_KEY, JSON.stringify(guestTotals))
    } catch {
      // 保存失敗は無視
    }
  },
  { deep: true },
)
watch(
  ratios,
  () => {
    try {
      localStorage.setItem(RATIO_KEY, JSON.stringify(ratios))
    } catch {
      // 保存失敗は無視
    }
  },
  { deep: true },
)

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    const tenantId = auth.effectiveTenantId
    loadLocal()
    await Promise.all([skewersStore.fetchActive(tenantId), orderScheduleStore.fetchAll(tenantId)])
    if (skewersStore.error) throw new Error(skewersStore.error)
    if (orderScheduleStore.error) throw new Error(orderScheduleStore.error)
    selectWeek('this')
    ensureGuestKeys()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '読み込みに失敗しました'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-8">
    <!-- ヘッダー -->
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark px-4 py-4 sticky top-0 z-10">
      <div class="max-w-lg mx-auto flex items-center gap-3 pr-12">
        <router-link to="/" class="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 text-sm">‹ ホーム</router-link>
        <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">発注推定</h1>
        <div class="ml-auto"><TenantSwitcher /></div>
      </div>
    </header>

    <main class="max-w-lg mx-auto px-4 py-5 space-y-4">
      <p v-if="loading" class="text-center text-neutral-400 dark:text-neutral-500 py-12">読み込み中...</p>
      <p v-else-if="loadError" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
        {{ loadError }}
      </p>

      <template v-else>
        <!-- 週選択 -->
        <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3 space-y-3">
          <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">週選択</h2>
          <div class="flex gap-2">
            <button
              v-for="opt in WEEK_PRESETS"
              :key="opt"
              type="button"
              class="flex-1 min-h-tap rounded-xl text-sm font-medium border active:scale-95 transition-transform"
              :class="
                activePreset === opt
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white dark:bg-[#2A2A2A] text-neutral-500 dark:text-neutral-400 border-edge dark:border-edge-dark'
              "
              @click="selectWeek(opt)"
            >
              {{ opt === 'last' ? '先週' : opt === 'this' ? '今週' : '来週' }}
            </button>
          </div>
          <label class="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            週開始（月）
            <input
              v-model="weekStart"
              type="date"
              class="rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              @change="onWeekStartChange"
            />
          </label>
        </section>

        <!-- 今週の発注スケジュール（運用管理で登録されたものを表示） -->
        <template v-if="weekSchedules.length > 0 || weekBlackouts.length > 0">
          <!-- 納品不可期間 警告バナー -->
          <div
            v-for="(blk, bi) in weekBlackouts"
            :key="`blk-${bi}`"
            class="flex items-start gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl px-4 py-3"
          >
            <span class="text-base leading-none mt-0.5">⚠️</span>
            <div>
              <p class="text-sm font-semibold text-amber-700 dark:text-amber-400">
                {{ blk.title }}（{{ blk.start_date.slice(5).replace('-', '/') }}〜{{ blk.end_date.slice(5).replace('-', '/') }}）の納品不可期間があります。
              </p>
              <p class="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                通常より早めの発注をご検討ください。
              </p>
            </div>
          </div>

          <!-- 発注スケジュール一覧 -->
          <section
            v-if="weekSchedules.length > 0"
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
          >
            <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              📦 今週の発注スケジュール
            </h2>
            <ul class="divide-y divide-edge dark:divide-edge-dark">
              <li
                v-for="(sch, i) in weekSchedules"
                :key="i"
                class="px-4 py-3 text-sm text-neutral-700 dark:text-neutral-200"
              >
                <div class="flex items-center gap-2 flex-wrap">
                  <span>締め切り <span class="font-semibold tabular-nums">{{ fmtMdDow(sch.deadlineDate) }}</span></span>
                  <span class="text-neutral-400 dark:text-neutral-500">→</span>
                  <span>
                    納品
                    <span
                      class="font-semibold tabular-nums"
                      :class="sch.isIrregular ? 'text-amber-500' : 'text-brand-500'"
                    >{{ fmtMdDow(sch.deliveryDate) }}</span>
                    <span v-if="sch.isIrregular" class="ml-1 text-xs text-amber-500">⚠️ イレギュラー納品</span>
                  </span>
                </div>
                <p v-if="sch.note" class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  📝 {{ sch.note }}
                </p>
              </li>
            </ul>
          </section>
        </template>

        <!-- コース比率 -->
        <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3 space-y-2">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">コース比率</h2>
            <span
              class="text-xs font-medium px-2.5 py-1 rounded-full border"
              :class="ratioSum === 100 ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20'"
            >
              合計{{ ratioSum }}%
            </span>
          </div>
          <div class="flex gap-3">
            <label class="flex-1 text-xs text-neutral-500 dark:text-neutral-400">
              カジュアル
              <input
                v-model.number="ratios.casual"
                type="number"
                inputmode="numeric"
                min="0"
                max="100"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
            <label class="flex-1 text-xs text-neutral-500 dark:text-neutral-400">
              スタンダード
              <input
                v-model.number="ratios.standard"
                type="number"
                inputmode="numeric"
                min="0"
                max="100"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
            <label class="flex-1 text-xs text-neutral-500 dark:text-neutral-400">
              プレミアム
              <input
                v-model.number="ratios.premium"
                type="number"
                inputmode="numeric"
                min="0"
                max="100"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
          </div>
        </section>

        <!-- 来客数入力 -->
        <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
          <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">来客数入力</h2>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs text-neutral-500 dark:text-neutral-400">
                <th class="px-3 py-2 text-left">曜日</th>
                <th class="px-3 py-2 text-left">日付</th>
                <th class="px-3 py-2">来客数（人）</th>
                <th class="px-3 py-2 text-left">コース内訳</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="d in weekDays"
                :key="d.date"
                class="border-t border-edge dark:border-edge-dark"
                :class="d.isHoliday || d.dow === 0 ? 'bg-red-500/[0.06]' : ''"
              >
                <td class="px-3 py-2">
                  <span
                    :class="d.dow === 0 || d.isHoliday ? 'text-red-500 dark:text-red-400 font-bold' : 'text-neutral-700 dark:text-neutral-200'"
                  >
                    {{ DOW_LABELS[d.dow] }}
                  </span>
                  <span
                    v-if="d.isHoliday"
                    class="ml-1 text-[10px] bg-red-500 text-white rounded px-1"
                  >祝</span>
                </td>
                <td class="px-3 py-2 text-neutral-500 dark:text-neutral-400">{{ d.mdLabel }}</td>
                <td class="px-3 py-2 text-center">
                  <input
                    v-model.number="guestTotals[d.date]"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    class="w-20 text-center tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                  />
                </td>
                <td class="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <template v-if="(guestTotals[d.date] || 0) > 0">
                    C{{ breakdownOf(d.date).casual }}
                    S{{ breakdownOf(d.date).standard }}
                    P{{ breakdownOf(d.date).premium }}
                  </template>
                  <template v-else>－</template>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- 現在庫入力 -->
          <div class="px-4 py-3 border-t border-edge dark:border-edge-dark">
            <label class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
              <input
                v-model="useStock"
                type="checkbox"
                class="w-5 h-5 rounded border-edge dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] text-brand-500 focus:ring-brand-500"
              />
              現在庫を入力して差し引く
            </label>
            <div v-if="useStock" class="mt-2 space-y-1">
              <p
                v-if="orderSkewers.length === 0"
                class="text-xs text-neutral-400 dark:text-neutral-500"
              >
                発注設定済みの串がありません（運用管理で重量g・発注単位gを設定してください）
              </p>
              <div
                v-for="s in orderSkewers"
                :key="s.id"
                class="flex items-center justify-between"
              >
                <span class="text-sm text-neutral-700 dark:text-neutral-200">{{ s.name }}</span>
                <div class="flex items-center gap-1">
                  <input
                    v-model.number="stockValues[s.id]"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    class="w-20 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                  />
                  <span class="text-xs text-neutral-400 dark:text-neutral-500">本</span>
                </div>
              </div>
            </div>
          </div>

          <div class="px-4 py-3 border-t border-edge dark:border-edge-dark">
            <button
              type="button"
              :disabled="calculating"
              class="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
              @click="calc"
            >
              {{ calculating ? '計算中...' : '発注推定量を計算' }}
            </button>
          </div>
        </section>

        <!-- 結果 -->
        <template v-if="result">
          <section
            v-for="(group, gi) in result"
            :key="gi"
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
          >
            <div class="px-4 py-2.5 bg-black/[0.05] dark:bg-white/[0.06]">
              <p class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                {{ result.length > 1 ? `${gi + 1}回目 — ` : '' }}{{ groupTitle(group) }}
              </p>
              <p v-if="coverageLabel(group)" class="text-xs text-neutral-400 dark:text-neutral-500">
                対象曜日: {{ coverageLabel(group) }}
              </p>
            </div>
            <div v-if="visibleItems(group).length === 0" class="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
              発注設定済みの串がありません
            </div>
            <table v-else class="w-full text-sm">
              <thead>
                <tr class="text-xs text-neutral-500 dark:text-neutral-400 bg-black/[0.03] dark:bg-white/[0.04]">
                  <th class="px-2 py-2 text-left">串名</th>
                  <th class="px-2 py-2">推定人数</th>
                  <th class="px-2 py-2">上振れ後</th>
                  <th class="px-2 py-2">必要原材料</th>
                  <th class="px-2 py-2">発注推奨量</th>
                  <th v-if="useStock" class="px-2 py-2">在庫考慮後</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="it in visibleItems(group)" :key="it.skewerId" class="border-t border-edge dark:border-edge-dark">
                  <td class="px-2 py-2 text-neutral-800 dark:text-neutral-100">{{ it.name }}</td>
                  <td class="px-2 py-2 text-center tabular-nums text-neutral-500 dark:text-neutral-400">{{ it.totalUsage }}</td>
                  <td class="px-2 py-2 text-center tabular-nums text-neutral-500 dark:text-neutral-400">{{ it.upliftedUsage }}</td>
                  <td class="px-2 py-2 text-center tabular-nums text-neutral-500 dark:text-neutral-400">
                    {{ it.requiredMaterialG !== null ? it.requiredMaterialG.toLocaleString() : '-' }}g
                  </td>
                  <td class="px-2 py-2 text-center font-bold tabular-nums text-brand-500">
                    {{ it.orderQty !== null ? it.orderQty + it.orderUnitLabel : '-' }}
                  </td>
                  <td v-if="useStock" class="px-2 py-2 text-center font-bold tabular-nums text-green-600 dark:text-green-400">
                    {{ it.orderQtyWithStock !== null ? it.orderQtyWithStock + it.orderUnitLabel : '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- 均等発注量 -->
          <section
            v-if="result.length > 1 && equalQty.length > 0"
            class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
          >
            <div class="px-4 py-2.5 bg-neutral-700 dark:bg-neutral-800 text-white">
              <p class="text-sm font-semibold">
                均等発注量 <span class="font-normal text-xs opacity-80">（{{ result.length }}回の平均）</span>
              </p>
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-xs text-neutral-500 dark:text-neutral-400 bg-black/[0.03] dark:bg-white/[0.04]">
                  <th class="px-2 py-2 text-left">串名</th>
                  <th class="px-2 py-2">平均発注推奨量</th>
                  <th v-if="useStock" class="px-2 py-2">在庫考慮後（平均）</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="eq in equalQty" :key="eq.skewerId" class="border-t border-edge dark:border-edge-dark">
                  <td class="px-2 py-2 text-neutral-800 dark:text-neutral-100">{{ eq.name }}</td>
                  <td class="px-2 py-2 text-center font-bold tabular-nums text-brand-500">
                    {{ eq.avgOrderQty !== null ? eq.avgOrderQty + eq.orderUnitLabel : '-' }}
                  </td>
                  <td v-if="useStock" class="px-2 py-2 text-center font-bold tabular-nums text-green-600 dark:text-green-400">
                    {{ eq.avgOrderQtyWithStock !== null ? eq.avgOrderQtyWithStock + eq.orderUnitLabel : '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <p class="text-xs text-neutral-400 dark:text-neutral-500 px-1">
            発注推奨量はあくまで参考値です。最終的な発注はご自身でご判断ください。
          </p>
        </template>
      </template>
    </main>
  </div>
</template>
