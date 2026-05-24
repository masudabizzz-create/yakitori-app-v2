-- ============================================================
-- 004_new_roles_and_invitations.sql
-- 新ロール追加 & スタッフ招待テーブル
-- Supabase Dashboard の SQL Editor で実行する
-- ============================================================

-- --------------------
-- users.role の CHECK 制約を拡張
-- 既存の admin / manager / user は引き続き有効（後方互換）
-- --------------------
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check,
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('super_admin', 'tenant_admin', 'admin', 'manager', 'user', 'kitchen', 'hall'));

-- --------------------
-- user_invitations（スタッフ招待・承認フロー）
-- --------------------
CREATE TABLE IF NOT EXISTS user_invitations (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email        text NOT NULL,
  name         text NOT NULL,
  role         text NOT NULL
                 CHECK (role IN ('super_admin', 'tenant_admin', 'admin', 'manager', 'user', 'kitchen', 'hall')),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by   uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by  uuid REFERENCES auth.users(id),
  reviewed_at  timestamptz,
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invitations_tenant_status
  ON user_invitations(tenant_id, status);

-- --------------------
-- RLS for user_invitations
-- --------------------
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- admin 以上は同テナントの招待を参照可能
CREATE POLICY "invitations_select_admin" ON user_invitations
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('super_admin', 'tenant_admin', 'admin')
  );

-- admin 以上は招待を作成可能
CREATE POLICY "invitations_insert_admin" ON user_invitations
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('super_admin', 'tenant_admin', 'admin')
  );

-- admin 以上はステータス更新可能（承認・拒否）
CREATE POLICY "invitations_update_admin" ON user_invitations
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('super_admin', 'tenant_admin', 'admin')
  );

-- --------------------
-- tenants: admin が新テナントを作成・更新できるポリシーを追加
-- （manage-users Edge Function は service_role を使用するため RLS をバイパス可）
-- --------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenants_insert_admin'
  ) THEN
    EXECUTE 'CREATE POLICY "tenants_insert_admin" ON tenants
      FOR INSERT WITH CHECK (
        public.current_user_role() IN (''super_admin'', ''admin'')
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenants_update_admin'
  ) THEN
    EXECUTE 'CREATE POLICY "tenants_update_admin" ON tenants
      FOR UPDATE USING (
        public.current_user_role() IN (''super_admin'', ''tenant_admin'', ''admin'')
      )';
  END IF;
END $$;
