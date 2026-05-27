<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const showMenu = ref(false)
const triggerRef = ref<HTMLElement | null>(null)

// ─── 店舗切り替え確認ダイアログ ──────────────────────────────
const showSwitchConfirm = ref(false)
const pendingTenantId = ref<string | null>(null)

/** 下書きキー（dailyLog ストアと同じキーを参照） */
const DRAFT_KEY = 'yakitori_input_draft_v2'

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
  // 下書きが存在する場合は確認ダイアログを表示
  const draft = localStorage.getItem(DRAFT_KEY)
  if (draft) {
    pendingTenantId.value = tenantId
    showSwitchConfirm.value = true
    showMenu.value = false
    return
  }
  doSwitch(tenantId)
}

function confirmSwitch() {
  if (pendingTenantId.value) {
    localStorage.removeItem(DRAFT_KEY)
    doSwitch(pendingTenantId.value)
  }
  showSwitchConfirm.value = false
  pendingTenantId.value = null
}

function cancelSwitch() {
  showSwitchConfirm.value = false
  pendingTenantId.value = null
}

async function doSwitch(tenantId: string) {
  showMenu.value = false
  try {
    await auth.enterTenant(tenantId)
  } catch (e) {
    console.error('テナント切り替え失敗:', e)
    // セッション切れでログアウトされた場合はログイン画面へ
    if (!auth.isAuthenticated) {
      router.push({ name: 'login' })
    }
  }
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

  <!-- ─── 店舗切り替え確認ダイアログ ───────────────────────────── -->
  <Teleport to="body">
    <div
      v-if="showSwitchConfirm"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      @click.self="cancelSwitch"
    >
      <div class="bg-card dark:bg-card-dark rounded-2xl p-6 w-full max-w-xs shadow-xl space-y-4">
        <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-50">店舗を切り替えますか？</h3>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          入力中のデータが消えます。よいですか？
        </p>
        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 py-2.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-sm font-semibold rounded-xl transition-colors"
            @click="cancelSwitch"
          >
            キャンセル
          </button>
          <button
            type="button"
            class="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
            @click="confirmSwitch"
          >
            切り替える
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
