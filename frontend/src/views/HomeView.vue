<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import type { Component } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDailyLogStore } from '@/stores/dailyLog'
import { supabase } from '@/lib/supabase'
import { ROLE_RANK } from '@/lib/roleRank'
import { useThemeStore } from '@/stores/theme'
import { useUpdateNotice } from '@/composables/useUpdateNotice'
import VisitingBanner from '@/components/VisitingBanner.vue'
import UpdateNoticeModal from '@/components/UpdateNoticeModal.vue'
import UpdateListModal from '@/components/UpdateListModal.vue'
import type { UserRole } from '@/types'
import {
  PenLine,
  Utensils,
  BarChart3,
  Package,
  Wrench,
  Server,
  Sun,
  Moon,
  Monitor,
  CloudSun,
  Cloud,
  CloudFog,
  CloudRain,
  Snowflake,
  CloudLightning,
  LogOut,
  Store,
  Bell,
  CalendarCog,
} from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()
const dailyLogStore = useDailyLogStore()
const theme = useThemeStore()

const iconSrc = `${import.meta.env.BASE_URL}icons/icon-192.png`

// ─── 日付 ─────────────────────────────────────────────────────────
const DOW = ['日', '月', '火', '水', '木', '金', '土']
const _today = new Date()
const dateStr = computed(() => {
  const m = _today.getMonth() + 1
  const d = _today.getDate()
  return `${m}月${d}日（${DOW[_today.getDay()]}）`
})

// ─── ロール ───────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  platform_admin: 'プラットフォーム管理者',
  manager:        'マネージャー',
  store_owner:    '店舗責任者',
  staff_both:     'スタッフ（兼務）',
  staff_kitchen:  'スタッフ（キッチン）',
  staff_hall:     'スタッフ（ホール）',
}
const roleLabel = computed(() =>
  auth.role ? (ROLE_LABELS[auth.role] ?? auth.role) : '',
)

/** manager 以上（rank >= 4）かつ複数テナントにアクセスできる場合のみ店舗移動ボタンを表示 */
const showTenantSwitcher = computed(() =>
  ROLE_RANK[auth.role ?? 'staff_both'] >= 4 && auth.accessibleTenants.length > 1,
)

/** store_owner 以上か（月次処理表示権限） */
const isStoreOwnerOrAbove = computed(() =>
  auth.role ? ROLE_RANK[auth.role] >= ROLE_RANK.store_owner : false,
)

// ─── インライン店舗切替メニュー ────────────────────────────────────
const tenantMenuRef = ref<HTMLDivElement | null>(null)
const showTenantMenu = ref(false)

async function handleTenantSelect(tenantId: string) {
  showTenantMenu.value = false
  if (tenantId === auth.effectiveTenantId) return
  await auth.enterTenant(tenantId)
}

function handleDocumentClick(e: MouseEvent) {
  if (tenantMenuRef.value && !tenantMenuRef.value.contains(e.target as Node)) {
    showTenantMenu.value = false
  }
}

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
})

// ─── アップデート通知 ──────────────────────────────────────────────
const { latestEntry, hasUnreadUpdate, changelog, markAsRead } = useUpdateNotice()

/**
 * 初回ポップアップ表示状態
 * - HomeView マウント時に未読があれば1回だけ表示
 * - 作業画面の最中には出さない（深夜の営業後入力中に突然出ないように）
 */
const showInitialNotice = ref(false)

/** 一覧モーダル表示状態 */
const showUpdateList = ref(false)

/**
 * 一覧を開いたときの処理
 * - 自動で既読にする
 */
function openUpdateList() {
  showUpdateList.value = true
  markAsRead() // 一覧を見たら既読
}

/**
 * 初回ポップアップを閉じたときの処理
 * - 既読にしてポップアップを閉じる
 */
function closeInitialNotice() {
  markAsRead()
  showInitialNotice.value = false
}

// ─── テナント名 ───────────────────────────────────────────────────
const currentTenantName = computed(() =>
  auth.accessibleTenants.find((t) => t.id === auth.effectiveTenantId)?.name ?? '',
)

// ─── 最新ログ ─────────────────────────────────────────────────────
const latestLog = computed(() => dailyLogStore.latestLog)

/** 最新ログの日付を「今日/昨日/M/D」で返す */
function formatLogDateLabel(ymd: string | undefined): string {
  if (!ymd) return ''
  const [y, mo, d] = ymd.split('-').map(Number)
  const logMidnight = new Date(y, mo - 1, d)
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round(
    (todayMidnight.getTime() - logMidnight.getTime()) / (1000 * 60 * 60 * 24),
  )
  if (diffDays === 0) return '今日'
  if (diffDays === 1) return '昨日'
  return `${mo}/${d}`
}
function formatSales(v: number | null | undefined): string {
  return v != null ? `¥${v.toLocaleString()}` : '—'
}
function formatSkewers(v: number | null | undefined): string {
  return v != null ? `${v.toLocaleString()}本` : '—'
}

// ─── 今日の天気 ───────────────────────────────────────────────────
interface TodayWeather {
  weather_code: number | null
  temperature: number | null
  temp_max: number | null
  temp_min: number | null
}
const weather = ref<TodayWeather | null>(null)

/** WMO weather code → lucide アイコンコンポーネント */
function wmoIcon(code: number | null | undefined): Component {
  if (code == null) return Sun
  if (code === 0) return Sun
  if (code <= 2)  return CloudSun
  if (code === 3) return Cloud
  if (code <= 48) return CloudFog
  if (code <= 67) return CloudRain
  if (code <= 77) return Snowflake
  if (code <= 82) return CloudRain
  if (code <= 86) return Snowflake
  return CloudLightning
}
/** WMO weather code → 天気テキスト */
function wmoLabel(code: number | null | undefined): string {
  if (code == null) return ''
  if (code === 0)  return '快晴'
  if (code === 1)  return '晴れ'
  if (code === 2)  return '晴れ時々曇り'
  if (code === 3)  return '曇り'
  if (code <= 48)  return '霧'
  if (code <= 57)  return '霧雨'
  if (code <= 67)  return '雨'
  if (code <= 77)  return '雪'
  if (code <= 82)  return 'にわか雨'
  if (code <= 86)  return 'みぞれ'
  return '雷雨'
}

// ─── ナビゲーションカード ─────────────────────────────────────────
interface NavCard {
  icon: Component
  label: string
  desc: string
  to: string
  allowedRoles?: UserRole[]
}

const navCards: NavCard[] = [
  {
    icon: PenLine,
    label: '営業後入力',
    desc: '在庫・LINE送信',
    to: '/input',
  },
  {
    icon: Utensils,
    label: '仕込みダッシュボード',
    desc: '明日の仕込み',
    to: '/dashboard',
  },
  {
    icon: BarChart3,
    label: '分析・集計',
    desc: '曜日別トレンド',
    to: '/analytics',
    allowedRoles: ['platform_admin', 'manager', 'store_owner'],
  },
  {
    icon: Package,
    label: '発注推定',
    desc: '発注量を算出',
    to: '/order',
    allowedRoles: ['platform_admin', 'manager', 'store_owner'],
  },
  {
    icon: Wrench,
    label: '運用管理',
    desc: '串マスタ・発注',
    to: '/admin/ops',
    allowedRoles: ['platform_admin', 'manager', 'store_owner'],
  },
  {
    icon: Server,
    label: 'システム管理',
    desc: 'スタッフ・LINE',
    to: '/admin/sys',
    allowedRoles: ['platform_admin', 'manager', 'store_owner'],
  },
]

/** 既存の visibleCards ロジックをそのまま流用 */
const visibleCards = computed(() =>
  navCards.filter((c) => {
    if (!c.allowedRoles) return true
    return auth.role !== null && c.allowedRoles.includes(auth.role)
  }),
)

// ─── マウント ─────────────────────────────────────────────────────
onMounted(() => {
  const tenantId = auth.effectiveTenantId
  if (!tenantId) return

  // ドキュメントクリックで店舗メニューを閉じる
  document.addEventListener('click', handleDocumentClick)

  // 最新ログ取得（fire-and-forget）
  dailyLogStore.fetchLatest()

  // 今日の天気取得（失敗しても日付行は常に表示）
  ;(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-weather', {
        body: { action: 'today', tenant_id: tenantId },
      })
      if (!error && data) weather.value = data as TodayWeather
    } catch {
      // 天気取得失敗は無視
    }
  })()

  /**
   * 初回ポップアップ表示
   * - HomeView マウント時のみ（作業画面の最中には出さない）
   * - 未読アップデートがある場合に1回だけ表示
   * - ログインのたび・画面遷移のたびに繰り返し出ない
   */
  if (hasUnreadUpdate.value) {
    showInitialNotice.value = true
  }
})

async function handleLogout() {
  console.log('[DIAG-LOGOUT] handleLogout called')
  await auth.logout()
  console.log('[DIAG-LOGOUT] auth.logout() completed (navigation via SIGNED_OUT handler)')
}
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark">

    <!-- ══ 訪問中バー ═══════════════════════════════════════════════
         VisitingBanner は既存ロジック（他テナント訪問中のときのみ表示）を流用。
         配色: bg-brand-50/10 + border-brand-500/30 + text-brand-700 ── すべて変数由来。
    ══════════════════════════════════════════════════════════════════ -->
    <VisitingBanner />

    <!-- ══ Section 2: 日付・天気バー ══════════════════════════════════
         背景: brand-50 相当の淡色面（ダークは brand-500/20 で暗め調整）。
         文字: brand-700（ライト）/ brand-100（ダーク）。
         天気は取得失敗時に非表示（日付は常に表示）。
    ══════════════════════════════════════════════════════════════════ -->
    <div
      class="
        bg-brand-50      dark:bg-brand-500/20
        border-b border-brand-100 dark:border-brand-500/30
        px-4 py-2.5
      "
    >
      <div class="max-w-lg mx-auto flex items-center justify-between gap-4">
        <!-- 左: 日付 -->
        <p class="text-sm font-semibold text-brand-700 dark:text-brand-100">
          {{ dateStr }}
        </p>
        <!-- 右: 天気（取得成功時のみ） -->
        <div
          v-if="weather?.weather_code != null"
          class="flex items-center gap-1.5 text-brand-700 dark:text-brand-100 shrink-0"
        >
          <component :is="wmoIcon(weather.weather_code)" :size="16" />
          <span class="text-sm font-medium">
            <template v-if="weather.temp_max != null">
              {{ Math.round(weather.temp_max) }}°
              <span class="opacity-50 mx-0.5">·</span>
            </template>
            {{ wmoLabel(weather.weather_code) }}
          </span>
        </div>
      </div>
    </div>

    <!-- ══ Section 3: メインカード（テーマカラーグラデーション） ═════
         グラデーション: brand-400（明）→ brand-700（暗）の斜め。
         ダーク: brand-500 → brand-700（明暗差を保ちつつ輝度を落とす）。
         文字はすべて白系（white / white/70）でコントラスト確保。
         ハードコード16進なし。すべて --color-brand-* から生成。
    ══════════════════════════════════════════════════════════════════ -->
    <div
      class="
        bg-gradient-to-br from-brand-400 to-brand-700
        dark:from-brand-500 dark:to-brand-700
        px-4 py-5 shadow-md
      "
    >
      <div class="max-w-lg mx-auto space-y-4">

        <!-- 1行目: アプリアイコン ＋ アプリ名 ＋ テナント名 -->
        <div class="flex items-center gap-3">
          <img
            :src="iconSrc"
            alt=""
            class="w-9 h-9 rounded-xl object-cover shrink-0 shadow-sm ring-1 ring-white/20"
          />
          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-semibold text-white/70 leading-none">串在庫管理</p>
            <p class="text-base font-bold text-white leading-tight truncate mt-0.5">
              {{ currentTenantName }}
            </p>
          </div>
        </div>

        <!-- 2行目: ユーザー名 ＋ ロールバッジ -->
        <div class="flex items-center gap-2 flex-wrap">
          <p class="text-white font-semibold leading-tight">{{ auth.displayName }}</p>
          <span
            v-if="roleLabel"
            class="text-[11px] bg-white/20 text-white/90 px-2.5 py-0.5 rounded-full leading-tight"
          >
            {{ roleLabel }}
          </span>
        </div>

        <!-- 3行目: 最新ログの売上・串本数 2カード -->
        <div class="grid grid-cols-2 gap-2.5">
          <div class="bg-white/15 rounded-2xl px-3.5 py-3">
            <p class="text-[11px] text-white/60 leading-none mb-1">
              {{ latestLog ? `${formatLogDateLabel(latestLog.log_date)} の売上` : '最新の売上' }}
            </p>
            <p
              class="text-lg font-bold text-white tabular-nums leading-tight"
              :class="dailyLogStore.loadingLatest ? 'opacity-40' : ''"
            >
              {{ dailyLogStore.loadingLatest ? '...' : formatSales(latestLog?.total_sales) }}
            </p>
          </div>
          <div class="bg-white/15 rounded-2xl px-3.5 py-3">
            <p class="text-[11px] text-white/60 leading-none mb-1">
              {{ latestLog ? `${formatLogDateLabel(latestLog.log_date)} の串` : '最新の串本数' }}
            </p>
            <p
              class="text-lg font-bold text-white tabular-nums leading-tight"
              :class="dailyLogStore.loadingLatest ? 'opacity-40' : ''"
            >
              {{ dailyLogStore.loadingLatest ? '...' : formatSkewers(latestLog?.total_skewers) }}
            </p>
          </div>
        </div>

        <!-- 下行: 店舗切替（manager以上・複数テナント時のみ）＋ログアウト -->
        <div class="flex justify-end items-center gap-2 pt-0.5">
          <!-- 店舗切替ボタン -->
          <div v-if="showTenantSwitcher" ref="tenantMenuRef" class="relative">
            <button
              class="
                flex items-center gap-1.5 text-xs font-medium
                bg-brand-50 text-brand-700
                px-3 py-1.5 rounded-xl transition-colors active:scale-95
                hover:bg-white
              "
              @click.stop="showTenantMenu = !showTenantMenu"
            >
              <Store :size="13" />
              店舗切替
            </button>
            <!-- ドロップダウン -->
            <div
              v-if="showTenantMenu"
              class="
                absolute right-0 bottom-full mb-1.5 z-50
                bg-white dark:bg-neutral-800
                border border-edge dark:border-edge-dark
                rounded-xl shadow-lg overflow-hidden min-w-[9rem]
              "
            >
              <button
                v-for="t in auth.accessibleTenants"
                :key="t.id"
                class="
                  w-full text-left px-3.5 py-2.5 text-sm
                  text-neutral-800 dark:text-neutral-100
                  hover:bg-brand-50 dark:hover:bg-brand-500/20
                  transition-colors
                "
                :class="t.id === auth.effectiveTenantId ? 'font-semibold text-brand-700 dark:text-brand-300' : ''"
                @click="handleTenantSelect(t.id)"
              >
                {{ t.name }}
              </button>
            </div>
          </div>
          <!-- テーマ切替 -->
          <button
            class="
              flex items-center justify-center
              text-white/70 hover:text-white
              border border-white/25 hover:border-white/50
              min-h-tap min-w-tap rounded-xl transition-colors active:scale-95
            "
            :aria-label="`テーマ切替（現在: ${theme.mode}）`"
            @click="theme.cycle()"
          >
            <component
              :is="theme.mode === 'light' ? Sun : theme.mode === 'dark' ? Moon : Monitor"
              :size="14"
            />
          </button>
          <!-- ログアウト -->
          <button
            class="
              flex items-center gap-1.5 text-xs text-white/70 hover:text-white
              border border-white/25 hover:border-white/50
              px-3 py-1.5 rounded-xl transition-colors active:scale-95
            "
            @click="handleLogout"
          >
            <LogOut :size="13" />
            ログアウト
          </button>
        </div>

      </div>
    </div>

    <!-- ══ Section 4: 機能グリッド（2列）══════════════════════════════
         各カード: 丸アイコン（円背景 brand-50/dark:brand-500/20）＋機能名＋サブテキスト。
         ロール別出し分けは既存 visibleCards を流用。絵文字は廃止・lucide に統一。
    ══════════════════════════════════════════════════════════════════ -->
    <main class="max-w-lg mx-auto px-4 py-4">
      <div class="grid grid-cols-2 gap-3">
        <router-link
          v-for="card in visibleCards"
          :key="card.to"
          :to="card.to"
          class="
            flex flex-col items-center gap-2.5
            bg-card dark:bg-card-dark
            border border-edge dark:border-edge-dark
            rounded-2xl px-3 py-5
            active:scale-[0.97] transition-transform
          "
        >
          <!-- アイコン円: brand-50 淡色地（ダークは brand-500/20 で暗め調整） -->
          <div
            class="
              w-12 h-12 rounded-full flex items-center justify-center
              bg-brand-50    dark:bg-brand-500/20
            "
          >
            <component
              :is="card.icon"
              :size="22"
              class="text-brand-600 dark:text-brand-400"
            />
          </div>
          <!-- テキスト -->
          <div class="text-center min-w-0 w-full">
            <p class="text-sm font-semibold text-neutral-900 dark:text-neutral-50 leading-tight">
              {{ card.label }}
            </p>
            <p class="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-tight">
              {{ card.desc }}
            </p>
          </div>
        </router-link>

        <!-- 月次処理カード（store_owner 以上） -->
        <button
          v-if="isStoreOwnerOrAbove"
          class="
            relative flex flex-col items-center gap-2.5
            bg-card dark:bg-card-dark
            border border-edge dark:border-edge-dark
            rounded-2xl px-3 py-5
            active:scale-[0.97] transition-transform
          "
          @click="router.push('/monthly-tasks')"
        >
          <div class="relative">
            <div
              class="
                w-12 h-12 rounded-full flex items-center justify-center
                bg-brand-50    dark:bg-brand-500/20
              "
            >
              <CalendarCog :size="22" class="text-brand-600 dark:text-brand-400" />
            </div>
          </div>
          <div class="text-center min-w-0 w-full">
            <p class="text-sm font-semibold text-neutral-900 dark:text-neutral-50 leading-tight">
              月次処理
            </p>
            <p class="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-tight">
              予算・データ修正
            </p>
          </div>
        </button>

        <!-- お知らせカード -->
        <button
          class="
            relative flex flex-col items-center gap-2.5
            bg-card dark:bg-card-dark
            border border-edge dark:border-edge-dark
            rounded-2xl px-3 py-5
            active:scale-[0.97] transition-transform
          "
          @click="openUpdateList"
        >
          <!-- アイコン円 + 未読バッジ -->
          <div class="relative">
            <div
              class="
                w-12 h-12 rounded-full flex items-center justify-center
                bg-brand-50    dark:bg-brand-500/20
              "
            >
              <Bell :size="22" class="text-brand-600 dark:text-brand-400" />
            </div>
            <!-- 未読バッジ（赤ドット） -->
            <span
              v-if="hasUnreadUpdate"
              class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-card dark:border-card-dark"
            />
          </div>
          <!-- テキスト -->
          <div class="text-center min-w-0 w-full">
            <p class="text-sm font-semibold text-neutral-900 dark:text-neutral-50 leading-tight">
              お知らせ
            </p>
            <p class="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-tight">
              アップデート情報
            </p>
          </div>
        </button>
      </div>
    </main>

    <!-- ══ モーダル ════════════════════════════════════════════════════ -->

    <!-- 初回ポップアップ（HomeView マウント時のみ） -->
    <UpdateNoticeModal
      :open="showInitialNotice"
      :entry="latestEntry"
      @close="closeInitialNotice"
    />

    <!-- 一覧モーダル（お知らせカードクリック時） -->
    <UpdateListModal
      :open="showUpdateList"
      :changelog="changelog"
      @close="showUpdateList = false"
    />

  </div>
</template>
