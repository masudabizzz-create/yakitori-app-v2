<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useOrderScheduleStore } from '@/stores/orderSchedule'

const auth = useAuthStore()
const orderScheduleStore = useOrderScheduleStore()

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']

/** 通常スケジュール行（上振れ率は編集用に % で保持） */
interface SchedRow {
  deadlineDow: number
  deliveryDow: number
  upliftWdPct: number
  upliftHdPct: number
}
/** 例外スケジュール行 */
interface IrrRow {
  weekStart: string
  deadlineDate: string
  deliveryDate: string
  upliftWdPct: number
  upliftHdPct: number
  note: string
}

const schedules = ref<SchedRow[]>([])
const irregulars = ref<IrrRow[]>([])

const savingSched = ref(false)
const savingIrr = ref(false)
const schedMsg = ref('')
const irrMsg = ref('')
const errorMsg = ref('')

function syncFromStore() {
  schedules.value = orderScheduleStore.schedules.map((s) => ({
    deadlineDow: s.deadline_dow,
    deliveryDow: s.delivery_dow,
    upliftWdPct: Math.round(s.uplift_weekday * 100),
    upliftHdPct: Math.round(s.uplift_holiday * 100),
  }))
  irregulars.value = orderScheduleStore.irregulars.map((s) => ({
    weekStart: s.week_start_date,
    deadlineDate: s.deadline_date,
    deliveryDate: s.delivery_date,
    upliftWdPct: Math.round(s.uplift_weekday * 100),
    upliftHdPct: Math.round(s.uplift_holiday * 100),
    note: s.note,
  }))
}

onMounted(syncFromStore)

function addSchedule() {
  schedules.value.push({ deadlineDow: 3, deliveryDow: 5, upliftWdPct: 10, upliftHdPct: 15 })
}
function removeSchedule(i: number) {
  schedules.value.splice(i, 1)
}
function addIrregular() {
  irregulars.value.push({
    weekStart: '',
    deadlineDate: '',
    deliveryDate: '',
    upliftWdPct: 10,
    upliftHdPct: 15,
    note: '',
  })
}
function removeIrregular(i: number) {
  irregulars.value.splice(i, 1)
}

async function saveSchedules() {
  const tenantId = auth.appUser?.tenant_id
  if (!tenantId) {
    errorMsg.value = 'テナント情報がありません'
    return
  }
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

async function saveIrregulars() {
  const tenantId = auth.appUser?.tenant_id
  if (!tenantId) {
    errorMsg.value = 'テナント情報がありません'
    return
  }
  savingIrr.value = true
  irrMsg.value = ''
  errorMsg.value = ''
  try {
    await orderScheduleStore.saveIrregulars(
      irregulars.value.map((r) => ({
        week_start_date: r.weekStart,
        deadline_date: r.deadlineDate,
        delivery_date: r.deliveryDate,
        uplift_weekday: r.upliftWdPct / 100,
        uplift_holiday: r.upliftHdPct / 100,
        note: r.note,
      })),
      tenantId,
    )
    syncFromStore()
    irrMsg.value = '例外スケジュールを保存しました'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    savingIrr.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <p v-if="errorMsg" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      {{ errorMsg }}
    </p>

    <!-- 通常週スケジュール -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <div class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-between">
        <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">通常週スケジュール</h2>
        <button
          type="button"
          class="text-xs text-brand-500 font-medium"
          @click="addSchedule"
        >
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
              <select
                v-model.number="s.deadlineDow"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              >
                <option v-for="(l, d) in DOW_LABELS" :key="d" :value="d">{{ l }}</option>
              </select>
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              納品曜日
              <select
                v-model.number="s.deliveryDow"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              >
                <option v-for="(l, d) in DOW_LABELS" :key="d" :value="d">{{ l }}</option>
              </select>
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              上振れ 平日（%）
              <input
                v-model.number="s.upliftWdPct"
                type="number"
                inputmode="numeric"
                min="0"
                max="100"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              上振れ 祝日（%）
              <input
                v-model.number="s.upliftHdPct"
                type="number"
                inputmode="numeric"
                min="0"
                max="100"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            class="text-xs text-red-500 dark:text-red-400"
            @click="removeSchedule(i)"
          >
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

    <!-- 例外週スケジュール -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <div class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-between">
        <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">例外週スケジュール</h2>
        <button
          type="button"
          class="text-xs text-brand-500 font-medium"
          @click="addIrregular"
        >
          ＋ 追加
        </button>
      </div>

      <div v-if="irregulars.length === 0" class="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
        例外週がありません
      </div>
      <ul v-else class="divide-y divide-edge dark:divide-edge-dark">
        <li v-for="(s, i) in irregulars" :key="i" class="px-4 py-3 space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <label class="text-xs text-neutral-500 dark:text-neutral-400 col-span-2">
              対象週開始日
              <input
                v-model="s.weekStart"
                type="date"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              締め日
              <input
                v-model="s.deadlineDate"
                type="date"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              納品日
              <input
                v-model="s.deliveryDate"
                type="date"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              上振れ 平日（%）
              <input
                v-model.number="s.upliftWdPct"
                type="number"
                inputmode="numeric"
                min="0"
                max="100"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              上振れ 祝日（%）
              <input
                v-model.number="s.upliftHdPct"
                type="number"
                inputmode="numeric"
                min="0"
                max="100"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400 col-span-2">
              備考
              <input
                v-model="s.note"
                type="text"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            class="text-xs text-red-500 dark:text-red-400"
            @click="removeIrregular(i)"
          >
            削除
          </button>
        </li>
      </ul>

      <div class="px-4 py-3 border-t border-edge dark:border-edge-dark">
        <p v-if="irrMsg" class="text-xs text-green-600 dark:text-green-400 mb-2">{{ irrMsg }}</p>
        <button
          type="button"
          :disabled="savingIrr"
          class="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
          @click="saveIrregulars"
        >
          {{ savingIrr ? '保存中...' : '💾 例外スケジュールを保存' }}
        </button>
      </div>
    </section>
  </div>
</template>
