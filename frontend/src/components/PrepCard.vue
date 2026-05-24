<script setup lang="ts">
import { computed } from 'vue'
import {
  formatPrepAmount,
  formatStockDisplay,
  type PrepResult,
} from '@/composables/useInventoryCalc'

const props = defineProps<{ result: PrepResult }>()

// 前日仕込みは prepAmount = action≠'none' ? 1 : 0 のため、prepAmount>0 で一律判定できる
const needsPrep = computed(() => props.result.prepAmount > 0)
const prepText = computed(() => formatPrepAmount(props.result))
const stockText = computed(() =>
  formatStockDisplay(props.result.category, props.result.stock),
)
</script>

<template>
  <div
    class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3 flex items-center gap-3"
    :class="needsPrep ? 'border-l-4 border-l-brand-500' : ''"
  >
    <div class="flex-1 min-w-0">
      <p class="font-semibold text-neutral-900 dark:text-neutral-50 truncate">{{ result.name }}</p>
      <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
        {{ result.category }} ・ 在庫 {{ stockText }}
      </p>
    </div>
    <div class="text-right shrink-0">
      <p
        class="font-bold tabular-nums"
        :class="needsPrep ? 'text-brand-500 text-xl' : 'text-neutral-300 dark:text-neutral-600 text-sm'"
      >
        {{ prepText }}
      </p>
    </div>
  </div>
</template>
