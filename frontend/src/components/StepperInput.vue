<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number
  }>(),
  { min: 0, max: Number.MAX_SAFE_INTEGER, step: 1 },
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

function clamp(v: number): number {
  if (isNaN(v)) return props.min
  return Math.min(Math.max(v, props.min), props.max)
}

function decrement() {
  emit('update:modelValue', clamp(props.modelValue - props.step))
}

function increment() {
  emit('update:modelValue', clamp(props.modelValue + props.step))
}

function onInput(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10)
  emit('update:modelValue', clamp(v))
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <button
      type="button"
      class="min-w-tap min-h-tap flex items-center justify-center rounded-xl bg-neutral-200 hover:bg-neutral-300 dark:bg-[#2A2A2A] dark:hover:bg-[#333333] active:scale-90 transition-transform text-xl font-bold text-neutral-700 dark:text-neutral-200 select-none"
      aria-label="減らす"
      @click="decrement"
    >
      −
    </button>
    <input
      :value="modelValue"
      type="number"
      inputmode="numeric"
      :min="min"
      :max="max"
      class="w-16 text-center text-lg font-bold tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
      @input="onInput"
    />
    <button
      type="button"
      class="min-w-tap min-h-tap flex items-center justify-center rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-90 transition-transform text-xl font-bold text-white select-none"
      aria-label="増やす"
      @click="increment"
    >
      ＋
    </button>
  </div>
</template>
