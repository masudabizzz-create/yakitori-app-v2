<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import QRCode from 'qrcode'
import { useUsersStore } from '@/stores/users'
import { useTenantsStore } from '@/stores/tenants'
import { useAuthStore } from '@/stores/auth'
import { useTenantPermissionsStore } from '@/stores/tenantPermissions'
import { ROLE_RANK } from '@/lib/roleRank'
import type { AppUserDetail, UserRole, UserInvitation } from '@/types'

const usersStore = useUsersStore()
const tenantsStore = useTenantsStore()
const auth = useAuthStore()
const permStore = useTenantPermissionsStore()

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'platform_admin', label: 'プラットフォーム管理者' },
  { value: 'manager',        label: 'マネージャー' },
  { value: 'store_owner',    label: '店舗責任者' },
  { value: 'staff_both',     label: 'スタッフ兼務' },
  { value: 'staff_kitchen',  label: 'スタッフキッチン' },
  { value: 'staff_hall',     label: 'スタッフホール' },
]

/** 自分のランク */
const myRank = computed<number>(() => (auth.role ? ROLE_RANK[auth.role] : 0))

/**
 * 対象ユーザーを編集できるか。
 * 自分より下位ランクのスタッフのみ操作可能。
 */
function canEdit(u: AppUserDetail): boolean {
  return myRank.value > ROLE_RANK[u.role]
}

/**
 * 編集フォームで選択できるロール（自分より下位のみ）。
 * 自分と同格以上には昇格させられない。
 */
const assignableRoles = computed(() =>
  ROLES.filter((r) => ROLE_RANK[r.value] < myRank.value),
)

// ─── マウント ──────────────────────────────────────────────────

onMounted(async () => {
  // manager 以上の場合はパーミッション情報も取得（アクセス可能店舗表示用）
  if (auth.role && ROLE_RANK[auth.role] >= 4) {
    await permStore.fetchAll()
  }
})

// ─── 検索・フィルタ ───────────────────────────────────────────

const searchName = ref('')
const filterRole = ref<UserRole | ''>('')
const filterActive = ref<'all' | 'active' | 'inactive'>('all')

const filteredUsers = computed<AppUserDetail[]>(() => {
  const name = searchName.value.trim().toLowerCase()
  return usersStore.usersWithDetails.filter((u) => {
    if (name && !u.name.toLowerCase().includes(name)) return false
    if (filterRole.value && u.role !== filterRole.value) return false
    if (filterActive.value === 'active'   && !u.is_active) return false
    if (filterActive.value === 'inactive' &&  u.is_active) return false
    return true
  })
})

// ─── アコーディオン ───────────────────────────────────────────

const expandedIds = ref(new Set<string>())
const editingId   = ref<string | null>(null)
const editForm    = ref<{ name: string; role: UserRole }>({ name: '', role: 'staff_both' })

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
    if (editingId.value === id) editingId.value = null
  } else {
    expandedIds.value = new Set(expandedIds.value).add(id)
  }
}

function startEdit(u: AppUserDetail) {
  editForm.value = { name: u.name, role: u.role }
  editingId.value = u.id
}

function cancelEdit() {
  editingId.value = null
}

// ─── 保存 ─────────────────────────────────────────────────────

const savingId = ref<string | null>(null)
const saveErr  = ref('')
const saveMsg  = ref('')

async function saveEdit(u: AppUserDetail) {
  savingId.value = u.id
  saveErr.value  = ''
  saveMsg.value  = ''
  try {
    await usersStore.saveUser({ id: u.id, name: editForm.value.name, role: editForm.value.role, is_active: u.is_active })
    editingId.value = null
    saveMsg.value = '保存しました'
    setTimeout(() => { saveMsg.value = '' }, 2000)
  } catch (e) {
    saveErr.value = e instanceof Error ? e.message : '保存に失敗しました'
  } finally {
    savingId.value = null
  }
}

// ─── 無効化・有効化 ───────────────────────────────────────────

const togglingId = ref<string | null>(null)
const toggleErr  = ref('')

async function handleToggleActive(u: AppUserDetail) {
  togglingId.value = u.id
  toggleErr.value  = ''
  try {
    await usersStore.toggleActive(u.id, !u.is_active)
  } catch (e) {
    toggleErr.value = e instanceof Error ? e.message : '変更に失敗しました'
  } finally {
    togglingId.value = null
  }
}

// ─── 削除 ─────────────────────────────────────────────────────

const deleteConfirmId = ref<string | null>(null)
const deleting        = ref(false)
const deleteErr       = ref('')

async function executeDelete() {
  if (!deleteConfirmId.value) return
  deleting.value  = true
  deleteErr.value = ''
  try {
    const id = deleteConfirmId.value
    await usersStore.deleteUser(id)
    expandedIds.value.delete(id)
    deleteConfirmId.value = null
  } catch (e) {
    deleteErr.value = e instanceof Error ? e.message : '削除に失敗しました'
  } finally {
    deleting.value = false
  }
}

// ─── QRコード発行 ─────────────────────────────────────────────

const qrRole       = ref<UserRole>('staff_both')
const generating   = ref(false)
const generateErr  = ref('')
const qrDataUrl    = ref('')
const qrExpiresAt  = ref('')
const qrToken      = ref('')

function buildRegisterUrl(token: string): string {
  const base = window.location.origin + window.location.pathname
  return `${base}#/register?token=${token}`
}

async function generateQr() {
  generating.value = true
  generateErr.value = ''
  qrDataUrl.value   = ''
  try {
    const result = await usersStore.createQrInvitation(qrRole.value)
    qrToken.value     = result.token
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

// ─── 発行済みQRコード ─────────────────────────────────────────

const pendingQr = computed<UserInvitation[]>(() =>
  usersStore.invitations.filter((inv) => inv.token !== null),
)

const revoking  = ref<string | null>(null)
const revokeErr = ref('')

async function revokeQr(id: string) {
  revoking.value  = id
  revokeErr.value = ''
  try {
    await usersStore.revokeQrInvitation(id)
    if (qrToken.value) {
      const still = usersStore.invitations.find((i) => i.token === qrToken.value)
      if (!still) { qrDataUrl.value = ''; qrToken.value = '' }
    }
  } catch (e) {
    revokeErr.value = e instanceof Error ? e.message : '取消に失敗しました'
  } finally {
    revoking.value = null
  }
}

// ─── ユーティリティ ───────────────────────────────────────────

function roleLabel(role: UserRole): string {
  return ROLES.find((r) => r.value === role)?.label ?? role
}

const ROLE_BADGE: Record<UserRole, string> = {
  platform_admin: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  manager:        'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  store_owner:    'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  staff_both:     'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  staff_kitchen:  'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  staff_hall:     'bg-amber-500/15 text-amber-600 dark:text-amber-400',
}

function tenantName(tenantId: string): string {
  return tenantsStore.tenants.find((t) => t.id === tenantId)?.name ?? tenantId.slice(0, 8)
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric',
  })
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <div class="space-y-5">

    <!-- ─── QRコード発行 ──────────────────────────────────────── -->
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

    <!-- ─── 発行済みQRコード ──────────────────────────────────── -->
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

    <!-- ─── スタッフ一覧 ──────────────────────────────────────── -->
    <section class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
      <h2 class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        スタッフ一覧
        <span class="ml-1.5 text-xs font-normal text-neutral-400 dark:text-neutral-500">
          {{ filteredUsers.length }} / {{ usersStore.usersWithDetails.length }} 名
        </span>
      </h2>

      <!-- 検索・フィルタ -->
      <div class="px-4 py-3 border-b border-edge dark:border-edge-dark space-y-2">
        <input
          v-model="searchName"
          type="search"
          placeholder="名前で検索..."
          class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
        />
        <div class="flex gap-2">
          <select
            v-model="filterRole"
            class="flex-1 rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
          >
            <option value="">全ロール</option>
            <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
          <select
            v-model="filterActive"
            class="flex-1 rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
          >
            <option value="all">全員</option>
            <option value="active">有効のみ</option>
            <option value="inactive">無効のみ</option>
          </select>
        </div>
      </div>

      <!-- グローバルメッセージ -->
      <p v-if="saveMsg" class="mx-4 my-2 text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
        {{ saveMsg }}
      </p>
      <p v-if="toggleErr" class="mx-4 my-2 text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
        {{ toggleErr }}
      </p>

      <div v-if="usersStore.usersWithDetails.length === 0" class="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
        スタッフが登録されていません
      </div>
      <div v-else-if="filteredUsers.length === 0" class="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
        条件に一致するスタッフがいません
      </div>

      <!-- アコーディオン一覧 -->
      <ul v-else class="divide-y divide-edge dark:divide-edge-dark">
        <li v-for="u in filteredUsers" :key="u.id">

          <!-- ── 折りたたみ行（常時表示） ── -->
          <button
            type="button"
            class="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
            @click="toggleExpand(u.id)"
          >
            <!-- 名前 -->
            <span class="flex-1 text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
              {{ u.name }}
            </span>
            <!-- ロールバッジ -->
            <span
              class="shrink-0 text-xs font-medium px-2 py-0.5 rounded-lg"
              :class="ROLE_BADGE[u.role]"
            >
              {{ roleLabel(u.role) }}
            </span>
            <!-- 有効/無効バッジ -->
            <span
              class="shrink-0 text-xs font-medium px-2 py-0.5 rounded-lg"
              :class="u.is_active
                ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                : 'bg-red-500/15 text-red-500 dark:text-red-400'"
            >
              {{ u.is_active ? '有効' : '無効' }}
            </span>
            <!-- 開閉インジケーター -->
            <span class="shrink-0 text-neutral-400 dark:text-neutral-500 text-sm transition-transform duration-200"
              :style="{ transform: expandedIds.has(u.id) ? 'rotate(180deg)' : 'rotate(0deg)' }"
            >▾</span>
          </button>

          <!-- ── 展開エリア ── -->
          <div v-if="expandedIds.has(u.id)" class="px-4 pb-4 space-y-4 bg-neutral-50/60 dark:bg-white/[0.02]">

            <!-- 詳細情報グリッド -->
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm pt-3">
              <dt class="text-neutral-400 dark:text-neutral-500">所属店舗</dt>
              <dd class="text-neutral-800 dark:text-neutral-100 font-medium">{{ tenantName(u.tenant_id) }}</dd>

              <!-- manager 以上: アクセス可能な店舗 -->
              <template v-if="ROLE_RANK[u.role] >= 4 && permStore.tenantIdsForUser(u.id).length > 0">
                <dt class="text-neutral-400 dark:text-neutral-500">アクセス店舗</dt>
                <dd class="flex flex-wrap gap-1">
                  <span
                    v-for="tid in permStore.tenantIdsForUser(u.id)"
                    :key="tid"
                    class="text-xs px-2 py-0.5 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20"
                  >
                    {{ tenantName(tid) }}
                  </span>
                </dd>
              </template>

              <dt class="text-neutral-400 dark:text-neutral-500">メール</dt>
              <dd class="text-neutral-800 dark:text-neutral-100">{{ u.email ?? '—' }}</dd>

              <dt class="text-neutral-400 dark:text-neutral-500">登録日</dt>
              <dd class="text-neutral-800 dark:text-neutral-100">{{ fmtDate(u.created_at) }}</dd>

              <dt class="text-neutral-400 dark:text-neutral-500">最終ログイン</dt>
              <dd class="text-neutral-800 dark:text-neutral-100">{{ fmtDateTime(u.last_sign_in_at) }}</dd>
            </dl>

            <!-- 編集フォーム（編集ボタン押下時） -->
            <div v-if="editingId === u.id" class="space-y-2 rounded-xl border border-edge dark:border-edge-dark p-3">
              <div>
                <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">名前</label>
                <input
                  v-model="editForm.name"
                  type="text"
                  class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">ロール</label>
                <select
                  v-model="editForm.role"
                  class="w-full rounded-xl bg-white dark:bg-[#2A2A2A] border-edge dark:border-[#3A3A3A] text-neutral-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 text-sm"
                >
                  <!-- 自分より下位のロールのみ選択可 -->
                  <option v-for="r in assignableRoles" :key="r.value" :value="r.value">{{ r.label }}</option>
                </select>
              </div>
              <p v-if="saveErr" class="text-xs text-red-500 dark:text-red-400">{{ saveErr }}</p>
              <div class="flex gap-2">
                <button
                  type="button"
                  :disabled="savingId === u.id"
                  class="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400/60 text-white text-sm font-semibold rounded-xl transition-colors"
                  @click="saveEdit(u)"
                >
                  {{ savingId === u.id ? '保存中...' : '保存' }}
                </button>
                <button
                  type="button"
                  class="px-4 py-2 text-sm text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                  @click="cancelEdit"
                >
                  キャンセル
                </button>
              </div>
            </div>

            <!-- アクションボタン群（自分より上位ランクには表示しない） -->
            <div v-if="canEdit(u)" class="space-y-2">
              <!-- 編集ボタン（フォーム非表示時のみ） -->
              <button
                v-if="editingId !== u.id"
                type="button"
                class="w-full py-2.5 rounded-xl border border-edge dark:border-edge-dark text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                @click="startEdit(u)"
              >
                ✏️ 編集
              </button>

              <!-- 無効化 / 有効化ボタン（アンバー色） -->
              <button
                type="button"
                :disabled="togglingId === u.id"
                class="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                :class="u.is_active
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 border border-amber-500/30'
                  : 'bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25 border border-green-500/30'"
                @click="handleToggleActive(u)"
              >
                <template v-if="togglingId === u.id">処理中...</template>
                <template v-else-if="u.is_active">⚠️ 無効化する（いつでも戻せます）</template>
                <template v-else>✅ 有効化する</template>
              </button>

              <!-- 削除（テキストリンク形式・赤・小さく） -->
              <div class="text-center pt-1">
                <button
                  type="button"
                  class="text-xs text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-300 hover:underline transition-colors"
                  @click="deleteConfirmId = u.id; deleteErr = ''"
                >
                  このスタッフを完全に削除する
                </button>
              </div>
            </div>

            <!-- 権限不足メッセージ（同格以上は編集不可） -->
            <p v-else class="text-xs text-neutral-400 dark:text-neutral-500 text-center py-1">
              ※ 自分と同格以上のため編集できません
            </p>
          </div>
        </li>
      </ul>
    </section>

    <!-- ─── 削除確認モーダル ──────────────────────────────────── -->
    <div
      v-if="deleteConfirmId"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      @click.self="deleteConfirmId = null"
    >
      <div class="bg-card dark:bg-card-dark rounded-2xl p-6 w-full max-w-xs shadow-xl space-y-4">
        <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-50">本当に削除しますか？</h3>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          この操作は取り消せません。Auth アカウントと全データが完全に削除されます。
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
