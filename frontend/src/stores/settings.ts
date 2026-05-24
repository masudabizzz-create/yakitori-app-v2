import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Settings } from '@/types'

/**
 * システム設定ストア（1テナント1レコード）
 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** 自テナントの設定を取得する */
  async function fetchSettings(): Promise<void> {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('settings')
      .select('*')
      .single()
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
    const { error: err } = await supabase
      .from('settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', settings.value.id)
    if (err) throw new Error(err.message)
    await fetchSettings()
  }

  return { settings, loading, error, fetchSettings, saveSettings }
})
