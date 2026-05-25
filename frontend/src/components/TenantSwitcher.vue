<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const showMenu = ref(false)
const triggerRef = ref<HTMLElement | null>(null)

/** 現在表示中の店舗名 */
const currentTenantName = computed(() => {
  const tid = auth.effectiveTenantId
  if (!tid) return '（店舗未設定）'
  return auth.accessibleTenants.find((t) => t.id === tid)?.name ?? '読み込み中...'
})

/** 店舗切り替えが可能か（platform_admin / manager かつ複数店舗あり） */
const canSwitch = computed(
  () =>
    (auth.role === 'platform_admin' || auth.role === 'manager') &&
    auth.accessibleTenants.length > 1,
)

function selectTenant(tenantId: string) {
  auth.setActiveTenantId(tenantId)
  showMenu.value = false
}

/** メニュー外クリックで閉じる */
function handleOutsideClick(e: MouseEvent) {
  if (triggerRef.value && !triggerRef.value.contains(e.target as Node)) {
    showMenu.value = false
  }
}

onMounted(() => document.addEventListener('click', handleOutsideClick, true))
onUnmounted(() => document.removeEventListener('click', handleOutsideClick, true))
</script>

<template>
  <div ref="triggerRef" class="relative flex items-center">
    <!-- 店舗名チップ -->
    <button
      v-if="canSwitch"
      type="button"
      class="flex items-center gap-1 px-2.5 py-1 rounded-xl
             bg-brand-500/10 text-brand-600 dark:text-brand-400
             border border-brand-500/20 text-xs font-medium
             hover:bg-brand-500/20 active:scale-95 transition-all"
      @click.stop="showMenu = !showMenu"
    >
      <span class="text-[10px]">🏪</span>
      <span class="max-w-[96px] truncate">{{ currentTenantName }}</span>
      <span class="text-[10px] opacity-60">{{ showMenu ? '▲' : '▾' }}</span>
    </button>

    <!-- 切り替え不可の場合はラベルのみ -->
    <span
      v-else-if="currentTenantName !== '（店舗未設定）'"
      class="flex items-center gap-1 px-2.5 py-1 rounded-xl
             bg-neutral-100 dark:bg-neutral-800
             text-neutral-600 dark:text-neutral-400
             border border-neutral-200 dark:border-neutral-700 text-xs font-medium"
    >
      <span class="text-[10px]">🏪</span>
      <span class="max-w-[96px] truncate">{{ currentTenantName }}</span>
    </span>

    <!-- ドロップダウンメニュー -->
    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 scale-95 -translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 -translate-y-1"
    >
      <div
        v-if="showMenu"
        class="absolute top-full left-0 mt-1.5 z-50 min-w-[160px] max-w-[220px]
               bg-card dark:bg-card-dark border border-edge dark:border-edge-dark
               rounded-2xl shadow-lg overflow-hidden"
      >
        <ul class="py-1">
          <li
            v-for="tenant in auth.accessibleTenants"
            :key="tenant.id"
          >
            <button
              type="button"
              class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left
                     hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              :class="
                tenant.id === auth.effectiveTenantId
                  ? 'text-brand-500 font-semibold'
                  : 'text-neutral-700 dark:text-neutral-200'
              "
              @click="selectTenant(tenant.id)"
            >
              <span v-if="tenant.id === auth.effectiveTenantId" class="text-xs">✓</span>
              <span v-else class="w-3 shrink-0"></span>
              <span class="truncate">{{ tenant.name }}</span>
            </button>
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>
