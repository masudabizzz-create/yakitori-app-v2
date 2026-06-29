<script setup lang="ts">
import { ref } from 'vue'
import SysTenantsTab from '@/components/sys/SysTenantsTab.vue'

type TabKey = 'tenants'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'tenants', label: '店舗管理' },
]

const activeTab = ref<TabKey>('tenants')
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-8">
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
      <div class="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
        <router-link
          to="/"
          class="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 text-sm"
        >
          ‹ ホーム
        </router-link>
        <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">プラットフォーム管理</h1>
      </div>
      <div class="max-w-lg mx-auto px-4 flex">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          type="button"
          class="flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors"
          :class="
            activeTab === tab.key
              ? 'border-brand-500 text-brand-500'
              : 'border-transparent text-neutral-400 dark:text-neutral-500'
          "
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
    </header>

    <main class="max-w-lg mx-auto px-4 py-5">
      <SysTenantsTab v-if="activeTab === 'tenants'" />
    </main>
  </div>
</template>
