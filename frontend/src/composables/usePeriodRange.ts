/**
 * usePeriodRange.ts
 *
 * JST 基準の期間計算ユーティリティ。
 *
 * TZ 方式:
 *   Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(date)
 *   - en-CA ロケールは "YYYY-MM-DD" 形式を返す
 *   - timeZone: 'Asia/Tokyo' により端末の TZ に依存しない
 *   - Date.now() + 9*3600*1000 方式は端末 TZ が非 UTC 時に二重ずれが生じるため不採用
 */

export type Scope = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface PeriodRange {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
  label: string // 表示用ラベル
}

// ─── 内部ヘルパー ─────────────────────────────────────────────────

/** JST の今日を YYYY-MM-DD で返す */
export function jstTodayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(now)
}

/** YYYY-MM-DD を [year, month, day] に分解 */
export function parseYmd(ymd: string): [number, number, number] {
  const parts = ymd.split('-')
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])]
}

/** year / month / day → YYYY-MM-DD */
export function toYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** その年月の末日を返す */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** YYYY-MM-DD の曜日を返す（0=日, 1=月, ..., 6=土）。Asia/Tokyo 基準。 */
export function dowOf(ymd: string): number {
  const [y, m, d] = parseYmd(ymd)
  // Asia/Tokyo の曜日を取得
  const date = new Date(Date.UTC(y, m - 1, d))
  const dowStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short'
  }).format(date)
  // Sun=0, Mon=1, ..., Sat=6 に変換
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return dowMap[dowStr] ?? 0
}

/** YYYY-MM-DD に days を加算して新しい YYYY-MM-DD を返す */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = parseYmd(ymd)
  const date = new Date(y, m - 1, d + days)
  return toYmd(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** 月 m（1-indexed）が属する四半期（1-4） */
function quarterOf(m: number): number {
  return Math.ceil(m / 3)
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

// ─── 公開 API ─────────────────────────────────────────────────────

/**
 * スコープ + offset から期間を返す。
 * offset=0 = 今期, 1 = 前期, 2 = 前々期 ...
 * now は省略時に現在時刻（テスト用に注入可能）。
 */
export function getPeriodRange(scope: Scope, offset = 0, now: Date = new Date()): PeriodRange {
  const today = jstTodayYmd(now)
  const [y, m] = parseYmd(today)

  switch (scope) {
    case 'day': {
      const date = addDays(today, -offset)
      const [, dm, dd] = parseYmd(date)
      const dow = dowOf(date)
      return { from: date, to: date, label: `${dm}/${dd}(${DOW_JA[dow]})` }
    }

    case 'week': {
      // today から offset 週前の月曜〜日曜
      const refDate = addDays(today, -offset * 7)
      const refDow = dowOf(refDate) // 0=Sun
      const daysFromMon = refDow === 0 ? 6 : refDow - 1
      const weekStart = addDays(refDate, -daysFromMon)
      const weekEnd = addDays(weekStart, 6)
      const [, sm, sd] = parseYmd(weekStart)
      const [, em, ed] = parseYmd(weekEnd)
      return { from: weekStart, to: weekEnd, label: `${sm}/${sd}〜${em}/${ed}` }
    }

    case 'month': {
      let tm = m - offset
      let ty = y
      while (tm <= 0) { tm += 12; ty-- }
      while (tm > 12) { tm -= 12; ty++ }
      const lastD = lastDayOfMonth(ty, tm)
      return { from: toYmd(ty, tm, 1), to: toYmd(ty, tm, lastD), label: `${ty}年${tm}月` }
    }

    case 'quarter': {
      let tq = quarterOf(m) - offset
      let ty = y
      while (tq <= 0) { tq += 4; ty-- }
      while (tq > 4) { tq -= 4; ty++ }
      const startM = (tq - 1) * 3 + 1
      const endM = startM + 2
      return {
        from: toYmd(ty, startM, 1),
        to: toYmd(ty, endM, lastDayOfMonth(ty, endM)),
        label: `${ty}年Q${tq}（${startM}〜${endM}月）`,
      }
    }

    case 'year': {
      const ty = y - offset
      return { from: toYmd(ty, 1, 1), to: toYmd(ty, 12, 31), label: `${ty}年` }
    }
  }
}

/**
 * 前期比較対象の期間を返す。
 * 単日 = 前週同曜日（+7日遡り）/ その他 = 1つ前の同スコープ期間
 */
export function getPrevPeriod(scope: Scope, offset = 0, now: Date = new Date()): PeriodRange {
  if (scope === 'day') return getPeriodRange('day', offset + 7, now)
  return getPeriodRange(scope, offset + 1, now)
}

/**
 * 昨対（前年同期）を返す。month / quarter のみ意味を持つ。それ以外は null。
 */
export function getYoyPeriod(scope: Scope, offset = 0, now: Date = new Date()): PeriodRange | null {
  if (scope !== 'month' && scope !== 'quarter') return null
  const base = getPeriodRange(scope, offset, now)
  const [fy, fm] = parseYmd(base.from)
  const [, tm] = parseYmd(base.to)
  // 月末日はうるう年等で異なる場合があるため再計算
  const yoyLastD = lastDayOfMonth(fy - 1, tm)
  return {
    from: toYmd(fy - 1, fm, 1),
    to: toYmd(fy - 1, tm, yoyLastD),
    label: base.label.replace(`${fy}年`, `${fy - 1}年`),
  }
}

/**
 * 売上推移グラフ用のフェッチ範囲を返す。
 * 現在期間の末日を基準に、スコープに応じた過去 N 期間をカバーする範囲を返す。
 */
export function getTrendFetchRange(scope: Scope, offset = 0, now: Date = new Date()): PeriodRange {
  const TREND_POINTS: Record<Scope, number> = {
    day: 7, week: 8, month: 12, quarter: 5, year: 5,
  }
  const n = TREND_POINTS[scope]
  const currentEnd = getPeriodRange(scope, offset, now).to
  const oldestStart = getPeriodRange(scope, offset + n - 1, now).from
  return { from: oldestStart, to: currentEnd, label: '' }
}

/** スコープの日本語ラベル */
export const SCOPE_LABELS: Record<Scope, string> = {
  day: '単日',
  week: '週',
  month: '月',
  quarter: '四半期',
  year: '年',
}
