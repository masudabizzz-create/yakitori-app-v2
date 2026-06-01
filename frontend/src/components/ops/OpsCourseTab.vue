<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()

const casualPrice = ref(3500)
const standardPrice = ref(4500)
const premiumPrice = ref(5800)
const casualSkewers = ref(10)
const standardSkewers = ref(15)
const premiumSkewers = ref(20)
const monthlySalesTarget = ref(0)

const saving = ref(false)
const message = ref('')
const errorMsg = ref('')

function syncFromStore() {
  const s = settingsStore.settings
  if (!s) return
  casualPrice.value = s.course_casual_price
  standardPrice.value = s.course_standard_price
  premiumPrice.value = s.course_premium_price
  casualSkewers.value = s.course_casual_skewers
  standardSkewers.value = s.course_standard_skewers
  premiumSkewers.value = s.course_premium_skewers
  monthlySalesTarget.value = s.monthly_sales_target ?? 0
}

onMounted(syncFromStore)

async function save() {
  saving.value = true
  message.value = ''
  errorMsg.value = ''
  try {
    await settingsStore.saveSettings({
      course_casual_price: casualPrice.value,
      course_standard_price: standardPrice.value,
      course_premium_price: premiumPrice.value,
      course_casual_skewers: casualSkewers.value,
      course_standard_skewers: standardSkewers.value,
      course_premium_skewers: premiumSkewers.value,
      monthly_sales_target: monthlySalesTarget.value,
    })
    syncFromStore()
    message.value = '設定を保存しました'
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
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">コース設定</h2>
      <div class="divide-y divide-edge dark:divide-edge-dark">
        <div class="px-4 py-3 flex items-center justify-between gap-3">
          <label class="text-sm text-neutral-700 dark:text-neutral-200">カジュアルコース 単価（円）</label>
          <input
            v-model.number="casualPrice"
            type="number"
            inputmode="numeric"
            min="0"
            class="w-28 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
          />
        </div>
        <div class="px-4 py-3 flex items-center justify-between gap-3">
          <label class="text-sm text-neutral-700 dark:text-neutral-200">スタンダードコース 単価（円）</label>
          <input
            v-model.number="standardPrice"
            type="number"
            inputmode="numeric"
            min="0"
            class="w-28 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
          />
        </div>
        <div class="px-4 py-3 flex items-center justify-between gap-3">
          <label class="text-sm text-neutral-700 dark:text-neutral-200">プレミアムコース 単価（円）</label>
          <input
            v-model.number="premiumPrice"
            type="number"
            inputmode="numeric"
            min="0"
            class="w-28 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
          />
        </div>

        <div class="px-4 py-3 flex items-center justify-between gap-3">
          <label class="text-sm text-neutral-700 dark:text-neutral-200">カジュアルコース 1コースあたり串本数</label>
          <input
            v-model.number="casualSkewers"
            type="number"
            inputmode="numeric"
            min="0"
            class="w-28 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
          />
        </div>
        <div class="px-4 py-3 flex items-center justify-between gap-3">
          <label class="text-sm text-neutral-700 dark:text-neutral-200">スタンダードコース 1コースあたり串本数</label>
          <input
            v-model.number="standardSkewers"
            type="number"
            inputmode="numeric"
            min="0"
            class="w-28 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
          />
        </div>
        <div class="px-4 py-3 flex items-center justify-between gap-3">
          <label class="text-sm text-neutral-700 dark:text-neutral-200">プレミアムコース 1コースあたり串本数</label>
          <input
            v-model.number="premiumSkewers"
            type="number"
            inputmode="numeric"
            min="0"
            class="w-28 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
          />
        </div>
      </div>
    </section>

    <!-- 月次目標 -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">月次売上目標</h2>
      <div class="px-4 py-3 flex items-center justify-between gap-3">
        <label class="text-sm text-neutral-700 dark:text-neutral-200">月次目標（円）<span class="text-xs text-neutral-400 ml-1">0=未設定</span></label>
        <input
          v-model.number="monthlySalesTarget"
          type="number"
          inputmode="numeric"
          min="0"
          step="10000"
          class="w-32 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
        />
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
      {{ saving ? '保存中...' : '💾 設定を保存する' }}
    </button>
  </div>
</template>
