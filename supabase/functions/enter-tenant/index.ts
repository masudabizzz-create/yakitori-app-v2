// supabase/functions/enter-tenant/index.ts
//
// テナント入店 Edge Function
// 役割:
//   - フロントエンドから { tenant_id: string } を受け取る
//   - DB の set_tenant_context() でアクセス権を検証する
//   - service_role で auth.users.app_metadata.active_tenant_id を更新する
//   - フロントエンドが supabase.auth.refreshSession() を呼ぶと
//     新しい JWT に active_tenant_id が含まれ、RLS に反映される

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Missing Authorization header' })
  }

  let payload: { tenant_id?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  if (typeof payload.tenant_id !== 'string' || !payload.tenant_id.trim()) {
    return json(400, { error: 'tenant_id (string) is required' })
  }
  const tenantId = payload.tenant_id.trim()

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

  // DB の set_tenant_context() でアクセス権を検証する
  // 権限がない場合は RAISE EXCEPTION → error が返る
  const { error: ctxErr } = await supabase.rpc('set_tenant_context', {
    p_tenant_id: tenantId,
  })
  if (ctxErr) {
    return json(403, { error: ctxErr.message })
  }

  // service_role で app_metadata を更新する（auth.uid() は admin API 経由では使えないので直接指定）
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
    userData.user.id,
    { app_metadata: { active_tenant_id: tenantId } },
  )
  if (updateErr) {
    return json(500, { error: `app_metadata 更新失敗: ${updateErr.message}` })
  }

  return json(200, { success: true })
})
