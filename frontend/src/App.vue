<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore, applyTenantColor } from '@/stores/theme'

const auth = useAuthStore()
// テーマストアの初期化（インスタンス化時に applyTheme が実行される）
useThemeStore()

onMounted(() => {
  auth.initialize()
})

// テナント切り替え・テナントリスト読み込み時にテーマカラーを適用する
watch(
  [() => auth.effectiveTenantId, () => auth.accessibleTenants],
  ([tenantId, tenants]) => {
    const tenant = (tenants as { id: string; primary_color?: string }[]).find(
      (t) => t.id === tenantId,
    )
    applyTenantColor(tenant?.primary_color)
  },
  { immediate: true },
)
</script>

<template>
  <RouterView v-if="!auth.loading" :key="auth.effectiveTenantId" />
  <div
    v-else
    class="min-h-screen flex items-center justify-center bg-app dark:bg-app-dark"
  >
    <div class="text-center space-y-3">
      <div class="text-4xl">🍢</div>
      <p class="text-neutral-500 dark:text-neutral-400 text-sm">読み込み中...</p>
    </div>
  </div>
</template>
