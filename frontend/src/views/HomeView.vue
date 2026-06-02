<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import TenantSwitcher from '@/components/TenantSwitcher.vue'
import VisitingBanner from '@/components/VisitingBanner.vue'
import type { UserRole } from '@/types'

const router = useRouter()
const auth = useAuthStore()

const iconSrc = `${import.meta.env.BASE_URL}icons/icon-192.png`

// ─── 日付 ────────────────────────────────────────────────────────
const DOW = ['日', '月', '火', '水', '木', '金', '土']
const today = new Date()
const dateStr = computed(() => {
  const m = today.getMonth() + 1
  const d = today.getDate()
  return `${m}月${d}日（${DOW[today.getDay()]}）`
})

// ─── ロールラベル ─────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  platform_admin: 'プラットフォーム管理者',
  manager: 'マネージャー',
  store_owner: '店舗責任者',
  staff_both: 'スタッフ（兼務）',
  staff_kitchen: 'スタッフ（キッチン）',
  staff_hall: 'スタッフ（ホール）',
}
const roleLabel = computed(() =>
  auth.role ? (ROLE_LABELS[auth.role] ?? auth.role) : '',
)

// ─── 今日の天気（fetch-weather today アクション） ─────────────────
interface TodayWeather {
  weather_code: number | null
  temperature: number | null
  temp_max: number | null
  temp_min: number | null
}
const weather = ref<TodayWeather | null>(null)

/** WMO weather code → 天気絵文字 */
function wmoEmoji(code: number | null | undefined): string {
  if (code == null) return '—'
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '❄️'
  return '⛈️'
}

/** WMO weather code → 天気テキスト */
function wmoLabel(code: number | null | undefined): string {
  if (code == null) return ''
  if (code === 0) return '快晴'
  if (code === 1) return '晴れ'
  if (code === 2) return '晴れ時々曇り'
  if (code === 3) return '曇り'
  if (code <= 48) return '霧'
  if (code <= 57) return '霧雨'
  if (code <= 67) return '雨'
  if (code <= 77) return '雪'
  if (code <= 82) return 'にわか雨'
  if (code <= 86) return 'みぞれ'
  return '雷雨'
}

onMounted(async () => {
  const tenantId = auth.effectiveTenantId
  if (!tenantId) return
  try {
    const { data, error } = await supabase.functions.invoke('fetch-weather', {
      body: { action: 'today', tenant_id: tenantId },
    })
    if (!error && data) weather.value = data as TodayWeather
  } catch {
    // 天気取得失敗は無視（UI に影響させない）
  }
})

// ─── ナビゲーションカード ─────────────────────────────────────────
interface NavCard {
  emoji: string
  label: string
  desc: string
  to: string
  allowedRoles?: UserRole[]
}

const navCards: NavCard[] = [
  { emoji: '📝', label: '営業後入力',         desc: '在庫入力・LINE送信',        to: '/input' },
  { emoji: '🔪', label: '仕込みダッシュボード', desc: '明日の仕込みを確認',        to: '/dashboard' },
  {
    emoji: '📊', label: '分析・集計', desc: '売上・曜日別トレンド', to: '/analytics',
    allowedRoles: ['platform_admin', 'manager', 'store_owner'],
  },
  {
    emoji: '📦', label: '発注推定', desc: '週間来客数から発注量を算出', to: '/order',
    allowedRoles: ['platform_admin', 'manager', 'store_owner'],
  },
  {
    emoji: '🔧', label: '運用管理', desc: '串マスタ・発注スケジュール', to: '/admin/ops',
    allowedRoles: ['platform_admin', 'manager', 'store_owner'],
  },
  {
    emoji: '⚙️', label: 'システム管理', desc: 'スタッフ・LINE設定', to: '/admin/sys',
    allowedRoles: ['platform_admin', 'manager', 'store_owner'],
  },
]

const visibleCards = computed(() =>
  navCards.filter((c) => {
    if (!c.allowedRoles) return true
    return auth.role !== null && c.allowedRoles.includes(auth.role)
  })
)

// ─── テナント名 ───────────────────────────────────────────────────
const currentTenantName = computed(() =>
  auth.accessibleTenants.find((t) => t.id === auth.effectiveTenantId)?.name ?? ''
)

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark">

    <!-- 訪問中バナー（テナントカラーヘッダーの外・最上部に固定） -->
    <VisitingBanner />

    <!-- ══ Section 1: テーマカラーヘッダー ══════════════════════════ -->
    <div class="bg-brand-500 dark:bg-brand-600 pb-8">
      <div class="max-w-lg mx-auto px-4 pt-4 flex items-center justify-between gap-2">
        <!-- アプリアイコン + 名称 -->
        <div class="flex items-center gap-2.5">
          <img :src="iconSrc" alt="" class="w-8 h-8 rounded-xl object-cover shrink-0 shadow-sm" />
          <div>
            <h1 class="text-sm font-bold text-white leading-tight">串在庫管理</h1>
            <p class="text-[11px] text-white/70 leading-tight truncate max-w-[10rem]">{{ currentTenantName }}</p>
          </div>
        </div>
        <!-- テナント切り替え（右端） -->
        <TenantSwitcher />
      </div>
    </div>

    <!-- ══ Section 2 + 3: カード（ヘッダーに重ねてオーバーラップ） ══ -->
    <div class="max-w-lg mx-auto px-4 -mt-5 space-y-3">

      <!-- 日付 + 天気行 -->
      <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-5 py-3.5 shadow-sm flex items-center justify-between gap-3">
        <p class="font-semibold text-neutral-800 dark:text-neutral-100">{{ dateStr }}</p>
        <!-- 天気（取得できた場合のみ表示） -->
        <div v-if="weather?.weather_code != null" class="flex items-center gap-2 shrink-0">
          <span class="text-xl leading-none" :title="wmoLabel(weather.weather_code)">
            {{ wmoEmoji(weather.weather_code) }}
          </span>
          <div class="text-right">
            <p class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              {{ weather.temp_max != null ? `${Math.round(weather.temp_max)}°` : '' }}
            </p>
            <p class="text-[10px] text-neutral-400 dark:text-neutral-500 leading-none">{{ wmoLabel(weather.weather_code) }}</p>
          </div>
        </div>
      </div>

      <!-- ユーザー情報 + ログアウト -->
      <div class="bg-brand-500 dark:bg-brand-600 rounded-2xl px-5 py-4 shadow-sm flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-bold text-white text-base truncate">{{ auth.displayName }}</p>
          <p class="text-xs text-white/70 mt-0.5">{{ roleLabel }}</p>
        </div>
        <button
          class="shrink-0 text-xs text-white/80 hover:text-white border border-white/30 hover:border-white/60 px-3 py-1.5 rounded-xl transition-colors"
          @click="handleLogout"
        >
          ログアウト
        </button>
      </div>

    </div>

    <!-- ══ Section 4: 機能メニューグリッド ════════════════════════════ -->
    <main class="max-w-lg mx-auto px-4 py-4 space-y-2.5">
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
