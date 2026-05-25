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
const message = ref('')
const errorMsg = ref('')

// 追加フォーム
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
  weightPerStickG: 0,
  yieldPct: 100,
  orderUnitLabel: '',
  orderUnitG: 0,
  courseType: 'all_courses' as 'all_courses' | 'specific_courses',
  tcCasual: false,
  tcStandard: false,
  tcPremium: false,
})

// アコーディオン（1つだけ開く）
const expandedIdx = ref<number | null>(null)

// 行ごとの保存中フラグ
const savingRow = ref<number | null>(null)
// 削除確認モーダル
const deleteConfirmIdx = ref<number | null>(null)
const deleting = ref(false)

// 理想在庫モーダル
const idealModalIdx = ref(-1)
const idealBuffer = ref<number[]>([0, 0, 0, 0, 0, 0, 0])

function deepCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

onMounted(() => {
  rows.value = deepCopy(skewersStore.skewers)
})

// ─── カテゴリ別ヘルパー ────────────────────────────────────────────

function idealDivisor(cat: SkewerCategory): number {
  return cat === 'レギュラー' ? 20 : cat === 'つくね' ? 40 : 1
}
function idealUnitLabel(cat: SkewerCategory): string {
  return cat === 'レギュラー' ? 'P' : cat === 'つくね' ? 'B' : '本'
}
function usesIdeal(cat: SkewerCategory): boolean {
  return cat === 'レギュラー' || cat === 'つくね' || cat === '前日仕込み'
}
function showThresholds(cat: SkewerCategory): boolean {
  return cat === 'スペシャル' || cat === 'その他仕込み' || cat === '前日仕込み'
}
function idealSummary(row: Skewer): string {
  const div = idealDivisor(row.category)
  return DAY_KEYS.map((k, i) => `${DAY_LABELS[i]}:${Math.round(row[k] / div)}`).join(' ')
}
function yieldPctOf(row: Skewer): number {
  return Math.round((row.yield_rate || 1) * 100)
}
function setYieldPct(row: Skewer, pct: number): void {
  row.yield_rate = (Number(pct) || 100) / 100
}
function toggleTargetCourse(row: Skewer, course: string, on: boolean): void {
  const arr = [...row.target_courses]
  const idx = arr.indexOf(course)
  if (on && idx < 0) arr.push(course)
  if (!on && idx >= 0) arr.splice(idx, 1)
  row.target_courses = arr
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

// ─── 追加フォーム ─────────────────────────────────────────────────

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

// ─── アコーディオン ───────────────────────────────────────────────

function toggleExpand(i: number) {
  expandedIdx.value = expandedIdx.value === i ? null : i
}

function closeExpand() {
  expandedIdx.value = null
}

function isExpanded(i: number): boolean {
  return expandedIdx.value === i
}

// ─── 行ごとの保存 ────────────────────────────────────────────────

async function saveRow(i: number) {
  const tenantId = auth.effectiveTenantId
  if (!tenantId) { errorMsg.value = 'テナント情報がありません'; return }
  savingRow.value = i
  message.value = ''
  errorMsg.value = ''
  try {
    await skewersStore.saveSkewers([rows.value[i]], [], tenantId)
    rows.value = deepCopy(skewersStore.skewers)
    expandedIdx.value = null
    message.value = '保存しました'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    savingRow.value = null
  }
}

// ─── 削除 ────────────────────────────────────────────────────────

async function executeDelete() {
  const i = deleteConfirmIdx.value
  if (i === null) return
  const r = rows.value[i]
  const tenantId = auth.effectiveTenantId
  if (!tenantId) { errorMsg.value = 'テナント情報がありません'; return }
  deleting.value = true
  errorMsg.value = ''
  try {
    const toDelete = r.id ? [r.id] : []
    const remaining = rows.value.filter((_, idx) => idx !== i)
    await skewersStore.saveSkewers(remaining, toDelete, tenantId)
    rows.value = deepCopy(skewersStore.skewers)
    expandedIdx.value = null
    deleteConfirmIdx.value = null
    message.value = '削除しました'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '削除に失敗しました'
  } finally {
    deleting.value = false
  }
}

// ─── 全体保存（新規追加行をまとめて保存） ────────────────────────

async function saveAll() {
  const tenantId = auth.effectiveTenantId
  if (!tenantId) { errorMsg.value = 'テナント情報がありません'; return }
  message.value = ''
  errorMsg.value = ''
  try {
    await skewersStore.saveSkewers(rows.value, deletedIds.value, tenantId)
    deletedIds.value = []
    rows.value = deepCopy(skewersStore.skewers)
    message.value = '串マスタを保存しました'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存に失敗しました'
  }
}

// ─── 理想在庫モーダル ────────────────────────────────────────────

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

// ─── フィールドの共通スタイル ─────────────────────────────────────
const inputCls = 'w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm'
</script>

<template>
  <div class="space-y-4">
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">

      <!-- ヘッダー -->
      <div class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-between">
        <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">串マスタ一覧</h2>
        <button
          type="button"
          class="text-xs text-brand-500 font-medium"
          @click="showAddForm = !showAddForm; errorMsg = ''"
        >
          {{ showAddForm ? '× 閉じる' : '＋ 追加' }}
        </button>
      </div>

      <!-- 追加フォーム -->
      <div v-if="showAddForm" class="px-4 py-3 bg-brand-500/5 border-b border-edge dark:border-edge-dark space-y-2">
        <label class="block text-xs text-neutral-500 dark:text-neutral-400">
          串名 *
          <input v-model="addForm.name" type="text" placeholder="例: ねぎま" :class="['mt-0.5', inputCls]" />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            カテゴリ
            <select v-model="addForm.category" :class="['mt-0.5', inputCls]">
              <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            計算単位
            <input v-model.number="addForm.unit" type="number" min="0" :class="['mt-0.5', inputCls]" />
          </label>
        </div>
        <label v-if="addForm.category === '前日仕込み'" class="block text-xs text-neutral-500 dark:text-neutral-400">
          仕込み名
          <input v-model="addForm.prepMethodName" type="text" placeholder="例: 昆布締め" :class="['mt-0.5', inputCls]" />
        </label>
        <template v-if="showThresholds(addForm.category)">
          <div class="grid grid-cols-2 gap-2">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              閾値1 <input v-model.number="addForm.threshold1" type="number" min="0" :class="['mt-0.5', inputCls]" />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              仕込み量1 <input v-model.number="addForm.prepAmount1" type="number" min="0" :class="['mt-0.5', inputCls]" />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              閾値2 <input v-model.number="addForm.threshold2" type="number" min="0" :class="['mt-0.5', inputCls]" />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              仕込み量2 <input v-model.number="addForm.prepAmount2" type="number" min="0" :class="['mt-0.5', inputCls]" />
            </label>
          </div>
        </template>

        <!-- 詳細設定（追加フォーム） -->
        <button type="button" class="text-xs text-brand-500 font-medium" @click="showAddDetail = !showAddDetail">
          {{ showAddDetail ? '▲ 詳細設定を閉じる' : '▼ 詳細設定を開く' }}
        </button>
        <div v-if="showAddDetail" class="space-y-2 pt-1 border-t border-edge dark:border-edge-dark">
          <label class="block text-xs text-neutral-500 dark:text-neutral-400">
            コース分類
            <select v-model="addForm.courseType" :class="['mt-0.5', inputCls]">
              <option value="all_courses">全コース</option>
              <option value="specific_courses">特定コース</option>
            </select>
          </label>
          <div v-if="addForm.courseType === 'specific_courses'" class="flex flex-wrap gap-4 text-sm text-neutral-700 dark:text-neutral-200">
            <label class="flex items-center gap-1.5"><input v-model="addForm.tcCasual" type="checkbox" class="rounded border-edge text-brand-500" /> カジュアル</label>
            <label class="flex items-center gap-1.5"><input v-model="addForm.tcStandard" type="checkbox" class="rounded border-edge text-brand-500" /> スタンダード</label>
            <label class="flex items-center gap-1.5"><input v-model="addForm.tcPremium" type="checkbox" class="rounded border-edge text-brand-500" /> プレミアム</label>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              1本あたり重量（g）<input v-model.number="addForm.weightPerStickG" type="number" min="0" step="0.1" :class="['mt-0.5', inputCls]" />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              歩留まり率（%）<input v-model.number="addForm.yieldPct" type="number" min="0" max="100" :class="['mt-0.5', inputCls]" />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              発注単位ラベル<input v-model="addForm.orderUnitLabel" type="text" placeholder="例: kg" :class="['mt-0.5', inputCls]" />
            </label>
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              発注単位あたり重量（g）<input v-model.number="addForm.orderUnitG" type="number" min="0" :class="['mt-0.5', inputCls]" />
            </label>
          </div>
        </div>

        <button type="button" class="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform" @click="addRow">
          追加する
        </button>
      </div>

      <!-- 串一覧（アコーディオン） -->
      <ul class="divide-y divide-edge dark:divide-edge-dark">
        <template v-for="(row, i) in rows" :key="row.id || `new-${i}`">
          <li>
            <!-- 一覧行 -->
            <div
              class="px-4 py-3 flex items-center gap-3 cursor-pointer"
              @click="toggleExpand(i)"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                  {{ row.name || '（未入力）' }}
                  <span v-if="!row.is_active" class="ml-1 text-[10px] text-neutral-400 dark:text-neutral-500">無効</span>
                  <span v-if="!row.id" class="ml-1 text-[10px] text-amber-500">未保存</span>
                </p>
                <p class="text-xs text-neutral-400 dark:text-neutral-500">{{ row.category }}</p>
              </div>
              <span
                class="shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
                :class="isExpanded(i)
                  ? 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                  : 'text-brand-500'"
              >
                {{ isExpanded(i) ? '✕' : '詳細 ›' }}
              </span>
            </div>

            <!-- アコーディオン展開エリア -->
            <div
              v-if="isExpanded(i)"
              class="px-4 pb-5 pt-1 space-y-4 bg-brand-500/[0.03] dark:bg-white/[0.02] border-t border-edge dark:border-edge-dark"
              @click.stop
            >
              <!-- 右上 × ボタン -->
              <div class="flex justify-end -mb-2">
                <button type="button" class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-lg leading-none p-1" @click="closeExpand">✕</button>
              </div>

              <!-- 1. 有効フラグ -->
              <div class="flex items-center gap-3">
                <span class="text-sm font-medium text-neutral-500 dark:text-neutral-400 w-28 shrink-0">有効</span>
                <button
                  type="button"
                  class="relative inline-flex w-11 h-6 rounded-full transition-colors duration-200 shrink-0"
                  :class="row.is_active ? 'bg-brand-500' : 'bg-neutral-300 dark:bg-neutral-600'"
                  @click.stop="row.is_active = !row.is_active"
                >
                  <span
                    class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                    :class="row.is_active ? 'translate-x-5' : 'translate-x-0'"
                  />
                </button>
                <span class="text-sm text-neutral-600 dark:text-neutral-300">{{ row.is_active ? 'ON' : 'OFF' }}</span>
              </div>

              <!-- 2. 計算単位 -->
              <div>
                <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">計算単位</label>
                <input v-model.number="row.unit" type="number" min="0" :class="inputCls" />
              </div>

              <!-- 仕込み名（前日仕込みのみ） -->
              <div v-if="row.category === '前日仕込み'">
                <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">仕込み名</label>
                <input v-model="row.prep_method_name" type="text" placeholder="昆布締め" :class="inputCls" />
              </div>

              <!-- 3. 曜日別理想在庫 -->
              <div v-if="usesIdeal(row.category)">
                <div class="flex items-center justify-between mb-1">
                  <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    曜日別理想在庫（{{ idealUnitLabel(row.category) }}）
                  </label>
                  <button type="button" class="text-xs text-brand-500 font-medium" @click.stop="openIdealModal(i)">
                    編集
                  </button>
                </div>
                <p class="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800 rounded-xl px-3 py-2 leading-relaxed">
                  {{ idealSummary(row) }}
                </p>
              </div>

              <!-- 4&5. 閾値・仕込み量 -->
              <template v-if="showThresholds(row.category)">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">閾値1</label>
                    <input v-model.number="row.threshold1" type="number" min="0" :class="inputCls" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">仕込み量1</label>
                    <input v-model.number="row.prep_amount1" type="number" min="0" :class="inputCls" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">閾値2</label>
                    <input v-model.number="row.threshold2" type="number" min="0" :class="inputCls" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">仕込み量2</label>
                    <input v-model.number="row.prep_amount2" type="number" min="0" :class="inputCls" />
                  </div>
                </div>
              </template>

              <!-- 6. 対象コース -->
              <div>
                <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">対象コース</label>
                <select v-model="row.course_type" :class="inputCls">
                  <option value="all_courses">全コース</option>
                  <option value="specific_courses">特定コース</option>
                </select>
                <div v-if="row.course_type === 'specific_courses'" class="mt-2 flex flex-wrap gap-4 text-sm text-neutral-700 dark:text-neutral-200">
                  <label class="flex items-center gap-1.5">
                    <input type="checkbox" :checked="row.target_courses.includes('casual')" class="rounded border-edge text-brand-500" @change="toggleTargetCourse(row, 'casual', ($event.target as HTMLInputElement).checked)" />
                    カジュアル
                  </label>
                  <label class="flex items-center gap-1.5">
                    <input type="checkbox" :checked="row.target_courses.includes('standard')" class="rounded border-edge text-brand-500" @change="toggleTargetCourse(row, 'standard', ($event.target as HTMLInputElement).checked)" />
                    スタンダード
                  </label>
                  <label class="flex items-center gap-1.5">
                    <input type="checkbox" :checked="row.target_courses.includes('premium')" class="rounded border-edge text-brand-500" @change="toggleTargetCourse(row, 'premium', ($event.target as HTMLInputElement).checked)" />
                    プレミアム
                  </label>
                </div>
              </div>

              <!-- 7. 1本あたり重量 -->
              <div>
                <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">1本あたりの重量（g）</label>
                <input v-model.number="row.weight_per_stick_g" type="number" min="0" step="0.1" :class="inputCls" />
              </div>

              <!-- 8. 歩留まり率 -->
              <div>
                <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">歩留まり率（%）</label>
                <input
                  :value="yieldPctOf(row)"
                  type="number"
                  min="0"
                  max="100"
                  :class="inputCls"
                  @input="setYieldPct(row, Number(($event.target as HTMLInputElement).value))"
                />
              </div>

              <!-- 9. 発注単位ラベル -->
              <div>
                <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">発注単位ラベル</label>
                <input v-model="row.order_unit_label" type="text" placeholder="例: kg、1パック" :class="inputCls" />
              </div>

              <!-- 10. 1発注単位あたり -->
              <div>
                <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">1発注単位あたり（g）</label>
                <input v-model.number="row.order_unit_g" type="number" min="0" :class="inputCls" />
              </div>

              <!-- 保存 / 削除ボタン -->
              <div class="flex gap-3 pt-1">
                <button
                  type="button"
                  :disabled="savingRow === i"
                  class="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform"
                  @click.stop="saveRow(i)"
                >
                  {{ savingRow === i ? '保存中...' : '💾 保存する' }}
                </button>
                <button
                  type="button"
                  class="px-4 py-3 bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 text-sm font-semibold rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                  @click.stop="deleteConfirmIdx = i"
                >
                  削除
                </button>
              </div>
            </div>
          </li>
        </template>

        <li v-if="rows.length === 0" class="px-4 py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
          串が登録されていません
        </li>
      </ul>
    </section>

    <!-- 削除確認モーダル -->
    <Teleport to="body">
      <div
        v-if="deleteConfirmIdx !== null"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
        @click.self="deleteConfirmIdx = null"
      >
        <div class="bg-card dark:bg-card-dark rounded-2xl p-6 w-full max-w-xs shadow-xl space-y-4">
          <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            「{{ rows[deleteConfirmIdx]?.name }}」を削除しますか？
          </h3>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            この操作は取り消せません。関連する在庫データも削除されます。
          </p>
          <div class="flex gap-3">
            <button
              type="button"
              class="flex-1 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-semibold rounded-xl"
              @click="deleteConfirmIdx = null"
            >
              キャンセル
            </button>
            <button
              type="button"
              :disabled="deleting"
              class="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-400/60 text-white text-sm font-semibold rounded-xl transition-colors"
              @click="executeDelete"
            >
              {{ deleting ? '削除中...' : '削除する' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- メッセージ -->
    <p v-if="errorMsg" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{{ errorMsg }}</p>
    <p v-if="message" class="text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">{{ message }}</p>

    <!-- 全体保存（新規追加行をまとめて保存するときに使用） -->
    <button
      type="button"
      class="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
      @click="saveAll"
    >
      💾 串マスタを一括保存する
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
            <div v-for="(label, idx) in DAY_LABELS" :key="label" class="flex items-center justify-between">
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
            <button type="button" class="flex-1 min-h-tap rounded-2xl bg-neutral-100 dark:bg-[#2A2A2A] text-neutral-700 dark:text-neutral-200 font-medium" @click="closeIdealModal">
              キャンセル
            </button>
            <button type="button" class="flex-1 min-h-tap rounded-2xl bg-brand-500 hover:bg-brand-600 active:scale-95 transition-transform text-white font-semibold" @click="saveIdealModal">
              反映
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
