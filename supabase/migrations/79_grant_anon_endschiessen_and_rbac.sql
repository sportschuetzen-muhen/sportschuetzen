-- ==============================================================================
-- 79_grant_anon_endschiessen_and_rbac.sql
-- Grant EXECUTE on rbac_allows & auth.has_role to anon role
-- Erlaubt der anonymen Rolle (öffentliche Website) das fehlerfreie Evaluieren von RLS-Policies
-- ==============================================================================

GRANT EXECUTE ON FUNCTION public.rbac_allows(text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.has_role(app_role) TO anon, authenticated;

GRANT SELECT ON public.endschiessen_seasons TO anon, authenticated;
GRANT SELECT ON public.endschiessen_stiche TO anon, authenticated;
GRANT SELECT ON public.endschiessen_scores TO anon, authenticated;
GRANT SELECT ON public.endschiessen_final_series TO anon, authenticated;
GRANT SELECT ON public.members TO anon, authenticated;
