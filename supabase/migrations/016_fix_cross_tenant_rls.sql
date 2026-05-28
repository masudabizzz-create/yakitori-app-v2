-- ============================================================
-- 016_fix_cross_tenant_rls.sql
-- テナント横断アクセス時の RLS バグ修正
--
-- 問題:
--   1. users_select_same_tenant が厳しすぎるため、
--      platform_admin が別テナントに入店すると自分自身の
--      users レコードも見えなくなり appUser = null になる。
--   2. 串焼き本店以外のテナント（焼鳥つかだ渋谷等）に
--      settings 行が存在しないため .single() がエラーを返す。
-- ============================================================

-- ─── 1. users SELECT: 自分自身のレコードは常に参照可能に ──────────
DROP POLICY IF EXISTS "users_select_same_tenant" ON users;
CREATE POLICY "users_select_same_tenant" ON users
  FOR SELECT USING (
    -- 同じアクティブテナントのユーザー
    tenant_id = public.current_tenant_id()
    -- または自分自身（別テナント入店中でも自レコードを取得できる）
    OR id = auth.uid()
  );

-- ─── 2. 全テナントに settings 行を補完（存在しない場合のみ） ────────
INSERT INTO settings (tenant_id)
SELECT id
  FROM tenants
 WHERE id NOT IN (
   SELECT tenant_id FROM settings WHERE tenant_id IS NOT NULL
 )
ON CONFLICT (tenant_id) DO NOTHING;
