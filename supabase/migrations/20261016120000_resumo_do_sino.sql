-- ============================================================
-- O resumo do sino: os nomes primeiro
-- 05/10/2026
-- ============================================================
-- Achado na homologação do bloco 21, rodando o fluxo do convidado ponta
-- a ponta no DEV. A notificação saiu assim:
--
--   Convidado esperando confirmação
--   Ana Clara · Dança do Ventre · quinta 18:30 · Sala 2 · Multi · Beatriz
--
-- O rótulo da turma tem cinco palavras e fica no MEIO, entre os dois
-- nomes. Como a linha é truncada na largura do sino, o que sobra na tela
-- é "Ana Clara · Dança do Ventre · quinta 18:30 · Sa…" — some justamente
-- o nome da convidada, que é a informação que identifica o caso.
--
-- A ordem passa a ser: **quem, com quem, e só então onde.** A turma
-- continua na linha para quem abrir num monitor largo, mas a tela para
-- onde o clique leva mostra tudo mesmo.
-- ============================================================

create or replace function public.resumo_notificacao(p_dados jsonb)
returns text
language sql
immutable
set search_path to ''
as $function$
  select nullif(
    array_to_string(
      array_remove(array[
        nullif(btrim(coalesce(p_dados->>'nome', '')), ''),
        nullif(btrim(coalesce(p_dados->>'convidado', '')), ''),
        nullif(btrim(coalesce(p_dados->>'plano',
                     coalesce(p_dados->>'produto', p_dados->>'turma'))), '')
      ], null),
      ' · '),
    '');
$function$;

comment on function public.resumo_notificacao(jsonb) is
  'A linha curta do sino, montada do mesmo `dados` que o e-mail usa: quem, com quem, e só então onde. A ordem importa porque a linha é truncada na largura do painel.';

revoke execute on function public.resumo_notificacao(jsonb) from public, anon;
grant execute on function public.resumo_notificacao(jsonb) to authenticated;
