import type { UserRole } from '@/types'

/**
 * ロールの序列定義（数字が大きいほど上位）
 *
 * platform_admin : 5  全テナント横断管理
 * manager        : 4  複数店舗担当（store_owner より上位）
 * store_owner    : 3  自店舗責任者
 * staff_both     : 1  スタッフ（キッチン・ホール兼務）
 * staff_kitchen  : 1  スタッフ（キッチン）
 * staff_hall     : 1  スタッフ（ホール）
 */
export const ROLE_RANK: Record<UserRole, number> = {
  platform_admin: 5,
  manager:        4,
  store_owner:    3,
  staff_both:     1,
  staff_kitchen:  1,
  staff_hall:     1,
}

/** rank >= threshold のロール一覧 */
export function rolesAtLeast(threshold: number): UserRole[] {
  return (Object.entries(ROLE_RANK) as [UserRole, number][])
    .filter(([, rank]) => rank >= threshold)
    .map(([role]) => role)
}
