// supabase/functions/manage-users/index.ts
//
// スタッフ・店舗管理 Edge Function
//
// 【認証不要（公開）アクション】
//   validate_token     - QRトークンの有効性確認
//   register_with_token - QRトークンで自己登録
//
// 【認証必須アクション】
//   create_qr_invitation - QRコード招待を発行
//   create_invitation   - スタッフ招待（メール方式・旧フロー）
//   approve_invitation  - 招待を承認（旧フロー）
//   reject_invitation   - 招待を拒否 / QRトークン無効化
//   delete_user        - スタッフ削除
//   force_signout      - 指定ユーザーのセッションを強制失効（⑥ セッション管理）
//   transfer_tenant    - スタッフの所属店舗を変更（manager 以上のみ）
//   create_tenant      - 新店舗作成
//   update_tenant      - 店舗名更新
//   delete_tenant      - 店舗削除
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

const ADMIN_ROLES = ['platform_admin', 'store_owner', 'manager']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
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

  // service_role クライアント（全アクションで使用）
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // ============================================================
  // validate_token — 公開: QRトークンの有効性を確認
  // ============================================================
  if (action === 'validate_token') {
    const { token } = payload
    if (!token) return json(400, { error: 'token は必須です' })

    const { data: inv, error: invErr } = await supabaseAdmin
      .from('user_invitations')
      .select('id, role, expires_at, tenant_id, tenants(name)')
      .eq('token', token)
      .eq('status', 'pending')
      .maybeSingle()

    if (invErr || !inv) {
      return json(404, { error: '無効なQRコードです（期限切れまたは使用済み）' })
    }
    if (inv.expires_at && new Date(inv.expires_at as string) < new Date()) {
      return json(400, { error: 'QRコードの有効期限が切れています' })
    }

    return json(200, {
      role: inv.role,
      tenant_name: (inv.tenants as { name: string } | null)?.name ?? '',
      expires_at: inv.expires_at,
    })
  }

  // ============================================================
  // register_with_token — 公開: QRトークンで自己登録
  // ============================================================
  if (action === 'register_with_token') {
    const { token, email, name, password } = payload
    if (!token || !email || !name || !password) {
      return json(400, { error: 'token, email, name, password は必須です' })
    }

    // トークン検証
    const { data: inv, error: invErr } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .maybeSingle()

    if (invErr || !inv) {
      return json(404, { error: '無効なQRコードです（期限切れまたは使用済み）' })
    }
    if (inv.expires_at && new Date(inv.expires_at as string) < new Date()) {
      return json(400, { error: 'QRコードの有効期限が切れています' })
    }

    // メール重複チェック
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const emailExists = existingUsers?.users?.some(
      (u) => u.email?.toLowerCase() === (email as string).toLowerCase(),
    )
    if (emailExists) {
      return json(400, { error: 'このメールアドレスはすでに登録されています' })
    }

    // Auth ユーザーを作成（email_confirm: true → 確認メールなしで即時有効化）
    const { data: newAuthUser, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: email as string,
        password: password as string,
        email_confirm: true,
      })
    if (createErr) {
      return json(500, { error: `ユーザー作成失敗: ${createErr.message}` })
    }

    // users テーブルに挿入
    const { error: insertErr } = await supabaseAdmin.from('users').insert({
      id: newAuthUser.user.id,
      tenant_id: inv.tenant_id,
      name: name,
      role: inv.role,
      is_active: true,
    })
    if (insertErr) {
      await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id)
      return json(500, { error: `ユーザー登録失敗: ${insertErr.message}` })
    }

    // トークンを使用済みに更新
    await supabaseAdmin
      .from('user_invitations')
      .update({
        status: 'used',
        email: email,
        name: name,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', inv.id)

    // 監査ログ（新規ユーザーの user_id で記録）
    await insertAuditLogEdge(supabaseAdmin, {
      tenantId: inv.tenant_id as string,
      userId: newAuthUser.user.id,
      actorName: name as string,
      action: 'user.register',
      targetType: 'user',
      targetId: newAuthUser.user.id,
      targetName: name as string,
      afterValue: { role: inv.role, email },
    })

    return json(200, { success: true })
  }

  // ============================================================
  // 以降のアクションはすべて JWT 認証が必要
  // ============================================================
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Missing Authorization header' })
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

  // ============================================================
  // create_qr_invitation — QRコード招待を発行
  // ============================================================
  if (action === 'create_qr_invitation') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { role, tenant_id } = payload
    if (!role) return json(400, { error: 'role は必須です' })

    const targetTenantId = (tenant_id as string | undefined) ?? callerTenantId
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
      .from('user_invitations')
      .insert({
        tenant_id: targetTenantId,
        role,
        status: 'pending',
        created_by: authData.user.id,
        token,
        expires_at: expiresAt,
      })
      .select()
      .single()
    if (error) return json(500, { error: error.message })

    await insertAuditLogEdge(supabaseAdmin, {
      tenantId: targetTenantId,
      userId: authData.user.id,
      actorName: callerName,
      action: 'invitation.create_qr',
      targetType: 'invitation',
      targetId: (data as { id?: string })?.id ?? null,
      afterValue: { role, expires_at: expiresAt },
    })

    return json(200, { token, expires_at: expiresAt, invitation: data })
  }

  // ============================================================
  // create_invitation — 招待を作成（メール方式・旧フロー）
  // ============================================================
  if (action === 'create_invitation') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { email, name, role } = payload
    if (!email || !name || !role) {
      return json(400, { error: 'email, name, role は必須です' })
    }

    // 既存ユーザーの重複チェック
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
  // approve_invitation — 招待を承認（招待メール自動送信）
  // ============================================================
  if (action === 'approve_invitation') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { invitation_id } = payload
    if (!invitation_id) return json(400, { error: 'invitation_id は必須です' })

    const { data: inv, error: invErr } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('id', invitation_id)
      .eq('status', 'pending')
      .single()
    if (invErr || !inv) {
      return json(404, { error: '招待が見つかりません（既に処理済みの可能性があります）' })
    }

    // inviteUserByEmail で Auth ユーザー作成 + 招待メール自動送信
    const { data: inviteData, error: createErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(inv.email as string, {
        data: { name: inv.name },
      })
    if (createErr) {
      return json(500, { error: `Auth ユーザー作成失敗: ${createErr.message}` })
    }

    const { error: insertErr } = await supabaseAdmin.from('users').insert({
      id: inviteData.user.id,
      tenant_id: inv.tenant_id,
      name: inv.name,
      role: inv.role,
      is_active: true,
    })
    if (insertErr) {
      await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
      return json(500, { error: `ユーザー登録失敗: ${insertErr.message}` })
    }

    await supabaseAdmin
      .from('user_invitations')
      .update({
        status: 'approved',
        reviewed_by: authData.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', invitation_id)

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
  // reject_invitation — 招待を拒否 / QRトークンを無効化
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

    // 削除前にユーザー情報を取得しておく（監査ログ用）
    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('name, tenant_id')
      .eq('id', user_id as string)
      .maybeSingle()

    const { error } = await supabaseAdmin.auth.admin.deleteUser(
      user_id as string,
    )
    if (error) return json(500, { error: error.message })

    await insertAuditLogEdge(supabaseAdmin, {
      tenantId: (targetUser?.tenant_id as string | null) ?? null,
      userId: authData.user.id,
      actorName: callerName,
      action: 'user.delete',
      targetType: 'user',
      targetId: user_id as string,
      targetName: (targetUser?.name as string | null) ?? null,
    })

    return json(200, { success: true })
  }

  // ============================================================
  // force_signout — 指定ユーザーのセッションを強制失効（⑥）
  // ============================================================
  if (action === 'force_signout') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { user_id } = payload
    if (!user_id) return json(400, { error: 'user_id は必須です' })

    // GoTrue Admin API: 指定ユーザーの全セッションを無効化
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const res = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${user_id as string}/logout`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
      },
    )
    if (!res.ok && res.status !== 404) {
      const body = await res.text()
      return json(500, { error: `セッション失効失敗: ${body}` })
    }
    return json(200, { success: true })
  }

  // ============================================================
  // transfer_tenant — スタッフの所属店舗を変更（manager 以上のみ）
  // ============================================================
  if (action === 'transfer_tenant') {
    // platform_admin / manager のみ（store_owner は不可）
    if (callerRole !== 'platform_admin' && callerRole !== 'manager') {
      return json(403, { error: 'マネージャー以上の権限が必要です' })
    }

    const { user_id, new_tenant_id } = payload
    if (!user_id || !new_tenant_id) {
      return json(400, { error: 'user_id と new_tenant_id は必須です' })
    }
    if (user_id === authData.user.id) {
      return json(400, { error: '自分自身は異動できません' })
    }

    // 対象ユーザー情報取得
    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('name, tenant_id, role')
      .eq('id', user_id as string)
      .maybeSingle()
    if (!targetUser) {
      return json(404, { error: 'ユーザーが見つかりません' })
    }

    // ロールランク（フロントエンドの ROLE_RANK と同じ値）
    const RANK: Record<string, number> = {
      platform_admin: 5,
      manager:        4,
      store_owner:    3,
      staff_both:     1,
      staff_kitchen:  1,
      staff_hall:     1,
    }
    const callerRank = RANK[callerRole] ?? 0
    const targetRank = RANK[targetUser.role as string] ?? 0
    if (targetRank >= callerRank) {
      return json(403, { error: '自分と同格以上のスタッフは異動できません' })
    }

    // 異動先が現在の所属店舗と同じ
    if (targetUser.tenant_id === new_tenant_id) {
      return json(400, { error: '現在の所属店舗と同じです' })
    }

    // manager はアクセス可能テナントのみ異動先として指定可
    if (callerRole === 'manager') {
      const { data: perms } = await supabaseAdmin
        .from('user_tenant_permissions')
        .select('tenant_id')
        .eq('user_id', authData.user.id)
      const accessibleIds = new Set([
        callerTenantId,
        ...((perms ?? []) as { tenant_id: string }[]).map((p) => p.tenant_id),
      ])
      if (!accessibleIds.has(new_tenant_id as string)) {
        return json(403, { error: 'このテナントへの異動権限がありません' })
      }
    }

    // users.tenant_id を更新
    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ tenant_id: new_tenant_id })
      .eq('id', user_id as string)
    if (updateErr) return json(500, { error: updateErr.message })

    // セッション強制失効（異動したスタッフは再ログインが必要）
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id as string}/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    })

    // 監査ログ（異動元テナントに記録）
    await insertAuditLogEdge(supabaseAdmin, {
      tenantId: targetUser.tenant_id as string,
      userId: authData.user.id,
      actorName: callerName,
      action: 'user.transfer',
      targetType: 'user',
      targetId: user_id as string,
      targetName: targetUser.name as string,
      beforeValue: { tenant_id: targetUser.tenant_id },
      afterValue: { tenant_id: new_tenant_id },
    })

    return json(200, { success: true })
  }

  // ============================================================
  // create_tenant — 新店舗を作成
  // ============================================================
  if (action === 'create_tenant') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { name, primary_color } = payload
    if (!name) return json(400, { error: 'name は必須です' })

    // primary_color 未指定時はパレットからランダムに選択
    const TENANT_PALETTE = [
      '#FF6B35', '#E85D04', '#F59E0B', '#16A34A', '#0D9488',
      '#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#0891B2',
    ]
    const resolvedColor = typeof primary_color === 'string' && /^#[0-9a-f]{6}$/i.test(primary_color)
      ? primary_color
      : TENANT_PALETTE[Math.floor(Math.random() * TENANT_PALETTE.length)]

    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .insert({ name, primary_color: resolvedColor })
      .select()
      .single()
    if (tenantErr) return json(500, { error: tenantErr.message })

    await supabaseAdmin
      .from('settings')
      .insert({ tenant_id: tenant.id })

    await insertAuditLogEdge(supabaseAdmin, {
      tenantId: (tenant as { id: string }).id,
      userId: authData.user.id,
      actorName: callerName,
      action: 'tenant.create',
      targetType: 'tenant',
      targetId: (tenant as { id: string }).id,
      targetName: name as string,
    })

    return json(200, { tenant })
  }

  // ============================================================
  // update_tenant — 店舗名・テーマカラーを更新
  // ============================================================
  if (action === 'update_tenant') {
    if (!isAdmin) return json(403, { error: '管理者権限が必要です' })
    const { tenant_id, name, primary_color } = payload
    if (!tenant_id || !name) {
      return json(400, { error: 'tenant_id と name は必須です' })
    }

    const updates: Record<string, unknown> = { name }
    if (typeof primary_color === 'string' && /^#[0-9a-f]{6}$/i.test(primary_color)) {
      updates.primary_color = primary_color
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
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

    await insertAuditLogEdge(supabaseAdmin, {
      tenantId: null,
      userId: authData.user.id,
      actorName: callerName,
      action: 'tenant.delete',
      targetType: 'tenant',
      targetId: tenant_id as string,
    })

    return json(200, { success: true })
  }

  return json(400, { error: `不明なアクション: ${action}` })
})

// ============================================================
// ヘルパー: 監査ログ記録（⑦）
// ============================================================
async function insertAuditLogEdge(
  supabase: ReturnType<typeof createClient>,
  params: {
    tenantId?: string | null
    userId: string
    actorName?: string | null
    action: string
    targetType?: string | null
    targetId?: string | null
    targetName?: string | null
    beforeValue?: unknown | null
    afterValue?: unknown | null
  },
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      tenant_id:    params.tenantId    ?? null,
      user_id:      params.userId,
      actor_name:   params.actorName   ?? null,
      action:       params.action,
      target_type:  params.targetType  ?? null,
      target_id:    params.targetId    ?? null,
      target_name:  params.targetName  ?? null,
      before_value: params.beforeValue ?? null,
      after_value:  params.afterValue  ?? null,
    })
  } catch {
    // 監査ログ失敗は本処理を止めない
  }
}

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
