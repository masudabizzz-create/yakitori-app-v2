import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/types'

interface Permission {
  user_id: string
  tenant_id: string
}

/**
 * user_tenant_permissions ストア
 * platform_admin が manager の店舗アクセス権を管理するためのストア
 */
export const useTenantPermissionsStore = defineStore('tenantPermissions', () => {
  /** role='manager' のユーザー全員 */
  const managers = ref<AppUser[]>([])
  /** user_tenant_permissions テーブルの全レコード */
  const permissions = ref<Permission[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** テナントIDを受け取り、そのテナントに権限を持つ manager の user_id 配列を返す */
  const managerIdsForTenant = computed(
    () =>
      (tenantId: string): string[] =>
        permissions.value
          .filter((p) => p.tenant_id === tenantId)
          .map((p) => p.user_id),
  )

  /** 全マネージャーと全権限を一括取得する */
  async function fetchAll(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [mgrsRes, permsRes] = await Promise.all([
        supabase.from('users').select('*').eq('role', 'manager').order('created_at'),
        supabase.from('user_tenant_permissions').select('user_id, tenant_id'),
      ])
      if (mgrsRes.error) throw new Error(mgrsRes.error.message)
      if (permsRes.error) throw new Error(permsRes.error.message)
      managers.value = (mgrsRes.data ?? []) as AppUser[]
      permissions.value = (permsRes.data ?? []) as Permission[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : '取得に失敗しました'
    } finally {
      loading.value = false
    }
  }

  /** manager にテナントへのアクセス権を付与する */
  async function addPermission(userId: string, tenantId: string): Promise<void> {
    const { error: err } = await supabase
      .from('user_tenant_permissions')
      .insert({ user_id: userId, tenant_id: tenantId })
    if (err) throw new Error(err.message)
    // ローカルにも追加（再フェッチ不要）
    permissions.value = [...permissions.value, { user_id: userId, tenant_id: tenantId }]
  }

  /** manager からテナントへのアクセス権を削除する */
  async function removePermission(userId: string, tenantId: string): Promise<void> {
    const { error: err } = await supabase
      .from('user_tenant_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
    if (err) throw new Error(err.message)
    permissions.value = permissions.value.filter(
      (p) => !(p.user_id === userId && p.tenant_id === tenantId),
    )
  }

  /** 権限トグル（あれば削除、なければ追加） */
  async function togglePermission(userId: string, tenantId: string): Promise<void> {
    const has = permissions.value.some(
      (p) => p.user_id === userId && p.tenant_id === tenantId,
    )
    if (has) {
      await removePermission(userId, tenantId)
    } else {
      await addPermission(userId, tenantId)
    }
  }

  return {
    managers,
    permissions,
    loading,
    error,
    managerIdsForTenant,
    fetchAll,
    addPermission,
    removePermission,
    togglePermission,
  }
})
