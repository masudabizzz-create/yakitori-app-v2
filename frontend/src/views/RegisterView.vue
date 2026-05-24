<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import type { UserRole } from '@/types'

const route = useRoute()

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'スーパー管理者',
  tenant_admin: 'テナント管理者',
  admin: '管理者',
  manager: 'マネージャー',
  user: 'スタッフ',
  kitchen: 'キッチン',
  hall: 'ホール',
}

// トークン検証
const token = ref((route.query.token as string) ?? '')
const validating = ref(true)
const tokenErr = ref('')
const invitationRole = ref<UserRole | null>(null)
const tenantName = ref('')
const expiresAt = ref('')

// 登録フォーム
const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const submitErr = ref('')
const success = ref(false)

onMounted(async () => {
  if (!token.value) {
    tokenErr.value = 'URLにトークンが含まれていません。QRコードを再度読み取ってください。'
    validating.value = false
    return
  }

  try {
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'validate_token', token: token.value },
    })
    if (error) {
      const detail = (data as { error?: string } | null)?.error ?? error.message
      tokenErr.value = detail
    } else {
      invitationRole.value = (data as { role: UserRole }).role
      tenantName.value = (data as { tenant_name: string }).tenant_name
      expiresAt.value = (data as { expires_at: string }).expires_at
    }
  } catch (e) {
    tokenErr.value = e instanceof Error ? e.message : 'トークンの確認に失敗しました'
  } finally {
    validating.value = false
  }
})

async function submit() {
  if (!name.value.trim() || !email.value.trim() || !password.value) {
    submitErr.value = 'すべての項目を入力してください'
    return
  }
  if (password.value !== confirmPassword.value) {
    submitErr.value = 'パスワードが一致しません'
    return
  }
  if (password.value.length < 8) {
    submitErr.value = 'パスワードは8文字以上で入力してください'
    return
  }

  submitting.value = true
  submitErr.value = ''

  try {
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: {
        action: 'register_with_token',
        token: token.value,
        email: email.value.trim(),
        name: name.value.trim(),
        password: password.value,
      },
    })
    if (error) {
      const detail = (data as { error?: string } | null)?.error ?? error.message
      submitErr.value = detail
    } else {
      success.value = true
    }
  } catch (e) {
    submitErr.value = e instanceof Error ? e.message : '登録に失敗しました'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-app dark:bg-app-dark flex items-center justify-center px-4 py-10">
    <div class="w-full max-w-sm space-y-6">

      <!-- ロゴ・タイトル -->
      <div class="text-center space-y-1">
        <h1 class="text-2xl font-bold text-neutral-900 dark:text-neutral-50">スタッフ登録</h1>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">串在庫管理アプリ</p>
      </div>

      <!-- 読み込み中 -->
      <div v-if="validating" class="text-center py-8 text-neutral-400 dark:text-neutral-500 text-sm">
        QRコードを確認中...
      </div>

      <!-- トークンエラー -->
      <div v-else-if="tokenErr" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl px-5 py-5 space-y-3 text-center">
        <p class="text-2xl">⚠️</p>
        <p class="text-sm font-semibold text-red-600 dark:text-red-400">{{ tokenErr }}</p>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">管理者に新しいQRコードの発行を依頼してください。</p>
      </div>

      <!-- 登録成功 -->
      <div v-else-if="success" class="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-2xl px-5 py-6 space-y-3 text-center">
        <p class="text-3xl">✅</p>
        <p class="text-base font-semibold text-green-700 dark:text-green-400">登録が完了しました！</p>
        <p class="text-sm text-neutral-600 dark:text-neutral-400">
          確認メールを送信しました。<br />
          メール内のリンクをタップしてアカウントを有効化してください。
        </p>
        <router-link
          to="/login"
          class="block mt-2 text-sm text-brand-500 hover:underline font-medium"
        >
          ログイン画面へ →
        </router-link>
      </div>

      <!-- 登録フォーム -->
      <template v-else>
        <!-- 招待情報 -->
        <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl px-4 py-3 space-y-1">
          <p class="text-xs text-neutral-400 dark:text-neutral-500">登録情報</p>
          <p class="text-sm text-neutral-700 dark:text-neutral-200">
            店舗: <span class="font-semibold">{{ tenantName }}</span>
          </p>
          <p class="text-sm text-neutral-700 dark:text-neutral-200">
            役割: <span class="font-semibold">{{ invitationRole ? ROLE_LABELS[invitationRole] : '' }}</span>
          </p>
        </div>

        <!-- フォーム -->
        <div class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
          <div class="divide-y divide-edge dark:divide-edge-dark">
            <!-- 名前 -->
            <div class="px-4 py-3 space-y-1">
              <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400">名前</label>
              <input
                v-model="name"
                type="text"
                placeholder="山田 太郎"
                autocomplete="name"
                class="w-full bg-transparent border-none p-0 text-sm text-neutral-900 dark:text-neutral-50 placeholder-neutral-300 dark:placeholder-neutral-600 focus:ring-0"
              />
            </div>
            <!-- メール -->
            <div class="px-4 py-3 space-y-1">
              <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400">メールアドレス</label>
              <input
                v-model="email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                class="w-full bg-transparent border-none p-0 text-sm text-neutral-900 dark:text-neutral-50 placeholder-neutral-300 dark:placeholder-neutral-600 focus:ring-0"
              />
            </div>
            <!-- パスワード -->
            <div class="px-4 py-3 space-y-1">
              <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400">パスワード（8文字以上）</label>
              <input
                v-model="password"
                type="password"
                placeholder="••••••••"
                autocomplete="new-password"
                class="w-full bg-transparent border-none p-0 text-sm text-neutral-900 dark:text-neutral-50 placeholder-neutral-300 dark:placeholder-neutral-600 focus:ring-0"
              />
            </div>
            <!-- パスワード確認 -->
            <div class="px-4 py-3 space-y-1">
              <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400">パスワード（確認）</label>
              <input
                v-model="confirmPassword"
                type="password"
                placeholder="••••••••"
                autocomplete="new-password"
                class="w-full bg-transparent border-none p-0 text-sm text-neutral-900 dark:text-neutral-50 placeholder-neutral-300 dark:placeholder-neutral-600 focus:ring-0"
              />
            </div>
          </div>
        </div>

        <p v-if="submitErr" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {{ submitErr }}
        </p>

        <button
          type="button"
          :disabled="submitting"
          class="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
          @click="submit"
        >
          {{ submitting ? '登録中...' : '登録する' }}
        </button>

        <p class="text-xs text-center text-neutral-400 dark:text-neutral-500">
          登録後、確認メールが届きます。メール内のリンクをタップしてアカウントを有効化してください。
        </p>
      </template>

    </div>
  </div>
</template>
