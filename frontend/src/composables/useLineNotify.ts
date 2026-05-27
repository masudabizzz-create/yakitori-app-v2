/**
 * useLineNotify.ts
 * LINE Messaging API（ブロードキャスト）への通知送信。
 *
 * Supabase Edge Function (`send-line`) 経由で送信する。
 * ブラウザから api.line.me を直接叩くと CORS でブロックされるため、
 * 中継用の Edge Function を経由する設計。
 * LINE トークンはサーバー側（Edge Function 内で settings テーブルから取得）に
 * 閉じ込められ、フロントエンドには露出しない。
 */
import { supabase } from '@/lib/supabase'
import { buildLineMessage } from './useInventoryCalc'
import type { PrepResult, LineReportData } from './useInventoryCalc'

export interface LineNotifyResult {
  lineSent: boolean
  lineError: string
  message: string
}

/**
 * Edge Function 経由で LINE へブロードキャスト送信する。
 * 失敗時は例外を投げる。
 * tenantId: platform_admin が別テナントを操作中の場合に指定（複数テナント対応）
 */
export async function sendLineBroadcast(message: string, tenantId?: string): Promise<void> {
  const body: Record<string, string> = { message }
  if (tenantId) body.tenant_id = tenantId
  const { error } = await supabase.functions.invoke('send-line', { body })
  if (error) {
    // FunctionsHttpError の場合は context（Response）から詳細メッセージを取得する。
    // SDK v2 では非 2xx 時に data=null, error=FunctionsHttpError となるため、
    // error.context.json() で Edge Function が返した JSON body を読む必要がある。
    let detail = error.message
    if (error.name === 'FunctionsHttpError') {
      try {
        const body = await (error.context as Response).json() as { error?: string }
        detail = body.error ?? error.message
      } catch {
        // JSON パース失敗は無視し error.message を使用
      }
    }
    throw new Error(`LINE送信失敗: ${detail}`)
  }
}

export interface NotifyDailyReportParams {
  /** calcPrep の結果 */
  prepResults: PrepResult[]
  /** 当日の実績 */
  report: LineReportData
  /** 焼師名 */
  staffName: string
  /** 基準日時（省略時は現在時刻） */
  now?: Date
  /** 送信先テナントID（platform_admin が別テナントを操作中の場合に必須） */
  tenantId?: string
}

/**
 * 日次レポートの LINE 通知を送信する。
 * 送信に失敗してもアプリ全体は止めず、
 * 結果オブジェクト（lineSent / lineError / message）で返す。
 */
export async function notifyDailyReport(
  params: NotifyDailyReportParams,
): Promise<LineNotifyResult> {
  const message = buildLineMessage(
    params.prepResults,
    params.report,
    params.staffName,
    params.now,
  )
  try {
    await sendLineBroadcast(message, params.tenantId)
    return { lineSent: true, lineError: '', message }
  } catch (e) {
    return {
      lineSent: false,
      lineError: e instanceof Error ? e.message : String(e),
      message,
    }
  }
}
