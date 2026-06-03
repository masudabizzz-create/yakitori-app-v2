/**
 * useBusinessDate.ts
 *
 * 入力時刻から「営業日（log_date）」を解決するロジック。
 *
 * ── 判定規則 ──────────────────────────────────────────────────
 *  21:00〜23:59  → 自動: 当日
 *   0:00〜 2:59  → 自動: 前日（深夜営業の日跨ぎ）
 *   3:00〜20:59  → 確認必要: 今日 or 前日の2択をユーザーに提示
 * ────────────────────────────────────────────────────────────
 * 境界時刻は定数で管理し、後から調整しやすくしてある。
 */

/** 自動割り当て「当日」の開始時刻（21時〜23時はその日の営業） */
export const BUSINESS_START_HOUR = 21

/** 自動割り当て「前日」の終了時刻（0時〜2時は前日の営業扱い） */
export const BUSINESS_END_HOUR = 3

export type BusinessDateResult =
  | { date: string; needsConfirm: false }
  | { date: string; needsConfirm: true; candidates: [string, string] }

/** yyyy-MM-dd（ローカル時刻基準） */
function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 前日の Date を返す */
function prevDay(d: Date): Date {
  const p = new Date(d)
  p.setDate(p.getDate() - 1)
  return p
}

/**
 * 入力時刻（ローカル時刻・JST）から営業日を解決する純粋関数。
 *
 * @param now - 判定基準時刻（省略時は new Date()）
 * @returns
 *   needsConfirm: false → date が確定営業日
 *   needsConfirm: true  → candidates[0]=今日, candidates[1]=前日 から選択
 */
export function resolveBusinessDate(now: Date = new Date()): BusinessDateResult {
  const hour = now.getHours() // ローカル時刻 → JST で動作

  if (hour >= BUSINESS_START_HOUR) {
    // 21:00〜23:59 → 当日
    return { date: formatYmd(now), needsConfirm: false }
  }

  if (hour < BUSINESS_END_HOUR) {
    // 0:00〜2:59 → 前日
    return { date: formatYmd(prevDay(now)), needsConfirm: false }
  }

  // 3:00〜20:59 → 要確認
  return {
    date: formatYmd(now),       // デフォルト選択（今日）
    needsConfirm: true,
    candidates: [formatYmd(now), formatYmd(prevDay(now))],
  }
}

/**
 * 営業日文字列（YYYY-MM-DD）を表示用ラベルに変換する。
 * 例: "2026-06-02" → "6/2（火）"
 */
const DOW_SHORT = ['日', '月', '火', '水', '木', '金', '土']

export function formatBusinessDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  // スラッシュ区切りでパースするとローカル時刻として解釈される（UTC誤差を防ぐ）
  const date = new Date(y, m - 1, d, 12)
  return `${m}/${d}（${DOW_SHORT[date.getDay()]}）`
}
