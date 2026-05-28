<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useUsersStore } from '@/stores/users'
import { useSettingsStore } from '@/stores/settings'
import { useTenantsStore } from '@/stores/tenants'
import { useAuthStore } from '@/stores/auth'
import SysStaffTab from '@/components/sys/SysStaffTab.vue'
import SysSettingsTab from '@/components/sys/SysSettingsTab.vue'
import SysTenantsTab from '@/components/sys/SysTenantsTab.vue'
import SysAuditTab from '@/components/sys/SysAuditTab.vue'
import TenantSwitcher from '@/components/TenantSwitcher.vue'
import VisitingBanner from '@/components/VisitingBanner.vue'

type TabKey = 'staff' | 'tenants' | 'settings' | 'audit'

const usersStore = useUsersStore()
const settingsStore = useSettingsStore()
const tenantsStore = useTenantsStore()
const auth = useAuthStore()

/** 店舗管理・監査ログタブは platform_admin のみ表示 */
const TABS = computed<{ key: TabKey; label: string }[]>(() => [
  { key: 'staff',    label: 'スタッフ管理' },
  ...(auth.role === 'platform_admin'
    ? [{ key: 'tenants' as TabKey, label: '店舗管理' }]
    : []),
  { key: 'settings', label: 'システム設定' },
  ...(auth.role === 'platform_admin' || auth.role === 'store_owner'
    ? [{ key: 'audit' as TabKey, label: '監査ログ' }]
    : []),
])

const activeTab = ref<TabKey>('staff')

// タブが非表示になった場合のフォールバック
watch(TABS, (tabs) => {
  if (!tabs.find((t) => t.key === activeTab.value)) {
    activeTab.value = 'staff'
  }
}, { immediate: true })

const loading = ref(true)
const loadError = ref('')

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    const tenantId = auth.effectiveTenantId
    await Promise.all([
      usersStore.fetchAll(tenantId),
      usersStore.fetchAllWithDetails(tenantId),
      usersStore.fetchInvitations(),
      settingsStore.fetchSettings(tenantId),
      tenantsStore.fetchAll(),
    ])
    if (usersStore.error) throw new Error(usersStore.error)
    if (settingsStore.error) throw new Error(settingsStore.error)
    if (tenantsStore.error) throw new Error(tenantsStore.error)
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
        <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">システム管理</h1>
        <div class="ml-auto"><TenantSwitcher /></div>
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
        <SysTenantsTab v-show="activeTab === 'tenants'" />
        <SysSettingsTab v-show="activeTab === 'settings'" />
        <SysAuditTab v-if="activeTab === 'audit'" />
      </template>
    </main>
  </div>
</template>
