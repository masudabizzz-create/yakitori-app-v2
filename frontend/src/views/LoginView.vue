<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const iconSrc = `${import.meta.env.BASE_URL}icons/icon-192.png`

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const errorMsg = ref('')
const submitting = ref(false)

async function handleLogin() {
  errorMsg.value = ''
  submitting.value = true
  try {
    await auth.login(email.value, password.value)
    const redirect = (route.query.redirect as string) || '/'
    await router.push(redirect)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'ログインに失敗しました'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-app dark:bg-app-dark px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <img
          :src="iconSrc"
          alt="串在庫管理"
          class="w-24 h-24 mx-auto mb-4 rounded-3xl shadow-lg object-cover"
        />
        <h1 class="text-2xl font-bold text-neutral-900 dark:text-neutral-50">串在庫管理</h1>
        <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-1">v2</p>
      </div>

      <form
        class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-3xl p-6 space-y-4"
        @submit.prevent="handleLogin"
      >
        <div>
          <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
            メールアドレス
          </label>
          <input
            v-model="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            required
            class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white px-4 py-3 focus:border-brand-500 focus:ring-brand-500"
            placeholder="staff@example.com"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
            パスワード
          </label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white px-4 py-3 focus:border-brand-500 focus:ring-brand-500"
            placeholder="••••••••"
          />
        </div>

        <p
          v-if="errorMsg"
          class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2"
        >
          {{ errorMsg }}
        </p>

        <button
          type="submit"
          :disabled="submitting"
          class="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
        >
          {{ submitting ? 'ログイン中...' : 'ログイン' }}
        </button>
      </form>
    </div>
  </div>
</template>
