<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import {
  type Scope,
  SCOPE_LABELS,
  jstTodayYmd,
  parseYmd,
  toYmd,
  dowOf,
  getPeriodRange,
} from '@/composables/usePeriodRange'

const props = defineProps<{
  scope: Scope
  /** 現在選択中のオフセット（0=今期） */
  modelValue: number
  open: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [offset: number]
  cancel: []
}>()

// ─── 基準日（JST） ─────────────────────────────────────────────────
const today = jstTodayYmd()
const [todayY, todayM] = parseYmd(today)

// ─── カレンダー表示月（day/weekスコープ） ──────────────────────────
const viewYear  = ref(todayY)
const viewMonth = ref(todayM)

// ─── 年ピッカー表示年（month/quarterスコープ） ─────────────────────
const pickerYear = ref(todayY)

// picker が開いたとき、選択中期間の年月にジャンプ
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  const sel = getPeriodRange(props.scope, props.modelValue)
  const [sy, sm] = parseYmd(sel.from)
  pickerYear.value = sy
  viewYear.value   = sy
  viewMonth.value  = sm
})

// ─── カレンダーグリッド生成 ────────────────────────────────────────
/**
 * 月曜始まり 7列 × 最大6行のカレンダーグリッドを返す。
 * null = その月に属さないセル（空白）
 */
function buildGrid(year: number, month: number): Array<Array<string | null>> {
  const lastDay = new Date(year, month, 0).getDate()  // month は1-indexed なので OK
  const firstDow = dowOf(toYmd(year, month, 1))       // 0=Sun..6=Sat
  const startCol = firstDow === 0 ? 6 : firstDow - 1  // Mon=0 に変換

  const cells: Array<string | null> = []
  for (let i = 0; i < startCol; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(toYmd(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const rows: Array<Array<string | null>> = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

const calendarGrid = computed(() => buildGrid(viewYear.value, viewMonth.value))

const calendarHeaderLabel = computed(() => {
  const MONTH_JA = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
  return `${viewYear.value}年${MONTH_JA[viewMonth.value - 1]}`
})

function prevCalMonth() {
  if (viewMonth.value === 1) { viewMonth.value = 12; viewYear.value-- }
  else viewMonth.value--
}
function nextCalMonth() {
  if (!canGoNextCalMonth.value) return
  if (viewMonth.value === 12) { viewMonth.value = 1; viewYear.value++ }
  else viewMonth.value++
}
const canGoNextCalMonth = computed(() =>
  viewYear.value < todayY || (viewYear.value === todayY && viewMonth.value < todayM),
)

// ─── 選択中のハイライト ────────────────────────────────────────────
const selectedPeriod = computed(() => getPeriodRange(props.scope, props.modelValue))

function isDaySelected(ymd: string | null): boolean {
  if (!ymd) return false
  return ymd >= selectedPeriod.value.from && ymd <= selectedPeriod.value.to
}
function isWeekRowSelected(row: Array<string | null>): boolean {
  const first = row.find(d => d !== null)
  if (!first) return false
  return first >= selectedPeriod.value.from && first <= selectedPeriod.value.to
}
function isMonthSelected(y: number, m: number): boolean {
  const off = monthOffset(y, m)
  if (off < 0) return false
  return getPeriodRange('month', off).from === selectedPeriod.value.from
}
function isQuarterSelected(y: number, q: number): boolean {
  const off = quarterOffset(y, q)
  if (off < 0) return false
  return getPeriodRange('quarter', off).from === selectedPeriod.value.from
}
function isYearSelected(y: number): boolean {
  return getPeriodRange('year', todayY - y).from === selectedPeriod.value.from
}

// ─── オフセット計算 ────────────────────────────────────────────────
function daysUntilToday(ymd: string): number {
  const [y, m, d] = parseYmd(ymd)
  const [ty, tm, td] = parseYmd(today)
  return Math.round(
    (new Date(ty, tm - 1, td).getTime() - new Date(y, m - 1, d).getTime()) / 86400000,
  )
}
function dayOffset(ymd: string): number  { return daysUntilToday(ymd) }

function monthOffset(y: number, m: number): number {
  return (todayY - y) * 12 + (todayM - m)
}
function quarterOffset(y: number, q: number): number {
  const curQ = Math.ceil(todayM / 3)
  return (todayY - y) * 4 + (curQ - q)
}

function weekOffsetOfDate(ymd: string): number {
  const [y, m, d] = parseYmd(ymd)
  const dow = dowOf(ymd)
  const daysFromMon = dow === 0 ? 6 : dow - 1
  const [ty, tm, td] = parseYmd(today)
  const todayDow = dowOf(today)
  const todayFromMon = todayDow === 0 ? 6 : todayDow - 1
  const weekMonMs = new Date(y, m - 1, d - daysFromMon).getTime()
  const todayMonMs = new Date(ty, tm - 1, td - todayFromMon).getTime()
  return Math.round((todayMonMs - weekMonMs) / (7 * 86400000))
}

// ─── 選択ハンドラ ──────────────────────────────────────────────────
function selectDay(ymd: string | null) {
  if (!ymd || ymd > today) return
  emit('update:modelValue', dayOffset(ymd))
}

function selectWeekRow(row: Array<string | null>) {
  const first = row.find(d => d !== null)
  if (!first || first > today) return
  emit('update:modelValue', weekOffsetOfDate(first))
}

function selectMonth(y: number, m: number) {
  const off = monthOffset(y, m)
  if (off < 0) return
  emit('update:modelValue', off)
}

function selectQuarter(y: number, q: number) {
  const off = quarterOffset(y, q)
  if (off < 0) return
  emit('update:modelValue', off)
}

function selectYear(y: number) {
  const off = todayY - y
  if (off < 0) return
  emit('update:modelValue', off)
}

// ─── 月名・定数 ────────────────────────────────────────────────────
const MONTHS_JA = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const DOW_LABELS = ['月','火','水','木','金','土','日']
const QUARTERS = [1, 2, 3, 4]
const QUARTER_RANGES = ['1〜3月','4〜6月','7〜9月','10〜12月']

const availableYears = computed(() => {
  const years: number[] = []
  for (let y = todayY; y >= todayY - 5; y--) years.push(y)
  return years
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="open"
        class="fixed inset-0 bg-black/60 z-50 flex items-end justify-center sm:items-center"
        @click.self="emit('cancel')"
      >
        <div class="bg-card dark:bg-card-dark rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
          <!-- ヘッダー -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-edge dark:border-edge-dark shrink-0">
            <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              {{ SCOPE_LABELS[scope] }}を選択
            </h3>
            <button
              type="button"
              class="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              @click="emit('cancel')"
            >
              <X :size="16" />
            </button>
          </div>

          <div class="overflow-y-auto flex-1">

            <!-- ─── 単日 / 週: カレンダー ─── -->
            <template v-if="scope === 'day' || scope === 'week'">
              <!-- 月ナビ -->
              <div class="flex items-center gap-2 px-4 py-2 border-b border-edge dark:border-edge-dark shrink-0">
                <button type="button" @click="prevCalMonth"
                  class="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                  <ChevronLeft :size="15" />
                </button>
                <p class="flex-1 text-center text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  {{ calendarHeaderLabel }}
                </p>
                <button type="button" @click="nextCalMonth" :disabled="!canGoNextCalMonth"
                  class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                  :class="canGoNextCalMonth ? 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800' : 'text-neutral-200 dark:text-neutral-700 cursor-not-allowed'">
                  <ChevronRight :size="15" />
                </button>
              </div>
              <!-- 曜日ヘッダー -->
              <div class="grid grid-cols-7 px-3 pt-2.5 pb-1">
                <div v-for="lbl in DOW_LABELS" :key="lbl"
                  class="text-center text-[10px] font-medium text-neutral-400 dark:text-neutral-500">{{ lbl }}</div>
              </div>
              <!-- グリッド -->
              <div class="px-2 pb-3">
                <!-- 週選択: 行単位 -->
                <template v-if="scope === 'week'">
                  <button
                    v-for="(row, ri) in calendarGrid"
                    :key="ri"
                    type="button"
                    class="grid grid-cols-7 w-full rounded-xl transition-colors mb-0.5 py-0.5"
                    :class="isWeekRowSelected(row) ? 'bg-brand-500' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'"
                    @click="selectWeekRow(row)"
                  >
                    <div
                      v-for="(ymd, ci) in row"
                      :key="ci"
                      class="h-8 flex items-center justify-center text-xs tabular-nums"
                      :class="[
                        !ymd ? 'opacity-0' : '',
                        isWeekRowSelected(row) ? 'text-white font-medium' : 'text-neutral-700 dark:text-neutral-200',
                        ymd === today ? 'underline' : '',
                        ymd && ymd > today ? 'opacity-30' : '',
                      ]"
                    >{{ ymd ? Number(ymd.split('-')[2]) : '' }}</div>
                  </button>
                </template>
                <!-- 単日: セル単位 -->
                <template v-else>
                  <div v-for="(row, ri) in calendarGrid" :key="ri" class="grid grid-cols-7 mb-0.5">
                    <button
                      v-for="(ymd, ci) in row"
                      :key="ci"
                      type="button"
                      class="h-8 flex items-center justify-center text-xs rounded-lg tabular-nums transition-colors"
                      :class="[
                        !ymd ? 'invisible' : '',
                        isDaySelected(ymd)
                          ? 'bg-brand-500 text-white font-bold'
                          : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
                        ymd === today && !isDaySelected(ymd) ? 'ring-1 ring-brand-500' : '',
                        ymd && ymd > today ? 'opacity-30 pointer-events-none' : '',
                      ]"
                      @click="selectDay(ymd)"
                    >{{ ymd ? Number(ymd.split('-')[2]) : '' }}</button>
                  </div>
                </template>
              </div>
            </template>

            <!-- ─── 月: 年ナビ + 月グリッド ─── -->
            <template v-else-if="scope === 'month'">
              <div class="flex items-center gap-2 px-4 py-2.5 border-b border-edge dark:border-edge-dark">
                <button type="button" @click="pickerYear--"
                  class="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <ChevronLeft :size="15" />
                </button>
                <p class="flex-1 text-center text-sm font-semibold text-neutral-800 dark:text-neutral-100">{{ pickerYear }}年</p>
                <button type="button" @click="pickerYear++" :disabled="pickerYear >= todayY"
                  class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                  :class="pickerYear < todayY ? 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800' : 'text-neutral-200 dark:text-neutral-700 cursor-not-allowed'">
                  <ChevronRight :size="15" />
                </button>
              </div>
              <div class="grid grid-cols-3 gap-2 p-4">
                <button
                  v-for="(lbl, mi) in MONTHS_JA"
                  :key="mi"
                  type="button"
                  class="py-2.5 rounded-xl text-sm font-medium transition-colors"
                  :class="[
                    isMonthSelected(pickerYear, mi + 1)
                      ? 'bg-brand-500 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-brand-500/10 dark:hover:bg-brand-500/20',
                    pickerYear === todayY && mi + 1 > todayM
                      ? 'opacity-30 pointer-events-none' : '',
                  ]"
                  @click="selectMonth(pickerYear, mi + 1)"
                >{{ lbl }}</button>
              </div>
            </template>

            <!-- ─── 四半期: 年ナビ + 4Qボタン ─── -->
            <template v-else-if="scope === 'quarter'">
              <div class="flex items-center gap-2 px-4 py-2.5 border-b border-edge dark:border-edge-dark">
                <button type="button" @click="pickerYear--"
                  class="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <ChevronLeft :size="15" />
                </button>
                <p class="flex-1 text-center text-sm font-semibold text-neutral-800 dark:text-neutral-100">{{ pickerYear }}年</p>
                <button type="button" @click="pickerYear++" :disabled="pickerYear >= todayY"
                  class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                  :class="pickerYear < todayY ? 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800' : 'text-neutral-200 dark:text-neutral-700 cursor-not-allowed'">
                  <ChevronRight :size="15" />
                </button>
              </div>
              <div class="grid grid-cols-2 gap-3 p-4">
                <button
                  v-for="(q, qi) in QUARTERS"
                  :key="q"
                  type="button"
                  class="py-4 rounded-2xl text-sm font-semibold transition-colors"
                  :class="[
                    isQuarterSelected(pickerYear, q)
                      ? 'bg-brand-500 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-brand-500/10 dark:hover:bg-brand-500/20',
                    quarterOffset(pickerYear, q) < 0 ? 'opacity-30 pointer-events-none' : '',
                  ]"
                  @click="selectQuarter(pickerYear, q)"
                >
                  <p>Q{{ q }}</p>
                  <p class="text-[10px] font-normal opacity-70">{{ QUARTER_RANGES[qi] }}</p>
                </button>
              </div>
            </template>

            <!-- ─── 年: リスト ─── -->
            <template v-else-if="scope === 'year'">
              <div class="p-4 space-y-2">
                <button
                  v-for="y in availableYears"
                  :key="y"
                  type="button"
                  class="w-full py-3 rounded-2xl text-sm font-semibold transition-colors"
                  :class="isYearSelected(y)
                    ? 'bg-brand-500 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-brand-500/10 dark:hover:bg-brand-500/20'"
                  @click="selectYear(y)"
                >{{ y }}年</button>
              </div>
            </template>

          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-enter-active { transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease; }
.sheet-leave-active { transition: transform 0.2s ease-in, opacity 0.2s ease-in; }
.sheet-enter-from, .sheet-leave-to { transform: translateY(100%); opacity: 0; }
</style>
