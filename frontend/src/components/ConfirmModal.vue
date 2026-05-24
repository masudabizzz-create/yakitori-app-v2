<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean
    title?: string
    confirmLabel?: string
    busy?: boolean
  }>(),
  { title: '確認', confirmLabel: '送信する', busy: false },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center"
      @click.self="emit('cancel')"
    >
      <div class="absolute inset-0 bg-black/60" />
      <div class="relative bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-3xl shadow-xl mx-4 w-full max-w-sm p-6 space-y-4">
        <h2 class="text-lg font-bold text-neutral-900 dark:text-neutral-50">{{ title }}</h2>
        <div class="text-sm text-neutral-500 dark:text-neutral-400">
          <slot />
        </div>
        <div class="flex gap-3 pt-1">
          <button
            type="button"
            class="flex-1 min-h-tap rounded-2xl bg-neutral-100 dark:bg-[#2A2A2A] text-neutral-700 dark:text-neutral-200 font-medium disabled:opacity-50"
            :disabled="busy"
            @click="emit('cancel')"
          >
            キャンセル
          </button>
          <button
            type="button"
            class="flex-1 min-h-tap rounded-2xl bg-brand-500 hover:bg-brand-600 active:scale-95 transition-transform text-white font-semibold disabled:bg-brand-400/60"
            :disabled="busy"
            @click="emit('confirm')"
          >
            {{ busy ? '送信中...' : confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
