-- ============================================================
-- Corrige a 20260921120000, que não surtiu efeito nenhum.
--
-- Lá eu escrevi `revoke execute ... from anon, authenticated` e conferi
-- o resultado pelo Advisor: os quatro achados continuaram lá. O motivo,
-- visível no `proacl` das funções:
--
--   {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--    ^^^
--    esse `=X` sem nada antes do sinal de igual é o GRANT para PUBLIC
--
-- `anon` e `authenticated` nunca tiveram grant próprio — eles executam
-- **através** de PUBLIC, que é o padrão do Postgres para toda função
-- criada sem `revoke`. Revogar de quem nunca teve é no-op silencioso: o
-- comando não dá erro, não muda nada, e o `proacl` fica igual.
--
-- O que muda aqui: revoga de PUBLIC, que é onde o privilégio está.
-- `postgres` e `service_role` mantêm o grant explícito deles (o backend
-- usa service_role), e o gatilho continua disparando normalmente — o
-- Postgres não checa EXECUTE ao disparar trigger, ele roda como dono da
-- tabela.
--
-- Por que o laço em vez de listar nome por nome: são 15 funções, e todas
-- as 15 têm em comum exatamente uma coisa — retornam `trigger`. Essa é a
-- definição do conjunto que nunca deveria estar publicado como RPC, e
-- deixá-la expressa em SQL vale mais do que uma lista que envelhece.
-- As RPCs de verdade (agendar_aula, matricular, is_gestao...) têm grant
-- explícito para `authenticated` e não são tocadas aqui.
--
-- ⚠️ Isto não impede que a PRÓXIMA função de gatilho nasça com o mesmo
-- grant — o padrão do Postgres continua sendo PUBLIC. A trava definitiva
-- seria `alter default privileges ... revoke execute on functions from
-- public`, mas ela pegaria também as RPCs novas, que então parariam de
-- funcionar até alguém lembrar de dar o grant. Trocar uma falha silenciosa
-- por outra não melhora nada; fica como está, e o Advisor avisa.
-- ============================================================

do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
      and p.proacl::text like '{=X/%'
  loop
    execute format('revoke execute on function %s from public', f.assinatura);
    n := n + 1;
  end loop;
  raise notice 'EXECUTE revogado de PUBLIC em % função(ões) de gatilho', n;
end $$;
