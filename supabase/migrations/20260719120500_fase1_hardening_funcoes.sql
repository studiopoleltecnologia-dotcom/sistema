-- ============================================================
-- Hardening (advisors Supabase): funções SECURITY DEFINER não
-- devem ser executáveis via API REST (/rest/v1/rpc/...).
-- ============================================================

-- Trigger do Auth: só o supabase_auth_admin (dono do trigger em
-- auth.users) pode executar. Ninguém via API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Usada dentro das policies de RLS: precisa ser executável por
-- authenticated (policies rodam como o usuário da query), mas não
-- por anon — anon nunca é sócia.
revoke execute on function public.is_socia() from public, anon;
grant execute on function public.is_socia() to authenticated;
