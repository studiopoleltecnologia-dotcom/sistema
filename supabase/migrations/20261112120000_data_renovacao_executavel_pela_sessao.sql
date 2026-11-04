-- ============================================================
-- A sessão precisa poder executar data_renovacao()
-- ============================================================
-- `vw_previsao_mensalidades` devolvia **403 Forbidden** para a gestão
-- logada, enquanto a mesma consulta rodada no SQL Editor devolvia as
-- linhas certas. A tela mostrava "nenhuma assinatura para projetar" e
-- parecia falta de dado — eram 24 matrículas no banco.
--
-- A causa: a view é `security_invoker = true` (como toda view financeira
-- aqui, para a RLS valer), e com isso **tudo** que ela usa por dentro é
-- executado com os privilégios de quem consulta — inclusive as FUNÇÕES.
-- `authenticated` tinha select nas quatro tabelas e na própria view, mas
-- não tinha execute em `public.data_renovacao()`.
--
-- Por que ninguém tropeçou nisso antes: até agora `data_renovacao()` só
-- era chamada de dentro de funções `security definer`
-- (`matricular_produto`, `renovar_ciclo`, `processar_assinaturas`), onde
-- o privilégio de quem chamou não é consultado. A view é a primeira a
-- chamá-la no privilégio da sessão.
--
-- ------------------------------------------------------------
-- Por que conceder, e não contornar
-- ------------------------------------------------------------
-- As alternativas seriam tornar a view `security definer` (perderia a
-- RLS — é o oposto do que a seção 3 do CLAUDE.md exige das views
-- financeiras) ou repetir a conta de data dentro da view (viraria a
-- segunda implementação da regra A17, e um dia as duas discordariam).
--
-- `data_renovacao()` é `immutable` e **não lê tabela nenhuma**: recebe
-- datas e devolve data. Não há o que vazar por ela. `anon` continua
-- de fora — quem não está logado não tem por que calcular ciclo.
-- ============================================================

grant execute on function
  public.data_renovacao(date, integer, integer, integer, integer)
  to authenticated;

comment on function public.data_renovacao(date, integer, integer, integer, integer) is
  'Data da renovacao que acontece p_ciclos ciclos depois de p_base (inicio de um ciclo). '
  'Em meses: no dia p_dia, ou no ultimo dia do mes que nao o tem. O fim do ciclo e essa data '
  'menos um. Unica conta de data de ciclo do banco (A17). '
  'Executavel por authenticated porque vw_previsao_mensalidades e security_invoker e a chama '
  'no privilegio da sessao; a funcao e immutable e nao le tabela nenhuma.';


-- ------------------------------------------------------------
-- A guarda
-- ------------------------------------------------------------
-- Prova a permissão que esta migration existe para dar, e varre as
-- demais funções que a view usa — para a próxima falha deste tipo
-- aparecer aqui, e não como um 403 numa tela vazia.
do $$
declare
  v_faltando text;
begin
  select string_agg(f, ', ') into v_faltando
  from unnest(array[
    'public.data_renovacao(date,integer,integer,integer,integer)',
    'public.is_gestao()'
  ]) as f
  where not has_function_privilege('authenticated', f, 'execute');

  if v_faltando is not null then
    raise exception
      'authenticated nao pode executar: % — vw_previsao_mensalidades vai dar 403', v_faltando;
  end if;

  -- anon não deve ganhar nada com isto.
  if has_function_privilege('anon', 'public.data_renovacao(date,integer,integer,integer,integer)', 'execute') then
    raise exception 'anon ganhou execute em data_renovacao() — nao era para isso acontecer';
  end if;

  -- E as tabelas que a view lê no privilégio da sessão.
  select string_agg(t, ', ') into v_faltando
  from unnest(array['public.matriculas','public.clientes','public.produtos',
                    'public.entradas_financeiras','public.vw_previsao_mensalidades']) as t
  where not has_table_privilege('authenticated', t, 'select');

  if v_faltando is not null then
    raise exception 'authenticated nao pode ler: %', v_faltando;
  end if;
end $$;
