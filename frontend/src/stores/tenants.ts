import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { extractFnError } from '@/lib/fn-error'
import type { Tenant } from '@/types'

/**
 * 店舗（tenants テーブル）ストア
 *
 * 店舗の作成・更新・削除は manage-users Edge Function 経由で行う（service_role 必要）。
 * 当ストアは店舗一覧の取得と Edge Function 呼び出しを担う。
 */
export const useTenantsStore = defineStore('tenants', () => {
  const tenants = ref<Tenant[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** 全店舗一覧を取得する */
  async function fetchAll(): Promise<void> {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at')
    if (err) {
      error.value = err.message
    } else {
      tenants.value = (data ?? []) as Tenant[]
    }
    loading.value = false
  }

  /** 新店舗を作成する（manage-users Edge Function 経由）。作成した店舗の ID を返す。 */
  async function createTenant(name: string, primaryColor?: string): Promise<string> {
    const body: Record<string, unknown> = { action: 'create_tenant', name }
    if (primaryColor) body.primary_color = primaryColor
    const { data, error: err } = await supabase.functions.invoke('manage-users', { body })
    if (err) {
      throw new Error(await extractFnError(err, data))
    }
    const tenantId = (data as { tenant: { id: string } }).tenant.id
    await fetchAll()
    return tenantId
  }

  /** 店舗名・テーマカラー・緯度経度を更新する（manage-users Edge Function 経由） */
  async function updateTenant(
    tenantId: string,
    name: string,
    primaryColor?: string,
    coords?: { latitude: number | null; longitude: number | null },
  ): Promise<void> {
    const body: Record<string, unknown> = { action: 'update_tenant', tenant_id: tenantId, name }
    if (primaryColor !== undefined) body.primary_color = primaryColor
    if (coords !== undefined) {
      body.latitude = coords.latitude
      body.longitude = coords.longitude
    }
    const { data, error: err } = await supabase.functions.invoke('manage-users', { body })
    if (err) {
      throw new Error(await extractFnError(err, data))
    }
    await fetchAll()
  }

  /** 店舗を削除する（スタッフが存在する場合は失敗） */
  async function deleteTenant(tenantId: string): Promise<void> {
    const { data, error: err } = await supabase.functions.invoke('manage-users', {
      body: { action: 'delete_tenant', tenant_id: tenantId },
    })
    if (err) {
      throw new Error(await extractFnError(err, data))
    }
    await fetchAll()
  }

  return {
    tenants,
    loading,
    error,
    fetchAll,
    createTenant,
    updateTenant,
    deleteTenant,
  }
})
