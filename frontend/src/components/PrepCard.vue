<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import {
  formatPrepAmount,
  formatStockDisplay,
  type PrepResult,
} from '@/composables/useInventoryCalc'

const props = defineProps<{
  result: PrepResult
  /** 完了済みフラグ（trueでグレーアウト） */
  completed?: boolean
  /** 長押しタイマー機能の有効フラグ */
  timerEnabled?: boolean
}>()

const emit = defineEmits<{
  /** 完了ボタン押下。durationSeconds は長押しタイマー使用時のみ渡される */
  complete: [durationSeconds?: number]
  /** 完了を取り消す */
  undo: []
}>()

const needsPrep = computed(() => props.result.prepAmount > 0)
const prepText = computed(() => formatPrepAmount(props.result))
const stockText = computed(() =>
  formatStockDisplay(props.result.category, props.result.stock),
)

// ─── 長押しタイマー ───────────────────────────────────────────

const timing = ref(false)          // 長押し計測中フラグ
const elapsedMs = ref(0)           // 経過ミリ秒
let pressTimer: ReturnType<typeof setTimeout> | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null
let tickStart = 0

const elapsedLabel = computed(() => {
  const s = Math.floor(elapsedMs.value / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}分${s % 60}秒` : `${s}秒`
})

function clearTimers() {
  if (pressTimer !== null) { clearTimeout(pressTimer); pressTimer = null }
  if (tickTimer !== null) { clearInterval(tickTimer); tickTimer = null }
}

function onPointerDown(e: PointerEvent) {
  if (props.completed || !needsPrep.value) return
  e.currentTarget && (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  timing.value = false
  elapsedMs.value = 0
  if (props.timerEnabled) {
    pressTimer = setTimeout(() => {
      timing.value = true
      tickStart = Date.now()
      tickTimer = setInterval(() => {
        elapsedMs.value = Date.now() - tickStart
      }, 100)
    }, 600)
  }
}

function onPointerUp() {
  if (props.completed || !needsPrep.value) return
  if (timing.value) {
    clearTimers()
    const dur = Math.round(elapsedMs.value / 1000)
    timing.value = false
    elapsedMs.value = 0
    emit('complete', dur > 0 ? dur : undefined)
  } else {
    clearTimers()
    emit('complete')
  }
}

function onPointerCancel() {
  clearTimers()
  timing.value = false
  elapsedMs.value = 0
}

onUnmounted(clearTimers)
</script>

<template>
  <div
    class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3 flex items-center gap-3 transition-opacity"
    :class="[
      needsPrep && !completed ? 'border-l-4 border-l-brand-500' : '',
      completed ? 'opacity-40' : '',
    ]"
  >
    <!-- 左: 串情報 -->
    <div class="flex-1 min-w-0">
      <p class="font-semibold text-neutral-900 dark:text-neutral-50 truncate">
        {{ result.name }}
        <span v-if="completed" class="ml-1 text-xs text-green-500 font-normal">✓ 完了</span>
      </p>
      <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
        {{ result.category }} ・ 在庫 {{ stockText }}
      </p>
    </div>

    <!-- 中: 仕込み量 -->
    <div class="text-right shrink-0">
      <p
        class="font-bold tabular-nums"
        :class="needsPrep && !completed
          ? 'text-brand-500 text-xl'
          : 'text-neutral-300 dark:text-neutral-600 text-sm'"
      >
        {{ prepText }}
      </p>
    </div>

    <!-- 右: 完了ボタン（仕込み必要な未完了アイテムのみ） -->
    <template v-if="needsPrep && !completed">
      <button
        type="button"
        class="shrink-0 select-none touch-none"
        :class="timing
          ? 'w-16 h-12 rounded-xl bg-amber-500 text-white text-xs font-bold flex flex-col items-center justify-center gap-0.5 active:scale-95'
          : 'w-12 h-12 rounded-xl bg-brand-500/10 dark:bg-brand-500/20 text-brand-500 text-2xl flex items-center justify-center active:scale-90 transition-transform'"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
      >
        <template v-if="timing">
          <span class="text-[10px] leading-none">計測中</span>
          <span class="leading-none">{{ elapsedLabel }}</span>
        </template>
        <template v-else>
          ✓
        </template>
      </button>
    </template>

    <!-- 完了済み: 取り消しボタン -->
    <button
      v-else-if="completed"
      type="button"
      class="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-400 dark:text-neutral-500 border border-edge dark:border-edge-dark hover:text-red-400 hover:border-red-400/40 transition-colors"
      @click="emit('undo')"
    >
      取り消す
    </button>
  </div>
</template>
