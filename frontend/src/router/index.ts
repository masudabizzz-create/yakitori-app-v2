import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { UserRole } from '@/types'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    /** 許可するロールの配列。未指定 = 認証済みなら全ロール可 */
    allowedRoles?: UserRole[]
    title?: string
  }
}

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: 'ログイン' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { title: 'スタッフ登録' },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true, title: 'ホーム' },
    },
    {
      // 全ロールアクセス可（staff_kitchen は串在庫入力、staff_hall は営業日報入力）
      path: '/input',
      name: 'input',
      component: () => import('@/views/InputView.vue'),
      meta: { requiresAuth: true, title: '営業後入力' },
    },
    {
      // 全ロールアクセス可
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true, title: '仕込みダッシュボード' },
    },
    {
      // store_owner 以上（store_owner / manager / platform_admin）
      path: '/analytics',
      name: 'analytics',
      component: () => import('@/views/AnalyticsView.vue'),
      meta: {
        requiresAuth: true,
        allowedRoles: ['platform_admin', 'manager', 'store_owner'],
        title: '分析・集計',
      },
    },
    {
      // 前期比較ページ（analytics と同ロール）
      path: '/analytics/compare',
      name: 'analytics-compare',
      component: () => import('@/views/AnalyticsCompareView.vue'),
      meta: {
        requiresAuth: true,
        allowedRoles: ['platform_admin', 'manager', 'store_owner'],
        title: '前期比較',
      },
    },
    {
      // platform_admin / manager / store_owner のみ
      path: '/order',
      name: 'order',
      component: () => import('@/views/OrderView.vue'),
      meta: {
        requiresAuth: true,
        allowedRoles: ['platform_admin', 'manager', 'store_owner'],
        title: '発注推定',
      },
    },
    {
      // platform_admin / manager / store_owner のみ
      path: '/admin/ops',
      name: 'ops-admin',
      component: () => import('@/views/OpsAdminView.vue'),
      meta: {
        requiresAuth: true,
        allowedRoles: ['platform_admin', 'manager', 'store_owner'],
        title: '運用管理',
      },
    },
    {
      // rank >= 3: platform_admin / manager / store_owner
      path: '/admin/sys',
      name: 'sys-admin',
      component: () => import('@/views/SysAdminView.vue'),
      meta: {
        requiresAuth: true,
        allowedRoles: ['platform_admin', 'manager', 'store_owner'],
        title: 'システム管理',
      },
    },
    {
      // 月次処理（store_owner 以上）
      path: '/monthly-tasks',
      name: 'monthly-tasks',
      component: () => import('@/views/MonthlyTasksView.vue'),
      meta: {
        requiresAuth: true,
        allowedRoles: ['platform_admin', 'manager', 'store_owner'],
        title: '月次処理',
      },
    },
    {
      // 予算設定（store_owner 以上）
      path: '/monthly-tasks/budget',
      name: 'budget-setting',
      component: () => import('@/views/BudgetSettingView.vue'),
      meta: {
        requiresAuth: true,
        allowedRoles: ['platform_admin', 'manager', 'store_owner'],
        title: '予算設定',
      },
    },
    {
      // platform_admin / manager が複数店舗にアクセス可能な場合にログイン後表示される
      path: '/select-tenant',
      name: 'select-tenant',
      component: () => import('@/views/SelectTenantView.vue'),
      meta: { requiresAuth: true, title: '店舗を選択' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

/** appUser キャッシュ有効期限 (ms)。この時間内は DB 再取得をスキップする。 */
const APPUSER_CACHE_TTL_MS = 60_000
/** fetchAppUser のタイムアウト上限 (ms)。超過時はキャッシュで続行またはログインへ。 */
const APPUSER_FETCH_TIMEOUT_MS = 8_000

/**
 * promise にタイムアウトを付与する。
 * タイムアウト時は Error('timeout') で reject する。
 * resolve/reject どちらの場合もタイマーをクリアして漏れを防ぐ。
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timerId = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => { clearTimeout(timerId); resolve(value) },
      (err)   => { clearTimeout(timerId); reject(err) },
    )
  })
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // [DIAG] ナビゲーション開始タイマー
  console.time(`nav:${String(to.name)}`)

  // セッション復元（初回のみ実行される）
  if (auth.loading) {
    await auth.initialize()
  }

  // 認証必須ルートに未認証でアクセス → ログインへ
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    console.timeEnd(`nav:${String(to.name)}`)
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // is_active チェック: 退職者を再確認。
  // (a) 60秒キャッシュ: TTL 内であれば DB クエリをスキップして高速化する。
  //     最大 60 秒の遅延で is_active=false を検出する（仕様上許容）。
  // (b) 8秒タイムアウト: 取得が必要な場合も無限待ちにならないよう上限を設ける。
  if (auth.isAuthenticated) {
    const needsFetch =
      auth.appUserFetchedAt === null ||
      Date.now() - auth.appUserFetchedAt >= APPUSER_CACHE_TTL_MS

    if (needsFetch) {
      try {
        await withTimeout(auth.fetchAppUser(), APPUSER_FETCH_TIMEOUT_MS)
        // [DIAG] fetchAppUser 完了 → タイマー終了
        console.timeEnd(`nav:${String(to.name)}`)
      } catch (err) {
        console.timeEnd(`nav:${String(to.name)}`)
        if ((err as Error).message === 'timeout') {
          // タイムアウト: appUser があればキャッシュで続行、なければログインへ
          console.warn('[DIAG] fetchAppUser timed out')
          if (!auth.appUser) return { name: 'login' }
          // appUser がある → そのまま通す（フリーズより優先）
        } else {
          // AuthApiError（Invalid Refresh Token など）→ 自動ログアウト
          await auth.logout()
          return { name: 'login' }
        }
      }
    } else {
      // [DIAG] キャッシュヒット → fetchAppUser スキップ
      console.log(`[DIAG] nav:${String(to.name)} cache hit (${Date.now() - auth.appUserFetchedAt!}ms ago)`)
      console.timeEnd(`nav:${String(to.name)}`)
    }

    if (auth.appUser?.is_active === false) {
      await auth.logout()
      return { name: 'login' }
    }
  }

  // 認証済みでログイン画面へ → 店舗選択 or ホームへ
  if (to.name === 'login' && auth.isAuthenticated) {
    if (!auth.activeTenantId && auth.accessibleTenants.length > 1) {
      return { name: 'select-tenant' }
    }
    return { name: 'home' }
  }

  // 店舗選択が必要か判定（select-tenant 自体は対象外）
  if (
    auth.isAuthenticated &&
    to.meta.requiresAuth &&
    to.name !== 'select-tenant'
  ) {
    const tenants = auth.accessibleTenants
    if (!auth.activeTenantId && tenants.length > 1) {
      // 複数テナントにアクセス可能で未選択 → 選択画面へ
      return { name: 'select-tenant' }
    }
  }

  // ロールチェック: allowedRoles が設定されていて該当しない → ホームへ
  if (
    to.meta.allowedRoles &&
    auth.role !== null &&
    !to.meta.allowedRoles.includes(auth.role)
  ) {
    return { name: 'home' }
  }

  document.title = to.meta.title ? `${to.meta.title} | 串在庫管理` : '串在庫管理'
})

export default router
