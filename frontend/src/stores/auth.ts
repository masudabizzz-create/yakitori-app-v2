import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { insertAuditLog } from '@/lib/audit'
import type { AppUser, Tenant, UserRole } from '@/types'

/** localStorage に保存する入店中テナント ID のキー */
const ACTIVE_TENANT_KEY = 'yakitori_active_tenant_id'

/**
 * 認証ストア
 * Supabase Auth のセッションと、users テーブルのアプリ内ユーザー情報を管理する。
 */
export const useAuthStore = defineStore('auth', () => {
  const authUser = ref<SupabaseAuthUser | null>(null)
  const appUser = ref<AppUser | null>(null)
  const loading = ref(true)
  /**
   * 入店中のテナントID。
   * - undefined のときは appUser.tenant_id（自テナント）を使用する。
   * - localStorage に保存し、ページリロード後も維持する。
   * - テナント切り替え時は enterTenant() を使う。
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
      try {
        const { data } = await supabase.auth.getSession()
        authUser.value = data.session?.user ?? null
        if (authUser.value) {
          await fetchAppUser()
          // localStorage からアクティブテナントを復元（検証は fetchAppUser 完了後）
          _restoreActiveTenant()
        }
      } catch {
        // getSession / fetchAppUser 失敗 → ローカル状態だけクリア（HTTP呼び出しは避ける）
        authUser.value = null
        appUser.value = null
        activeTenantId.value = undefined
        accessibleTenants.value = []
        localStorage.removeItem(ACTIVE_TENANT_KEY)
      } finally {
        // 成功・失敗に関わらず必ず loading を解除する
        loading.value = false
      }

      supabase.auth.onAuthStateChange(async (event, session) => {
        authUser.value = session?.user ?? null
        // TOKEN_REFRESHED は refreshSession() や自動更新で頻繁に発火するが
        // appUser やテナント状態は変わらないのでスキップする
        if (
          session?.user &&
          (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')
        ) {
          try {
            await fetchAppUser()
            _restoreActiveTenant()
          } catch {
            // セッション切れ → クリア（router が /login へリダイレクトする）
            authUser.value = null
            appUser.value = null
            activeTenantId.value = undefined
            accessibleTenants.value = []
          }
        } else if (!session) {
          appUser.value = null
          activeTenantId.value = undefined
          accessibleTenants.value = []
        }
      })
    })()
    return initPromise
  }

  /**
   * localStorage に保存されたテナントIDを検証して activeTenantId に復元する。
   * アクセス可能なテナント一覧に含まれない場合は localStorage をクリアする。
   */
  function _restoreActiveTenant(): void {
    const saved = localStorage.getItem(ACTIVE_TENANT_KEY)
    if (!saved) return
    const accessible = accessibleTenants.value
    if (accessible.length === 0 || accessible.some((t) => t.id === saved)) {
      activeTenantId.value = saved
    } else {
      // アクセス権がなくなったテナントは削除
      localStorage.removeItem(ACTIVE_TENANT_KEY)
      activeTenantId.value = undefined
    }
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
   * 店舗に入店する（active_tenant_sessions テーブルを更新し、RLS を切り替える）。
   * - platform_admin / manager: Edge Function 経由で active_tenant_sessions を更新
   *   → refreshSession() は不要（DB が即座に current_tenant_id() に反映される）
   * - その他のロール: localStorage へ保存のみ（自テナントのみ許可）
   * - undefined を渡すと自テナント（ホーム）に戻る
   */
  async function enterTenant(id: string | undefined): Promise<void> {
    const targetId = id ?? appUser.value?.tenant_id
    if (!targetId) return

    if (role.value === 'platform_admin' || role.value === 'manager') {
      if (id === undefined) {
        // ホームに戻る: active_tenant_sessions から自分の行を削除
        await supabase
          .from('active_tenant_sessions')
          .delete()
          .eq('user_id', authUser.value!.id)
      } else {
        // 別テナントへ入店: Edge Function で active_tenant_sessions を更新
        const { error } = await supabase.functions.invoke('enter-tenant', {
          body: { tenant_id: id },
        })
        if (error) {
          let detail = error.message
          if (error.name === 'FunctionsHttpError') {
            try {
              const body = await (error.context as Response).json() as { error?: string }
              detail = body.error ?? error.message
            } catch { /* ignore */ }
          }
          throw new Error(`入店失敗: ${detail}`)
        }
        // refreshSession() は不要 — DB テーブルが即座に有効になる
      }
    }

    activeTenantId.value = id  // undefined = ホームテナントに戻る
    if (id) {
      localStorage.setItem(ACTIVE_TENANT_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_TENANT_KEY)
    }
  }

  /**
   * @deprecated enterTenant() を使ってください。
   * 後方互換のために残す（同期版・JWT更新なし）。
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
    localStorage.removeItem(ACTIVE_TENANT_KEY)
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
    enterTenant,
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
