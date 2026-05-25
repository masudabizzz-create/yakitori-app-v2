import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { PrepLog } from '@/types'

export interface PrepLogInput {
  tenantId: string
  logDate: string
  skewerId: string | null
  skewerName: string
  prepAmount: number
  stickCount: number
  userId: string | null
  durationSeconds?: number
  type?: 'normal' | 'extra'
  note?: string
}

export const usePrepLogsStore = defineStore('prepLogs', () => {
  const todayLogs = ref<PrepLog[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** 指定日の prep_logs を取得する */
  async function fetchByDate(tenantId: string, logDate: string): Promise<void> {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('prep_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('log_date', logDate)
      .order('completed_at')
    if (err) error.value = err.message
    else todayLogs.value = (data ?? []) as PrepLog[]
    loading.value = false
  }

  /** 仕込み完了を記録する */
  async function recordCompletion(input: PrepLogInput): Promise<void> {
    const { error: err } = await supabase.from('prep_logs').insert({
      tenant_id: input.tenantId,
      log_date: input.logDate,
      skewer_id: input.skewerId,
      skewer_name: input.skewerName,
      prep_amount: input.prepAmount,
      stick_count: input.stickCount,
      completed_at: new Date().toISOString(),
      user_id: input.userId,
      duration_seconds: input.durationSeconds ?? null,
      type: input.type ?? 'normal',
      note: input.note ?? null,
    })
    if (err) throw new Error(err.message)
    await fetchByDate(input.tenantId, input.logDate)
  }

  /** 今日の通常完了ログの skewerId セット */
  const completedSkewerIds = computed(
    () =>
      new Set(
        todayLogs.value
          .filter((l) => l.type === 'normal' && l.skewer_id !== null)
          .map((l) => l.skewer_id as string),
      ),
  )

  /**
   * 指定串の通常完了ログを取り消す（該当 skewerId の normal ログを削除）
   */
  async function undoCompletion(tenantId: string, logDate: string, skewerId: string): Promise<void> {
    const { error: err } = await supabase
      .from('prep_logs')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('log_date', logDate)
      .eq('skewer_id', skewerId)
      .eq('type', 'normal')
    if (err) throw new Error(err.message)
    await fetchByDate(tenantId, logDate)
  }

  /** 今日の合計串本数（通常 + 追加の合計） */
  const totalStickCount = computed(() =>
    todayLogs.value.reduce((sum, l) => sum + l.stick_count, 0),
  )

  return {
    todayLogs,
    loading,
    error,
    fetchByDate,
    recordCompletion,
    undoCompletion,
    completedSkewerIds,
    totalStickCount,
  }
})
