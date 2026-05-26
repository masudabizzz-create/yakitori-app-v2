import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { insertAuditLog } from '@/lib/audit'
import type { AppUser, Tenant, UserRole } from '@/types'

/**
 * 認証ストア
 * Supabase Auth のセッションと、users テーブルのアプリ内ユーザー情報を管理する。
 */
export const useAuthStore = defineStore('auth', () => {
  const authUser = ref<SupabaseAuthUser | null>(null)
  const appUser = ref<AppUser | null>(null)
  const loading = ref(true)
  /**
   * platform_admin / manager が別テナントのコンテキストで操作する際に設定するテナントID。
   * undefined のときは appUser.tenant_id（自テナント）を使用する。
   */
  const activeTenantId = ref<string | undefined>(undefined)
  /** アクセス可能な全店舗一覧（RLS によって自動フィルタリング） */
  const accessibleTenants = ref<Tenant[]>([])
  // 初期化処理を共有 Promise として保持する（複数呼び出しを単一の完了に集約）
  let initPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => authUser.value !== null)
  const role = computed<UserRole | null>(() => appUser.value?.role ?? null)
  /** システム管理画面にアクセス可能（rank >= 3: platform_admin / manager / store_owner） */
  const isAdmin = computed(() =>
    role.value === 'platform_admin' ||
    role.value === 'manager' ||
    role.value === 'store_owner',
  )
  /** 運用管理画面にアクセス可能（rank >= 3: platform_admin / manager / store_owner） */
  const isManager = computed(() =>
    role.value === 'platform_admin' ||
    role.value === 'manager' ||
    role.value === 'store_owner',
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
          accessibleTenants.value = []
        }
      })
    })()
    return initPromise
  }

  /** users テーブルから自分のレコードを取得し、アクセス可能な店舗一覧も更新する。 */
  async function fetchAppUser(): Promise<void> {
    if (!authUser.value) return
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.value.id)
      .single()
    appUser.value = error ? null : (data as AppUser)
    // ユーザー情報確定後にアクセス可能店舗を取得する
    await fetchAccessibleTenants()
  }

  /** アクセス可能な店舗一覧を取得する（RLS によって自動フィルタリング）。 */
  async function fetchAccessibleTenants(): Promise<void> {
    if (!authUser.value) {
      accessibleTenants.value = []
      return
    }
    const { data } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at')
    accessibleTenants.value = (data ?? []) as Tenant[]
  }

  /** メール + パスワードでログインする。 */
  async function login(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(translateAuthError(error.message))
  }

  /**
   * 操作対象テナントを切り替える（platform_admin / manager 利用可）。
   * undefined を渡すと自テナントに戻る。
   * store_owner 以下は undefined のみ受け付け（自テナントリセット）。
   */
  function setActiveTenantId(id: string | undefined): void {
    if (
      id === undefined ||
      role.value === 'platform_admin' ||
      role.value === 'manager'
    ) {
      activeTenantId.value = id
    }
  }

  /** ログアウトする。 */
  async function logout(): Promise<void> {
    // 監査ログ（signOut 前に記録: 後では auth.uid() が null になる）
    await insertAuditLog({
      tenantId: appUser.value?.tenant_id ?? null,
      action: 'auth.logout',
      actorName: appUser.value?.name ?? null,
    })
    await supabase.auth.signOut()
    authUser.value = null
    appUser.value = null
    activeTenantId.value = undefined
    accessibleTenants.value = []
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
    accessibleTenants,
    setActiveTenantId,
    initialize,
    fetchAppUser,
    fetchAccessibleTenants,
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
