import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import type { AppUser } from '@/types'

// ────────────────────────────────────────────────────────────────────────────
// Supabase モック
// hoisted() でモック関数を先に定義し、vi.mock のファクトリから参照する。
// ────────────────────────────────────────────────────────────────────────────
const { mockUsersQuery, mockTenantsQuery, mockFrom, mockSignOut } = vi.hoisted(() => {
  const mockUsersQuery = vi.fn()
  const mockTenantsQuery = vi.fn()
  const mockSignOut = vi.fn().mockResolvedValue({ error: null })
  const mockFrom = vi.fn((table: string) => {
    if (table === 'users') {
      return { select: () => ({ eq: () => ({ single: mockUsersQuery }) }) }
    }
    // tenants テーブル
    return { select: () => ({ order: mockTenantsQuery }) }
  })
  return { mockUsersQuery, mockTenantsQuery, mockFrom, mockSignOut }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: mockSignOut,
    },
    from: mockFrom,
  },
}))

vi.mock('@/lib/audit', () => ({
  insertAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { useAuthStore } from '@/stores/auth'

// ────────────────────────────────────────────────────────────────────────────
// テスト用フィクスチャ
// ────────────────────────────────────────────────────────────────────────────
function mockSuccessQueries() {
  mockUsersQuery.mockResolvedValue({
    data: { id: 'u1', name: 'テスト', role: 'store_owner', tenant_id: 't1', is_active: true },
    error: null,
  })
  mockTenantsQuery.mockResolvedValue({ data: [] })
}

function mockErrorQuery() {
  mockUsersQuery.mockResolvedValue({
    data: null,
    error: { message: 'Not found', code: 'PGRST116' },
  })
  mockTenantsQuery.mockResolvedValue({ data: [] })
}

// ────────────────────────────────────────────────────────────────────────────
// appUserFetchedAt キャッシュ挙動
// ────────────────────────────────────────────────────────────────────────────
describe('useAuthStore — appUserFetchedAt キャッシュ', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockUsersQuery.mockReset()
    mockTenantsQuery.mockReset()
    mockFrom.mockClear()
  })

  it('初期値は null', () => {
    const auth = useAuthStore()
    expect(auth.appUserFetchedAt).toBeNull()
  })

  it('fetchAppUser() 正常完了後にタイムスタンプが設定される', async () => {
    mockSuccessQueries()
    const auth = useAuthStore()
    auth.authUser = { id: 'u1' } as unknown as SupabaseAuthUser

    const before = Date.now()
    await auth.fetchAppUser()
    const after = Date.now()

    expect(auth.appUserFetchedAt).not.toBeNull()
    expect(auth.appUserFetchedAt).toBeGreaterThanOrEqual(before)
    expect(auth.appUserFetchedAt).toBeLessThanOrEqual(after)
  })

  it('DB エラー時はタイムスタンプを更新しない（次回ナビで再試行させる）', async () => {
    mockErrorQuery()
    const auth = useAuthStore()
    auth.authUser = { id: 'u1' } as unknown as SupabaseAuthUser

    await auth.fetchAppUser()

    expect(auth.appUserFetchedAt).toBeNull()
  })

  it('2回目の正常完了でタイムスタンプが更新される（エラー→成功の遷移）', async () => {
    const auth = useAuthStore()
    auth.authUser = { id: 'u1' } as unknown as SupabaseAuthUser

    // 1回目: エラー → タイムスタンプなし
    mockErrorQuery()
    await auth.fetchAppUser()
    expect(auth.appUserFetchedAt).toBeNull()

    // 2回目: 成功 → タイムスタンプ設定
    mockSuccessQueries()
    const before = Date.now()
    await auth.fetchAppUser()
    expect(auth.appUserFetchedAt).not.toBeNull()
    expect(auth.appUserFetchedAt).toBeGreaterThanOrEqual(before)
  })

  it('authUser が null なら fetchAppUser() は即返り、タイムスタンプを更新しない', async () => {
    const auth = useAuthStore()
    // authUser はデフォルト null のまま

    await auth.fetchAppUser()

    expect(auth.appUserFetchedAt).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// is_active watcher（auth ストア内の watch(appUser, ...) の挙動を検証）
// ────────────────────────────────────────────────────────────────────────────
describe('useAuthStore — is_active watcher', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockSignOut.mockReset()
  })

  it('appUser.is_active が false になると logout（signOut）が呼ばれる', async () => {
    const auth = useAuthStore()
    auth.authUser = { id: 'u1' } as unknown as SupabaseAuthUser

    // まず active=true でセットしてウォッチャーを起動させる
    auth.appUser = { id: 'u1', is_active: true } as unknown as AppUser
    await nextTick()

    // is_active を false に変更 → ウォッチャーが logout() を起動
    auth.appUser = { id: 'u1', is_active: false } as unknown as AppUser
    await nextTick()
    // logout() は非同期（insertAuditLog → signOut）なので追加で待つ
    await vi.waitFor(() => expect(mockSignOut).toHaveBeenCalled())
  })

  it('appUser.is_active が true のままなら logout は呼ばれない', async () => {
    const auth = useAuthStore()
    auth.authUser = { id: 'u1' } as unknown as SupabaseAuthUser

    auth.appUser = { id: 'u1', is_active: true } as unknown as AppUser
    await nextTick()
    auth.appUser = { id: 'u1', is_active: true, name: 'updated' } as unknown as AppUser
    await nextTick()

    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('appUser が null になっても logout は呼ばれない', async () => {
    const auth = useAuthStore()
    auth.authUser = { id: 'u1' } as unknown as SupabaseAuthUser

    auth.appUser = { id: 'u1', is_active: true } as unknown as AppUser
    await nextTick()
    auth.appUser = null
    await nextTick()

    expect(mockSignOut).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// withTimeout ヘルパー（router 内で使用する同等ロジックを独立して検証）
// ────────────────────────────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timerId = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => { clearTimeout(timerId); resolve(value) },
      (err)   => { clearTimeout(timerId); reject(err) },
    )
  })
}

describe('withTimeout', () => {
  it('Promise が ms 以内に解決すれば値を返す', async () => {
    const result = await withTimeout(Promise.resolve(42), 100)
    expect(result).toBe(42)
  })

  it('Promise が ms 以内に失敗すれば元のエラーを伝播する', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('original')), 100)
    ).rejects.toThrow('original')
  })

  it('ms を超えると Error("timeout") で reject する', async () => {
    vi.useFakeTimers()
    const never = new Promise<never>(() => { /* 解決しない */ })
    const racePromise = withTimeout(never, 8_000)

    vi.advanceTimersByTime(8_000)
    await expect(racePromise).rejects.toThrow('timeout')
    vi.useRealTimers()
  })

  it('解決後にタイマーが残らない（clearTimeout が呼ばれる）', async () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    const fast = new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 10))
    const racePromise = withTimeout(fast, 8_000)
    vi.advanceTimersByTime(10)
    await racePromise

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
    vi.useRealTimers()
  })
})
