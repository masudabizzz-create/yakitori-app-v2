<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSkewersStore } from '@/stores/skewers'
import { useSettingsStore } from '@/stores/settings'
import { useDailyLogStore } from '@/stores/dailyLog'
import { useUsersStore } from '@/stores/users'
import { calcPrep, calcTotalSkewers } from '@/composables/useInventoryCalc'
import { resolveBusinessDate, formatBusinessDateLabel } from '@/composables/useBusinessDate'
import type { BusinessDateResult } from '@/composables/useBusinessDate'
import { ROLE_RANK } from '@/lib/roleRank'
import { notifyDailyReport } from '@/composables/useLineNotify'
import StepperInput from '@/components/StepperInput.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import VisitingBanner from '@/components/VisitingBanner.vue'
import type { DailyInputForm, SkewerCategory } from '@/types'
import { ChevronLeft, Store, BedDouble } from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()
const skewersStore = useSkewersStore()
const settingsStore = useSettingsStore()
const dailyLogStore = useDailyLogStore()
const usersStore = useUsersStore()

/** 現在入店中の店舗名 */
const currentTenantName = computed(() =>
  auth.accessibleTenants.find((t) => t.id === auth.effectiveTenantId)?.name ?? ''
)

const loading = ref(true)
const loadError = ref('')
const submitting = ref(false)
const submitError = ref('')
const showConfirm = ref(false)
const draftRestored = ref(false)
const lineWarning = ref('')
const savedOk = ref(false)

// ─── 営業日判定 ───────────────────────────────────────────────
/** resolveBusinessDate の結果（openConfirm 時に確定） */
const businessDateResult = ref<BusinessDateResult | null>(null)
/** 確定した営業日 YYYY-MM-DD（自動割り当て or ユーザー選択） */
const resolvedLogDate = ref<string>('')

/**
 * ドリンク比率の文字列バッファ（小数点入力対応）。
 * form.drinkRatio（number）とは分離し、保存時に parseFloat() で変換する。
 */
const drinkRatioStr = ref<string>('')
const drinkRatioErr = ref<string>('')

/** drinkRatioStr → form.drinkRatio（数値）にリアルタイム同期 */
watch(drinkRatioStr, (v) => {
  const parsed = parseFloat(v)
  form.drinkRatio = isNaN(parsed) || v.trim() === '' ? 0 : parsed
  if (drinkRatioErr.value) drinkRatioErr.value = ''
})

/**
 * 組数・客数の文字列バッファ。
 * 空文字 = 未入力（null）と 0 入力を区別するために文字列で管理する。
 */
const groupsCountStr = ref<string>('0')
const guestsCountStr = ref<string>('0')
const groupsGuestsErr = ref<string>('')

// 入力フォーム
const form = reactive<DailyInputForm>({
  staffName: '',
  courseCasual: 0,
  courseStandard: 0,
  coursePremium: 0,
  extraSkewers: 0,
  totalSales: 0,
  drinkRatio: 0,
  memo: '',
  skewerInputs: {},
  groupsCount: null,
  guestsCount: null,
})

// カテゴリ表示順（副産物は入力対象外）
const CATEGORY_ORDER: SkewerCategory[] = [
  'レギュラー',
  'スペシャル',
  'つくね',
  '前日仕込み',
  'その他仕込み',
]

const inputSkewers = computed(() =>
  skewersStore.skewers.filter((s) => s.category !== '副産物'),
)

const groupedSkewers = computed(() =>
  CATEGORY_ORDER.map((category) => ({
    category,
    items: inputSkewers.value.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0),
)

/** 有効なスタッフ一覧（名前順）*/
const activeUsers = computed(() =>
  usersStore.users.filter((u) => u.is_active),
)

/** manager 以上（rank >= 4）のみ焼師を変更できる */
const canChangeStaff = computed(() =>
  ROLE_RANK[auth.role ?? 'staff_both'] >= 4,
)

/** manager 以上かつ複数テナントにアクセスできる場合のみ店舗切替ボタンを表示 */
const showTenantSwitcher = computed(() =>
  ROLE_RANK[auth.role ?? 'staff_both'] >= 4 && auth.accessibleTenants.length > 1,
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

// 翌日が日曜か
const tomorrowIsSunday = computed(() => {
  const t = new Date()
  t.setDate(t.getDate() + 1)
  return t.getDay() === 0
})

// 合計串本数（自動計算）
const totalSkewers = computed(() => {
  const s = settingsStore.settings
  if (!s) return 0
  return calcTotalSkewers(
    {
      casual: form.courseCasual,
      standard: form.courseStandard,
      premium: form.coursePremium,
      extra: form.extraSkewers,
    },
    {
      casual: s.course_casual_skewers,
      standard: s.course_standard_skewers,
      premium: s.course_premium_skewers,
    },
  )
})

/** カテゴリごとの入力単位ラベル */
function unitLabel(category: SkewerCategory): string {
  if (category === 'レギュラー' || category === '前日仕込み') return 'P'
  if (category === 'つくね') return 'B'
  return '本'
}

onMounted(async () => {
  document.addEventListener('click', handleDocumentClick)
  loading.value = true
  loadError.value = ''
  try {
    const tenantId = auth.effectiveTenantId
    await Promise.all([
      skewersStore.fetchActive(tenantId),
      settingsStore.fetchSettings(tenantId),
      usersStore.fetchAll(tenantId),
    ])
    if (skewersStore.error) throw new Error(skewersStore.error)
    if (settingsStore.error) throw new Error(settingsStore.error)

    form.staffName = auth.appUser?.name ?? auth.displayName

    // 下書き復元
    const draft = dailyLogStore.loadDraft()
    if (draft) {
      form.courseCasual = draft.courseCasual
      form.courseStandard = draft.courseStandard
      form.coursePremium = draft.coursePremium
      form.extraSkewers = draft.extraSkewers
      form.totalSales = draft.totalSales
      form.drinkRatio = draft.drinkRatio
      form.memo = draft.memo
      draftRestored.value = true
    }

    // ドリンク比率の文字列バッファを初期化（下書き復元後）
    drinkRatioStr.value = form.drinkRatio > 0 ? String(form.drinkRatio) : ''

    // 串入力の初期化（下書きがあれば引き継ぐ）
    for (const s of inputSkewers.value) {
      form.skewerInputs[s.id] = draft?.skewerInputs?.[s.id] ?? {
        value: 0,
        isKombu: false,
        isPreparing: false,
      }
    }

    // 下書き自動保存（初期化後に開始）
    watch(form, () => dailyLogStore.saveDraft(form), { deep: true })
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '読み込みに失敗しました'
  } finally {
    loading.value = false
  }
})

/** ドリンク比率のバリデーション。0以上・小数点2桁まで。 */
function validateDrinkRatio(): boolean {
  const raw = drinkRatioStr.value.trim()
  if (raw === '') {
    // 空欄は 0 として許可
    form.drinkRatio = 0
    return true
  }
  const parsed = parseFloat(raw)
  if (isNaN(parsed) || parsed < 0 || !/^\d+(\.\d{1,2})?$/.test(raw)) {
    drinkRatioErr.value = '0以上の数値を小数点2桁まで入力してください（例: 35.5）'
    return false
  }
  form.drinkRatio = parsed
  drinkRatioErr.value = ''
  return true
}

/**
 * 組数・客数のバリデーション。
 * 空欄（null）は送信不可、0 は有効。整数のみ許可。
 */
function validateGroupsGuests(): boolean {
  groupsGuestsErr.value = ''
  const gs = groupsCountStr.value.trim()
  const cs = guestsCountStr.value.trim()
  if (gs === '' || cs === '') {
    groupsGuestsErr.value = '総組数と総客数を入力してください（0も有効です）'
    return false
  }
  const g = parseInt(gs, 10)
  const c = parseInt(cs, 10)
  if (isNaN(g) || g < 0 || !Number.isInteger(g)) {
    groupsGuestsErr.value = '総組数は0以上の整数を入力してください'
    return false
  }
  if (isNaN(c) || c < 0 || !Number.isInteger(c)) {
    groupsGuestsErr.value = '総客数は0以上の整数を入力してください'
    return false
  }
  form.groupsCount = g
  form.guestsCount = c
  return true
}

// 総組数・総客数セクションへのスクロール用 ref
const groupsGuestsRef = ref<HTMLDivElement | null>(null)

/**
 * 「確認して送信」ボタン押下時の処理。
 * モーダルを開く前にバリデーションを実行し、
 * エラーがある場合は該当フィールドへスクロールして返す。
 */
function openConfirm() {
  // バリデーション先行実行（失敗時はモーダルを開かず、エラー箇所へスクロール）
  const groupsOk = validateGroupsGuests()
  const drinkOk = validateDrinkRatio()
  if (!groupsOk || !drinkOk) {
    if (!groupsOk) {
      nextTick(() => groupsGuestsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }
    return
  }
  // 営業日を判定してモーダルに反映
  const result = resolveBusinessDate(new Date())
  businessDateResult.value = result
  resolvedLogDate.value = result.date   // 自動割り当て or デフォルト選択（今日）
  showConfirm.value = true
}

/** 今日の日付を YYYY-MM-DD 形式で返す */
function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function handleSubmit() {
  showConfirm.value = false
  // openConfirm() でバリデーション済みだが念のため再確認
  const groupsOk = validateGroupsGuests()
  const drinkOk = validateDrinkRatio()
  if (!groupsOk || !drinkOk) {
    // どちらが失敗しても組数・客数フィールドへスクロール（最上位の必須項目）
    nextTick(() => groupsGuestsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    return
  }
  submitting.value = true
  submitError.value = ''
  lineWarning.value = ''
  try {
    const s = settingsStore.settings
    const tenantId = auth.effectiveTenantId
    if (!s || !tenantId) throw new Error('設定の読み込みが完了していません')

    // Supabase に保存
    const { stockRows } = await dailyLogStore.submitDailyReport(
      { ...form },
      {
        tenantId,
        skewers: skewersStore.skewers,
        perCourse: {
          casual: s.course_casual_skewers,
          standard: s.course_standard_skewers,
          premium: s.course_premium_skewers,
        },
        logDate: resolvedLogDate.value || undefined,
      },
    )
    savedOk.value = true

    // 仕込み計算（GAS submitDailyReport と同様、当日の getDay() を渡す）
    const stockMap: Record<string, number> = {}
    const kombuFlags: Record<string, boolean> = {}
    for (const r of stockRows) {
      stockMap[r.skewerId] = r.stock
      kombuFlags[r.skewerId] = r.is_kombu
    }
    const prepResults = calcPrep(skewersStore.skewers, stockMap, new Date().getDay(), {
      sundayBoostEnabled: s.sunday_boost_enabled,
      kombuFlags,
    })

    // LINE通知（Edge Function 経由・失敗してもアプリは止めない）
    const lineRes = await notifyDailyReport({
      prepResults,
      report: {
        totalSales: form.totalSales,
        drinkRatio: form.drinkRatio,
        courseCasual: form.courseCasual,
        courseStandard: form.courseStandard,
        coursePremium: form.coursePremium,
        extraSkewers: form.extraSkewers,
        totalSkewers: totalSkewers.value,
        memo: form.memo,
      },
      staffName: form.staffName,
      tenantId: tenantId,
    })

    dailyLogStore.clearDraft()

    // 天気データを非同期で取得（失敗しても保存処理をブロックしない）
    ;(async () => {
      try {
        const { supabase } = await import('@/lib/supabase')
        await supabase.functions.invoke('fetch-weather', {
          body: { action: 'historical', tenant_id: tenantId, log_date: todayYmd() },
        })
      } catch {
        // 天気取得エラーは無視（UI に影響させない）
      }
    })()

    if (lineRes.lineSent) {
      // 送信完了後、仕込みダッシュボードへ自動遷移
      router.push('/dashboard')
    } else {
      // 保存は成功・LINEのみ失敗 → 警告を表示し手動遷移
      lineWarning.value = lineRes.lineError
    }
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : '送信に失敗しました'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark pb-28">
    <!-- ヘッダー -->
    <header class="bg-card dark:bg-card-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
      <VisitingBanner />
      <div class="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
        <router-link
          to="/"
          class="flex items-center gap-0.5 text-sm text-neutral-400 dark:text-neutral-500
                 hover:text-neutral-600 dark:hover:text-neutral-300 shrink-0"
        >
          <ChevronLeft :size="16" />ホーム
        </router-link>
        <h1 class="text-base font-semibold text-neutral-900 dark:text-neutral-50 flex-1 truncate">営業後入力</h1>
        <!-- 店舗切替（manager以上・複数テナント時のみ） -->
        <div v-if="showTenantSwitcher" ref="tenantMenuRef" class="relative shrink-0">
          <button
            class="flex items-center gap-1.5 text-xs font-medium
                   bg-brand-50 text-brand-700
                   px-3 py-1.5 rounded-xl transition-colors active:scale-95
                   hover:bg-brand-100 dark:bg-brand-500/20 dark:text-brand-300 dark:hover:bg-brand-500/30"
            @click.stop="showTenantMenu = !showTenantMenu"
          >
            <Store :size="13" />
            店舗切替
          </button>
          <!-- ドロップダウン -->
          <div
            v-if="showTenantMenu"
            class="absolute right-0 top-full mt-1.5 z-50
                   bg-white dark:bg-neutral-800
                   border border-edge dark:border-edge-dark
                   rounded-xl shadow-lg overflow-hidden min-w-[9rem]"
          >
            <button
              v-for="t in auth.accessibleTenants"
              :key="t.id"
              class="w-full text-left px-3.5 py-2.5 text-sm
                     text-neutral-800 dark:text-neutral-100
                     hover:bg-brand-50 dark:hover:bg-brand-500/20
                     transition-colors"
              :class="t.id === auth.effectiveTenantId
                ? 'font-semibold text-brand-700 dark:text-brand-300'
                : ''"
              @click="handleTenantSelect(t.id)"
            >
              {{ t.name }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-lg mx-auto px-4 py-5 space-y-5">
      <p v-if="loading" class="text-center text-neutral-400 dark:text-neutral-500 py-12">読み込み中...</p>

      <p v-else-if="loadError" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
        {{ loadError }}
      </p>

      <template v-else>
        <!-- 日曜バナー -->
        <div
          v-if="tomorrowIsSunday"
          class="flex items-center gap-2 bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-500/25 rounded-2xl px-4 py-3 text-sm font-semibold"
        >
          <BedDouble :size="16" class="shrink-0" />
          明日は日曜日 — 無理のない仕込みで
        </div>

        <!-- 下書き復元通知 -->
        <p v-if="draftRestored" class="text-xs text-neutral-500 dark:text-neutral-400 bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-xl px-3 py-2">
          前回の下書きを復元しました
        </p>

        <!-- 焼師（manager以上: プルダウン選択 / それ以外: 読み取り専用） -->
        <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3 space-y-1.5">
          <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400">焼師</p>
          <!-- manager 以上（rank >= 4）かつスタッフ一覧取得済みの場合はプルダウン -->
          <select
            v-if="canChangeStaff && activeUsers.length > 0"
            v-model="form.staffName"
            class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white text-sm font-semibold focus:border-brand-500 focus:ring-brand-500 px-3 py-2"
          >
            <option v-for="u in activeUsers" :key="u.id" :value="u.name">
              {{ u.name }}
            </option>
          </select>
          <!-- それ以外: ログイン中ユーザー名を読み取り専用で表示 -->
          <p v-else class="font-semibold text-neutral-900 dark:text-neutral-50">
            {{ form.staffName || '—' }}
          </p>
        </section>

        <!-- 在庫入力 -->
        <section
          v-for="group in groupedSkewers"
          :key="group.category"
          class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
        >
          <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            {{ group.category }}
          </h2>
          <ul class="divide-y divide-edge dark:divide-edge-dark">
            <li
              v-for="s in group.items"
              :key="s.id"
              class="px-4 py-3 flex items-center gap-3"
            >
              <div class="flex-1 min-w-0">
                <p class="font-medium text-neutral-900 dark:text-neutral-100 truncate">{{ s.name }}</p>
                <label
                  v-if="s.category === '前日仕込み'"
                  class="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400"
                >
                  <input
                    v-model="form.skewerInputs[s.id].isKombu"
                    type="checkbox"
                    class="rounded border-edge dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] text-brand-500 focus:ring-brand-500"
                  />
                  {{ s.prep_method_name || '昆布締め' }}済み
                </label>
              </div>

              <!-- その他仕込み: 仕込み中チェックのみ -->
              <label
                v-if="s.category === 'その他仕込み'"
                class="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200"
              >
                <input
                  v-model="form.skewerInputs[s.id].isPreparing"
                  type="checkbox"
                  class="w-5 h-5 rounded border-edge dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] text-brand-500 focus:ring-brand-500"
                />
                仕込み中
              </label>

              <!-- それ以外: ステッパー入力 -->
              <div v-else class="flex items-center gap-1.5">
                <StepperInput v-model="form.skewerInputs[s.id].value" />
                <span class="text-sm text-neutral-500 dark:text-neutral-400 w-4">{{ unitLabel(s.category) }}</span>
              </div>
            </li>
          </ul>
        </section>

        <!-- 売上データ -->
        <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
          <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">売上データ</h2>
          <div class="divide-y divide-edge dark:divide-edge-dark">
            <div class="px-4 py-3 flex items-center justify-between">
              <span class="text-sm text-neutral-700 dark:text-neutral-200">カジュアル組数</span>
              <StepperInput v-model="form.courseCasual" />
            </div>
            <div class="px-4 py-3 flex items-center justify-between">
              <span class="text-sm text-neutral-700 dark:text-neutral-200">スタンダード組数</span>
              <StepperInput v-model="form.courseStandard" />
            </div>
            <div class="px-4 py-3 flex items-center justify-between">
              <span class="text-sm text-neutral-700 dark:text-neutral-200">プレミアム組数</span>
              <StepperInput v-model="form.coursePremium" />
            </div>
            <div class="px-4 py-3 flex items-center justify-between">
              <span class="text-sm text-neutral-700 dark:text-neutral-200">追加串</span>
              <div class="flex items-center gap-1.5">
                <StepperInput v-model="form.extraSkewers" />
                <span class="text-sm text-neutral-500 dark:text-neutral-400 w-4">本</span>
              </div>
            </div>
            <div class="px-4 py-3 flex items-center justify-between bg-brand-500/[0.04]">
              <span class="text-sm font-medium text-neutral-700 dark:text-neutral-200">合計串本数</span>
              <span class="text-3xl font-bold tabular-nums text-brand-500">
                {{ totalSkewers }}<span class="text-sm text-neutral-400 dark:text-neutral-500 ml-1">本</span>
              </span>
            </div>
            <div class="px-4 py-3 flex items-center justify-between">
              <label class="text-sm text-neutral-700 dark:text-neutral-200">総売上（円）</label>
              <input
                v-model.number="form.totalSales"
                type="number"
                inputmode="numeric"
                min="0"
                class="w-32 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
              />
            </div>
            <!-- 総組数・総客数（実入力・必須） -->
            <div ref="groupsGuestsRef" class="px-4 py-3 space-y-0.5 border-t-2 border-brand-500/20">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  総組数
                  <span class="ml-1 text-[10px] text-brand-500 font-normal">必須</span>
                </span>
                <input
                  v-model="groupsCountStr"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  class="w-24 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
                  :class="groupsGuestsErr ? 'border-red-400 dark:border-red-500' : ''"
                  @input="groupsGuestsErr = ''"
                />
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  総客数
                  <span class="ml-1 text-[10px] text-brand-500 font-normal">必須</span>
                </span>
                <input
                  v-model="guestsCountStr"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  class="w-24 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
                  :class="groupsGuestsErr ? 'border-red-400 dark:border-red-500' : ''"
                  @input="groupsGuestsErr = ''"
                />
              </div>
              <p v-if="groupsGuestsErr" class="text-xs text-red-500 dark:text-red-400 text-right pt-0.5">
                {{ groupsGuestsErr }}
              </p>
            </div>
            <div class="px-4 py-3 space-y-1">
              <div class="flex items-center justify-between">
                <label class="text-sm text-neutral-700 dark:text-neutral-200">ドリンク比率（%）</label>
                <input
                  v-model="drinkRatioStr"
                  type="text"
                  inputmode="decimal"
                  placeholder="0"
                  autocomplete="off"
                  class="w-32 text-right tabular-nums rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
                  :class="drinkRatioErr ? 'border-red-400 dark:border-red-500 focus:border-red-400 focus:ring-red-400' : ''"
                />
              </div>
              <p v-if="drinkRatioErr" class="text-xs text-red-500 dark:text-red-400 text-right">
                {{ drinkRatioErr }}
              </p>
            </div>
            <div class="px-4 py-3">
              <label class="text-sm text-neutral-700 dark:text-neutral-200 block mb-1.5">メモ（任意）</label>
              <textarea
                v-model="form.memo"
                rows="2"
                class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                placeholder="今日どうだった？"
              />
            </div>
          </div>
        </section>

        <!-- 送信エラー -->
        <p v-if="submitError" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {{ submitError }}
        </p>

        <!-- 保存OK・LINEのみ失敗 -->
        <div
          v-if="savedOk && lineWarning"
          class="bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 rounded-2xl px-4 py-3 text-sm space-y-2"
        >
          <p>保存は完了しましたが、LINE通知に失敗しました。</p>
          <p class="text-xs text-amber-600 dark:text-amber-400/80 break-all">{{ lineWarning }}</p>
          <button
            class="mt-1 w-full py-3 rounded-2xl bg-brand-500 hover:bg-brand-600 active:scale-95 transition-transform text-white font-semibold"
            @click="router.push('/dashboard')"
          >
            仕込みダッシュボードへ
          </button>
        </div>
      </template>
    </main>

    <!-- 送信バー（固定） -->
    <div
      v-if="!loading && !loadError && !(savedOk && lineWarning)"
      class="fixed bottom-0 inset-x-0 bg-card dark:bg-card-dark border-t border-edge dark:border-edge-dark px-4 py-3"
      style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom))"
    >
      <div class="max-w-lg mx-auto space-y-2">
        <!-- バリデーションエラーをボタン直上に表示 -->
        <p v-if="groupsGuestsErr" class="text-xs text-red-500 dark:text-red-400 text-center px-1">
          {{ groupsGuestsErr }}
        </p>
        <p v-if="drinkRatioErr" class="text-xs text-red-500 dark:text-red-400 text-center px-1">
          {{ drinkRatioErr }}
        </p>
        <button
          type="button"
          :disabled="submitting"
          class="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
          @click="openConfirm"
        >
          確認して送信
        </button>
      </div>
    </div>

    <!-- 確認モーダル -->
    <ConfirmModal
      :open="showConfirm"
      title="送信内容の確認"
      confirm-label="送信する"
      :busy="submitting"
      @cancel="showConfirm = false"
      @confirm="handleSubmit"
    >
      <!-- ── 営業日（自動表示 or 2択選択） ── -->
      <div v-if="businessDateResult" class="mb-3">
        <!-- 自動割り当て: 表示のみ -->
        <template v-if="!businessDateResult.needsConfirm">
          <div class="flex items-center justify-between rounded-xl bg-brand-500/10 dark:bg-brand-500/20 px-3 py-2">
            <span class="text-xs text-neutral-500 dark:text-neutral-400">営業日</span>
            <span class="font-bold text-brand-500">{{ formatBusinessDateLabel(resolvedLogDate) }}</span>
          </div>
        </template>
        <!-- 確認必要: 2択ボタン -->
        <template v-else>
          <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">どちらの営業分ですか？</p>
          <div class="flex gap-2">
            <button
              v-for="(candidate, i) in businessDateResult.candidates"
              :key="candidate"
              type="button"
              class="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors active:scale-95"
              :class="resolvedLogDate === candidate
                ? 'bg-brand-500 text-white'
                : 'bg-neutral-100 dark:bg-[#2A2A2A] text-neutral-700 dark:text-neutral-200'"
              @click="resolvedLogDate = candidate"
            >
              <span class="block text-[10px] font-normal leading-tight mb-0.5 opacity-70">{{ i === 0 ? '今日' : '前日' }}</span>
              {{ formatBusinessDateLabel(candidate) }}
            </button>
          </div>
        </template>
      </div>

      <!-- ── 送信内容サマリー ── -->
      <ul class="space-y-1">
        <li class="flex items-center gap-1.5 font-semibold text-neutral-700 dark:text-neutral-200">
          <Store :size="14" />{{ currentTenantName }}
        </li>
        <li>焼師: {{ form.staffName }}</li>
        <li>コース: C{{ form.courseCasual }} / S{{ form.courseStandard }} / P{{ form.coursePremium }}</li>
        <li>総組数: {{ groupsCountStr }}組 / 総客数: {{ guestsCountStr }}名</li>
        <li>合計串本数: {{ totalSkewers }}本</li>
        <li>総売上: ¥{{ form.totalSales.toLocaleString() }}</li>
      </ul>
      <p class="mt-2 text-xs text-neutral-400 dark:text-neutral-500">送信するとLINEへ通知が送られます。</p>
    </ConfirmModal>
  </div>
</template>
