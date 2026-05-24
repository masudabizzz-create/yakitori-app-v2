/**
 * Supabase Edge Function の呼び出しエラーから実際のメッセージを取り出す。
 *
 * non-2xx レスポンスの場合、supabase-js は data=null / error=FunctionsHttpError を返す。
 * error.context が生の Response オブジェクトなので、そこから JSON body を読む。
 */
export async function extractFnError(
  error: { message: string; context?: Response },
  data?: unknown,
): Promise<string> {
  // data に error フィールドがある場合（2xx でもエラーを返すケース）
  const fromData = (data as { error?: string } | null)?.error
  if (fromData) return fromData
  // context（生 Response）から JSON を読む
  try {
    if (error.context) {
      const body = await error.context.clone().json()
      if (body?.error) return body.error
    }
  } catch { /* ignore */ }
  return error.message
}
