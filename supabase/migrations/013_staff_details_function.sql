-- ============================================================
-- 013_staff_details_function.sql
-- スタッフ詳細取得関数（email / last_sign_in_at を含む）
--
-- auth.users は anon キーから直接参照できないため、
-- SECURITY DEFINER 関数経由で公開する。
-- has_tenant_access() による RLS フィルタ込み。
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_staff_details()
RETURNS TABLE (
  id              uuid,
  tenant_id       uuid,
  name            text,
  role            text,
  is_active       boolean,
  created_at      timestamptz,
  email           text,
  last_sign_in_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.tenant_id,
    u.name,
    u.role,
    u.is_active,
    u.created_at,
    au.email::text,
    au.last_sign_in_at
  FROM public.users u
  LEFT JOIN auth.users au ON au.id = u.id
  WHERE public.has_tenant_access(u.tenant_id)
  ORDER BY u.created_at
$$;
