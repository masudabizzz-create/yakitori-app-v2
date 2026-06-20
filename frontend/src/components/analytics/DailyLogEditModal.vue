<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { DailyLog } from '@/types'
import { X, AlertTriangle, Save } from 'lucide-vue-next'

const props = defineProps<{
  log: DailyLog | null
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const auth = useAuthStore()

// フォーム状態
const form = ref({
  log_date: '',
  day_of_week: '',
  staff_name: '',
  course_casual: 0,
  course_standard: 0,
  course_premium: 0,
  extra_skewers: 0,
  total_skewers: 0,
  total_sales: 0,
  drink_sales: 0,
  drink_ratio: 0,
  guests_count: null as number | null,
  memo: '',
  weather_code: null as number | null,
  temp_max: null as number | null,
})

const saving = ref(false)
const errorMsg = ref('')
const showConfirm = ref(false)

// propsからformを初期化
watch(() => props.log, (log) => {
  if (log) {
    form.value = {
      log_date: log.log_date,
      day_of_week: log.day_of_week,
      staff_name: log.staff_name,
      course_casual: log.course_casual,
      course_standard: log.course_standard,
      course_premium: log.course_premium,
      extra_skewers: log.extra_skewers,
      total_skewers: log.total_skewers,
      total_sales: log.total_sales,
      drink_sales: log.drink_sales,
      drink_ratio: log.drink_ratio,
      guests_count: log.guests_count ?? null,
      memo: log.memo ?? '',
      weather_code: log.weather_code ?? null,
      temp_max: log.temp_max ?? null,
    }
  }
}, { immediate: true })

// 変更検出
const hasChanges = computed(() => {
  if (!props.log) return false
  return (
    form.value.staff_name !== props.log.staff_name ||
    form.value.course_casual !== props.log.course_casual ||
    form.value.course_standard !== props.log.course_standard ||
    form.value.course_premium !== props.log.course_premium ||
    form.value.extra_skewers !== props.log.extra_skewers ||
    form.value.total_skewers !== props.log.total_skewers ||
    form.value.total_sales !== props.log.total_sales ||
    form.value.drink_sales !== props.log.drink_sales ||
    form.value.drink_ratio !== props.log.drink_ratio ||
    form.value.guests_count !== props.log.guests_count ||
    form.value.memo !== (props.log.memo ?? '') ||
    form.value.weather_code !== props.log.weather_code ||
    form.value.temp_max !== props.log.temp_max
  )
})

function close() {
  showConfirm.value = false
  errorMsg.value = ''
  emit('close')
}

function confirmSave() {
  if (!hasChanges.value) {
    close()
    return
  }
  showConfirm.value = true
}

async function save() {
  if (!props.log || !hasChanges.value) return

  saving.value = true
  errorMsg.value = ''

  try {
    const tenantId = auth.effectiveTenantId
    const userId = auth.authUser?.id
    if (!tenantId || !userId) throw new Error('認証情報が不正です')

    // 変更前の値を抽出
    const oldValues: Record<string, unknown> = {}
    const newValues: Record<string, unknown> = {}

    const fields: (keyof typeof form.value)[] = [
      'staff_name', 'course_casual', 'course_standard', 'course_premium',
      'extra_skewers', 'total_skewers', 'total_sales', 'drink_sales',
      'drink_ratio', 'guests_count', 'memo', 'weather_code',
      'temp_max'
    ]

    fields.forEach(key => {
      const oldVal = props.log![key as keyof DailyLog]
      const newVal = form.value[key]
      if (oldVal !== newVal) {
        oldValues[key] = oldVal
        newValues[key] = newVal
      }
    })

    // daily_logsを更新
    const { error: updateError } = await supabase
      .from('daily_logs')
      .update({
        staff_name: form.value.staff_name,
        course_casual: form.value.course_casual,
        course_standard: form.value.course_standard,
        course_premium: form.value.course_premium,
        extra_skewers: form.value.extra_skewers,
        total_skewers: form.value.total_skewers,
        total_sales: form.value.total_sales,
        drink_sales: form.value.drink_sales,
        drink_ratio: form.value.drink_ratio,
        guests_count: form.value.guests_count,
        memo: form.value.memo,
        weather_code: form.value.weather_code,
        temp_max: form.value.temp_max,
      })
      .eq('id', props.log.id)

    if (updateError) throw updateError

    // 編集履歴を記録
    const { error: historyError } = await supabase
      .from('daily_log_edits')
      .insert({
        tenant_id: tenantId,
        daily_log_id: props.log.id,
        edited_by: userId,
        old_values: oldValues,
        new_values: newValues,
      })

    if (historyError) throw historyError

    showConfirm.value = false
    emit('saved')
    emit('close')
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="show && log" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" @click.self="close">
    <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      <!-- ヘッダー -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-edge dark:border-edge-dark">
        <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-50">データ修正</h2>
        <button @click="close" class="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <X :size="20" />
        </button>
      </div>

      <!-- 本体 -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2 flex items-start gap-2">
          <AlertTriangle :size="16" class="text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
          <div class="text-xs text-yellow-700 dark:text-yellow-300">
            <p class="font-semibold">データ修正の注意事項</p>
            <ul class="list-disc list-inside mt-1 space-y-0.5">
              <li>修正内容は履歴として記録されます</li>
              <li>LINE通知は送信されません</li>
              <li>天気情報は自動取得されたものです（手動修正可）</li>
            </ul>
          </div>
        </div>

        <!-- 日付・曜日・担当者 -->
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">日付</label>
            <input
              :value="form.log_date"
              disabled
              class="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-sm"
            />
          </div>
          <div>
            <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">曜日</label>
            <input
              :value="form.day_of_week"
              disabled
              class="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-sm"
            />
          </div>
          <div>
            <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">担当者</label>
            <input
              v-model="form.staff_name"
              type="text"
              class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
            />
          </div>
        </div>

        <!-- コース -->
        <div>
          <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-2">コース客数</label>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-xs text-neutral-400 mb-1">カジュアル</label>
              <input
                v-model.number="form.course_casual"
                type="number"
                min="0"
                class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
              />
            </div>
            <div>
              <label class="block text-xs text-neutral-400 mb-1">スタンダード</label>
              <input
                v-model.number="form.course_standard"
                type="number"
                min="0"
                class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
              />
            </div>
            <div>
              <label class="block text-xs text-neutral-400 mb-1">プレミアム</label>
              <input
                v-model.number="form.course_premium"
                type="number"
                min="0"
                class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <!-- 串・売上 -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">追加串（本）</label>
            <input
              v-model.number="form.extra_skewers"
              type="number"
              min="0"
              class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
            />
          </div>
          <div>
            <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">合計串（本）</label>
            <input
              v-model.number="form.total_skewers"
              type="number"
              min="0"
              class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
            />
          </div>
          <div>
            <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">売上（円）</label>
            <input
              v-model.number="form.total_sales"
              type="number"
              min="0"
              class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
            />
          </div>
          <div>
            <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">ドリンク売上（円）</label>
            <input
              v-model.number="form.drink_sales"
              type="number"
              min="0"
              class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
            />
          </div>
          <div>
            <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">ドリンク比率（%）</label>
            <input
              v-model.number="form.drink_ratio"
              type="number"
              min="0"
              max="100"
              class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
            />
          </div>
          <div>
            <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">客数（任意）</label>
            <input
              v-model.number="form.guests_count"
              type="number"
              min="0"
              class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
            />
          </div>
        </div>

        <!-- 天気（自動取得） -->
        <div>
          <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            天気情報 <span class="text-[10px] text-neutral-400">(自動取得)</span>
          </label>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-xs text-neutral-400 mb-1">天気コード</label>
              <input
                v-model.number="form.weather_code"
                type="number"
                class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
              />
            </div>
            <div>
              <label class="block text-xs text-neutral-400 mb-1">最高気温（℃）</label>
              <input
                v-model.number="form.temp_max"
                type="number"
                step="0.1"
                class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <!-- メモ -->
        <div>
          <label class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">メモ</label>
          <textarea
            v-model="form.memo"
            rows="3"
            class="w-full px-3 py-2 rounded-xl border border-edge dark:border-edge-dark bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:border-brand-500 focus:ring-brand-500"
          ></textarea>
        </div>

        <!-- エラーメッセージ -->
        <p v-if="errorMsg" class="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {{ errorMsg }}
        </p>
      </div>

      <!-- フッター -->
      <div class="px-4 py-3 border-t border-edge dark:border-edge-dark flex items-center justify-end gap-2">
        <button
          @click="close"
          class="px-4 py-2 rounded-xl text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          キャンセル
        </button>
        <button
          :disabled="!hasChanges || saving"
          @click="confirmSave"
          class="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white text-sm font-semibold flex items-center gap-2"
        >
          <Save :size="16" />
          {{ saving ? '保存中...' : '保存する' }}
        </button>
      </div>
    </div>

    <!-- 確認ダイアログ -->
    <div v-if="showConfirm" class="absolute inset-0 flex items-center justify-center bg-black/50" @click.self="showConfirm = false">
      <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-2">データを修正しますか？</h3>
        <p class="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          修正内容は履歴として記録されます。この操作は取り消せません。
        </p>
        <div class="flex gap-2">
          <button
            @click="showConfirm = false"
            class="flex-1 px-4 py-2 rounded-xl border border-edge dark:border-edge-dark text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            キャンセル
          </button>
          <button
            @click="save"
            :disabled="saving"
            class="flex-1 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold"
          >
            {{ saving ? '保存中...' : '修正する' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
