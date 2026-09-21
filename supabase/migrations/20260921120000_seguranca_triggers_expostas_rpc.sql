-- ============================================================
-- Segurança: funções de TRIGGER estavam publicadas como RPC.
--
-- Contexto (Supabase Advisor, 21/09/2026). Dois lints novos desde a
-- revisão de 22/08 — eles não existiam no Advisor na época, o código
-- não mudou:
--   anon_security_definer_function_executable ......... 4 achados
--   authenticated_security_definer_function_executable  46 achados
--   function_search_path_mutable ...... preencher_competencia_saida
--
-- O PostgREST publica em /rest/v1/rpc/<nome> TODA função do schema
-- `public` que o role tiver EXECUTE. Como o EXECUTE nasce concedido a
-- PUBLIC no Postgres, as funções de gatilho entraram junto — e como
-- são SECURITY DEFINER, rodavam com o dono. Não havia exploração
-- prática (uma função de trigger chamada fora de um trigger falha ao
-- tocar em NEW/OLD), mas é superfície gratuita: qualquer anônimo com a
-- anon key conseguia invocar `POST /rest/v1/rpc/avaliar_faltas` e
-- provocar trabalho no banco. Nenhuma delas é chamada pelo front.
--
-- Os outros 46 achados de `authenticated_...` são as RPCs REAIS do
-- sistema (agendar_aula, matricular, is_gestao...). Elas PRECISAM
-- estar publicadas — é assim que os três portais conversam com o
-- banco. Quem filtra ali é a guarda interna de cada função + RLS,
-- não o GRANT. Ficam como estão, de caso pensado.
--
-- Ver docs/05-BACKLOG.md §2 (S10) e CLAUDE.md §5.1.
-- ============================================================

-- 1. Tira do PostgREST as 5 funções que só existem para rodar em
--    trigger. Revogar EXECUTE não afeta o gatilho: o Postgres não
--    checa privilégio de EXECUTE ao disparar um trigger, ele roda
--    como dono da tabela. Confirmado: todas retornam `trigger`.
revoke execute on function public.avaliar_faltas() from anon, authenticated;
revoke execute on function public.email_vaga_liberada() from anon, authenticated;
revoke execute on function public.email_confirmacao_agendamento() from anon, authenticated;
revoke execute on function public.sync_socia_email() from anon, authenticated;
revoke execute on function public.preencher_competencia_saida() from anon, authenticated;

-- 2. search_path fixo em preencher_competencia_saida. É a única função
--    do schema sem `search_path` definido (as demais já nascem com
--    search_path=''). Sem isso, quem controlar o search_path da sessão
--    escolhe qual tabela a função enxerga. Aqui vai `public, pg_temp`
--    em vez de '' para não precisar requalificar o corpo — a função é
--    SECURITY INVOKER, então o risco é menor e a correção é a mínima
--    que satisfaz o lint sem reescrever lógica financeira.
alter function public.preencher_competencia_saida() set search_path = public, pg_temp;

comment on function public.avaliar_faltas() is
  'Trigger em presencas (regra 4 do regulamento). EXECUTE revogado de anon/authenticated em 21/09/2026: é função de gatilho, nunca RPC — ver 20260921120000.';
comment on function public.email_vaga_liberada() is
  'Trigger que enfileira o e-mail de vaga liberada. EXECUTE revogado de anon/authenticated em 21/09/2026: é função de gatilho, nunca RPC.';
comment on function public.email_confirmacao_agendamento() is
  'Trigger que enfileira a confirmação de agendamento. EXECUTE revogado de anon/authenticated em 21/09/2026: é função de gatilho, nunca RPC.';
comment on function public.sync_socia_email() is
  'Trigger que mantém socias.email em sincronia com auth.users (ver 20260822120000). EXECUTE revogado de anon/authenticated em 21/09/2026.';
comment on function public.preencher_competencia_saida() is
  'Trigger que preenche a competência da saída financeira. EXECUTE revogado de anon/authenticated e search_path fixado em 21/09/2026.';
