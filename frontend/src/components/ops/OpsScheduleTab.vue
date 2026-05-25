<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useOrderScheduleStore } from '@/stores/orderSchedule'

const auth = useAuthStore()
const orderScheduleStore = useOrderScheduleStore()

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']
const today = new Date().toISOString().slice(0, 10)

// ─── 通常スケジュール ──────────────────────────────────────────

interface SchedRow {
  deadlineDow: number
  deliveryDow: number
  upliftWdPct: number
  upliftHdPct: number
}

const schedules = ref<SchedRow[]>([])
const savingSched = ref(false)
const schedMsg = ref('')
const errorMsg = ref('')

// ─── 納品不可期間 ──────────────────────────────────────────────

interface IrrDateRow {
  id?: string
  delivery_date: string
  note: string
}
interface BlackoutRow {
  id?: string
  title: string
  start_date: string
  end_date: string
  note: string
  irregular_dates: IrrDateRow[]
}

const blackoutRows = ref<BlackoutRow[]>([])
const expandedBlackoutIdx = ref<number | null>(null)
const savingBlackoutIdx = ref<number | null>(null)
const deleteConfirmBlackoutIdx = ref<number | null>(null)
const deletingBlackout = ref(false)
const blackoutMsg = ref('')

// ─── 初期化 ────────────────────────────────────────────────────

function syncFromStore() {
  schedules.value = orderScheduleStore.schedules.map((s) => ({
    deadlineDow: s.deadline_dow,
    deliveryDow: s.delivery_dow,
    upliftWdPct: Math.round(s.uplift_weekday * 100),
    upliftHdPct: Math.round(s.uplift_holiday * 100),
  }))
  blackoutRows.value = orderScheduleStore.blackouts.map((b) => ({
    id: b.id,
    title: b.title,
    start_date: b.start_date,
    end_date: b.end_date,
    note: b.note ?? '',
    irregular_dates: (b.delivery_irregular_dates ?? []).map((d) => ({
      id: d.id,
      delivery_date: d.delivery_date,
      note: d.note ?? '',
    })),
  }))
}

onMounted(syncFromStore)

// ─── 通常スケジュール操作 ─────────────────────────────────────

function addSchedule() {
  schedules.value.push({ deadlineDow: 3, deliveryDow: 5, upliftWdPct: 10, upliftHdPct: 15 })
}
function removeSchedule(i: number) {
  schedules.value.splice(i, 1)
}

async function saveSchedules() {
  const tenantId = auth.appUser?.tenant_id
  if (!tenantId) { errorMsg.value = 'テナント情報がありません'; return }
  savingSched.value = true
  schedMsg.value = ''
  errorMsg.value = ''
  try {
    await orderScheduleStore.saveSchedules(
      schedules.value.map((r) => ({
        deadline_dow: r.deadlineDow,
        delivery_dow: r.deliveryDow,
        uplift_weekday: r.upliftWdPct / 100,
        uplift_holiday: r.upliftHdPct / 100,
      })),
      tenantId,
    )
    syncFromStore()
    schedMsg.value = '通常スケジュールを保存しました'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    savingSched.value = false
  }
}

// ─── 納品不可期間アコーディオン ────────────────────────────────

function isPastBlackout(row: BlackoutRow): boolean {
  return row.end_date !== '' && row.end_date < today
}

function toggleExpandBlackout(i: number) {
  expandedBlackoutIdx.value = expandedBlackoutIdx.value === i ? null : i
}
function closeExpandBlackout() {
  expandedBlackoutIdx.value = null
}
function isExpandedBlackout(i: number): boolean {
  return expandedBlackoutIdx.value === i
}

function addBlackout() {
  blackoutRows.value.push({ title: '', start_date: '', end_date: '', note: '', irregular_dates: [] })
  expandedBlackoutIdx.value = blackoutRows.value.length - 1
}

function addIrregularDate(i: number) {
  blackoutRows.value[i].irregular_dates.push({ delivery_date: '', note: '' })
}
function removeIrregularDate(i: number, j: number) {
  blackoutRows.value[i].irregular_dates.splice(j, 1)
}

function fmtDateRange(start: string, end: string): string {
  if (!start || !end) return '日付未設定'
  const [, sm, sd] = start.split('-').map(Number)
  const [, em, ed] = end.split('-').map(Number)
  return `${sm}/${sd}〜${em}/${ed}`
}

// ─── 納品不可期間 保存 / 削除 ─────────────────────────────────

async function saveBlackout(i: number) {
  const tenantId = auth.appUser?.tenant_id
  if (!tenantId) { errorMsg.value = 'テナント情報がありません'; return }
  const row = blackoutRows.value[i]
  if (!row.title.trim()) { errorMsg.value = 'タイトルを入力してください'; return }
  if (!row.start_date || !row.end_date) { errorMsg.value = '開始日・終了日を入力してください'; return }
  savingBlackoutIdx.value = i
  errorMsg.value = ''
  blackoutMsg.value = ''
  try {
    await orderScheduleStore.saveBlackout(
      {
        id: row.id,
        title: row.title.trim(),
        start_date: row.start_date,
        end_date: row.end_date,
        note: row.note.trim() || null,
        irregular_dates: row.irregular_dates
          .filter((d) => d.delivery_date)
          .map((d) => ({ id: d.id, delivery_date: d.delivery_date, note: d.note.trim() || null })),
      },
      tenantId,
    )
    syncFromStore()
    expandedBlackoutIdx.value = null
    blackoutMsg.value = '保存しました'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    savingBlackoutIdx.value = null
  }
}

async function executeDeleteBlackout() {
  const i = deleteConfirmBlackoutIdx.value
  if (i === null) return
  const row = blackoutRows.value[i]
  deletingBlackout.value = true
  errorMsg.value = ''
  blackoutMsg.value = ''
  try {
    if (row.id) {
      await orderScheduleStore.deleteBlackout(row.id)
      syncFromStore()
    } else {
      blackoutRows.value.splice(i, 1)
    }
    expandedBlackoutIdx.value = null
    deleteConfirmBlackoutIdx.value = null
    blackoutMsg.value = '削除しました'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '削除に失敗しました'
  } finally {
    deletingBlackout.value = false
  }
}

const inputCls =
  'w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm'
</script>

<template>
  <div class="space-y-4">
    <p v-if="errorMsg" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      {{ errorMsg }}
    </p>

    <!-- ─── 通常週スケジュール ─────────────────────────────────── -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <div class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-between">
        <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">通常週スケジュール</h2>
        <button type="button" class="text-xs text-brand-500 font-medium" @click="addSchedule">
          ＋ 追加
        </button>
      </div>

      <div v-if="schedules.length === 0" class="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
        スケジュールがありません
      </div>
      <ul v-else class="divide-y divide-edge dark:divide-edge-dark">
        <li v-for="(s, i) in schedules" :key="i" class="px-4 py-3 space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              締め曜日
              <select v-model.number="s.deadlineDow" :class="['mt-0.5', inputCls]">
                <option v-for="(l, d) in DOW_LABELS" :key="d" :value="d">{{ l }}</option>
              </select>
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              納品曜日
              <select v-model.number="s.deliveryDow" :class="['mt-0.5', inputCls]">
                <option v-for="(l, d) in DOW_LABELS" :key="d" :value="d">{{ l }}</option>
              </select>
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              上振れ 平日（%）
              <input v-model.number="s.upliftWdPct" type="number" inputmode="numeric" min="0" max="100" :class="['mt-0.5', inputCls]" />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              上振れ 祝日（%）
              <input v-model.number="s.upliftHdPct" type="number" inputmode="numeric" min="0" max="100" :class="['mt-0.5', inputCls]" />
            </label>
          </div>
          <button type="button" class="text-xs text-red-500 dark:text-red-400" @click="removeSchedule(i)">
            削除
          </button>
        </li>
      </ul>

      <div class="px-4 py-3 border-t border-edge dark:border-edge-dark">
        <p v-if="schedMsg" class="text-xs text-green-600 dark:text-green-400 mb-2">{{ schedMsg }}</p>
        <button
          type="button"
          :disabled="savingSched"
          class="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
          @click="saveSchedules"
        >
          {{ savingSched ? '保存中...' : '💾 通常スケジュールを保存' }}
        </button>
      </div>
    </section>

    <!-- ─── イレギュラー納品日設定 ───────────────────────────── -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <div class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-between">
        <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">イレギュラー納品日設定</h2>
        <button type="button" class="text-xs text-brand-500 font-medium" @click="addBlackout">
          ＋ 新規追加
        </button>
      </div>

      <ul class="divide-y divide-edge dark:divide-edge-dark">
        <template v-for="(row, i) in blackoutRows" :key="row.id ?? `new-${i}`">
          <li>
            <!-- 一覧行 -->
            <div
              class="px-4 py-3 flex items-center gap-3 cursor-pointer"
              :class="isPastBlackout(row) ? 'opacity-50' : ''"
              @click="toggleExpandBlackout(i)"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                  {{ row.title || '（タイトル未入力）' }}
                  <span v-if="!row.id" class="ml-1 text-[10px] text-amber-500">未保存</span>
                </p>
                <p class="text-xs text-neutral-400 dark:text-neutral-500">
                  {{ fmtDateRange(row.start_date, row.end_date) }}
                  <span v-if="row.irregular_dates.length > 0" class="ml-1 text-brand-400">
                    · イレギュラー {{ row.irregular_dates.length }}日
                  </span>
                </p>
              </div>
              <span
                class="shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
                :class="isExpandedBlackout(i)
                  ? 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                  : 'text-brand-500'"
              >
                {{ isExpandedBlackout(i) ? '✕' : '詳細 ›' }}
              </span>
            </div>

            <!-- アコーディオン展開エリア -->
            <div
              v-if="isExpandedBlackout(i)"
              class="px-4 pb-5 pt-1 space-y-4 bg-brand-500/[0.03] dark:bg-white/[0.02] border-t border-edge dark:border-edge-dark"
              @click.stop
            >
              <!-- 右上 × ボタン -->
              <div class="flex justify-end -mb-2">
                <button
                  type="button"
                  class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-lg leading-none p-1"
                  @click="closeExpandBlackout"
                >✕</button>
              </div>

              <!-- タイトル -->
              <div>
                <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">タイトル</label>
                <input v-model="row.title" type="text" placeholder="例: 年末年始 2026" :class="inputCls" />
              </div>

              <!-- 期間 -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">納品不可 開始日</label>
                  <input v-model="row.start_date" type="date" :class="inputCls" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">納品不可 終了日</label>
                  <input v-model="row.end_date" type="date" :class="inputCls" />
                </div>
              </div>

              <!-- メモ -->
              <div>
                <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">メモ（任意）</label>
                <input v-model="row.note" type="text" placeholder="備考など" :class="inputCls" />
              </div>

              <!-- イレギュラー納品日 -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">イレギュラー納品日</label>
                  <button
                    type="button"
                    class="text-xs text-brand-500 font-medium"
                    @click.stop="addIrregularDate(i)"
                  >
                    ＋ 日付を追加
                  </button>
                </div>

                <div v-if="row.irregular_dates.length === 0" class="text-xs text-neutral-400 dark:text-neutral-500 py-2">
                  イレギュラー納品日が未設定の場合、不可期間後の最初の通常納品日が自動で使われます。
                </div>

                <ul class="space-y-2">
                  <li
                    v-for="(d, j) in row.irregular_dates"
                    :key="j"
                    class="flex items-center gap-2"
                  >
                    <input
                      v-model="d.delivery_date"
                      type="date"
                      class="w-36 shrink-0 rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                    />
                    <input
                      v-model="d.note"
                      type="text"
                      placeholder="備考"
                      class="flex-1 min-w-0 rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                    />
                    <button
                      type="button"
                      class="shrink-0 text-red-400 hover:text-red-500 p-1 text-sm"
                      @click.stop="removeIrregularDate(i, j)"
                    >✕</button>
                  </li>
                </ul>
              </div>

              <!-- 保存 / 削除ボタン -->
              <div class="flex gap-3 pt-1">
                <button
                  type="button"
                  :disabled="savingBlackoutIdx === i"
                  class="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform"
                  @click.stop="saveBlackout(i)"
                >
                  {{ savingBlackoutIdx === i ? '保存中...' : '💾 保存する' }}
                </button>
                <button
                  type="button"
                  class="px-4 py-3 bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 text-sm font-semibold rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                  @click.stop="deleteConfirmBlackoutIdx = i"
                >
                  削除
                </button>
              </div>
            </div>
          </li>
        </template>

        <li v-if="blackoutRows.length === 0" class="px-4 py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
          納品不可期間が登録されていません
        </li>
      </ul>

      <div v-if="blackoutMsg" class="px-4 py-2.5 border-t border-edge dark:border-edge-dark">
        <p class="text-xs text-green-600 dark:text-green-400">{{ blackoutMsg }}</p>
      </div>
    </section>

    <!-- ─── 削除確認モーダル ─────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="deleteConfirmBlackoutIdx !== null"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
        @click.self="deleteConfirmBlackoutIdx = null"
      >
        <div class="bg-card dark:bg-card-dark rounded-2xl p-6 w-full max-w-xs shadow-xl space-y-4">
          <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            「{{ blackoutRows[deleteConfirmBlackoutIdx]?.title || '（タイトル未入力）' }}」を削除しますか？
          </h3>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            この操作は取り消せません。イレギュラー納品日も削除されます。
          </p>
          <div class="flex gap-3">
            <button
              type="button"
              class="flex-1 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-semibold rounded-xl"
              @click="deleteConfirmBlackoutIdx = null"
            >
              キャンセル
            </button>
            <button
              type="button"
              :disabled="deletingBlackout"
              class="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-400/60 text-white text-sm font-semibold rounded-xl transition-colors"
              @click="executeDeleteBlackout"
            >
              {{ deletingBlackout ? '削除中...' : '削除する' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
