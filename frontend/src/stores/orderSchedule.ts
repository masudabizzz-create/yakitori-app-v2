import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { OrderSchedule, DeliveryBlackoutPeriod } from '@/types'

/** 通常スケジュールの保存用入力（id / tenant_id / sort_order は内部で付与） */
export interface OrderScheduleInput {
  deadline_dow: number
  delivery_dow: number
  uplift_weekday: number
  uplift_holiday: number
}

/** 納品不可期間の保存用入力 */
export interface BlackoutInput {
  id?: string
  title: string
  start_date: string
  end_date: string
  note?: string | null
  irregular_dates: {
    id?: string
    delivery_date: string
    note?: string | null
  }[]
}

/**
 * 発注スケジュールストア（通常 / 納品不可期間 + イレギュラー納品日）
 */
export const useOrderScheduleStore = defineStore('orderSchedule', () => {
  const schedules = ref<OrderSchedule[]>([])
  const blackouts = ref<DeliveryBlackoutPeriod[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** 通常スケジュールと納品不可期間（イレギュラー納品日含む）をまとめて取得する */
  async function fetchAll(): Promise<void> {
    loading.value = true
    error.value = null
    const [r1, r2] = await Promise.all([
      supabase.from('order_schedules').select('*').order('sort_order'),
      supabase
        .from('delivery_blackout_periods')
        .select('*, delivery_irregular_dates(*)')
        .order('start_date'),
    ])
    if (r1.error) error.value = r1.error.message
    else schedules.value = (r1.data ?? []) as OrderSchedule[]
    if (r2.error) error.value = r2.error.message
    else blackouts.value = (r2.data ?? []) as DeliveryBlackoutPeriod[]
    loading.value = false
  }

  /** 通常スケジュールを洗い替え保存する */
  async function saveSchedules(rows: OrderScheduleInput[], tenantId: string): Promise<void> {
    const { error: delErr } = await supabase
      .from('order_schedules')
      .delete()
      .eq('tenant_id', tenantId)
    if (delErr) throw new Error(delErr.message)

    if (rows.length > 0) {
      const insertRows = rows.map((r, i) => ({ ...r, tenant_id: tenantId, sort_order: i }))
      const { error: insErr } = await supabase.from('order_schedules').insert(insertRows)
      if (insErr) throw new Error(insErr.message)
    }
    await fetchAll()
  }

  /**
   * 納品不可期間を保存する（新規 or 更新）。
   * イレギュラー納品日は一括削除・再挿入で同期する。
   */
  async function saveBlackout(input: BlackoutInput, tenantId: string): Promise<void> {
    let blackoutId: string

    if (input.id) {
      // 既存レコードを更新
      const { error: updErr } = await supabase
        .from('delivery_blackout_periods')
        .update({
          title: input.title,
          start_date: input.start_date,
          end_date: input.end_date,
          note: input.note ?? null,
        })
        .eq('id', input.id)
      if (updErr) throw new Error(updErr.message)
      blackoutId = input.id
    } else {
      // 新規挿入
      const { data, error: insErr } = await supabase
        .from('delivery_blackout_periods')
        .insert({
          tenant_id: tenantId,
          title: input.title,
          start_date: input.start_date,
          end_date: input.end_date,
          note: input.note ?? null,
        })
        .select('id')
        .single()
      if (insErr) throw new Error(insErr.message)
      blackoutId = (data as { id: string }).id
    }

    // イレギュラー納品日: 全削除 → 再挿入
    const { error: delErr } = await supabase
      .from('delivery_irregular_dates')
      .delete()
      .eq('blackout_id', blackoutId)
    if (delErr) throw new Error(delErr.message)

    if (input.irregular_dates.length > 0) {
      const rows = input.irregular_dates.map((d) => ({
        tenant_id: tenantId,
        blackout_id: blackoutId,
        delivery_date: d.delivery_date,
        note: d.note ?? null,
      }))
      const { error: insErr } = await supabase.from('delivery_irregular_dates').insert(rows)
      if (insErr) throw new Error(insErr.message)
    }

    await fetchAll()
  }

  /** 納品不可期間を削除する（CASCADE でイレギュラー納品日も削除） */
  async function deleteBlackout(id: string): Promise<void> {
    const { error: delErr } = await supabase
      .from('delivery_blackout_periods')
      .delete()
      .eq('id', id)
    if (delErr) throw new Error(delErr.message)
    await fetchAll()
  }

  return {
    schedules,
    blackouts,
    loading,
    error,
    fetchAll,
    saveSchedules,
    saveBlackout,
    deleteBlackout,
  }
})
