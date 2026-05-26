/**
 * 監査ログ記録ユーティリティ
 *
 * insert_audit_log() SECURITY DEFINER 関数を呼び出す。
 * - user_id はサーバー側で auth.uid() に強制される（なりすまし防止）
 * - 失敗しても呼び出し元の処理は止めない（try-catch で吸収）
 */
import { supabase } from '@/lib/supabase'

export interface AuditLogParams {
  tenantId?: string | null
  action: string
  targetType?: string | null
  targetId?: string | null
  targetName?: string | null
  beforeValue?: unknown | null
  afterValue?: unknown | null
  actorName?: string | null
}

export async function insertAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await supabase.rpc('insert_audit_log', {
      p_tenant_id:    params.tenantId    ?? null,
      p_action:       params.action,
      p_target_type:  params.targetType  ?? null,
      p_target_id:    params.targetId    ?? null,
      p_target_name:  params.targetName  ?? null,
      p_before_value: params.beforeValue != null
        ? (params.beforeValue as object)
        : null,
      p_after_value:  params.afterValue != null
        ? (params.afterValue as object)
        : null,
      p_actor_name:   params.actorName   ?? null,
    })
  } catch {
    // 監査ログ記録失敗は本来の処理を止めない
  }
}
