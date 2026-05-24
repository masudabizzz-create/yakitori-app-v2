import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { OrderSchedule, OrderScheduleIrregular } from '@/types'

/** 通常スケジュールの保存用入力（id / tenant_id / sort_order は内部で付与） */
export interface OrderScheduleInput {
  deadline_dow: number
  delivery_dow: number
  uplift_weekday: number
  uplift_holiday: number
}

/** 例外スケジュールの保存用入力（id / tenant_id は内部で付与） */
export interface OrderScheduleIrregularInput {
  week_start_date: string
  deadline_date: string
  delivery_date: string
  uplift_weekday: number
  uplift_holiday: number
  note: string
}

/**
 * 発注スケジュールストア（通常 / 例外）
 */
export const useOrderScheduleStore = defineStore('orderSchedule', () => {
  const schedules = ref<OrderSchedule[]>([])
  const irregulars = ref<OrderScheduleIrregular[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** 通常・例外スケジュールをまとめて取得する */
  async function fetchAll(): Promise<void> {
    loading.value = true
    error.value = null
    const [r1, r2] = await Promise.all([
      supabase.from('order_schedules').select('*').order('sort_order'),
      supabase.from('order_schedule_irregulars').select('*').order('week_start_date'),
    ])
    if (r1.error) error.value = r1.error.message
    else schedules.value = (r1.data ?? []) as OrderSchedule[]
    if (r2.error) error.value = r2.error.message
    else irregulars.value = (r2.data ?? []) as OrderScheduleIrregular[]
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

  /** 例外スケジュールを洗い替え保存する */
  async function saveIrregulars(
    rows: OrderScheduleIrregularInput[],
    tenantId: string,
  ): Promise<void> {
    const { error: delErr } = await supabase
      .from('order_schedule_irregulars')
      .delete()
      .eq('tenant_id', tenantId)
    if (delErr) throw new Error(delErr.message)

    if (rows.length > 0) {
      const insertRows = rows.map((r) => ({ ...r, tenant_id: tenantId }))
      const { error: insErr } = await supabase.from('order_schedule_irregulars').insert(insertRows)
      if (insErr) throw new Error(insErr.message)
    }
    await fetchAll()
  }

  return { schedules, irregulars, loading, error, fetchAll, saveSchedules, saveIrregulars }
})
