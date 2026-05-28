<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSkewersStore } from '@/stores/skewers'
import { useSettingsStore } from '@/stores/settings'
import { useOrderScheduleStore } from '@/stores/orderSchedule'
import OpsSkewersTab from '@/components/ops/OpsSkewersTab.vue'
import OpsCourseTab from '@/components/ops/OpsCourseTab.vue'
import OpsScheduleTab from '@/components/ops/OpsScheduleTab.vue'
import TenantSwitcher from '@/components/TenantSwitcher.vue'
import VisitingBanner from '@/components/VisitingBanner.vue'

type TabKey = 'skewers' | 'course' | 'schedule'

const auth = useAuthStore()
const skewersStore = useSkewersStore()
const settingsStore = useSettingsStore()
const orderScheduleStore = useOrderScheduleStore()

const TABS: { key: TabKey; label: string }[] = [
  { key: 'skewers', label: '串マスタ' },
  { key: 'course', label: 'コース設定' },
  { key: 'schedule', label: '発注スケジュール' },
]
const activeTab = ref<TabKey>('skewers')

const loading = ref(true)
const loadError = ref('')

onMounted(async () => {
  loading.value = true
  loadError.value = ''

  const tenantId = auth.effectiveTenantId

  try {
    await Promise.all([
      skewersStore.fetchAll(tenantId),
      settingsStore.fetchSettings(tenantId),
      orderScheduleStore.fetchAll(tenantId),
    ])
    if (skewersStore.error) throw new Error(skewersStore.error)
    if (settingsStore.error) throw new Error(settingsStore.error)
    if (orderScheduleStore.error) throw new Error(orderScheduleStore.error)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '読み込みに失敗しました'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-8">
    <!-- ヘッダー -->
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
      <VisitingBanner />
      <div class="max-w-lg mx-auto px-4 py-4 flex items-center gap-3 pr-12">
        <router-link to="/" class="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 text-sm">‹ ホーム</router-link>
        <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">運用管理</h1>
        <div class="ml-auto"><TenantSwitcher /></div>
      </div>
      <!-- タブ -->
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
      <p v-if="loading" class="text-center text-neutral-400 dark:text-neutral-500 py-12">読み込み中...</p>

      <p v-else-if="loadError" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
        {{ loadError }}
      </p>

      <template v-else>
        <OpsSkewersTab v-show="activeTab === 'skewers'" />
        <OpsCourseTab v-show="activeTab === 'course'" />
        <OpsScheduleTab v-show="activeTab === 'schedule'" />
      </template>
    </main>
  </div>
</template>
