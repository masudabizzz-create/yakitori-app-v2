// supabase/functions/send-line/index.ts
//
// LINE Messaging API（broadcast）への中継 Edge Function
// 役割:
//   - フロントエンドから { message: string } を受け取る
//   - 呼び出し元の JWT で Supabase に接続（RLS が効くので別テナントのデータは見えない）
//   - settings テーブルから line_token を取得
//   - LINE API に POST
//   - 結果を返す
//
// ブラウザから api.line.me を直接叩くと CORS でブロックされるため本関数を経由する。
// LINE トークンはサーバー側に閉じ込められ、フロントエンドには露出しない。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  // 呼び出し元の JWT を取得
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Missing Authorization header' })
  }

  // リクエストボディ解析
  let payload: { message?: unknown; tenant_id?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }
  if (typeof payload.message !== 'string' || !payload.message.trim()) {
    return json(400, { error: 'message (string) is required' })
  }

  // 呼び出し元の JWT で Supabase クライアントを作成（RLS が効く）
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )

  // 認証ユーザー確認
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) {
    return json(401, { error: 'Unauthorized' })
  }

  // settings から LINE トークンを取得
  // tenant_id をフロントから受け取り明示フィルター（platform_admin は複数テナントが見えるため必須）
  // 未指定時は呼び出し元ユーザーの tenant_id を使用
  const tenantId = typeof payload.tenant_id === 'string' && payload.tenant_id
    ? payload.tenant_id
    : (await supabase.from('users').select('tenant_id').eq('id', userData.user.id).single()).data?.tenant_id

  const { data: settings, error: settingsErr } = await supabase
    .from('settings')
    .select('line_token')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (settingsErr) {
    return json(500, { error: `Settings fetch failed: ${settingsErr.message}` })
  }
  const token = (settings?.line_token as string | undefined)?.trim()
  if (!token) {
    return json(400, {
      error: 'LINE token is not configured. システム管理画面で設定してください。',
    })
  }

  // LINE API へブロードキャスト送信
  const lineRes = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ type: 'text', text: payload.message }],
    }),
  })

  if (!lineRes.ok) {
    const errBody = await lineRes.text().catch(() => '')
    return json(lineRes.status, {
      error: `LINE API error (HTTP ${lineRes.status}): ${errBody || lineRes.statusText}`,
    })
  }

  return json(200, { success: true })
})
