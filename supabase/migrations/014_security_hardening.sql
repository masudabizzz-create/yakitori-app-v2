-- ============================================================
-- 014_security_hardening.sql
--
-- ⑤ user_tenant_permissions 自己付与防止
-- ⑦ audit_logs テーブル + insert_audit_log() 関数
-- ============================================================

-- ─── ⑤ user_tenant_permissions 書き込みポリシー強化 ─────────────
-- platform_admin も自分自身への権限付与は不可（自己昇格防止）
DROP POLICY IF EXISTS "utp_write" ON public.user_tenant_permissions;
CREATE POLICY "utp_write" ON public.user_tenant_permissions
  FOR ALL
  USING  (public.current_user_role() = 'platform_admin' AND user_id != auth.uid())
  WITH CHECK (public.current_user_role() = 'platform_admin' AND user_id != auth.uid());

-- ─── ⑦ audit_logs テーブル ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id      uuid,
  actor_name   text,
  action       text        NOT NULL,
  target_type  text,
  target_id    text,
  target_name  text,
  before_value jsonb,
  after_value  jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
  ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- platform_admin は全件閲覧、store_owner は自テナントのみ
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT USING (
    public.current_user_role() = 'platform_admin'
    OR (
      public.current_user_role() = 'store_owner'
      AND tenant_id = public.current_tenant_id()
    )
  );

-- ─── insert_audit_log() 関数 ─────────────────────────────────
-- SECURITY DEFINER: フロントエンドから安全に呼び出せる（RLS をバイパス）
-- user_id は auth.uid() を強制しているため、なりすましによるログ改ざんは不可
DROP FUNCTION IF EXISTS public.insert_audit_log(uuid, text, text, text, text, jsonb, jsonb, text);
CREATE OR REPLACE FUNCTION public.insert_audit_log(
  p_tenant_id    uuid    DEFAULT NULL,
  p_action       text    DEFAULT '',
  p_target_type  text    DEFAULT NULL,
  p_target_id    text    DEFAULT NULL,
  p_target_name  text    DEFAULT NULL,
  p_before_value jsonb   DEFAULT NULL,
  p_after_value  jsonb   DEFAULT NULL,
  p_actor_name   text    DEFAULT NULL
) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_logs
    (tenant_id, user_id, actor_name, action,
     target_type, target_id, target_name,
     before_value, after_value)
  VALUES
    (p_tenant_id, auth.uid(), p_actor_name, p_action,
     p_target_type, p_target_id, p_target_name,
     p_before_value, p_after_value);
$$;
