-- ============================================================
-- Conta fixa: pular um mes, e destravar a correcao do valor
-- ============================================================
-- Duas queixas da mesma linha da tela (Saidas -> Fixo recorrente ->
-- A pagar): nao da para tirar a conta de um mes especifico, e as vezes
-- nao da nem para mudar o valor dela.
--
-- ------------------------------------------------------------
-- 1. A trava silenciosa: o indice unico ficou no recorte antigo
-- ------------------------------------------------------------
-- `saidas_recorrente_mes_unico` (20260719210000) garante "uma recorrente
-- por mes" comparando o MES DA DATA DE CAIXA. Em 20261109120000 a view
-- passou a excluir a projecao por COMPETENCIA, justamente porque pagar
-- adiantado grava o caixa no mes em que o dinheiro saiu. O indice ficou
-- para tras, e os dois passaram a discordar:
--
--   05/11: paga-se adiantado a conta de dezembro -> caixa 2026-11-05
--   a conta de NOVEMBRO continua projetada (competencia nov sem linha)
--   corrigir o valor dela insere caixa 2026-11-xx -> 23505 duplicate key
--
-- E o front nao mostra erro de gravacao: o numero volta sozinho ao que
-- era, como se o clique nao tivesse acontecido. Reproduzido no DEV em
-- 05/11/2026.
--
-- O indice passa a ser por `data_competencia` -- o mesmo recorte da view,
-- e o mesmo que as dividas ja adotaram em 20261105120000.
-- ------------------------------------------------------------

do $$
declare
  v_dup integer;
begin
  select count(*) into v_dup from (
    select recorrente_id, data_competencia
      from public.saidas_financeiras
     where recorrente_id is not null
     group by 1, 2
    having count(*) > 1
  ) x;

  if v_dup > 0 then
    raise exception
      'Ha % par(es) (recorrente, competencia) com mais de uma saida. Resolver a mao antes de trocar o indice -- o indice novo os recusaria.',
      v_dup;
  end if;
end $$;

drop index if exists public.saidas_recorrente_mes_unico;

create unique index saidas_recorrente_mes_unico
  on public.saidas_financeiras (recorrente_id, data_competencia)
  where recorrente_id is not null;

comment on index public.saidas_recorrente_mes_unico is
  'Uma recorrente por COMPETENCIA (nao por mes de caixa): pagar adiantado nao pode travar o mes seguinte.';

-- ------------------------------------------------------------
-- 2. Pular um mes = uma saida `cancelada`
-- ------------------------------------------------------------
-- "Em dezembro nao tem Marketing" nao e desativar a conta fixa (isso
-- mataria todos os meses) nem mexer na vigencia (data_fim encerra dali
-- em diante). E um buraco de um mes so.
--
-- Nao precisa de tabela nova: o enum `status_saida` ja tem 'cancelada',
-- ate hoje sem nenhum uso, e as quatro views que leem saidas ja o
-- ignoram -- DRE (<> 'cancelada'), saidas mensais e saldo de caixa
-- (= 'paga') e contas a pagar (= 'prevista'). Entao a linha cancelada
-- ocupa a competencia (a projecao some, pelo `not exists` da view) e nao
-- entra em nenhum numero. Reversivel: volta para 'prevista' e a conta
-- reaparece em A pagar.
--
-- A guarda no fim prova isso em vez de confiar na leitura.
-- ------------------------------------------------------------

-- `recorrente_id` passa a sair na view: a tela precisa saber se uma
-- saida PREVISTA veio de conta fixa para oferecer "pular este mes".
-- Numa parcela de divida a oferta seria errada -- o buraco ali e no
-- cronograma, e e a aba Dividas que manda nele.
create or replace view public.vw_contas_a_pagar
with (security_invoker = true) as
with meses as (
  -- O mes corrente e os 12 seguintes.
  select (date_trunc('month', current_date::timestamp) + make_interval(months => i))::date as mes
  from generate_series(0, 12) as i
),
recorrentes_pendentes as (
  select
    d.id,
    d.descricao,
    cs.nome as categoria,
    cs.tipo::text as tipo,
    d.valor_centavos,
    public.vencimento_no_mes(m.mes, d.dia_vencimento) as vencimento,
    'recorrente'::text as origem,
    d.categoria_id,
    null::uuid as divida_id,
    m.mes as competencia,
    d.id::text || ':' || to_char(m.mes, 'YYYY-MM') as chave,
    d.id as recorrente_id
  from public.despesas_recorrentes d
  join public.categorias_saida cs on cs.id = d.categoria_id
  cross join meses m
  where d.ativa
    and d.data_inicio <= (m.mes + interval '1 month' - interval '1 day')::date
    and (d.data_fim is null or d.data_fim >= m.mes)
    -- Qualquer linha na competencia tira a projecao: paga, prevista ou
    -- CANCELADA. E a cancelada que faz o mes pulado ficar pulado.
    and not exists (
      select 1
      from public.saidas_financeiras s
      where s.recorrente_id = d.id
        and s.data_competencia = m.mes
    )
),
saidas_previstas as (
  select
    s.id,
    s.descricao,
    cs.nome as categoria,
    cs.tipo::text as tipo,
    s.valor_centavos,
    coalesce(s.data_prevista, s.data_caixa) as vencimento,
    'saida'::text as origem,
    s.categoria_id,
    s.divida_id,
    s.data_competencia as competencia,
    s.id::text as chave,
    s.recorrente_id
  from public.saidas_financeiras s
  join public.categorias_saida cs on cs.id = s.categoria_id
  where s.status_saida = 'prevista'
),
unidas as (
  select * from recorrentes_pendentes
  union all
  select * from saidas_previstas
)
select
  id,
  descricao,
  categoria,
  tipo,
  valor_centavos,
  vencimento,
  origem,
  categoria_id,
  divida_id,
  case
    when vencimento < current_date then 'atrasada'::text
    when vencimento = current_date then 'hoje'::text
    when vencimento <= (current_date + 6) then 'semana'::text
    when vencimento <= (date_trunc('month', current_date::timestamp) + interval '1 month' - interval '1 day')::date
      then 'mes'::text
    else 'depois'::text
  end as bucket,
  competencia,
  chave,
  recorrente_id
from unidas;

comment on view public.vw_contas_a_pagar is
  'Contas a pagar: recorrentes projetadas do mes corrente ate 12 meses a frente (nunca para tras) + saidas previstas. A recorrente sai da projecao quando existe QUALQUER saida na competencia -- paga, prevista ou cancelada (mes pulado).';

-- ------------------------------------------------------------
-- 3. O saldo projetado tinha a mesma divergencia
-- ------------------------------------------------------------
-- `vw_saldo_caixa` descontava as recorrentes "ainda nao lancadas no mes"
-- comparando o mes de data_caixa. Pagar dezembro adiantado em novembro
-- fazia a conta de NOVEMBRO sumir do projetado sem ter sido paga -- o
-- saldo ficava otimista no valor do aluguel. Mesmo conserto: competencia.
-- Mes pulado continua fora da conta, que e o que se quer de um buraco.
-- ------------------------------------------------------------
create or replace view public.vw_saldo_caixa
with (security_invoker = true) as
with cfg as (
  select saldo_inicial_centavos, saldo_inicial_data from public.config_financeiro
),
recebidas as (
  select coalesce(sum(e.valor_centavos), 0)::bigint as total
  from public.entradas_financeiras e, cfg
  where e.status = 'recebida' and e.data_caixa >= cfg.saldo_inicial_data
),
pagas as (
  select coalesce(sum(s.valor_centavos), 0)::bigint as total
  from public.saidas_financeiras s, cfg
  where s.status_saida = 'paga' and s.data_caixa >= cfg.saldo_inicial_data
),
previstas as (
  select coalesce(sum(valor_centavos), 0)::bigint as total
  from public.entradas_financeiras
  where status = 'prevista'
),
saidas_previstas as (
  select coalesce(sum(valor_centavos), 0)::bigint as total
  from public.saidas_financeiras
  where status_saida = 'prevista'
),
recorrentes_pendentes as (
  select coalesce(sum(d.valor_centavos), 0)::bigint as total
  from public.despesas_recorrentes d
  where d.ativa
    and d.data_inicio <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
    and (d.data_fim is null or d.data_fim >= date_trunc('month', current_date)::date)
    and not exists (
      select 1 from public.saidas_financeiras s
      where s.recorrente_id = d.id
        and s.data_competencia = date_trunc('month', current_date)::date
    )
)
select
  (cfg.saldo_inicial_centavos + recebidas.total - pagas.total)::bigint
    as saldo_atual_centavos,
  previstas.total as previsto_em_aberto_centavos,
  (cfg.saldo_inicial_centavos + recebidas.total - pagas.total
   + previstas.total - recorrentes_pendentes.total - saidas_previstas.total)::bigint
    as saldo_projetado_centavos,
  recorrentes_pendentes.total as recorrentes_pendentes_mes_centavos,
  saidas_previstas.total as saidas_previstas_centavos
from cfg, recebidas, pagas, previstas, recorrentes_pendentes, saidas_previstas;

comment on view public.vw_saldo_caixa is
  'Saldo atual (caixa realizado) e projetado. O projetado soma entradas previstas e desconta saidas previstas + recorrentes VIGENTES sem linha na COMPETENCIA do mes (paga, prevista ou pulada).';

-- ------------------------------------------------------------
-- A guarda
-- ------------------------------------------------------------
-- Prova as tres coisas desta migration, em cima de dado de verdade
-- apagado no fim: que o indice deixou de recusar dois caixas no mesmo
-- mes para competencias diferentes; que uma saida 'cancelada' tira a
-- projecao do mes; e que ela nao mexe no saldo projetado nem no DRE.
-- ------------------------------------------------------------
do $$
declare
  v_rec public.despesas_recorrentes%rowtype;
  v_rec_id uuid;
  v_mes date;
  v_outro date;
  v_a uuid;
  v_b uuid;
  v_saldo_antes bigint;
  v_saldo_depois bigint;
  v_dre_antes bigint;
  v_dre_depois bigint;
  v_linhas integer;
begin
  -- A conta e os dois meses saem da PROPRIA view, nao de um palpite: assim
  -- a guarda nao quebra num banco onde a 1a recorrente ja tem lancamento
  -- no mes escolhido, ou vigencia que nao alcanca ele.
  --
  -- So meses FUTUROS. Pular o mes corrente muda o saldo projetado de
  -- proposito (a obrigacao deixou de existir), e a guarda compara saldo.
  select p.recorrente_id, min(p.competencia), max(p.competencia)
    into v_rec_id, v_mes, v_outro
    from public.vw_contas_a_pagar p
   where p.origem = 'recorrente'
     and p.competencia > date_trunc('month', current_date)::date
   group by p.recorrente_id
  having count(distinct p.competencia) >= 2
   order by p.recorrente_id
   limit 1;

  if v_rec_id is null then
    raise notice 'Sem conta fixa projetada em 2+ meses: guarda pulada.';
    return;
  end if;

  select * into v_rec from public.despesas_recorrentes where id = v_rec_id;

  select saldo_projetado_centavos into v_saldo_antes from public.vw_saldo_caixa;
  select coalesce(sum(total_centavos), 0)::bigint into v_dre_antes
    from public.vw_dre_competencia;

  -- Duas competencias distintas com caixa no MESMO mes: era exatamente o
  -- que o indice antigo recusava.
  insert into public.saidas_financeiras
    (descricao, valor_centavos, categoria_id, data_caixa, data_competencia,
     recorrente_id, status_saida)
  values ('guarda', v_rec.valor_centavos, v_rec.categoria_id, current_date,
          v_mes, v_rec.id, 'cancelada')
  returning id into v_a;

  insert into public.saidas_financeiras
    (descricao, valor_centavos, categoria_id, data_caixa, data_competencia,
     recorrente_id, status_saida)
  values ('guarda', v_rec.valor_centavos, v_rec.categoria_id, current_date,
          v_outro, v_rec.id, 'cancelada')
  returning id into v_b;

  select count(*) into v_linhas
    from public.vw_contas_a_pagar
   where recorrente_id = v_rec.id and competencia in (v_mes, v_outro);
  if v_linhas <> 0 then
    raise exception 'Mes pulado continuou aparecendo em contas a pagar (% linha(s)).', v_linhas;
  end if;

  select saldo_projetado_centavos into v_saldo_depois from public.vw_saldo_caixa;
  if v_saldo_depois <> v_saldo_antes then
    raise exception 'Saida cancelada mexeu no saldo projetado (% -> %).',
      v_saldo_antes, v_saldo_depois;
  end if;

  select coalesce(sum(total_centavos), 0)::bigint into v_dre_depois
    from public.vw_dre_competencia;
  if v_dre_depois <> v_dre_antes then
    raise exception 'Saida cancelada entrou no DRE (% -> %).', v_dre_antes, v_dre_depois;
  end if;

  delete from public.saidas_financeiras where id in (v_a, v_b);
end $$;
