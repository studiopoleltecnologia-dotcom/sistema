-- ============================================================
-- Prever o repasse Wellhub de um mês, sem fingir que é check-in
-- ============================================================
-- O que a gestão tentou fazer e o sistema não deixou: "quero estimar
-- quanto a Wellhub vai repassar em dezembro". A única porta era lançar
-- uma entrada da categoria `wellhub` em Entradas — e aí duas coisas
-- davam errado:
--
--  1. a aba Wellhub lista TODA entrada `wellhub` + `prevista` e chama
--     cada uma de "check-in". A previsão do mês inteiro (R$ 3.360) virou
--     "1 check-in de R$ 3.360", e duas tentativas viraram "2 check-ins ·
--     estimado R$ 6.720". O número do topo passou a somar previsão com
--     previsão;
--  2. `conciliar_wellhub()` distribuía o repasse real entre essas mesmas
--     linhas, isto é, tratava a previsão como se fosse uma visita de
--     aluno. Com check-ins de verdade no mês, o mesmo dinheiro entraria
--     duas vezes no caixa e no teto MEI.
--
-- A diferença entre as duas coisas já existe na tabela e ninguém estava
-- usando: **check-in tem `presenca_id`; previsão do mês, não.**
--
-- ------------------------------------------------------------
-- As duas naturezas, e por que as duas precisam existir
-- ------------------------------------------------------------
--  · **check-in a reconciliar** — nasce de `integrar_presenca()`, um por
--    visita, valorizado pelo plano do assinante. É a previsão *derivada*;
--  · **previsão do repasse** — uma linha por competência, digitada pela
--    gestão. É a previsão *declarada*, e hoje é a única que existe de
--    fato: a integração ainda não alimenta presença em produção, então
--    sem ela o fluxo de caixa simplesmente não enxerga a Wellhub.
--
-- Elas não se somam: são duas estimativas do MESMO dinheiro. A tela
-- mostra as duas lado a lado e o fechamento usa uma ou outra.
--
-- ------------------------------------------------------------
-- O que acontece quando o repasse real chega
-- ------------------------------------------------------------
--  · **com check-ins no mês:** o real se distribui entre eles (como já
--    era) e a previsão declarada é **cancelada** — ela cumpriu o papel
--    de segurar o valor no fluxo de caixa até o dinheiro existir;
--  · **sem check-ins:** a própria previsão declarada vira a entrada
--    recebida, com o valor real. É o caso de hoje.
--
-- Em nenhum dos dois a previsão declarada vira receita *além* dos
-- check-ins. Esse era o risco.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Lançar (ou corrigir) a previsão do mês
-- ------------------------------------------------------------
-- Idempotente por competência, e é isso que conserta a duplicação: uma
-- competência tem UM repasse, logo tem no máximo uma previsão. Chamar de
-- novo corrige o valor em vez de criar outra linha.
--
-- Se já houver mais de uma previsão manual no mês (o estrago que a porta
-- antiga permitia), a função consolida: mantém a mais antiga com o valor
-- novo e apaga as demais, devolvendo quantas removeu para a tela contar
-- o que fez. O apagão é estreito de propósito — só linha da categoria
-- `wellhub`, ainda `prevista` e **sem `presenca_id`**. Nunca encosta num
-- check-in nem em entrada já recebida.
create or replace function public.prever_repasse_wellhub(
  p_mes date,
  p_valor_centavos bigint,
  p_data_prevista date default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  ini date := date_trunc('month', p_mes)::date;
  fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  -- Regra de repasse (§12.6): cai todo dia 15 do mês seguinte.
  venc date := coalesce(p_data_prevista, (ini + interval '1 month' + interval '14 days')::date);
  v_id uuid;
  v_removidas integer := 0;
begin
  -- Dinheiro é gestão (§5.2). A função é `definer`, então a RLS de
  -- `entradas_financeiras` não é consultada — esta linha é o portão.
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'apenas a gestão lança previsão de receita';
  end if;

  if p_valor_centavos is null or p_valor_centavos <= 0 then
    raise exception 'o valor previsto precisa ser maior que zero';
  end if;

  select id into v_id
  from public.entradas_financeiras
  where categoria = 'wellhub'
    and status = 'prevista'
    and presenca_id is null
    and data_competencia >= ini and data_competencia < fim
  order by criada_em
  limit 1;

  if v_id is null then
    insert into public.entradas_financeiras
      (descricao, categoria, status, valor_centavos,
       data_competencia, data_prevista, data_caixa)
    values
      (format('Previsão do repasse Wellhub %s', to_char(ini, 'MM/YYYY')),
       'wellhub', 'prevista', p_valor_centavos,
       ini, venc, null)
    returning id into v_id;
  else
    update public.entradas_financeiras
    set valor_centavos = p_valor_centavos,
        data_prevista = venc,
        descricao = format('Previsão do repasse Wellhub %s', to_char(ini, 'MM/YYYY'))
    where id = v_id;

    with extras as (
      delete from public.entradas_financeiras
      where categoria = 'wellhub'
        and status = 'prevista'
        and presenca_id is null
        and data_competencia >= ini and data_competencia < fim
        and id <> v_id
      returning 1
    )
    select count(*) into v_removidas from extras;
  end if;

  return jsonb_build_object(
    'entrada_id', v_id,
    'competencia', to_char(ini, 'YYYY-MM'),
    'valor_centavos', p_valor_centavos,
    'vence_em', venc,
    'duplicadas_removidas', v_removidas);
end;
$fn$;

comment on function public.prever_repasse_wellhub(date, bigint, date) is
  'Lanca ou corrige a UNICA previsao declarada do repasse Wellhub de uma competencia (entrada wellhub '
  'prevista sem presenca_id, vencendo dia 15 do mes seguinte). Idempotente: chamar de novo corrige o '
  'valor e consolida duplicatas, em vez de criar outra linha.';

revoke all on function public.prever_repasse_wellhub(date, bigint, date) from public, anon;
grant execute on function public.prever_repasse_wellhub(date, bigint, date) to authenticated;


-- Desfazer a previsão (o mês que não vai ter repasse, ou o valor que a
-- gestão desistiu de estimar). Só a linha declarada; check-in não sai
-- por aqui.
create or replace function public.remover_previsao_repasse_wellhub(p_mes date)
returns integer
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  ini date := date_trunc('month', p_mes)::date;
  fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  n integer;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'apenas a gestão lança previsão de receita';
  end if;

  with mortas as (
    delete from public.entradas_financeiras
    where categoria = 'wellhub'
      and status = 'prevista'
      and presenca_id is null
      and data_competencia >= ini and data_competencia < fim
    returning 1
  )
  select count(*) into n from mortas;

  return n;
end;
$fn$;

comment on function public.remover_previsao_repasse_wellhub(date) is
  'Apaga a previsao declarada do repasse de uma competencia. Nao toca em check-in (presenca_id nao nulo) '
  'nem em entrada recebida.';

revoke all on function public.remover_previsao_repasse_wellhub(date) from public, anon;
grant execute on function public.remover_previsao_repasse_wellhub(date) to authenticated;


-- ------------------------------------------------------------
-- 2. A competência vista pela tela, com as duas naturezas separadas
-- ------------------------------------------------------------
-- Existe para a tela parar de somar coisas diferentes. Antes ela
-- agrupava as entradas e chamava o total de "estimado"; agora cada
-- competência diz quantos check-ins tem, quanto eles valem, e qual é a
-- previsão declarada — três números que não se misturam.
create or replace view public.vw_wellhub_competencias
with (security_invoker = true) as
select
  to_char(e.data_competencia, 'YYYY-MM') as competencia,
  count(*) filter (where e.presenca_id is not null) as check_ins,
  coalesce(sum(e.valor_centavos) filter (where e.presenca_id is not null), 0) as checkins_centavos,
  coalesce(sum(e.valor_centavos) filter (where e.presenca_id is null), 0) as previsao_centavos,
  count(*) filter (where e.presenca_id is null) as linhas_previsao,
  min(e.data_prevista) filter (where e.presenca_id is null) as previsao_vence_em
from public.entradas_financeiras e
where e.categoria = 'wellhub' and e.status = 'prevista'
group by to_char(e.data_competencia, 'YYYY-MM');

comment on view public.vw_wellhub_competencias is
  'Por competencia Wellhub em aberto: check-ins a reconciliar (quantos e quanto) e a previsao declarada '
  'da gestao, SEPARADOS. Sao duas estimativas do mesmo dinheiro — somar as duas conta duas vezes.';

grant select on public.vw_wellhub_competencias to authenticated;


-- ------------------------------------------------------------
-- 3. A conciliação para de tratar previsão como visita
-- ------------------------------------------------------------
-- Reescrita de 20261019120000. O miolo (distribuição proporcional ao
-- previsto de cada check-in, sobra de arredondamento no primeiro,
-- retrato por plano antes do update) é o mesmo. Muda quem entra na
-- conta:
--
--  · **check-ins** (`presenca_id` não nulo) recebem o rateio;
--  · a **previsão declarada** é cancelada quando havia check-ins, ou
--    vira ela própria a entrada recebida quando não havia nenhum.
--
-- Cancelar e não apagar: a linha continua no histórico da competência
-- dizendo o que se esperava, que é a informação que explica a diferença
-- entre previsto e real meses depois.
--
-- A trava de acesso subiu de `is_socia()` para `is_gestao()`: a função é
-- `definer`, então ela — e não a RLS — é o portão, e isto grava receita
-- (§5.2). A secretária não fecha repasse.
create or replace function public.conciliar_wellhub(
  p_mes date,
  p_valor_total_centavos bigint,
  p_data_caixa date default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ini date := date_trunc('month', p_mes)::date;
  fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  dcaixa date := coalesce(p_data_caixa, current_date);
  n integer;
  previsto bigint;
  distribuido bigint := 0;
  primeiro uuid;
  detalhe jsonb;
  r record;
  parte bigint;
  n_previsoes integer;
  previsto_declarado bigint;
  v_previsao uuid;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'apenas a gestão fecha o repasse';
  end if;
  if p_valor_total_centavos <= 0 then
    raise exception 'valor do repasse deve ser maior que zero';
  end if;

  -- Os check-ins de verdade.
  select count(*), coalesce(sum(valor_centavos), 0)
    into n, previsto
  from public.entradas_financeiras
  where categoria = 'wellhub' and status = 'prevista' and presenca_id is not null
    and data_competencia >= ini and data_competencia < fim;

  -- A previsão declarada pela gestão.
  select count(*), coalesce(sum(valor_centavos), 0)
    into n_previsoes, previsto_declarado
  from public.entradas_financeiras
  where categoria = 'wellhub' and status = 'prevista' and presenca_id is null
    and data_competencia >= ini and data_competencia < fim;

  if n = 0 and n_previsoes = 0 then
    raise exception
      'nada a conciliar na competência % — não há check-in registrado nem previsão lançada',
      to_char(ini, 'MM/YYYY');
  end if;

  -- ---- Caminho A: sem check-in, a previsão declarada vira o recebido ----
  -- É o caso enquanto a integração não alimenta presença em produção:
  -- existe uma linha segurando o valor no fluxo de caixa, e o repasse
  -- real chegou. Ela vira a entrada de verdade, com o valor de verdade.
  if n = 0 then
    select id into v_previsao
    from public.entradas_financeiras
    where categoria = 'wellhub' and status = 'prevista' and presenca_id is null
      and data_competencia >= ini and data_competencia < fim
    order by criada_em
    limit 1;

    update public.entradas_financeiras
    set valor_centavos = p_valor_total_centavos,
        status = 'recebida',
        data_caixa = dcaixa,
        descricao = format('Repasse Wellhub %s', to_char(ini, 'MM/YYYY'))
    where id = v_previsao;

    -- Qualquer previsão extra do mês sai de cena: o repasse é um só.
    update public.entradas_financeiras
    set status = 'cancelada'
    where categoria = 'wellhub' and status = 'prevista' and presenca_id is null
      and data_competencia >= ini and data_competencia < fim
      and id <> v_previsao;

    return jsonb_build_object(
      'modo', 'previsao_declarada',
      'check_ins', 0,
      'previsto_centavos', previsto_declarado,
      'real_centavos', p_valor_total_centavos,
      'diferenca_centavos', p_valor_total_centavos - previsto_declarado,
      'previsoes_canceladas', greatest(n_previsoes - 1, 0),
      'por_plano', '[]'::jsonb);
  end if;

  -- ---- Caminho B: há check-ins; o real se distribui entre eles ----
  if p_valor_total_centavos < n then
    raise exception 'valor menor que o número de check-ins (%) — concilie manualmente', n;
  end if;

  -- O retrato por plano ANTES de mexer: depois do update os valores já
  -- são os reais, e a comparação deixaria de existir.
  select jsonb_agg(x order by x->>'plano') into detalhe
  from (
    select jsonb_build_object(
             'plano', coalesce(w.descricao, 'sem plano identificado'),
             'check_ins', count(*),
             'previsto_centavos', sum(e.valor_centavos)) as x
    from public.entradas_financeiras e
    join public.presencas pr on pr.id = e.presenca_id
    left join public.wellhub_planos w on w.product_id = pr.wellhub_product_id
    where e.categoria = 'wellhub' and e.status = 'prevista'
      and e.data_competencia >= ini and e.data_competencia < fim
    group by coalesce(w.descricao, 'sem plano identificado')
  ) s;

  select id into primeiro
  from public.entradas_financeiras
  where categoria = 'wellhub' and status = 'prevista' and presenca_id is not null
    and data_competencia >= ini and data_competencia < fim
  order by data_competencia, criada_em
  limit 1;

  -- Proporcional ao previsto. Sem previsão nenhuma (tudo zerado, ex.: mês
  -- só de primeiras visitas que ainda assim foram pagas), cai na divisão
  -- igual — é o melhor palpite possível quando não há proporção.
  for r in
    select id, valor_centavos
    from public.entradas_financeiras
    where categoria = 'wellhub' and status = 'prevista' and presenca_id is not null
      and data_competencia >= ini and data_competencia < fim
    order by data_competencia, criada_em
  loop
    parte := case
      when previsto > 0
        then (p_valor_total_centavos * r.valor_centavos) / previsto
      else p_valor_total_centavos / n
    end;
    update public.entradas_financeiras
    set valor_centavos = greatest(parte, 1),
        status = 'recebida',
        data_caixa = dcaixa
    where id = r.id;
    distribuido := distribuido + greatest(parte, 1);
  end loop;

  -- O arredondamento sobra (ou falta) no primeiro lançamento, para a soma
  -- bater com o repasse ao centavo.
  if distribuido <> p_valor_total_centavos then
    update public.entradas_financeiras
    set valor_centavos = greatest(valor_centavos + (p_valor_total_centavos - distribuido), 1)
    where id = primeiro;
  end if;

  -- A previsão declarada cumpriu o papel: segurou o valor no fluxo de
  -- caixa até o dinheiro existir. Agora o dinheiro está nos check-ins, e
  -- deixá-la aberta somaria o mesmo repasse duas vezes.
  update public.entradas_financeiras
  set status = 'cancelada'
  where categoria = 'wellhub' and status = 'prevista' and presenca_id is null
    and data_competencia >= ini and data_competencia < fim;

  return jsonb_build_object(
    'modo', 'check_ins',
    'check_ins', n,
    'previsto_centavos', previsto,
    'real_centavos', p_valor_total_centavos,
    'diferenca_centavos', p_valor_total_centavos - previsto,
    'previsoes_canceladas', n_previsoes,
    'por_plano', coalesce(detalhe, '[]'::jsonb));
end;
$function$;

comment on function public.conciliar_wellhub(date, bigint, date) is
  'Fecha a competencia com o valor do relatorio do Portal do Parceiro. Com check-ins, distribui '
  'PROPORCIONALMENTE ao previsto de cada um (planos valem diferente) e cancela a previsao declarada; '
  'sem check-ins, a propria previsao declarada vira a entrada recebida. Devolve previsto, real e a '
  'diferenca — e essa diferenca que diz se o preco combinado ainda esta valendo.';

revoke execute on function public.conciliar_wellhub(date, bigint, date) from public, anon;
grant execute on function public.conciliar_wellhub(date, bigint, date) to authenticated;
