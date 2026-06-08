<script setup lang="ts">
import type { ChangelogEntry } from '@/data/changelog'

defineProps<{
  /** モーダル表示状態 */
  open: boolean
  /** 表示するアップデートエントリ */
  entry: ChangelogEntry
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center"
      @click.self="emit('close')"
    >
      <!-- 背景オーバーレイ -->
      <div class="absolute inset-0 bg-black/60" />

      <!-- モーダルコンテンツ -->
      <div
        class="relative bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-3xl shadow-xl mx-4 w-full max-w-sm p-6 space-y-4"
      >
        <!-- ヘッダー -->
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span
              class="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-500/20"
            >
              {{ entry.version }}
            </span>
            <span class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ entry.date }}
            </span>
          </div>
          <h2 class="text-lg font-bold text-neutral-900 dark:text-neutral-50">
            {{ entry.title }}
          </h2>
        </div>

        <!-- 変更内容 -->
        <div class="text-sm text-neutral-700 dark:text-neutral-300 space-y-2">
          <p class="text-neutral-500 dark:text-neutral-400">新しい機能と改善:</p>
          <ul class="space-y-1.5 pl-1">
            <li
              v-for="(change, i) in entry.changes"
              :key="i"
              class="flex items-start gap-2"
            >
              <span class="text-brand-500 mt-0.5 shrink-0">•</span>
              <span>{{ change }}</span>
            </li>
          </ul>
        </div>

        <!-- ボタン -->
        <div class="pt-2">
          <button
            type="button"
            class="w-full min-h-tap rounded-2xl bg-brand-500 hover:bg-brand-600 active:scale-95 transition-transform text-white font-semibold"
            @click="emit('close')"
          >
            確認しました
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
