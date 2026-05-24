import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { UserRole } from '@/types'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    minRole?: UserRole
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
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true, title: 'ホーム' },
    },
    {
      path: '/input',
      name: 'input',
      component: () => import('@/views/InputView.vue'),
      meta: { requiresAuth: true, minRole: 'user', title: '営業後入力' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true, minRole: 'user', title: '仕込みダッシュボード' },
    },
    {
      path: '/analytics',
      name: 'analytics',
      component: () => import('@/views/AnalyticsView.vue'),
      meta: { requiresAuth: true, minRole: 'user', title: '分析・集計' },
    },
    {
      path: '/order',
      name: 'order',
      component: () => import('@/views/OrderView.vue'),
      meta: { requiresAuth: true, minRole: 'user', title: '発注推定' },
    },
    {
      path: '/admin/ops',
      name: 'ops-admin',
      component: () => import('@/views/OpsAdminView.vue'),
      meta: { requiresAuth: true, minRole: 'manager', title: '運用管理' },
    },
    {
      path: '/admin/sys',
      name: 'sys-admin',
      component: () => import('@/views/SysAdminView.vue'),
      meta: { requiresAuth: true, minRole: 'admin', title: 'システム管理' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

const ROLE_RANK: Record<UserRole, number> = { user: 1, manager: 2, admin: 3 }

function hasRole(actual: UserRole | null, required: UserRole): boolean {
  if (!actual) return false
  return ROLE_RANK[actual] >= ROLE_RANK[required]
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // セッション復元（初回のみ実行される）
  if (auth.loading) {
    await auth.initialize()
  }

  // 認証必須ルートに未認証でアクセス → ログインへ
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // 認証済みでログイン画面へ → ホームへ
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'home' }
  }

  // ロール不足 → ホームへ
  if (to.meta.minRole && !hasRole(auth.role, to.meta.minRole)) {
    return { name: 'home' }
  }

  document.title = to.meta.title ? `${to.meta.title} | 串在庫管理` : '串在庫管理'
})

export default router
