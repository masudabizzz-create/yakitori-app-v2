import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { insertAuditLog } from '@/lib/audit'
import type { Settings } from '@/types'

/**
 * システム設定ストア（1テナント1レコード）
 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * 設定を取得する。
   * tenantId を渡すと明示的に絞り込む（platform_admin が別テナント操作時に使用）。
   */
  async function fetchSettings(tenantId?: string): Promise<void> {
    loading.value = true
    error.value = null
    const { data, error: err } = await (tenantId
      ? supabase.from('settings').select('*').eq('tenant_id', tenantId).single()
      : supabase.from('settings').select('*').single())
    if (err) {
      error.value = err.message
    } else {
      settings.value = data as Settings
    }
    loading.value = false
  }

  /** 設定を部分更新する */
  async function saveSettings(patch: Partial<Settings>): Promise<void> {
    if (!settings.value) throw new Error('設定が読み込まれていません')
    const before = { ...settings.value }
    const { error: err } = await supabase
      .from('settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', settings.value.id)
    if (err) throw new Error(err.message)
    await fetchSettings()
    // 監査ログ
    await insertAuditLog({
      tenantId: settings.value?.tenant_id ?? null,
      action: 'settings.update',
      targetType: 'settings',
      targetId: before.id,
      beforeValue: before,
      afterValue: settings.value,
    })
  }

  return { settings, loading, error, fetchSettings, saveSettings }
})
