<script setup lang="ts">
import type { ChangelogEntry } from '@/data/changelog'
import { X } from 'lucide-vue-next'

defineProps<{
  /** モーダル表示状態 */
  open: boolean
  /** 全アップデート履歴（新しい順） */
  changelog: ChangelogEntry[]
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
        class="relative bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-3xl shadow-xl mx-4 w-full max-w-md max-h-[80vh] flex flex-col"
      >
        <!-- ヘッダー（固定） -->
        <div class="flex items-center justify-between p-6 pb-4 border-b border-edge dark:border-edge-dark">
          <h2 class="text-lg font-bold text-neutral-900 dark:text-neutral-50">
            アップデート履歴
          </h2>
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors active:scale-95"
            aria-label="閉じる"
            @click="emit('close')"
          >
            <X :size="20" />
          </button>
        </div>

        <!-- スクロール可能なリスト -->
        <div class="overflow-y-auto p-6 space-y-6">
          <div
            v-for="entry in changelog"
            :key="entry.version"
            class="space-y-3"
          >
            <!-- エントリヘッダー -->
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

            <!-- タイトル -->
            <h3 class="font-bold text-neutral-900 dark:text-neutral-50">
              {{ entry.title }}
            </h3>

            <!-- 変更内容 -->
            <ul class="text-sm text-neutral-700 dark:text-neutral-300 space-y-1.5 pl-1">
              <li
                v-for="(change, i) in entry.changes"
                :key="i"
                class="flex items-start gap-2"
              >
                <span class="text-brand-500 mt-0.5 shrink-0">•</span>
                <span>{{ change }}</span>
              </li>
            </ul>

            <!-- 区切り線（最後以外） -->
            <div
              v-if="entry !== changelog[changelog.length - 1]"
              class="pt-3 border-b border-edge dark:border-edge-dark"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
