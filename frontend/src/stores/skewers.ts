import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Skewer } from '@/types'

/**
 * 串マスタストア
 */
export const useSkewersStore = defineStore('skewers', () => {
  const skewers = ref<Skewer[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** 有効な串のみを sort_order 順で取得する */
  async function fetchActive(): Promise<void> {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('skewers')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    if (err) {
      error.value = err.message
    } else {
      skewers.value = (data ?? []) as Skewer[]
    }
    loading.value = false
  }

  /** 無効を含む全串を取得する（運用管理用） */
  async function fetchAll(): Promise<void> {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('skewers')
      .select('*')
      .order('sort_order')
    if (err) {
      error.value = err.message
    } else {
      skewers.value = (data ?? []) as Skewer[]
    }
    loading.value = false
  }

  /**
   * 串マスタを保存する。
   * - deletedIds の串を削除（daily_log_stocks は ON DELETE CASCADE で連動削除）
   * - id を持つ行は更新、持たない行（新規）は挿入
   * - 表示順は配列インデックスで再採番
   */
  async function saveSkewers(
    rows: Skewer[],
    deletedIds: string[],
    tenantId: string,
  ): Promise<void> {
    if (deletedIds.length > 0) {
      const { error: delErr } = await supabase.from('skewers').delete().in('id', deletedIds)
      if (delErr) throw new Error(delErr.message)
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const payload = {
        tenant_id: tenantId,
        name: r.name,
        category: r.category,
        ideal_mon: r.ideal_mon,
        ideal_tue: r.ideal_tue,
        ideal_wed: r.ideal_wed,
        ideal_thu: r.ideal_thu,
        ideal_fri: r.ideal_fri,
        ideal_sat: r.ideal_sat,
        ideal_sun: r.ideal_sun,
        unit: r.unit,
        threshold1: r.threshold1,
        prep_amount1: r.prep_amount1,
        threshold2: r.threshold2,
        prep_amount2: r.prep_amount2,
        is_active: r.is_active,
        prep_method_name: r.prep_method_name,
        course_type: r.course_type,
        target_courses: r.target_courses,
        weight_per_stick_g: r.weight_per_stick_g,
        yield_rate: r.yield_rate,
        order_unit_label: r.order_unit_label,
        order_unit_g: r.order_unit_g,
        sort_order: i,
      }
      if (r.id) {
        const { error: upErr } = await supabase.from('skewers').update(payload).eq('id', r.id)
        if (upErr) throw new Error(upErr.message)
      } else {
        const { error: insErr } = await supabase.from('skewers').insert(payload)
        if (insErr) throw new Error(insErr.message)
      }
    }

    await fetchAll()
  }

  return { skewers, loading, error, fetchActive, fetchAll, saveSkewers }
})
