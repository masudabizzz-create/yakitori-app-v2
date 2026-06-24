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

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // [DIAG] ナビゲーション開始タイマー
  console.time(`nav:${String(to.name)}`)

  // セッション復元（初回のみ実行される。fetchAppUser もここで完了する）
  if (auth.loading) {
    await auth.initialize()
  }

  // 認証必須ルートに未認証でアクセス → ログインへ
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    console.timeEnd(`nav:${String(to.name)}`)
    return { name: 'login', query: { redirect: to.fullPath } }
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
  // is_active チェックは auth ストアの watch(appUser) で reactive に担保している
  if (
    to.meta.allowedRoles &&
    auth.role !== null &&
    !to.meta.allowedRoles.includes(auth.role)
  ) {
    return { name: 'home' }
  }

  console.timeEnd(`nav:${String(to.name)}`)
  document.title = to.meta.title ? `${to.meta.title} | 串在庫管理` : '串在庫管理'
})

export default router
