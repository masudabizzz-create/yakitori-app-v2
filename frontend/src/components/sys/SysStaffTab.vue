<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUsersStore } from '@/stores/users'
import type { AppUser, UserRole } from '@/types'

const usersStore = useUsersStore()

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: '管理者' },
  { value: 'manager', label: 'マネージャー' },
  { value: 'user', label: 'スタッフ' },
]

const rows = ref<AppUser[]>([])
const saving = ref(false)
const message = ref('')
const errorMsg = ref('')

function syncFromStore() {
  rows.value = JSON.parse(JSON.stringify(usersStore.users)) as AppUser[]
}

onMounted(syncFromStore)

async function save() {
  saving.value = true
  message.value = ''
  errorMsg.value = ''
  try {
    await usersStore.saveUsers(rows.value)
    syncFromStore()
    message.value = 'スタッフ情報を保存しました'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">スタッフ一覧</h2>

      <div v-if="rows.length === 0" class="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
        スタッフが登録されていません
      </div>
      <ul v-else class="divide-y divide-edge dark:divide-edge-dark">
        <li v-for="u in rows" :key="u.id" class="px-4 py-3 space-y-2">
          <input
            v-model="u.name"
            type="text"
            placeholder="スタッフ名"
            class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
          />
          <div class="flex items-center gap-3">
            <select
              v-model="u.role"
              class="flex-1 rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            >
              <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>
            <label class="flex items-center gap-1.5 text-sm text-neutral-700 dark:text-neutral-200">
              <input
                v-model="u.is_active"
                type="checkbox"
                class="w-5 h-5 rounded border-edge dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] text-brand-500 focus:ring-brand-500"
              />
              有効
            </label>
          </div>
        </li>
      </ul>
    </section>

    <p class="text-xs text-neutral-400 dark:text-neutral-500 px-1">
      新規スタッフの追加・削除は Supabase Auth ユーザーの作成が必要なため、Supabase
      Dashboard から行ってください（手順は SETUP.md 参照）。当画面では既存スタッフの
      名前・役割・有効フラグを編集できます。退職者は「有効」をオフにしてください。
    </p>

    <p v-if="errorMsg" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      {{ errorMsg }}
    </p>
    <p v-if="message" class="text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
      {{ message }}
    </p>

    <button
      type="button"
      :disabled="saving"
      class="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
      @click="save"
    >
      {{ saving ? '保存中...' : '💾 スタッフ情報を保存する' }}
    </button>
  </div>
</template>
