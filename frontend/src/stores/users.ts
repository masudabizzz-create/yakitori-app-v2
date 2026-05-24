import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/types'

/**
 * スタッフ（users テーブル）ストア
 *
 * 注: 新規スタッフの追加・削除は Supabase Auth ユーザーの作成/削除を伴うため、
 *     クライアントからは行えない（service_role が必要）。
 *     当ストアは既存スタッフの一覧取得と 名前/役割/有効フラグ の更新のみを担う。
 *     新規追加・削除は Supabase Dashboard で行う（SETUP.md 参照）。
 */
export const useUsersStore = defineStore('users', () => {
  const users = ref<AppUser[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** 同一テナントの全スタッフを取得する（RLS により自テナントのみ） */
  async function fetchAll(): Promise<void> {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('users')
      .select('*')
      .order('created_at')
    if (err) {
      error.value = err.message
    } else {
      users.value = (data ?? []) as AppUser[]
    }
    loading.value = false
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

  return { users, loading, error, fetchAll, saveUsers }
})
