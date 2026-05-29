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
  /** タイマー機能の有効フラグ（2タップ方式） */
  timerEnabled?: boolean
}>()

const emit = defineEmits<{
  /** 完了ボタン押下。durationSeconds はタイマー使用時のみ渡される */
  complete: [durationSeconds?: number]
  /** 完了を取り消す */
  undo: []
}>()

const needsPrep = computed(() => props.result.prepAmount > 0)
const prepText = computed(() => formatPrepAmount(props.result))
const stockText = computed(() =>
  formatStockDisplay(props.result.category, props.result.stock),
)

// ─── 2タップタイマー ───────────────────────────────────────────
// 長押し検出を廃止。1回目タップでタイマー開始、2回目タップで完了記録。
// iOS Safari の pointercancel 問題を根本回避。

const timing = ref(false)   // 計測中フラグ
const elapsedMs = ref(0)    // 経過ミリ秒
let tickTimer: ReturnType<typeof setInterval> | null = null
let tickStart = 0

const elapsedLabel = computed(() => {
  const s = Math.floor(elapsedMs.value / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}分${s % 60}秒` : `${s}秒`
})

function clearTick() {
  if (tickTimer !== null) { clearInterval(tickTimer); tickTimer = null }
}

/** ✓ / 完了ボタンをタップ */
function onCompleteClick() {
  if (props.completed || !needsPrep.value) return

  if (!props.timerEnabled) {
    // タイマーなし: 即完了
    emit('complete')
    return
  }

  if (!timing.value) {
    // 1回目タップ: タイマー開始
    timing.value = true
    tickStart = Date.now()
    elapsedMs.value = 0
    tickTimer = setInterval(() => {
      elapsedMs.value = Date.now() - tickStart
    }, 100)
  } else {
    // 2回目タップ: タイマー停止 + 完了記録
    clearTick()
    const dur = Math.round(elapsedMs.value / 1000)
    timing.value = false
    elapsedMs.value = 0
    emit('complete', dur > 0 ? dur : undefined)
  }
}

/** ✕ボタン: タイマーをキャンセルして未完了に戻す */
function onCancelTimer() {
  clearTick()
  timing.value = false
  elapsedMs.value = 0
}

onUnmounted(clearTick)
</script>

<template>
  <div
    class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3 flex items-center gap-3 transition-opacity"
    :class="[
      needsPrep && !completed ? 'border-l-4 border-l-brand-500' : '',
      completed ? 'opacity-40' : '',
    ]"
  >
    <!-- 左: 串情報（flex-1 min-w-0 で残りスペースを使い切る） -->
    <div class="flex-1 min-w-0 space-y-0.5">
      <p class="font-semibold text-sm leading-snug text-neutral-900 dark:text-neutral-50 break-keep">
        {{ result.name }}
        <span v-if="completed" class="ml-1 text-xs text-green-500 font-normal">✓ 完了</span>
      </p>
      <p class="text-xs text-neutral-400 dark:text-neutral-500 flex items-center gap-1 flex-wrap">
        <span class="shrink-0">{{ result.category }}</span>
        <span class="opacity-40">·</span>
        <span class="shrink-0">在庫 {{ stockText }}</span>
      </p>
    </div>

    <!-- 右: 仕込み量 + アクションボタン（まとめて shrink-0 ブロック） -->
    <div class="shrink-0 flex items-center gap-2">

      <!-- 仕込み量（タイマー計測中は非表示でスペースを確保） -->
      <p
        v-if="!timing"
        class="font-bold tabular-nums text-right whitespace-nowrap"
        :class="needsPrep && !completed
          ? 'text-brand-500 text-xl'
          : 'text-neutral-300 dark:text-neutral-600 text-sm'"
      >
        {{ prepText }}
      </p>

      <!-- 完了ボタン（仕込み必要な未完了アイテムのみ） -->
      <template v-if="needsPrep && !completed">

        <!-- タイマー計測中: 経過時間ボタン（大） + キャンセル（小） -->
        <template v-if="timing">
          <button
            type="button"
            class="w-16 h-11 rounded-xl bg-amber-500 text-white text-xs font-bold flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
            @click="onCompleteClick"
          >
            <span class="text-[10px] leading-none">完了</span>
            <span class="leading-none tabular-nums">{{ elapsedLabel }}</span>
          </button>
          <button
            type="button"
            class="w-8 h-8 rounded-lg text-neutral-400 dark:text-neutral-500 text-sm flex items-center justify-center active:scale-90 transition-transform hover:bg-neutral-100 dark:hover:bg-neutral-700"
            @click="onCancelTimer"
          >
            ✕
          </button>
        </template>

        <!-- 通常: ✓ボタン（タイマーON時は1回目タップでタイマー開始） -->
        <button
          v-else
          type="button"
          class="w-11 h-11 rounded-xl bg-brand-500/10 dark:bg-brand-500/20 text-brand-500 text-2xl flex items-center justify-center active:scale-90 transition-transform"
          @click="onCompleteClick"
        >
          ✓
        </button>
      </template>

      <!-- 完了済み: 取り消しボタン -->
      <button
        v-else-if="completed"
        type="button"
        class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-400 dark:text-neutral-500 border border-edge dark:border-edge-dark hover:text-red-400 hover:border-red-400/40 transition-colors"
        @click="emit('undo')"
      >
        取消
      </button>
    </div>
  </div>
</template>
