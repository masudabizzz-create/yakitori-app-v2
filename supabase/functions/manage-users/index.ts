// supabase/functions/manage-users/index.ts
//
// スタッフ・店舗管理 Edge Function
//
// 対応アクション:
//   create_invitation  - スタッフ招待（pending 状態で登録）
//   approve_invitation - 招待を承認（Auth ユーザー作成 + LINE通知）
//   reject_invitation  - 招待を拒否
//   delete_user        - スタッフ削除（Auth ユーザー削除 → CASCADE）
//   create_tenant      - 新店舗作成
//   update_tenant      - 店舗名更新
//   delete_tenant      - 店舗削除（スタッフがいない場合のみ）
//
// service_role を使用して RLS をバイパスするため、Edge Function 経由のみで実行する。

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

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'admin']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  // JWT を取得
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Missing Authorization header' })
  }

  // リクエストボディ解析
  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const { action } = payload
  if (typeof action !== 'string') {
    return json(400, { error: 'action は必須です' })
  }

  // 呼び出し元 JWT で Supabase クライアント（RLS 有効）
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )

  // 認証ユーザー確認
  const { data: authData, error: authErr } = await supabaseUser.auth.getUser()
  if (authErr || !authData.user) {
    return json(401, { error: 'Unauthorized' })
  }

  // 呼び出し元のロール・テナント確認
  const { data: caller } = await supabaseUser
    .from('users')
    .select('role, tenant_id, name')
    .eq('id', authData.user.id)
    .single()
  if (!caller) {
    return json(403, { error: 'ユーザー情報が見つかりません' })
  }
  const callerRole = caller.role as string
  const callerTenantId = caller.tenant_id as string
  const callerName = caller.name as string
  const isAdmin = ADMIN_ROLES.includes(callerRole)

  // service_role クライアント（RLS バイパス）
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // ============================================================
  // create_invitation — 招待を作成（pending）
  // ============================================================
  if (action === 'create_invitation') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { email, name, role } = payload
    if (!email || !name || !role) {
      return json(400, { error: 'email, name, role は必須です' })
    }

    // 既存ユーザーの重複チェック
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('tenant_id', callerTenantId)
    const existingAuth = await supabaseAdmin.auth.admin.listUsers()
    const emailExists = existingAuth.data?.users?.some(
      (u) => u.email?.toLowerCase() === (email as string).toLowerCase(),
    )
    if (emailExists) {
      return json(400, { error: 'このメールアドレスはすでに登録されています' })
    }

    // 保留中の招待重複チェック
    const { data: pendingInv } = await supabaseAdmin
      .from('user_invitations')
      .select('id')
      .eq('tenant_id', callerTenantId)
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle()
    if (pendingInv) {
      return json(400, { error: 'このメールアドレスへの招待がすでに保留中です' })
    }

    const { data, error } = await supabaseAdmin
      .from('user_invitations')
      .insert({
        tenant_id: callerTenantId,
        email,
        name,
        role,
        status: 'pending',
        created_by: authData.user.id,
      })
      .select()
      .single()
    if (error) return json(500, { error: error.message })

    // 招待作成を LINE 通知
    await sendLine(
      supabaseAdmin,
      callerTenantId,
      [
        '📋 スタッフ招待が作成されました',
        `名前: ${name}`,
        `メール: ${email}`,
        `役割: ${role}`,
        `作成者: ${callerName}`,
        '→ システム管理画面で承認してください',
      ].join('\n'),
    )

    return json(200, { invitation: data })
  }

  // ============================================================
  // approve_invitation — 招待を承認（Auth ユーザー作成 + LINE通知）
  // ============================================================
  if (action === 'approve_invitation') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { invitation_id } = payload
    if (!invitation_id) return json(400, { error: 'invitation_id は必須です' })

    // 招待情報を取得
    const { data: inv, error: invErr } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('id', invitation_id)
      .eq('status', 'pending')
      .single()
    if (invErr || !inv) {
      return json(404, { error: '招待が見つかりません（既に処理済みの可能性があります）' })
    }

    // inviteUserByEmail で Auth ユーザーを作成 + 招待メールを自動送信
    const { data: inviteData, error: createErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(inv.email, {
        data: { name: inv.name },
      })
    if (createErr) {
      return json(500, { error: `Auth ユーザー作成失敗: ${createErr.message}` })
    }

    // users テーブルに挿入
    const { error: insertErr } = await supabaseAdmin.from('users').insert({
      id: inviteData.user.id,
      tenant_id: inv.tenant_id,
      name: inv.name,
      role: inv.role,
      is_active: true,
    })
    if (insertErr) {
      // ロールバック: Auth ユーザーを削除
      await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
      return json(500, { error: `ユーザー登録失敗: ${insertErr.message}` })
    }

    // 招待ステータスを更新
    await supabaseAdmin
      .from('user_invitations')
      .update({
        status: 'approved',
        reviewed_by: authData.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', invitation_id)

    // LINE 通知
    await sendLine(
      supabaseAdmin,
      callerTenantId,
      [
        '✅ スタッフ追加が承認されました',
        `名前: ${inv.name}`,
        `メール: ${inv.email}`,
        `役割: ${inv.role}`,
        `承認者: ${callerName}`,
        '招待メールを送信しました。メール内のリンクからパスワードを設定してください。',
      ].join('\n'),
    )

    return json(200, { success: true, userId: inviteData.user.id })
  }

  // ============================================================
  // reject_invitation — 招待を拒否
  // ============================================================
  if (action === 'reject_invitation') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { invitation_id, note } = payload
    if (!invitation_id) return json(400, { error: 'invitation_id は必須です' })

    const { error } = await supabaseAdmin
      .from('user_invitations')
      .update({
        status: 'rejected',
        reviewed_by: authData.user.id,
        reviewed_at: new Date().toISOString(),
        note: typeof note === 'string' ? note : '',
      })
      .eq('id', invitation_id)
      .eq('status', 'pending')
    if (error) return json(500, { error: error.message })
    return json(200, { success: true })
  }

  // ============================================================
  // delete_user — スタッフを削除
  // ============================================================
  if (action === 'delete_user') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { user_id } = payload
    if (!user_id) return json(400, { error: 'user_id は必須です' })
    if (user_id === authData.user.id) {
      return json(400, { error: '自分自身は削除できません' })
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(
      user_id as string,
    )
    if (error) return json(500, { error: error.message })
    return json(200, { success: true })
  }

  // ============================================================
  // create_tenant — 新店舗を作成
  // ============================================================
  if (action === 'create_tenant') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { name } = payload
    if (!name) return json(400, { error: 'name は必須です' })

    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .insert({ name })
      .select()
      .single()
    if (tenantErr) return json(500, { error: tenantErr.message })

    // settings レコードも同時に作成
    await supabaseAdmin
      .from('settings')
      .insert({ tenant_id: tenant.id })

    return json(200, { tenant })
  }

  // ============================================================
  // update_tenant — 店舗名を更新
  // ============================================================
  if (action === 'update_tenant') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { tenant_id, name } = payload
    if (!tenant_id || !name) {
      return json(400, { error: 'tenant_id と name は必須です' })
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ name })
      .eq('id', tenant_id)
    if (error) return json(500, { error: error.message })
    return json(200, { success: true })
  }

  // ============================================================
  // delete_tenant — 店舗を削除
  // ============================================================
  if (action === 'delete_tenant') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { tenant_id } = payload
    if (!tenant_id) return json(400, { error: 'tenant_id は必須です' })

    // スタッフが存在する場合は削除不可
    const { count } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
    if ((count ?? 0) > 0) {
      return json(400, { error: 'スタッフが存在するテナントは削除できません' })
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('id', tenant_id)
    if (error) return json(500, { error: error.message })
    return json(200, { success: true })
  }

  return json(400, { error: `不明なアクション: ${action}` })
})

// ============================================================
// ヘルパー: LINE ブロードキャスト送信
// ============================================================
async function sendLine(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  message: string,
): Promise<void> {
  try {
    const { data: settings } = await supabase
      .from('settings')
      .select('line_token')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    const token = (settings?.line_token as string | undefined)?.trim()
    if (!token) return

    await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ type: 'text', text: message }] }),
    })
  } catch {
    // LINE 送信失敗はメイン処理を止めない
  }
}
