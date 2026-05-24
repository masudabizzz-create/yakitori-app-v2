<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'

const settingsStore = useSettingsStore()
const auth = useAuthStore()

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

onMounted(() => {
  lineToken.value = settingsStore.settings?.line_token ?? ''
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
</script>

<template>
  <div class="space-y-4">
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
