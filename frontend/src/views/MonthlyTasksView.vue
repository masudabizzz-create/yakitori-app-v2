<script setup lang="ts">
import { useRouter } from 'vue-router'
import { TrendingUp, Pencil } from 'lucide-vue-next'
import VisitingBanner from '@/components/VisitingBanner.vue'
import TenantSwitcher from '@/components/TenantSwitcher.vue'

const router = useRouter()
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-8">
    <!-- ヘッダー -->
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
      <VisitingBanner />
      <div class="max-w-lg mx-auto px-4 py-4 flex items-center gap-3 pr-12">
        <router-link to="/" class="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 text-sm">‹ ホーム</router-link>
        <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">月次処理</h1>
        <div class="ml-auto"><TenantSwitcher /></div>
      </div>
    </header>

    <!-- メインコンテンツ -->
    <main class="max-w-lg mx-auto px-4 py-4 space-y-3">
      <!-- 予算設定カード -->
      <button
        class="
          w-full flex items-center gap-4 p-4
          bg-card dark:bg-card-dark
          border border-edge dark:border-edge-dark
          rounded-2xl
          active:scale-[0.98] transition-transform
        "
        @click="router.push('/monthly-tasks/budget')"
      >
        <div class="w-12 h-12 rounded-full flex items-center justify-center bg-brand-50 dark:bg-brand-500/20 shrink-0">
          <TrendingUp :size="22" class="text-brand-600 dark:text-brand-400" />
        </div>
        <div class="text-left flex-1">
          <p class="text-base font-semibold text-neutral-900 dark:text-neutral-50">予算設定</p>
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">日別予算の管理</p>
        </div>
      </button>

      <!-- データ修正カード（導線は分析画面が主） -->
      <div
        class="
          w-full flex items-center gap-4 p-4
          bg-card dark:bg-card-dark
          border border-edge dark:border-edge-dark
          rounded-2xl
          opacity-60
        "
      >
        <div class="w-12 h-12 rounded-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 shrink-0">
          <Pencil :size="22" class="text-neutral-500 dark:text-neutral-400" />
        </div>
        <div class="text-left flex-1">
          <p class="text-base font-semibold text-neutral-700 dark:text-neutral-300">データ修正</p>
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">分析画面から編集できます</p>
        </div>
      </div>
    </main>
  </div>
</template>
