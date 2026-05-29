<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

/** 所属店舗以外に入店中か */
const isVisiting = computed(() => {
  if (!auth.isAuthenticated) return false
  const home = auth.appUser?.tenant_id
  const eff = auth.effectiveTenantId
  return !!eff && !!home && eff !== home
})

const visitingName = computed(() =>
  auth.accessibleTenants.find((t) => t.id === auth.effectiveTenantId)?.name ?? '',
)

const homeName = computed(() =>
  auth.accessibleTenants.find((t) => t.id === auth.appUser?.tenant_id)?.name ?? '',
)
</script>

<template>
  <div
    v-if="isVisiting"
    class="bg-brand-500/10 border-b border-brand-500/30 px-4 py-1.5"
  >
    <div class="max-w-lg mx-auto flex items-center gap-1.5 text-xs text-brand-700 dark:text-brand-400">
      <span>👁</span>
      <span class="font-semibold">{{ visitingName }}</span>
      <span>を訪問中</span>
      <span class="opacity-40 mx-0.5">·</span>
      <span class="opacity-75">所属: {{ homeName }}</span>
    </div>
  </div>
</template>
