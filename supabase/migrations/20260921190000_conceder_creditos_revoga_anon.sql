-- ============================================================
-- Corrige o grant de `conceder_creditos`: faltava revogar de `anon`.
--
-- A migration 20260921180000 fez `revoke ... from public` e parou aí.
-- Só que no Supabase toda função nova nasce com EXECUTE **explícito**
-- para `anon` e `authenticated` (default privileges do projeto), e
-- revogar de PUBLIC não mexe em grant nominal. Resultado no DEV:
--
--   {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,...}
--
-- ou seja, `anon` podia chamar a RPC. Todas as outras 6 RPCs conferidas
-- (matricular, renovar_ciclo, cancelar_assinatura, marcar_inadimplente,
-- agendar_aula, promover_a_equipe) têm `anon = false`, porque o padrão
-- da casa desde 20260719120500 é `from public, anon` — as duas coisas.
--
-- Não era explorável: a primeira linha da função é `if not is_gestao()`
-- e, sem sessão, `auth.uid()` é nulo. Mas "não explorável hoje" é o
-- argumento que já falhou uma vez neste projeto (S10, em 21/09): o
-- revoke da 20260921120000 foi um no-op silencioso pelo motivo
-- espelhado — revogava de anon/authenticated quando quem tinha o
-- privilégio era PUBLIC. As duas metades da mesma lição.
-- ============================================================

revoke execute on function
  public.conceder_creditos(uuid, integer, text, date, public.motivo_credito)
  from public, anon;

do $$
declare pode boolean;
begin
  select has_function_privilege('anon', p.oid, 'execute') into pode
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'conceder_creditos';

  if pode then
    raise exception 'conceder_creditos continua executável por anon — o revoke não pegou.';
  end if;
  raise notice 'conceder_creditos: anon sem EXECUTE, authenticated mantido.';
end $$;
