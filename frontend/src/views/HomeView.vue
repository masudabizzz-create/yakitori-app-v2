<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const DOW = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日']
const today = new Date()
const dateStr = computed(() => {
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}年${m}月${d}日（${DOW[today.getDay()]}）`
})

interface NavCard {
  emoji: string
  label: string
  desc: string
  to: string
  minRole?: 'manager' | 'admin'
}

const navCards: NavCard[] = [
  { emoji: '📝', label: '営業後入力', desc: '在庫入力・LINE送信', to: '/input' },
  { emoji: '🔪', label: '仕込みダッシュボード', desc: '明日の仕込みを確認', to: '/dashboard' },
  { emoji: '📊', label: '分析・集計', desc: '売上・曜日別トレンド', to: '/analytics' },
  { emoji: '📦', label: '発注推定', desc: '週間来客数から発注量を算出', to: '/order' },
  { emoji: '🔧', label: '運用管理', desc: '串マスタ・理想在庫・コース設定', to: '/admin/ops', minRole: 'manager' },
  { emoji: '⚙️', label: 'システム管理', desc: 'スタッフ・LINE設定', to: '/admin/sys', minRole: 'admin' },
]

const visibleCards = computed(() =>
  navCards.filter((c) => {
    if (!c.minRole) return true
    if (c.minRole === 'manager') return auth.isManager
    return auth.isAdmin
  })
)

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark">
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark px-4 py-4">
      <div class="max-w-lg mx-auto flex items-center justify-between gap-3 pr-12">
        <div>
          <h1 class="text-xl font-semibold text-neutral-900 dark:text-neutral-50">🍢 串在庫管理</h1>
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{{ dateStr }}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-sm text-neutral-500 dark:text-neutral-400">{{ auth.displayName }}</span>
          <button
            class="text-xs text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 px-2 py-1 rounded-lg"
            @click="handleLogout"
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-lg mx-auto px-4 py-6 space-y-3">
      <router-link
        v-for="card in visibleCards"
        :key="card.to"
        :to="card.to"
        class="flex items-center gap-4 bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-5 py-4 active:scale-[0.98] transition-transform"
      >
        <span class="text-3xl">{{ card.emoji }}</span>
        <div class="min-w-0">
          <p class="font-semibold text-neutral-900 dark:text-neutral-50">{{ card.label }}</p>
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{{ card.desc }}</p>
        </div>
        <span class="ml-auto text-neutral-300 dark:text-neutral-600 text-lg">›</span>
      </router-link>
    </main>
  </div>
</template>
