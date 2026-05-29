<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore, applyTenantColor } from '@/stores/theme'

const auth = useAuthStore()
// テーマストアの初期化（インスタンス化時に applyTheme が実行される）
const theme = useThemeStore()

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
  <!-- テーマ切替ボタン（全画面共通・右上固定） -->
  <button
    type="button"
    class="fixed top-3 right-3 z-50 w-10 h-10 rounded-full flex items-center justify-center
           bg-card dark:bg-card-dark border border-edge dark:border-edge-dark
           shadow-sm active:scale-90 transition-transform text-lg"
    :aria-label="`テーマ切替（現在: ${theme.mode}）`"
    @click="theme.cycle()"
  >
    <span v-if="theme.mode === 'system'">🖥️</span>
    <span v-else-if="theme.mode === 'light'">☀️</span>
    <span v-else>🌙</span>
  </button>

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
