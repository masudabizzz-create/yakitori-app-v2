-- ============================================================
-- 017_active_tenant_sessions.sql
-- テナント切り替えを JWT ではなく DB テーブルで管理する
--
-- 背景:
--   supabase.auth.refreshSession() でリフレッシュトークンが
--   ローテートされ、並列処理で "Invalid Refresh Token" が頻発。
--   active_tenant_sessions テーブルに書き込むだけで即座に
--   current_tenant_id() の戻り値が変わるため、JWT の再発行が不要。
-- ============================================================

-- ─── 1. active_tenant_sessions テーブル ──────────────────────
CREATE TABLE IF NOT EXISTS public.active_tenant_sessions (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.active_tenant_sessions ENABLE ROW LEVEL SECURITY;

-- 自分自身のレコードのみ SELECT / DELETE 可能
-- INSERT / UPDATE はサービスロール（Edge Function）のみ
CREATE POLICY "ats_select_own" ON public.active_tenant_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "ats_delete_own" ON public.active_tenant_sessions
  FOR DELETE USING (user_id = auth.uid());

-- ─── 2. current_tenant_id() を active_tenant_sessions 優先に更新 ──
-- active_tenant_sessions に行があればそれを使い、なければ users.tenant_id にフォールバック
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tenant_id FROM public.active_tenant_sessions WHERE user_id = auth.uid()),
    (SELECT tenant_id FROM public.users           WHERE id      = auth.uid())
  )
$$;
