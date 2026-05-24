<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUsersStore } from '@/stores/users'
import { useSettingsStore } from '@/stores/settings'
import SysStaffTab from '@/components/sys/SysStaffTab.vue'
import SysSettingsTab from '@/components/sys/SysSettingsTab.vue'

type TabKey = 'staff' | 'settings'

const usersStore = useUsersStore()
const settingsStore = useSettingsStore()

const TABS: { key: TabKey; label: string }[] = [
  { key: 'staff', label: 'スタッフ管理' },
  { key: 'settings', label: 'システム設定' },
]
const activeTab = ref<TabKey>('staff')

const loading = ref(true)
const loadError = ref('')

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    await Promise.all([usersStore.fetchAll(), settingsStore.fetchSettings()])
    if (usersStore.error) throw new Error(usersStore.error)
    if (settingsStore.error) throw new Error(settingsStore.error)
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
      <div class="max-w-lg mx-auto px-4 py-4 flex items-center gap-3 pr-12">
        <router-link to="/" class="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 text-sm">‹ ホーム</router-link>
        <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">システム管理</h1>
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
      <p v-if="loading" class="text-center text-neutral-400 dark:text-neutral-500 py-12">読み込み中...</p>
      <p v-else-if="loadError" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
        {{ loadError }}
      </p>
      <template v-else>
        <SysStaffTab v-show="activeTab === 'staff'" />
        <SysSettingsTab v-show="activeTab === 'settings'" />
      </template>
    </main>
  </div>
</template>
