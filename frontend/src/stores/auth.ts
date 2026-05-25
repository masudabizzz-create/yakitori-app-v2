import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { AppUser, UserRole } from '@/types'

/**
 * 認証ストア
 * Supabase Auth のセッションと、users テーブルのアプリ内ユーザー情報を管理する。
 */
export const useAuthStore = defineStore('auth', () => {
  const authUser = ref<SupabaseAuthUser | null>(null)
  const appUser = ref<AppUser | null>(null)
  const loading = ref(true)
  /**
   * platform_admin が別テナントのコンテキストで操作する際に設定するテナントID。
   * undefined のときは appUser.tenant_id（自テナント）を使用する。
   */
  const activeTenantId = ref<string | undefined>(undefined)
  // 初期化処理を共有 Promise として保持する（複数呼び出しを単一の完了に集約）
  let initPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => authUser.value !== null)
  const role = computed<UserRole | null>(() => appUser.value?.role ?? null)
  /** システム管理画面にアクセス可能（platform_admin / store_owner） */
  const isAdmin = computed(() =>
    role.value === 'platform_admin' || role.value === 'store_owner',
  )
  /** 運用管理画面にアクセス可能（platform_admin / store_owner / manager） */
  const isManager = computed(() =>
    role.value === 'platform_admin' ||
    role.value === 'store_owner' ||
    role.value === 'manager',
  )
  const displayName = computed(
    () => appUser.value?.name ?? authUser.value?.email ?? ''
  )
  /**
   * 現在操作対象のテナントID。
   * platform_admin が setActiveTenantId() で切り替えた場合はその値を、
   * それ以外は自テナント（appUser.tenant_id）を返す。
   */
  const effectiveTenantId = computed(
    () => activeTenantId.value ?? appUser.value?.tenant_id
  )

  /**
   * アプリ起動時に呼ぶ。セッション復元と監視を開始する。
   * 複数箇所（App.vue の onMounted / router の beforeEach）から呼ばれても
   * 同じ Promise を返し、全員が同じ完了を await することでレース条件を防ぐ。
   */
  function initialize(): Promise<void> {
    if (initPromise) return initPromise
    initPromise = (async () => {
      const { data } = await supabase.auth.getSession()
      authUser.value = data.session?.user ?? null
      if (authUser.value) await fetchAppUser()
      loading.value = false

      supabase.auth.onAuthStateChange(async (_event, session) => {
        authUser.value = session?.user ?? null
        if (authUser.value) {
          await fetchAppUser()
        } else {
          appUser.value = null
          activeTenantId.value = undefined
        }
      })
    })()
    return initPromise
  }

  /** users テーブルから自分のレコードを取得する。 */
  async function fetchAppUser(): Promise<void> {
    if (!authUser.value) return
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.value.id)
      .single()
    appUser.value = error ? null : (data as AppUser)
  }

  /** メール + パスワードでログインする。 */
  async function login(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(translateAuthError(error.message))
  }

  /**
   * 操作対象テナントを切り替える（platform_admin 専用）。
   * undefined を渡すと自テナントに戻る。
   */
  function setActiveTenantId(id: string | undefined): void {
    if (role.value === 'platform_admin' || id === undefined) {
      activeTenantId.value = id
    }
  }

  /** ログアウトする。 */
  async function logout(): Promise<void> {
    await supabase.auth.signOut()
    authUser.value = null
    appUser.value = null
    activeTenantId.value = undefined
  }

  /** ログイン中ユーザー自身のパスワードを変更する（Supabase Auth）。 */
  async function updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw new Error(error.message)
  }

  return {
    authUser,
    appUser,
    loading,
    isAuthenticated,
    role,
    isAdmin,
    isManager,
    displayName,
    activeTenantId,
    effectiveTenantId,
    setActiveTenantId,
    initialize,
    fetchAppUser,
    login,
    logout,
    updatePassword,
  }
})

/** Supabase Auth のエラーメッセージを日本語化する。 */
function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'メールアドレスまたはパスワードが正しくありません'
  }
  if (message.includes('Email not confirmed')) {
    return 'メールアドレスが未確認です'
  }
  return message
}
