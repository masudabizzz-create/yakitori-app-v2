<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSkewersStore } from '@/stores/skewers'
import type { Skewer, SkewerCategory } from '@/types'

const auth = useAuthStore()
const skewersStore = useSkewersStore()

const CATEGORIES: SkewerCategory[] = [
  'レギュラー',
  'スペシャル',
  'つくね',
  '前日仕込み',
  'その他仕込み',
  '副産物',
]
const DAY_KEYS = [
  'ideal_mon',
  'ideal_tue',
  'ideal_wed',
  'ideal_thu',
  'ideal_fri',
  'ideal_sat',
  'ideal_sun',
] as const
const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

const rows = ref<Skewer[]>([])
const deletedIds = ref<string[]>([])
const saving = ref(false)
const message = ref('')
const errorMsg = ref('')

// 追加フォーム（基本＋詳細アコーディオン）
const showAddForm = ref(false)
const showAddDetail = ref(false)
const addForm = ref({
  name: '',
  category: 'レギュラー' as SkewerCategory,
  unit: 20,
  prepMethodName: '昆布締め',
  threshold1: 0,
  prepAmount1: 0,
  threshold2: 0,
  prepAmount2: 0,
  // 詳細設定（発注関連）
  weightPerStickG: 0,
  yieldPct: 100,
  orderUnitLabel: '',
  orderUnitG: 0,
  courseType: 'all_courses' as 'all_courses' | 'specific_courses',
  tcCasual: false,
  tcStandard: false,
  tcPremium: false,
})

// 1行ごとの詳細展開（モーダル廃止しインラインアコーディオン化）
const expandedRows = ref(new Set<number>())

// 理想在庫モーダル
const idealModalIdx = ref(-1)
const idealBuffer = ref<number[]>([0, 0, 0, 0, 0, 0, 0])

function deepCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

onMounted(() => {
  rows.value = deepCopy(skewersStore.skewers)
})

// ---------------- カテゴリ別ヘルパー ----------------

/** 理想在庫の入力単位の除数（レギュラー=20本/P, つくね=40本/B, それ以外=1） */
function idealDivisor(cat: SkewerCategory): number {
  return cat === 'レギュラー' ? 20 : cat === 'つくね' ? 40 : 1
}
function idealUnitLabel(cat: SkewerCategory): string {
  return cat === 'レギュラー' ? 'P' : cat === 'つくね' ? 'B' : '本'
}
/** 曜日別理想在庫を使うカテゴリか */
function usesIdeal(cat: SkewerCategory): boolean {
  return cat === 'レギュラー' || cat === 'つくね' || cat === '前日仕込み'
}
/** 閾値・仕込量フィールドを表示するカテゴリか（レギュラー/つくね/副産物は非表示） */
function showThresholds(cat: SkewerCategory): boolean {
  return cat === 'スペシャル' || cat === 'その他仕込み' || cat === '前日仕込み'
}
function idealSummary(row: Skewer): string {
  const div = idealDivisor(row.category)
  return DAY_KEYS.map((k, i) => `${DAY_LABELS[i]}${Math.round(row[k] / div)}`).join(' ')
}
function orderConfigured(row: Skewer): boolean {
  return row.weight_per_stick_g > 0 && row.order_unit_g > 0
}

function makeBlankSkewer(over: Partial<Skewer>): Skewer {
  return {
    id: '',
    tenant_id: '',
    name: '',
    category: 'レギュラー',
    ideal_mon: 0,
    ideal_tue: 0,
    ideal_wed: 0,
    ideal_thu: 0,
    ideal_fri: 0,
    ideal_sat: 0,
    ideal_sun: 0,
    unit: 20,
    threshold1: 0,
    prep_amount1: 0,
    threshold2: 0,
    prep_amount2: 0,
    is_active: true,
    prep_method_name: '昆布締め',
    course_type: 'all_courses',
    target_courses: [],
    weight_per_stick_g: 0,
    yield_rate: 1,
    order_unit_label: '',
    order_unit_g: 0,
    sort_order: 0,
    created_at: '',
    ...over,
  }
}

// ---------------- 行の追加・削除 ----------------

function addRow() {
  const f = addForm.value
  if (!f.name.trim()) {
    errorMsg.value = '串名を入力してください'
    return
  }
  errorMsg.value = ''
  const tc: string[] = []
  if (f.tcCasual) tc.push('casual')
  if (f.tcStandard) tc.push('standard')
  if (f.tcPremium) tc.push('premium')
  rows.value.push(
    makeBlankSkewer({
      name: f.name.trim(),
      category: f.category,
      unit: f.unit,
      prep_method_name: f.prepMethodName || '昆布締め',
      threshold1: f.threshold1,
      prep_amount1: f.prepAmount1,
      threshold2: f.threshold2,
      prep_amount2: f.prepAmount2,
      is_active: f.category !== '副産物',
      weight_per_stick_g: f.weightPerStickG,
      yield_rate: (f.yieldPct || 100) / 100,
      order_unit_label: f.orderUnitLabel.trim(),
      order_unit_g: f.orderUnitG,
      course_type: f.courseType,
      target_courses: tc,
    }),
  )
  addForm.value = {
    name: '',
    category: 'レギュラー',
    unit: 20,
    prepMethodName: '昆布締め',
    threshold1: 0,
    prepAmount1: 0,
    threshold2: 0,
    prepAmount2: 0,
    weightPerStickG: 0,
    yieldPct: 100,
    orderUnitLabel: '',
    orderUnitG: 0,
    courseType: 'all_courses',
    tcCasual: false,
    tcStandard: false,
    tcPremium: false,
  }
  showAddForm.value = false
  showAddDetail.value = false
}

function removeRow(i: number) {
  const r = rows.value[i]
  if (!confirm(`「${r.name}」を削除しますか？`)) return
  if (r.id) deletedIds.value.push(r.id)
  rows.value.splice(i, 1)
}

// ---------------- 理想在庫モーダル ----------------

function openIdealModal(i: number) {
  idealModalIdx.value = i
  const r = rows.value[i]
  const div = idealDivisor(r.category)
  idealBuffer.value = DAY_KEYS.map((k) => Math.round(r[k] / div))
}
function closeIdealModal() {
  idealModalIdx.value = -1
}
function saveIdealModal() {
  const i = idealModalIdx.value
  if (i < 0) return
  const r = rows.value[i]
  const div = idealDivisor(r.category)
  DAY_KEYS.forEach((k, idx) => {
    r[k] = (idealBuffer.value[idx] || 0) * div
  })
  closeIdealModal()
}

// ---------------- 行の詳細展開（インラインアコーディオン） ----------------

function toggleExpand(i: number) {
  const s = new Set(expandedRows.value)
  if (s.has(i)) s.delete(i)
  else s.add(i)
  expandedRows.value = s
}

function isExpanded(i: number): boolean {
  return expandedRows.value.has(i)
}

/** target_courses 配列に course を出し入れする */
function toggleTargetCourse(row: Skewer, course: string, on: boolean): void {
  const arr = [...row.target_courses]
  const idx = arr.indexOf(course)
  if (on && idx < 0) arr.push(course)
  if (!on && idx >= 0) arr.splice(idx, 1)
  row.target_courses = arr
}

/** 歩留まり率 0〜1 を % 整数で取得 */
function yieldPctOf(row: Skewer): number {
  return Math.round((row.yield_rate || 1) * 100)
}
function setYieldPct(row: Skewer, pct: number): void {
  row.yield_rate = (Number(pct) || 100) / 100
}

// ---------------- 保存 ----------------

async function save() {
  const tenantId = auth.appUser?.tenant_id
  if (!tenantId) {
    errorMsg.value = 'テナント情報がありません'
    return
  }
  saving.value = true
  message.value = ''
  errorMsg.value = ''
  try {
    await skewersStore.saveSkewers(rows.value, deletedIds.value, tenantId)
    deletedIds.value = []
    rows.value = deepCopy(skewersStore.skewers)
    message.value = '串マスタを保存しました'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <div class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-between">
        <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">串マスタ一覧</h2>
        <button
          type="button"
          class="text-xs text-brand-500 font-medium"
          @click="showAddForm = !showAddForm"
        >
          {{ showAddForm ? '× 閉じる' : '＋ 追加' }}
        </button>
      </div>

      <!-- 追加フォーム -->
      <div v-if="showAddForm" class="px-4 py-3 bg-brand-500/5 border-b border-edge dark:border-edge-dark space-y-2">
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs text-neutral-500 dark:text-neutral-400 col-span-2">
            串名 *
            <input
              v-model="addForm.name"
              type="text"
              placeholder="例: ねぎま"
              class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            />
          </label>
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            カテゴリ
            <select
              v-model="addForm.category"
              class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            >
              <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            計算単位
            <input
              v-model.number="addForm.unit"
              type="number"
              min="0"
              class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            />
          </label>
          <label v-if="addForm.category === '前日仕込み'" class="text-xs text-neutral-500 dark:text-neutral-400 col-span-2">
            仕込み名
            <input
              v-model="addForm.prepMethodName"
              type="text"
              placeholder="例: 昆布締め"
              class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            />
          </label>
          <template v-if="showThresholds(addForm.category)">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              閾値1
              <input
                v-model.number="addForm.threshold1"
                type="number"
                min="0"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              仕込み量1
              <input
                v-model.number="addForm.prepAmount1"
                type="number"
                min="0"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              閾値2
              <input
                v-model.number="addForm.threshold2"
                type="number"
                min="0"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              仕込み量2
              <input
                v-model.number="addForm.prepAmount2"
                type="number"
                min="0"
                class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
              />
            </label>
          </template>
        </div>

        <!-- 詳細設定アコーディオン -->
        <button
          type="button"
          class="text-xs text-brand-500 font-medium"
          @click="showAddDetail = !showAddDetail"
        >
          {{ showAddDetail ? '▲ 詳細設定を閉じる' : '▼ 詳細設定を開く' }}
        </button>
        <div v-if="showAddDetail" class="grid grid-cols-2 gap-2 pt-1 border-t border-edge dark:border-edge-dark">
          <label class="text-xs text-neutral-500 dark:text-neutral-400 col-span-2">
            コース分類
            <select
              v-model="addForm.courseType"
              class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            >
              <option value="all_courses">全コース</option>
              <option value="specific_courses">特定コース</option>
            </select>
          </label>
          <div
            v-if="addForm.courseType === 'specific_courses'"
            class="col-span-2 flex flex-wrap gap-4 text-sm text-neutral-700 dark:text-neutral-200"
          >
            <label class="flex items-center gap-1.5">
              <input v-model="addForm.tcCasual" type="checkbox" class="rounded border-edge dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] text-brand-500 focus:ring-brand-500" />
              カジュアル
            </label>
            <label class="flex items-center gap-1.5">
              <input v-model="addForm.tcStandard" type="checkbox" class="rounded border-edge dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] text-brand-500 focus:ring-brand-500" />
              スタンダード
            </label>
            <label class="flex items-center gap-1.5">
              <input v-model="addForm.tcPremium" type="checkbox" class="rounded border-edge dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] text-brand-500 focus:ring-brand-500" />
              プレミアム
            </label>
          </div>
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            1本あたり重量（g）
            <input
              v-model.number="addForm.weightPerStickG"
              type="number"
              min="0"
              step="0.1"
              class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            />
          </label>
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            歩留まり率（%）
            <input
              v-model.number="addForm.yieldPct"
              type="number"
              min="0"
              max="100"
              class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            />
          </label>
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            発注単位ラベル
            <input
              v-model="addForm.orderUnitLabel"
              type="text"
              placeholder="例: kg、1パック"
              class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            />
          </label>
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            発注単位あたり重量（g）
            <input
              v-model.number="addForm.orderUnitG"
              type="number"
              min="0"
              class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            />
          </label>
        </div>

        <button
          type="button"
          class="min-h-tap px-5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform"
          @click="addRow"
        >
          追加する
        </button>
      </div>

      <!-- 串一覧テーブル -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-black/[0.03] dark:bg-white/[0.04] text-xs text-neutral-500 dark:text-neutral-400">
              <th class="px-2 py-2 text-left">串名</th>
              <th class="px-2 py-2 text-left">カテゴリ</th>
              <th class="px-2 py-2 text-left">理想在庫</th>
              <th class="px-2 py-2">単位</th>
              <th class="px-2 py-2">閾値1</th>
              <th class="px-2 py-2">仕込1</th>
              <th class="px-2 py-2">閾値2</th>
              <th class="px-2 py-2">仕込2</th>
              <th class="px-2 py-2">有効</th>
              <th class="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(row, i) in rows" :key="row.id || `new-${i}`">
            <tr class="border-t border-edge dark:border-edge-dark">
              <td class="px-2 py-2">
                <input
                  v-model="row.name"
                  type="text"
                  class="w-24 rounded bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                />
              </td>
              <td class="px-2 py-2">
                <select v-model="row.category" class="rounded bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm">
                  <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
                </select>
              </td>
              <td class="px-2 py-2 whitespace-nowrap">
                <template v-if="usesIdeal(row.category)">
                  <button
                    type="button"
                    class="text-xs text-brand-500 border border-brand-500/40 rounded-lg px-2 py-1"
                    @click="openIdealModal(i)"
                  >
                    曜日別
                  </button>
                  <div class="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                    {{ idealSummary(row) }} {{ idealUnitLabel(row.category) }}
                  </div>
                  <input
                    v-if="row.category === '前日仕込み'"
                    v-model="row.prep_method_name"
                    type="text"
                    placeholder="仕込み名"
                    class="mt-1 w-24 rounded bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-xs"
                  />
                </template>
                <span v-else class="text-neutral-300 dark:text-neutral-600">－</span>
              </td>
              <td class="px-2 py-2">
                <input
                  v-model.number="row.unit"
                  type="number"
                  min="0"
                  class="w-14 rounded bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                />
              </td>
              <td class="px-2 py-2 text-center">
                <input
                  v-if="showThresholds(row.category)"
                  v-model.number="row.threshold1"
                  type="number"
                  min="0"
                  class="w-14 rounded bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                />
                <span v-else class="text-neutral-300 dark:text-neutral-600">—</span>
              </td>
              <td class="px-2 py-2 text-center">
                <input
                  v-if="showThresholds(row.category)"
                  v-model.number="row.prep_amount1"
                  type="number"
                  min="0"
                  class="w-14 rounded bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                />
                <span v-else class="text-neutral-300 dark:text-neutral-600">—</span>
              </td>
              <td class="px-2 py-2 text-center">
                <input
                  v-if="showThresholds(row.category)"
                  v-model.number="row.threshold2"
                  type="number"
                  min="0"
                  class="w-14 rounded bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                />
                <span v-else class="text-neutral-300 dark:text-neutral-600">—</span>
              </td>
              <td class="px-2 py-2 text-center">
                <input
                  v-if="showThresholds(row.category)"
                  v-model.number="row.prep_amount2"
                  type="number"
                  min="0"
                  class="w-14 rounded bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                />
                <span v-else class="text-neutral-300 dark:text-neutral-600">—</span>
              </td>
              <td class="px-2 py-2 text-center">
                <input
                  v-model="row.is_active"
                  type="checkbox"
                  class="w-5 h-5 rounded border-edge dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] text-brand-500 focus:ring-brand-500"
                />
              </td>
              <td class="px-2 py-2 whitespace-nowrap">
                <button
                  type="button"
                  class="text-xs rounded-lg px-2 py-1 mr-1 border"
                  :class="
                    isExpanded(i)
                      ? 'bg-brand-500/15 text-brand-500 border-brand-500/30'
                      : orderConfigured(row)
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
                        : 'bg-neutral-200 dark:bg-[#2A2A2A] text-neutral-500 dark:text-neutral-400 border-transparent'
                  "
                  @click="toggleExpand(i)"
                >
                  {{ isExpanded(i) ? '▲ 閉じる' : orderConfigured(row) ? '✓ 詳細' : '▼ 詳細' }}
                </button>
                <button
                  type="button"
                  class="text-xs text-red-500 dark:text-red-400"
                  @click="removeRow(i)"
                >
                  削除
                </button>
              </td>
            </tr>
            <!-- 詳細設定（行内アコーディオン） -->
            <tr v-if="isExpanded(i)" class="bg-brand-500/[0.04] dark:bg-white/[0.02]">
              <td colspan="10" class="px-4 py-4">
                <p class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-3">発注設定</p>
                <div class="grid grid-cols-2 gap-3">
                  <label class="text-xs text-neutral-500 dark:text-neutral-400 col-span-2">
                    コース分類
                    <select
                      v-model="row.course_type"
                      class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                    >
                      <option value="all_courses">全コース</option>
                      <option value="specific_courses">特定コース</option>
                    </select>
                  </label>
                  <div
                    v-if="row.course_type === 'specific_courses'"
                    class="col-span-2 flex flex-wrap gap-4 text-sm text-neutral-700 dark:text-neutral-200"
                  >
                    <label class="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        :checked="row.target_courses.includes('casual')"
                        class="rounded border-edge dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] text-brand-500 focus:ring-brand-500"
                        @change="toggleTargetCourse(row, 'casual', ($event.target as HTMLInputElement).checked)"
                      />
                      カジュアル
                    </label>
                    <label class="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        :checked="row.target_courses.includes('standard')"
                        class="rounded border-edge dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] text-brand-500 focus:ring-brand-500"
                        @change="toggleTargetCourse(row, 'standard', ($event.target as HTMLInputElement).checked)"
                      />
                      スタンダード
                    </label>
                    <label class="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        :checked="row.target_courses.includes('premium')"
                        class="rounded border-edge dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] text-brand-500 focus:ring-brand-500"
                        @change="toggleTargetCourse(row, 'premium', ($event.target as HTMLInputElement).checked)"
                      />
                      プレミアム
                    </label>
                  </div>
                  <label class="text-xs text-neutral-500 dark:text-neutral-400">
                    1本あたり重量（g）
                    <input
                      v-model.number="row.weight_per_stick_g"
                      type="number"
                      min="0"
                      step="0.1"
                      class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                    />
                  </label>
                  <label class="text-xs text-neutral-500 dark:text-neutral-400">
                    歩留まり率（%）
                    <input
                      :value="yieldPctOf(row)"
                      type="number"
                      min="0"
                      max="100"
                      class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                      @input="setYieldPct(row, Number(($event.target as HTMLInputElement).value))"
                    />
                  </label>
                  <label class="text-xs text-neutral-500 dark:text-neutral-400">
                    発注単位ラベル
                    <input
                      v-model="row.order_unit_label"
                      type="text"
                      placeholder="例: kg、1パック"
                      class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                    />
                  </label>
                  <label class="text-xs text-neutral-500 dark:text-neutral-400">
                    発注単位あたり重量（g）
                    <input
                      v-model.number="row.order_unit_g"
                      type="number"
                      min="0"
                      class="mt-0.5 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                    />
                  </label>
                </div>
              </td>
            </tr>
            </template>
            <tr v-if="rows.length === 0">
              <td colspan="10" class="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500 text-sm">
                串が登録されていません
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <p v-if="errorMsg" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      {{ errorMsg }}
    </p>
    <p v-if="message" class="text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
      {{ message }}
    </p>

    <button
      type="button"
      :disabled="saving"
      class="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
      @click="save"
    >
      {{ saving ? '保存中...' : '💾 串マスタを保存する' }}
    </button>

    <!-- 理想在庫モーダル -->
    <Teleport to="body">
      <div
        v-if="idealModalIdx >= 0"
        class="fixed inset-0 z-50 flex items-center justify-center"
        @click.self="closeIdealModal"
      >
        <div class="absolute inset-0 bg-black/60" />
        <div class="relative bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-3xl shadow-xl mx-4 w-full max-w-sm p-6 space-y-3">
          <h3 class="font-bold text-neutral-900 dark:text-neutral-50">理想在庫（曜日別）</h3>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ rows[idealModalIdx]?.name }}（{{ rows[idealModalIdx]?.category }}）
            単位: {{ idealUnitLabel(rows[idealModalIdx]?.category ?? 'レギュラー') }}
          </p>
          <div class="space-y-2">
            <div
              v-for="(label, idx) in DAY_LABELS"
              :key="label"
              class="flex items-center justify-between"
            >
              <label class="text-sm text-neutral-700 dark:text-neutral-200">{{ label }}曜日</label>
              <input
                v-model.number="idealBuffer[idx]"
                type="number"
                inputmode="numeric"
                min="0"
                class="w-24 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
              />
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              class="flex-1 min-h-tap rounded-2xl bg-neutral-100 dark:bg-[#2A2A2A] text-neutral-700 dark:text-neutral-200 font-medium"
              @click="closeIdealModal"
            >
              キャンセル
            </button>
            <button
              type="button"
              class="flex-1 min-h-tap rounded-2xl bg-brand-500 hover:bg-brand-600 active:scale-95 transition-transform text-white font-semibold"
              @click="saveIdealModal"
            >
              反映
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 発注設定モーダルは廃止 — 行内アコーディオンに置換 -->
  </div>
</template>
