<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUsersStore } from '@/stores/users'
import type { AppUser, UserRole } from '@/types'

const usersStore = useUsersStore()

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'super_admin', label: 'スーパー管理者' },
  { value: 'tenant_admin', label: 'テナント管理者' },
  { value: 'admin', label: '管理者' },
  { value: 'manager', label: 'マネージャー' },
  { value: 'user', label: 'スタッフ' },
  { value: 'kitchen', label: 'キッチン' },
  { value: 'hall', label: 'ホール' },
]

// ─── スタッフ一覧・編集 ───────────────────────────────────────────────
const rows = ref<AppUser[]>([])
const saving = ref(false)
const saveMsg = ref('')
const saveErr = ref('')

function syncFromStore() {
  rows.value = JSON.parse(JSON.stringify(usersStore.users)) as AppUser[]
}

onMounted(async () => {
  await Promise.all([usersStore.fetchAll(), usersStore.fetchInvitations()])
  syncFromStore()
})

async function save() {
  saving.value = true
  saveMsg.value = ''
  saveErr.value = ''
  try {
    await usersStore.saveUsers(rows.value)
    syncFromStore()
    saveMsg.value = 'スタッフ情報を保存しました'
  } catch (e) {
    saveErr.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    saving.value = false
  }
}

// ─── スタッフ削除 ────────────────────────────────────────────────────
const deleteConfirmId = ref<string | null>(null)
const deleting = ref(false)
const deleteErr = ref('')

async function confirmDelete(userId: string) {
  deleteConfirmId.value = userId
  deleteErr.value = ''
}

async function executeDelete() {
  if (!deleteConfirmId.value) return
  deleting.value = true
  deleteErr.value = ''
  try {
    await usersStore.deleteUser(deleteConfirmId.value)
    syncFromStore()
    deleteConfirmId.value = null
  } catch (e) {
    deleteErr.value = e instanceof Error ? e.message : '削除に失敗しました'
  } finally {
    deleting.value = false
  }
}

// ─── 招待フォーム ────────────────────────────────────────────────────
const showInviteForm = ref(false)
const inviteEmail = ref('')
const inviteName = ref('')
const inviteRole = ref<UserRole>('user')
const inviting = ref(false)
const inviteMsg = ref('')
const inviteErr = ref('')

async function submitInvitation() {
  if (!inviteEmail.value || !inviteName.value) {
    inviteErr.value = 'メールアドレスと名前は必須です'
    return
  }
  inviting.value = true
  inviteMsg.value = ''
  inviteErr.value = ''
  try {
    await usersStore.createInvitation(inviteEmail.value, inviteName.value, inviteRole.value)
    inviteMsg.value = '招待を送信しました。管理者の承認をお待ちください。'
    inviteEmail.value = ''
    inviteName.value = ''
    inviteRole.value = 'user'
    showInviteForm.value = false
  } catch (e) {
    inviteErr.value = e instanceof Error ? e.message : '招待に失敗しました'
  } finally {
    inviting.value = false
  }
}

// ─── 招待承認・拒否 ──────────────────────────────────────────────────
const approvalLoading = ref<string | null>(null)
const approvalErr = ref('')
const approvalMsg = ref('')

async function approve(id: string) {
  approvalLoading.value = id
  approvalErr.value = ''
  approvalMsg.value = ''
  try {
    await usersStore.approveInvitation(id)
    syncFromStore()
    approvalMsg.value = '招待を承認し、スタッフを追加しました'
  } catch (e) {
    approvalErr.value = e instanceof Error ? e.message : '承認に失敗しました'
  } finally {
    approvalLoading.value = null
  }
}

async function reject(id: string) {
  approvalLoading.value = id
  approvalErr.value = ''
  approvalMsg.value = ''
  try {
    await usersStore.rejectInvitation(id)
    approvalMsg.value = '招待を拒否しました'
  } catch (e) {
    approvalErr.value = e instanceof Error ? e.message : '拒否に失敗しました'
  } finally {
    approvalLoading.value = null
  }
}

function roleLabel(role: UserRole): string {
  return ROLES.find((r) => r.value === role)?.label ?? role
}
</script>

<template>
  <div class="space-y-5">

    <!-- ─── 保留中の招待 ─────────────────────────────────────────── -->
    <section
      v-if="usersStore.invitations.length > 0"
      class="bg-card dark:bg-card-dark border border-amber-400/40 dark:border-amber-500/30 rounded-2xl overflow-hidden"
    >
      <h2 class="px-4 py-2.5 bg-amber-50 dark:bg-amber-500/10 text-sm font-semibold text-amber-700 dark:text-amber-400">
        📋 承認待ちの招待 ({{ usersStore.invitations.length }}件)
      </h2>

      <p v-if="approvalErr" class="mx-4 mt-3 text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
        {{ approvalErr }}
      </p>
      <p v-if="approvalMsg" class="mx-4 mt-3 text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
        {{ approvalMsg }}
      </p>

      <ul class="divide-y divide-edge dark:divide-edge-dark">
        <li v-for="inv in usersStore.invitations" :key="inv.id" class="px-4 py-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">{{ inv.name }}</p>
              <p class="text-xs text-neutral-500 dark:text-neutral-400 truncate">{{ inv.email }}</p>
              <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">役割: {{ roleLabel(inv.role) }}</p>
            </div>
            <div class="flex gap-2 shrink-0 mt-0.5">
              <button
                type="button"
                :disabled="approvalLoading === inv.id"
                class="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-green-400/60 text-white text-xs font-semibold rounded-xl transition-colors"
                @click="approve(inv.id)"
              >
                {{ approvalLoading === inv.id ? '処理中...' : '承認' }}
              </button>
              <button
                type="button"
                :disabled="approvalLoading === inv.id"
                class="px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 disabled:opacity-50 text-neutral-700 dark:text-neutral-200 text-xs font-semibold rounded-xl transition-colors"
                @click="reject(inv.id)"
              >
                拒否
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- ─── スタッフ一覧・編集 ──────────────────────────────────── -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">スタッフ一覧</h2>

      <div v-if="rows.length === 0" class="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
        スタッフが登録されていません
      </div>
      <ul v-else class="divide-y divide-edge dark:divide-edge-dark">
        <li v-for="u in rows" :key="u.id" class="px-4 py-3 space-y-2">
          <div class="flex items-center gap-2">
            <input
              v-model="u.name"
              type="text"
              placeholder="スタッフ名"
              class="flex-1 rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
            />
            <button
              type="button"
              class="shrink-0 px-2.5 py-1.5 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
              @click="confirmDelete(u.id)"
            >
              削除
            </button>
          </div>
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

    <!-- ─── 削除確認モーダル ──────────────────────────────────────── -->
    <div
      v-if="deleteConfirmId"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      @click.self="deleteConfirmId = null"
    >
      <div class="bg-card dark:bg-card-dark rounded-2xl p-6 w-full max-w-xs shadow-xl space-y-4">
        <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-50">スタッフを削除しますか？</h3>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          この操作は取り消せません。Auth ユーザーと全データが削除されます。
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

    <!-- ─── メッセージ ───────────────────────────────────────────── -->
    <p v-if="saveErr" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      {{ saveErr }}
    </p>
    <p v-if="saveMsg" class="text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
      {{ saveMsg }}
    </p>

    <!-- ─── 保存ボタン ───────────────────────────────────────────── -->
    <button
      type="button"
      :disabled="saving"
      class="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white font-semibold rounded-2xl active:scale-95 transition-transform"
      @click="save"
    >
      {{ saving ? '保存中...' : '💾 スタッフ情報を保存する' }}
    </button>

    <!-- ─── スタッフ招待フォーム ─────────────────────────────────── -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <button
        type="button"
        class="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold text-neutral-700 dark:text-neutral-200 bg-black/[0.03] dark:bg-white/[0.04]"
        @click="showInviteForm = !showInviteForm"
      >
        <span>➕ 新規スタッフを招待する</span>
        <span class="text-neutral-400">{{ showInviteForm ? '▲' : '▼' }}</span>
      </button>

      <div v-if="showInviteForm" class="px-4 py-4 space-y-3">
        <div>
          <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">メールアドレス</label>
          <input
            v-model="inviteEmail"
            type="email"
            placeholder="staff@example.com"
            class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">名前</label>
          <input
            v-model="inviteName"
            type="text"
            placeholder="山田 太郎"
            class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">役割</label>
          <select
            v-model="inviteRole"
            class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
          >
            <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </div>

        <p v-if="inviteErr" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {{ inviteErr }}
        </p>
        <p v-if="inviteMsg" class="text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
          {{ inviteMsg }}
        </p>

        <button
          type="button"
          :disabled="inviting"
          class="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform"
          @click="submitInvitation"
        >
          {{ inviting ? '送信中...' : '招待を送信する' }}
        </button>
        <p class="text-xs text-neutral-400 dark:text-neutral-500">
          招待は管理者の承認後にアカウントが作成されます。承認時に LINE 通知が送信されます。
        </p>
      </div>
    </section>

  </div>
</template>
