import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { extractFnError } from '@/lib/fn-error'
import type { AppUser, AppUserDetail, UserInvitation, UserRole } from '@/types'

/**
 * スタッフ（users テーブル）ストア
 *
 * スタッフの新規追加・削除は Supabase Auth ユーザーの操作（service_role 必要）を伴うため、
 * manage-users Edge Function 経由で行う。
 * 当ストアはスタッフ一覧・招待一覧の取得と、既存スタッフの編集・Edge Function 呼び出しを担う。
 */
export const useUsersStore = defineStore('users', () => {
  const users = ref<AppUser[]>([])
  /** get_staff_details() RPC の結果（email / last_sign_in_at 付き） */
  const usersWithDetails = ref<AppUserDetail[]>([])
  const invitations = ref<UserInvitation[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * email / last_sign_in_at を含むスタッフ詳細一覧を取得する（get_staff_details RPC 経由）。
   * tenantId を指定するとクライアント側でフィルタリングする。
   */
  async function fetchAllWithDetails(tenantId?: string): Promise<void> {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase.rpc('get_staff_details')
    if (err) {
      error.value = err.message
    } else {
      const all = ((data ?? []) as unknown as AppUserDetail[]).map((row) => ({
        ...row,
        role: row.role as UserRole,
        email: (row.email as string | null) ?? null,
        last_sign_in_at: (row.last_sign_in_at as string | null) ?? null,
      })) as AppUserDetail[]
      usersWithDetails.value = tenantId
        ? all.filter((u) => u.tenant_id === tenantId)
        : all
    }
    loading.value = false
  }

  /** スタッフ一覧を取得する（tenantId 指定時はそのテナントのみ、省略時は RLS フィルタ） */
  async function fetchAll(tenantId?: string): Promise<void> {
    loading.value = true
    error.value = null
    const q = supabase.from('users').select('*').order('created_at')
    const { data, error: err } = await (tenantId ? q.eq('tenant_id', tenantId) : q)
    if (err) {
      error.value = err.message
    } else {
      users.value = (data ?? []) as AppUser[]
    }
    loading.value = false
  }

  /** 保留中の招待一覧を取得する */
  async function fetchInvitations(): Promise<void> {
    const { data, error: err } = await supabase
      .from('user_invitations')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (!err) {
      invitations.value = (data ?? []) as UserInvitation[]
    }
  }

  /** スタッフ 1 名分の 名前/役割/有効フラグ を更新し、usersWithDetails をオプティミスティック更新する */
  async function saveUser(
    u: Pick<AppUser, 'id' | 'name' | 'role' | 'is_active'>,
  ): Promise<void> {
    const { error: err } = await supabase
      .from('users')
      .update({ name: u.name, role: u.role, is_active: u.is_active })
      .eq('id', u.id)
    if (err) throw new Error(err.message)
    const idx = usersWithDetails.value.findIndex((x) => x.id === u.id)
    if (idx >= 0) {
      usersWithDetails.value[idx] = {
        ...usersWithDetails.value[idx],
        name: u.name,
        role: u.role,
        is_active: u.is_active,
      }
    }
  }

  /** is_active フラグのみを更新する（無効化 / 有効化） */
  async function toggleActive(userId: string, isActive: boolean): Promise<void> {
    const { error: err } = await supabase
      .from('users')
      .update({ is_active: isActive })
      .eq('id', userId)
    if (err) throw new Error(err.message)
    const idx = usersWithDetails.value.findIndex((x) => x.id === userId)
    if (idx >= 0) {
      usersWithDetails.value[idx] = {
        ...usersWithDetails.value[idx],
        is_active: isActive,
      }
    }
  }

  /** スタッフの 名前/役割/有効フラグ を一括更新する */
  async function saveUsers(rows: AppUser[]): Promise<void> {
    for (const u of rows) {
      const { error: err } = await supabase
        .from('users')
        .update({ name: u.name, role: u.role, is_active: u.is_active })
        .eq('id', u.id)
      if (err) throw new Error(err.message)
    }
    await fetchAll()
  }

  /** スタッフ招待を作成する（manage-users Edge Function 経由） */
  async function createInvitation(
    email: string,
    name: string,
    role: UserRole,
  ): Promise<void> {
    const { data, error: err } = await supabase.functions.invoke('manage-users', {
      body: { action: 'create_invitation', email, name, role },
    })
    if (err) {
      throw new Error(await extractFnError(err, data))
    }
    await fetchInvitations()
  }

  /** 招待を承認する（Auth ユーザー作成 + LINE通知） */
  async function approveInvitation(invitationId: string): Promise<void> {
    const { data, error: err } = await supabase.functions.invoke('manage-users', {
      body: { action: 'approve_invitation', invitation_id: invitationId },
    })
    if (err) {
      throw new Error(await extractFnError(err, data))
    }
    await Promise.all([fetchAll(), fetchInvitations()])
  }

  /** 招待を拒否する */
  async function rejectInvitation(invitationId: string, note = ''): Promise<void> {
    const { data, error: err } = await supabase.functions.invoke('manage-users', {
      body: { action: 'reject_invitation', invitation_id: invitationId, note },
    })
    if (err) {
      throw new Error(await extractFnError(err, data))
    }
    await fetchInvitations()
  }

  /** スタッフを削除する（Auth ユーザー削除 → users テーブルも CASCADE 削除） */
  async function deleteUser(userId: string): Promise<void> {
    const { data, error: err } = await supabase.functions.invoke('manage-users', {
      body: { action: 'delete_user', user_id: userId },
    })
    if (err) {
      throw new Error(await extractFnError(err, data))
    }
    await fetchAll()
    usersWithDetails.value = usersWithDetails.value.filter((u) => u.id !== userId)
  }

  /** QRコード招待を発行する（manage-users Edge Function 経由） */
  async function createQrInvitation(
    role: UserRole,
    tenantId?: string,
  ): Promise<{ token: string; expires_at: string }> {
    const { data, error: err } = await supabase.functions.invoke('manage-users', {
      body: { action: 'create_qr_invitation', role, tenant_id: tenantId },
    })
    if (err) {
      throw new Error(await extractFnError(err, data))
    }
    return data as { token: string; expires_at: string }
  }

  /** QRトークンを無効化する */
  async function revokeQrInvitation(invitationId: string): Promise<void> {
    const { data, error: err } = await supabase.functions.invoke('manage-users', {
      body: { action: 'reject_invitation', invitation_id: invitationId },
    })
    if (err) {
      throw new Error(await extractFnError(err, data))
    }
    await fetchInvitations()
  }

  return {
    users,
    usersWithDetails,
    invitations,
    loading,
    error,
    fetchAll,
    fetchAllWithDetails,
    fetchInvitations,
    saveUser,
    saveUsers,
    toggleActive,
    createInvitation,
    approveInvitation,
    rejectInvitation,
    deleteUser,
    createQrInvitation,
    revokeQrInvitation,
  }
})
