<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Save } from 'lucide-vue-next'
import VisitingBanner from '@/components/VisitingBanner.vue'
import TenantSwitcher from '@/components/TenantSwitcher.vue'
import { isRegularHoliday } from '@/composables/useRegularHolidays'
import type { DailyBudget, BudgetPreset } from '@/types'

const router = useRouter()
const auth = useAuthStore()
const settingsStore = useSettingsStore()

// 対象月（YYYY-MM）
const targetMonth = ref('')
const budgets = ref<DailyBudget[]>([])
const selectedDates = ref<Set<string>>(new Set())
const loading = ref(false)
const saving = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

// 金額プリセット
const presets = ref<BudgetPreset[]>([])
const activePresetAmount = ref(80000)

// 定休日
const regularHolidays = computed(() => settingsStore.settings?.regular_holidays ?? [])

// 現在月を初期値に
onMounted(async () => {
  const now = new Date()
  targetMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  await settingsStore.fetchSettings()
  presets.value = settingsStore.settings?.budget_presets ?? []
  if (presets.value.length > 0) {
    activePresetAmount.value = presets.value[0].amount
  }

  await loadBudgets()
})

// 予算データ読み込み
async function loadBudgets() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [year, month] = targetMonth.value.split('-').map(Number)
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const { data, error } = await supabase
      .from('daily_budgets')
      .select('*')
      .eq('tenant_id', auth.effectiveTenantId)
      .gte('log_date', firstDay)
      .lte('log_date', lastDayStr)
      .order('log_date')

    if (error) throw error
    budgets.value = data ?? []
    selectedDates.value.clear()
  } finally {
    loading.value = false
  }
}

// 月変更
function changeMonth(delta: number) {
  const [year, month] = targetMonth.value.split('-').map(Number)
  const newDate = new Date(year, month - 1 + delta, 1)
  targetMonth.value = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`
  loadBudgets()
}

// カレンダー生成
const calendarDays = computed(() => {
  const [year, month] = targetMonth.value.split('-').map(Number)
  const firstDate = new Date(year, month - 1, 1)
  const lastDate = new Date(year, month, 0)
  const firstDow = firstDate.getDay() // 0=日
  const lastDay = lastDate.getDate()

  const days: Array<{
    date: string | null
    day: number | null
    isRegularHoliday: boolean
    budget: DailyBudget | null
  }> = []

  // 前月の空白
  for (let i = 0; i < firstDow; i++) {
    days.push({ date: null, day: null, isRegularHoliday: false, budget: null })
  }

  // 当月の日
  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const isHoliday = isRegularHoliday(dateStr, regularHolidays.value)
    const budget = budgets.value.find(b => b.log_date === dateStr) ?? null
    days.push({ date: dateStr, day, isRegularHoliday: isHoliday, budget })
  }

  return days
})

// 日付選択トグル
function toggleDate(date: string | null) {
  if (!date) return
  if (selectedDates.value.has(date)) {
    selectedDates.value.delete(date)
  } else {
    selectedDates.value.add(date)
  }
}

// 全クリア
function clearSelection() {
  selectedDates.value.clear()
}

// 選択日に金額を適用
function applyAmount(amount: number, isClosed = false) {
  for (const date of selectedDates.value) {
    const existing = budgets.value.find(b => b.log_date === date)
    if (existing) {
      existing.amount = amount
      existing.is_closed = isClosed
    } else {
      budgets.value.push({
        id: crypto.randomUUID(),
        tenant_id: auth.effectiveTenantId!,
        log_date: date,
        amount,
        is_closed: isClosed,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  }
  budgets.value.sort((a, b) => a.log_date.localeCompare(b.log_date))
  clearSelection()
}

// 保存
async function saveBudgets() {
  saving.value = true
  errorMsg.value = ''
  successMsg.value = ''
  try {
    // 営業日で未設定があればエラー
    const [year, month] = targetMonth.value.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const missingDates: string[] = []

    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const isHoliday = isRegularHoliday(dateStr, regularHolidays.value)
      if (isHoliday) continue  // 定休日はスキップ

      const budget = budgets.value.find(b => b.log_date === dateStr)
      if (!budget) {
        missingDates.push(`${month}/${day}`)
      }
    }

    if (missingDates.length > 0) {
      errorMsg.value = `営業日に未設定があります: ${missingDates.join(', ')}`
      return
    }

    // Upsert
    const { error } = await supabase
      .from('daily_budgets')
      .upsert(budgets.value.map(b => ({
        tenant_id: b.tenant_id,
        log_date: b.log_date,
        amount: b.amount,
        is_closed: b.is_closed,
      })))

    if (error) throw error
    successMsg.value = '予算を保存しました'
    setTimeout(() => { successMsg.value = '' }, 3000)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-8">
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
      <VisitingBanner />
      <div class="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
        <button @click="router.back()" class="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 text-sm">‹ 戻る</button>
        <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">予算設定</h1>
        <div class="ml-auto"><TenantSwitcher /></div>
      </div>
    </header>

    <main class="max-w-lg mx-auto px-4 py-4 space-y-4">
      <!-- 月選択 -->
      <div class="flex items-center justify-between">
        <button @click="changeMonth(-1)" class="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <ChevronLeft :size="20" />
        </button>
        <span class="text-lg font-semibold">{{ targetMonth }}</span>
        <button @click="changeMonth(1)" class="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <ChevronRight :size="20" />
        </button>
      </div>

      <!-- カレンダー -->
      <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl p-4">
        <div class="grid grid-cols-7 gap-1 text-xs text-center mb-2">
          <div v-for="dow in ['日', '月', '火', '水', '木', '金', '土']" :key="dow" class="font-semibold text-neutral-500">{{ dow }}</div>
        </div>
        <div class="grid grid-cols-7 gap-1">
          <button
            v-for="(day, i) in calendarDays"
            :key="i"
            :disabled="!day.date || day.isRegularHoliday"
            class="aspect-square p-1 rounded-lg text-sm transition-colors"
            :class="[
              !day.date ? 'invisible' : '',
              day.isRegularHoliday ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed' : '',
              !day.isRegularHoliday && day.date && selectedDates.has(day.date) ? 'bg-brand-500 text-white' : '',
              !day.isRegularHoliday && day.date && !selectedDates.has(day.date) && day.budget?.is_closed ? 'bg-red-500/20 text-red-600 dark:text-red-400' : '',
              !day.isRegularHoliday && day.date && !selectedDates.has(day.date) && !day.budget?.is_closed ? 'hover:bg-neutral-100 dark:hover:bg-neutral-800' : '',
            ]"
            @click="toggleDate(day.date)"
          >
            <div>{{ day.day }}</div>
            <div v-if="day.budget && !day.budget.is_closed" class="text-[10px]">¥{{ Math.round(day.budget.amount / 10000) }}万</div>
            <div v-if="day.budget?.is_closed" class="text-[10px]">休</div>
          </button>
        </div>
      </div>

      <!-- 金額・休業カード -->
      <div class="space-y-2">
        <p class="text-sm font-semibold">選択日に適用（{{ selectedDates.size }}日選択中）</p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="preset in presets"
            :key="preset.label"
            :disabled="selectedDates.size === 0"
            class="p-3 rounded-xl border-2 transition-colors disabled:opacity-50"
            :class="activePresetAmount === preset.amount ? 'border-brand-500 bg-brand-500/10' : 'border-edge dark:border-edge-dark'"
            @click="applyAmount(preset.amount)"
          >
            <div class="text-xs text-neutral-500">{{ preset.label }}</div>
            <div class="text-base font-semibold">¥{{ preset.amount.toLocaleString() }}</div>
          </button>
          <button
            :disabled="selectedDates.size === 0"
            class="p-3 rounded-xl border-2 border-red-500/30 bg-red-500/10 text-red-600 disabled:opacity-50"
            @click="applyAmount(0, true)"
          >
            <div class="text-xs">臨時休業</div>
            <div class="text-base font-semibold">休業</div>
          </button>
        </div>
        <button
          :disabled="selectedDates.size === 0"
          class="w-full py-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 disabled:opacity-50"
          @click="clearSelection"
        >
          選択解除
        </button>
      </div>

      <!-- エラー・成功メッセージ -->
      <p v-if="errorMsg" class="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{{ errorMsg }}</p>
      <p v-if="successMsg" class="text-sm text-green-600 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">{{ successMsg }}</p>

      <!-- 保存ボタン -->
      <button
        :disabled="saving"
        class="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
        @click="saveBudgets"
      >
        <Save :size="20" />
        {{ saving ? '保存中...' : '予算を保存' }}
      </button>
    </main>
  </div>
</template>
