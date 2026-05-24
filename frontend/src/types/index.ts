// ============================================================
// 型定義
// ============================================================

export type UserRole =
  | 'super_admin'
  | 'tenant_admin'
  | 'admin'
  | 'manager'
  | 'user'
  | 'kitchen'
  | 'hall'

export type InvitationStatus = 'pending' | 'approved' | 'rejected'

export interface UserInvitation {
  id: string
  tenant_id: string
  email: string
  name: string
  role: UserRole
  status: InvitationStatus
  created_by: string
  reviewed_by: string | null
  reviewed_at: string | null
  note: string
  created_at: string
}

export type SkewerCategory =
  | 'レギュラー'
  | 'スペシャル'
  | 'つくね'
  | '前日仕込み'
  | 'その他仕込み'
  | '副産物'

export type CourseType = 'all_courses' | 'specific_courses'
export type KombuAction = 'skewer_kombu' | 'none' | 'kombu' | 'skewer_direct'

// ---------------- DB エンティティ ----------------

export interface Tenant {
  id: string
  name: string
  created_at: string
}

export interface AppUser {
  id: string
  tenant_id: string
  name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface Skewer {
  id: string
  tenant_id: string
  name: string
  category: SkewerCategory
  ideal_mon: number
  ideal_tue: number
  ideal_wed: number
  ideal_thu: number
  ideal_fri: number
  ideal_sat: number
  ideal_sun: number
  unit: number
  threshold1: number
  prep_amount1: number
  threshold2: number
  prep_amount2: number
  is_active: boolean
  prep_method_name: string
  course_type: CourseType
  target_courses: string[]
  weight_per_stick_g: number
  yield_rate: number
  order_unit_label: string
  order_unit_g: number
  sort_order: number
  created_at: string
}

export interface DailyLog {
  id: string
  tenant_id: string
  log_date: string
  day_of_week: string
  staff_name: string
  recorded_at: string
  course_casual: number
  course_standard: number
  course_premium: number
  extra_skewers: number
  total_skewers: number
  total_sales: number
  drink_sales: number
  drink_ratio: number
  memo: string
  created_at: string
}

export interface DailyLogStock {
  id: string
  daily_log_id: string
  skewer_id: string
  stock: number
  is_kombu: boolean
}

export interface Settings {
  id: string
  tenant_id: string
  sunday_boost_enabled: boolean
  course_casual_price: number
  course_standard_price: number
  course_premium_price: number
  course_casual_skewers: number
  course_standard_skewers: number
  course_premium_skewers: number
  line_token: string
  updated_at: string
}

export interface OrderSchedule {
  id: string
  tenant_id: string
  deadline_dow: number
  delivery_dow: number
  uplift_weekday: number
  uplift_holiday: number
  sort_order: number
}

export interface OrderScheduleIrregular {
  id: string
  tenant_id: string
  week_start_date: string
  deadline_date: string
  delivery_date: string
  uplift_weekday: number
  uplift_holiday: number
  note: string
}

// ---------------- 営業後入力フォーム ----------------

/** 1串あたりの入力状態（カテゴリにより使う項目が異なる） */
export interface SkewerInput {
  /** 入力値。レギュラー/前日仕込み=P, つくね=B, スペシャル=本。その他仕込みでは未使用 */
  value: number
  /** 前日仕込み: 昆布締め済みフラグ */
  isKombu: boolean
  /** その他仕込み: 仕込み中フラグ */
  isPreparing: boolean
}

/** 営業後入力フォーム全体 */
export interface DailyInputForm {
  staffName: string
  courseCasual: number
  courseStandard: number
  coursePremium: number
  extraSkewers: number
  totalSales: number
  drinkRatio: number
  memo: string
  /** skewerId -> 入力状態 */
  skewerInputs: Record<string, SkewerInput>
}
