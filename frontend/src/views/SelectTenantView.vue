<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const entering = ref<string | null>(null)  // 入店処理中のテナントID
const error = ref('')

/** ホームテナントID（所属店舗） */
const homeTenantId = computed(() => auth.appUser?.tenant_id)

async function enterStore(tenantId: string) {
  entering.value = tenantId
  error.value = ''
  try {
    await auth.enterTenant(tenantId)
    router.push('/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '入店に失敗しました'
  } finally {
    entering.value = null
  }
}
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark flex flex-col items-center justify-center px-4 py-12">
    <div class="w-full max-w-sm space-y-6">
      <!-- タイトル -->
      <div class="text-center space-y-1">
        <p class="text-3xl">🏪</p>
        <h1 class="text-xl font-bold text-neutral-900 dark:text-neutral-50">店舗を選んでください</h1>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">{{ auth.displayName }}</p>
      </div>

      <!-- エラー -->
      <p
        v-if="error"
        class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"
      >
        {{ error }}
      </p>

      <!-- 店舗一覧 -->
      <ul class="space-y-2">
        <li
          v-for="tenant in auth.accessibleTenants"
          :key="tenant.id"
        >
          <button
            type="button"
            :disabled="entering !== null"
            class="w-full flex items-center gap-3 px-4 py-4 rounded-2xl
                   bg-card dark:bg-card-dark border border-edge dark:border-edge-dark
                   hover:border-brand-500/50 hover:bg-brand-500/[0.04]
                   active:scale-[0.98] transition-all text-left
                   disabled:opacity-60 disabled:cursor-not-allowed"
            @click="enterStore(tenant.id)"
          >
            <!-- スピナー or アイコン -->
            <span class="text-xl shrink-0">
              <template v-if="entering === tenant.id">
                <svg class="animate-spin w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              </template>
              <template v-else>🏪</template>
            </span>

            <div class="flex-1 min-w-0">
              <p class="font-semibold text-neutral-900 dark:text-neutral-50 truncate">
                {{ tenant.name }}
              </p>
              <p class="text-xs mt-0.5">
                <span
                  v-if="tenant.id === homeTenantId"
                  class="text-brand-500 font-medium"
                >所属店舗</span>
                <span
                  v-else
                  class="text-amber-600 dark:text-amber-400 font-medium"
                >訪問可能</span>
              </p>
            </div>

            <span class="text-neutral-300 dark:text-neutral-600 shrink-0">›</span>
          </button>
        </li>
      </ul>

      <!-- ログアウト -->
      <button
        type="button"
        class="w-full text-sm text-neutral-400 dark:text-neutral-500
               hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors py-2"
        @click="auth.logout()"
      >
        ログアウト
      </button>
    </div>
  </div>
</template>
