<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import QRCode from 'qrcode'
import { useUsersStore } from '@/stores/users'
import type { AppUser, UserRole, UserInvitation } from '@/types'

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

// ─── QRコード発行 ────────────────────────────────────────────────────
const qrRole = ref<UserRole>('user')
const generating = ref(false)
const generateErr = ref('')
const qrDataUrl = ref('')
const qrExpiresAt = ref('')
const qrToken = ref('')

function buildRegisterUrl(token: string): string {
  const base = window.location.origin + window.location.pathname
  return `${base}#/register?token=${token}`
}

async function generateQr() {
  generating.value = true
  generateErr.value = ''
  qrDataUrl.value = ''
  try {
    const result = await usersStore.createQrInvitation(qrRole.value)
    qrToken.value = result.token
    qrExpiresAt.value = result.expires_at
    const url = buildRegisterUrl(result.token)
    qrDataUrl.value = await QRCode.toDataURL(url, { width: 256, margin: 2 })
    await usersStore.fetchInvitations()
  } catch (e) {
    generateErr.value = e instanceof Error ? e.message : 'QR発行に失敗しました'
  } finally {
    generating.value = false
  }
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── 発行済みQRコード一覧 ────────────────────────────────────────────
const pendingQr = computed<UserInvitation[]>(() =>
  usersStore.invitations.filter((inv) => inv.token !== null),
)

const revoking = ref<string | null>(null)
const revokeErr = ref('')

async function revokeQr(id: string) {
  revoking.value = id
  revokeErr.value = ''
  try {
    await usersStore.revokeQrInvitation(id)
    if (qrToken.value) {
      const still = usersStore.invitations.find((i) => i.token === qrToken.value)
      if (!still) {
        qrDataUrl.value = ''
        qrToken.value = ''
      }
    }
  } catch (e) {
    revokeErr.value = e instanceof Error ? e.message : '取消に失敗しました'
  } finally {
    revoking.value = null
  }
}

function roleLabel(role: UserRole): string {
  return ROLES.find((r) => r.value === role)?.label ?? role
}
</script>

<template>
  <div class="space-y-5">

    <!-- ─── QRコード発行 ─────────────────────────────────────────── -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        📲 スタッフ登録用QRコードを発行する
      </h2>
      <div class="px-4 py-4 space-y-3">
        <div>
          <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">役割</label>
          <select
            v-model="qrRole"
            class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
          >
            <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </div>

        <p v-if="generateErr" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {{ generateErr }}
        </p>

        <button
          type="button"
          :disabled="generating"
          class="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform"
          @click="generateQr"
        >
          {{ generating ? '発行中...' : '🔑 QRコードを発行する' }}
        </button>

        <!-- QR表示 -->
        <div v-if="qrDataUrl" class="flex flex-col items-center gap-3 pt-2">
          <img :src="qrDataUrl" alt="登録用QRコード" class="w-48 h-48 rounded-xl border border-edge dark:border-edge-dark" />
          <div class="text-center space-y-1">
            <p class="text-xs text-neutral-500 dark:text-neutral-400">
              役割: <span class="font-semibold text-neutral-700 dark:text-neutral-200">{{ roleLabel(qrRole) }}</span>
            </p>
            <p class="text-xs text-neutral-500 dark:text-neutral-400">
              有効期限: <span class="font-semibold">{{ formatExpiry(qrExpiresAt) }}</span> まで
            </p>
            <p class="text-xs text-neutral-400 dark:text-neutral-500">このQRコードは24時間有効・使い捨てです</p>
          </div>
          <button
            type="button"
            class="text-xs text-red-500 dark:text-red-400 hover:underline"
            @click="revokeQr(usersStore.invitations.find(i => i.token === qrToken)?.id ?? '')"
          >
            このQRを今すぐ無効化する
          </button>
        </div>
      </div>
    </section>

    <!-- ─── 発行済みQRコード一覧 ─────────────────────────────────── -->
    <section
      v-if="pendingQr.length > 0"
      class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden"
    >
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        発行済みQRコード（{{ pendingQr.length }}件）
      </h2>
      <p v-if="revokeErr" class="mx-4 mt-2 text-sm text-red-500 dark:text-red-400">{{ revokeErr }}</p>
      <ul class="divide-y divide-edge dark:divide-edge-dark">
        <li v-for="inv in pendingQr" :key="inv.id" class="px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-neutral-800 dark:text-neutral-100">{{ roleLabel(inv.role) }}</p>
            <p class="text-xs text-neutral-400 dark:text-neutral-500">
              期限: {{ inv.expires_at ? formatExpiry(inv.expires_at) : '—' }}
            </p>
          </div>
          <button
            type="button"
            :disabled="revoking === inv.id"
            class="px-3 py-1.5 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
            @click="revokeQr(inv.id)"
          >
            {{ revoking === inv.id ? '処理中...' : '取消' }}
          </button>
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
              @click="deleteConfirmId = u.id; deleteErr = ''"
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
            class="flex-1 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-semibold rounded-xl"
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

  </div>
</template>
