<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { ROLE_RANK } from '@/lib/roleRank'

const settingsStore = useSettingsStore()
const auth = useAuthStore()

// 定休日設定
const regularHolidays = ref<number[]>([])
const savingHolidays = ref(false)
const holidaysMsg = ref('')
const holidaysErr = ref('')

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']

/** store_owner 以上か（定休日変更権限） */
const isStoreOwnerOrAbove = computed(() =>
  auth.role ? ROLE_RANK[auth.role] >= ROLE_RANK.store_owner : false
)

// LINE トークン
const lineToken = ref('')
const savingToken = ref(false)
const tokenMsg = ref('')
const tokenErr = ref('')

// パスワード変更
const newPassword = ref('')
const confirmPassword = ref('')
const changingPw = ref(false)
const pwMsg = ref('')
const pwErr = ref('')

// 拠点店舗変更（platform_admin のみ）
const selectedHomeTenantId = ref('')
const savingHomeTenant = ref(false)
const homeTenantMsg = ref('')
const homeTenantErr = ref('')

/** 現在の拠点店舗名 */
const currentHomeTenantName = computed(() => {
  const id = auth.appUser?.tenant_id
  return auth.accessibleTenants.find((t) => t.id === id)?.name ?? id ?? '—'
})

onMounted(() => {
  lineToken.value = settingsStore.settings?.line_token ?? ''
  selectedHomeTenantId.value = auth.appUser?.tenant_id ?? ''
  regularHolidays.value = settingsStore.settings?.regular_holidays ?? []
})

async function saveLineToken() {
  savingToken.value = true
  tokenMsg.value = ''
  tokenErr.value = ''
  try {
    await settingsStore.saveSettings({ line_token: lineToken.value.trim() })
    tokenMsg.value = 'LINEトークンを保存しました'
  } catch (e) {
    tokenErr.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    savingToken.value = false
  }
}

async function saveHomeTenant() {
  if (!selectedHomeTenantId.value) return
  savingHomeTenant.value = true
  homeTenantMsg.value = ''
  homeTenantErr.value = ''
  try {
    await auth.updateHomeTenant(selectedHomeTenantId.value)
    homeTenantMsg.value = '拠点店舗を変更しました'
  } catch (e) {
    homeTenantErr.value = e instanceof Error ? e.message : '変更に失敗しました'
  } finally {
    savingHomeTenant.value = false
  }
}

async function changePassword() {
  pwMsg.value = ''
  pwErr.value = ''
  if (newPassword.value.length < 6) {
    pwErr.value = 'パスワードは6文字以上で入力してください'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    pwErr.value = 'パスワードが一致しません'
    return
  }
  changingPw.value = true
  try {
    await auth.updatePassword(newPassword.value)
    newPassword.value = ''
    confirmPassword.value = ''
    pwMsg.value = 'パスワードを変更しました'
  } catch (e) {
    pwErr.value = e instanceof Error ? e.message : 'パスワード変更に失敗しました'
  } finally {
    changingPw.value = false
  }
}

function toggleHoliday(dow: number) {
  if (!isStoreOwnerOrAbove.value) return
  const index = regularHolidays.value.indexOf(dow)
  if (index >= 0) {
    regularHolidays.value.splice(index, 1)
  } else {
    regularHolidays.value.push(dow)
  }
  regularHolidays.value.sort()  // ソートして曜日順に
}

async function saveRegularHolidays() {
  savingHolidays.value = true
  holidaysMsg.value = ''
  holidaysErr.value = ''
  try {
    await settingsStore.saveSettings({ regular_holidays: regularHolidays.value })
    holidaysMsg.value = '定休日を保存しました'
  } catch (e) {
    holidaysErr.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    savingHolidays.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 定休日設定 -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">定休日設定</h2>
      <div class="px-4 py-3 space-y-3">
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          店舗の定休日を設定します。全員閲覧可、変更は店舗責任者以上のみ可能です。
        </p>

        <div class="flex gap-2 flex-wrap">
          <label
            v-for="(label, dow) in DOW_LABELS"
            :key="dow"
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-colors"
            :class="[
              regularHolidays.includes(dow)
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-700 dark:text-brand-300'
                : 'bg-neutral-50 dark:bg-neutral-900 border-edge dark:border-edge-dark text-neutral-700 dark:text-neutral-300',
              isStoreOwnerOrAbove ? 'cursor-pointer hover:border-brand-500/50' : 'cursor-not-allowed opacity-60'
            ]"
          >
            <input
              type="checkbox"
              :checked="regularHolidays.includes(dow)"
              :disabled="!isStoreOwnerOrAbove"
              class="rounded text-brand-500 focus:ring-brand-500"
              @change="toggleHoliday(dow)"
            />
            <span class="text-sm font-medium">{{ label }}</span>
          </label>
        </div>

        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          ※ 定休日なし（全日営業）の場合は、すべてのチェックを外してください。
        </p>

        <p v-if="holidaysErr" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {{ holidaysErr }}
        </p>
        <p v-if="holidaysMsg" class="text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          {{ holidaysMsg }}
        </p>

        <button
          v-if="isStoreOwnerOrAbove"
          type="button"
          :disabled="savingHolidays"
          class="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
          @click="saveRegularHolidays"
        >
          {{ savingHolidays ? '保存中...' : '定休日を保存' }}
        </button>
      </div>
    </section>

    <!-- 拠点店舗変更（platform_admin のみ） -->
    <section
      v-if="auth.role === 'platform_admin'"
      class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
    >
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">拠点店舗の変更</h2>
      <div class="px-4 py-3 space-y-2">
        <p class="text-xs text-neutral-400 dark:text-neutral-500">
          現在の拠点店舗: <span class="font-medium text-neutral-700 dark:text-neutral-200">{{ currentHomeTenantName }}</span>
        </p>
        <label class="block text-sm text-neutral-700 dark:text-neutral-200">
          新しい拠点店舗
          <select
            v-model="selectedHomeTenantId"
            class="mt-1 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
          >
            <option
              v-for="t in auth.accessibleTenants"
              :key="t.id"
              :value="t.id"
            >{{ t.name }}</option>
          </select>
        </label>
        <p v-if="homeTenantErr" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {{ homeTenantErr }}
        </p>
        <p v-if="homeTenantMsg" class="text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          {{ homeTenantMsg }}
        </p>
        <button
          type="button"
          :disabled="savingHomeTenant || selectedHomeTenantId === auth.appUser?.tenant_id"
          class="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
          @click="saveHomeTenant"
        >
          {{ savingHomeTenant ? '変更中...' : '拠点店舗を変更' }}
        </button>
      </div>
    </section>

    <!-- LINE設定 -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">LINE通知設定</h2>
      <div class="px-4 py-3 space-y-2">
        <label class="block text-sm text-neutral-700 dark:text-neutral-200">
          LINE Messaging API トークン
          <textarea
            v-model="lineToken"
            rows="3"
            placeholder="チャネルアクセストークンを貼り付け"
            class="mt-1 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm break-all"
          />
        </label>
        <p class="text-xs text-neutral-400 dark:text-neutral-500">
          営業後入力の送信時にブロードキャスト通知へ使用されます。空欄の場合は通知されません。
        </p>
        <p v-if="tokenErr" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {{ tokenErr }}
        </p>
        <p v-if="tokenMsg" class="text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          {{ tokenMsg }}
        </p>
        <button
          type="button"
          :disabled="savingToken"
          class="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
          @click="saveLineToken"
        >
          {{ savingToken ? '保存中...' : 'LINEトークンを保存' }}
        </button>
      </div>
    </section>

    <!-- パスワード変更 -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">パスワード変更</h2>
      <div class="px-4 py-3 space-y-2">
        <p class="text-xs text-neutral-400 dark:text-neutral-500">
          ログイン中のアカウント（{{ auth.displayName }}）のパスワードを変更します。
        </p>
        <label class="block text-sm text-neutral-700 dark:text-neutral-200">
          新しいパスワード
          <input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            class="mt-1 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
          />
        </label>
        <label class="block text-sm text-neutral-700 dark:text-neutral-200">
          新しいパスワード（確認）
          <input
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            class="mt-1 w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
          />
        </label>
        <p v-if="pwErr" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {{ pwErr }}
        </p>
        <p v-if="pwMsg" class="text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          {{ pwMsg }}
        </p>
        <button
          type="button"
          :disabled="changingPw"
          class="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
          @click="changePassword"
        >
          {{ changingPw ? '変更中...' : 'パスワードを変更' }}
        </button>
      </div>
    </section>
  </div>
</template>
