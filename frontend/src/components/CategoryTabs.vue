<script setup lang="ts">
defineProps<{
  tabs: string[]
  modelValue: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
    <button
      v-for="tab in tabs"
      :key="tab"
      type="button"
      class="flex-none min-h-[38px] px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
      :class="
        modelValue === tab
          ? 'bg-brand-500 text-white'
          : 'bg-card dark:bg-card-dark text-neutral-500 dark:text-neutral-400 border border-edge dark:border-edge-dark'
      "
      @click="emit('update:modelValue', tab)"
    >
      {{ tab }}
    </button>
  </div>
</template>
