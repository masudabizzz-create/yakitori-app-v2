<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTenantsStore } from '@/stores/tenants'
import { useAuthStore } from '@/stores/auth'
import type { Tenant } from '@/types'

const router = useRouter()
const tenantsStore = useTenantsStore()
const auth = useAuthStore()

const editRows = ref<{ id: string; name: string }[]>([])
const saving = ref<string | null>(null)
const saveMsg = ref('')
const saveErr = ref('')

// 新規作成
const newTenantName = ref('')
const creating = ref(false)
const createMsg = ref('')
const createErr = ref('')
// 作成後の初期設定誘導ダイアログ
const setupPromptTenantId = ref<string | null>(null)

// 削除確認
const deleteConfirmId = ref<string | null>(null)
const deleting = ref(false)
const deleteErr = ref('')

onMounted(async () => {
  await tenantsStore.fetchAll()
  syncRows()
})

function syncRows() {
  editRows.value = tenantsStore.tenants.map((t) => ({ id: t.id, name: t.name }))
}

async function saveTenant(row: { id: string; name: string }) {
  if (!row.name.trim()) {
    saveErr.value = '店舗名を入力してください'
    return
  }
  saving.value = row.id
  saveMsg.value = ''
  saveErr.value = ''
  try {
    await tenantsStore.updateTenant(row.id, row.name.trim())
    syncRows()
    saveMsg.value = '店舗名を更新しました'
  } catch (e) {
    saveErr.value = e instanceof Error ? e.message : '更新に失敗しました'
  } finally {
    saving.value = null
  }
}

async function createTenant() {
  if (!newTenantName.value.trim()) {
    createErr.value = '店舗名を入力してください'
    return
  }
  creating.value = true
  createMsg.value = ''
  createErr.value = ''
  try {
    const newTenantId = await tenantsStore.createTenant(newTenantName.value.trim())
    syncRows()
    newTenantName.value = ''
    setupPromptTenantId.value = newTenantId  // 初期設定ダイアログを表示
  } catch (e) {
    createErr.value = e instanceof Error ? e.message : '作成に失敗しました'
  } finally {
    creating.value = false
  }
}

function goToSetup(tenantId: string) {
  setupPromptTenantId.value = null
  router.push(`/admin/ops?tenant=${tenantId}`)
}

async function executeDelete() {
  if (!deleteConfirmId.value) return
  deleting.value = true
  deleteErr.value = ''
  try {
    await tenantsStore.deleteTenant(deleteConfirmId.value)
    syncRows()
    deleteConfirmId.value = null
  } catch (e) {
    deleteErr.value = e instanceof Error ? e.message : '削除に失敗しました'
  } finally {
    deleting.value = false
  }
}

function tenantName(id: string): string {
  return tenantsStore.tenants.find((t: Tenant) => t.id === id)?.name ?? ''
}
</script>

<template>
  <div class="space-y-5">

    <!-- ─── 店舗一覧 ─────────────────────────────────────────────── -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">店舗一覧</h2>

      <div v-if="tenantsStore.loading" class="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
        読み込み中...
      </div>
      <div v-else-if="editRows.length === 0" class="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
        店舗が登録されていません
      </div>
      <ul v-else class="divide-y divide-edge dark:divide-edge-dark">
        <li v-for="row in editRows" :key="row.id" class="px-4 py-3 space-y-2">
          <div class="flex items-center gap-2">
            <input
              v-model="row.name"
              type="text"
              placeholder="店舗名"
              class="flex-1 rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            />
            <button
              type="button"
              :disabled="saving === row.id"
              class="shrink-0 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white text-xs font-semibold rounded-xl transition-colors"
              @click="saveTenant(row)"
            >
              {{ saving === row.id ? '保存中' : '保存' }}
            </button>
            <button
              type="button"
              class="shrink-0 px-2.5 py-1.5 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
              @click="deleteConfirmId = row.id; deleteErr = ''"
            >
              削除
            </button>
          </div>
          <!-- 設定するボタン（platform_admin のみ） -->
          <div v-if="auth.role === 'platform_admin'" class="flex justify-end">
            <button
              type="button"
              class="text-xs text-brand-500 hover:underline"
              @click="router.push(`/admin/ops?tenant=${row.id}`)"
            >
              ⚙️ 運用管理を設定する →
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- ─── メッセージ ───────────────────────────────────────────── -->
    <p v-if="saveErr" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      {{ saveErr }}
    </p>
    <p v-if="saveMsg" class="text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
      {{ saveMsg }}
    </p>

    <!-- ─── 新規店舗作成（platform_admin のみ表示） ──────────────── -->
    <section
      v-if="auth.role === 'platform_admin'"
      class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
    >
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">➕ 新規店舗を追加する</h2>
      <div class="px-4 py-4 space-y-3">
        <div>
          <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">店舗名</label>
          <input
            v-model="newTenantName"
            type="text"
            placeholder="○○店"
            class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
          />
        </div>

        <p v-if="createErr" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {{ createErr }}
        </p>
        <p v-if="createMsg" class="text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
          {{ createMsg }}
        </p>

        <button
          type="button"
          :disabled="creating"
          class="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform"
          @click="createTenant"
        >
          {{ creating ? '作成中...' : '店舗を作成する' }}
        </button>
      </div>
    </section>

    <!-- ─── 店舗作成後の初期設定誘導ダイアログ ─────────────────────── -->
    <div
      v-if="setupPromptTenantId"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      @click.self="setupPromptTenantId = null"
    >
      <div class="bg-card dark:bg-card-dark rounded-2xl p-6 w-full max-w-xs shadow-xl space-y-4 text-center">
        <p class="text-3xl">🏪</p>
        <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-50">店舗を作成しました</h3>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          続けてこの店舗の初期設定（串マスタ・コース・発注スケジュール）を行いますか？
        </p>
        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 py-2.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-sm font-semibold rounded-xl transition-colors"
            @click="setupPromptTenantId = null"
          >
            後で
          </button>
          <button
            type="button"
            class="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
            @click="goToSetup(setupPromptTenantId!)"
          >
            設定する
          </button>
        </div>
      </div>
    </div>

    <!-- ─── 削除確認モーダル ──────────────────────────────────────── -->
    <div
      v-if="deleteConfirmId"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      @click.self="deleteConfirmId = null"
    >
      <div class="bg-card dark:bg-card-dark rounded-2xl p-6 w-full max-w-xs shadow-xl space-y-4">
        <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-50">店舗「{{ tenantName(deleteConfirmId) }}」を削除しますか？</h3>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          スタッフが所属している店舗は削除できません。
        </p>
        <p v-if="deleteErr" class="text-sm text-red-500 dark:text-red-400">{{ deleteErr }}</p>
        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 py-2.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-sm font-semibold rounded-xl transition-colors"
            @click="deleteConfirmId = null"
          >
            キャンセル
          </button>
          <button
            type="button"
            :disabled="deleting"
            class="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-400/60 text-white text-sm font-semibold rounded-xl transition-colors"
            @click="executeDelete"
          >
            {{ deleting ? '削除中...' : '削除する' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
