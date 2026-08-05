-- Fase D (Calendário Financeiro): a tela precisa mostrar de qual mês de
-- competência cada recebimento/pagamento vem, para deixar visualmente
-- claro que "o dinheiro de agosto pertence à operação de julho".
-- Recorrentes não têm competência própria (é sempre o mês do vencimento).

create or replace view public.vw_contas_a_receber
with (security_invoker = true) as
select
  id,
  descricao,
  categoria::text as categoria,
  valor_centavos,
  coalesce(data_prevista, current_date) as vencimento,
  case
    when coalesce(data_prevista, current_date) < current_date then 'atrasada'
    when coalesce(data_prevista, current_date) = current_date then 'hoje'
    when coalesce(data_prevista, current_date) <= current_date + 6 then 'semana'
    when coalesce(data_prevista, current_date)
      <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date then 'mes'
    else 'depois'
  end as bucket,
  data_competencia as competencia
from public.entradas_financeiras
where status = 'prevista';

comment on view public.vw_contas_a_receber is
  'Entradas previstas (nao recebidas ainda), com bucket de vencimento e mes de competencia de origem.';

drop view if exists public.vw_contas_a_pagar;

create view public.vw_contas_a_pagar
with (security_invoker = true) as
with recorrentes_pendentes as (
  select
    d.id,
    d.descricao,
    cs.nome as categoria,
    d.valor_centavos,
    (date_trunc('month', current_date)::date + (d.dia_vencimento - 1)) as vencimento,
    'recorrente'::text as origem,
    d.categoria_id,
    (date_trunc('month', current_date)::date + (d.dia_vencimento - 1)) as competencia
  from public.despesas_recorrentes d
  join public.categorias_saida cs on cs.id = d.categoria_id
  where d.ativa
    and not exists (
      select 1 from public.saidas_financeiras s
      where s.recorrente_id = d.id
        and date_trunc('month', s.data_caixa) = date_trunc('month', current_date)
    )
),
saidas_previstas as (
  select
    s.id,
    s.descricao,
    cs.nome as categoria,
    s.valor_centavos,
    coalesce(s.data_prevista, s.data_caixa) as vencimento,
    'saida'::text as origem,
    s.categoria_id,
    s.data_competencia as competencia
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
  valor_centavos,
  vencimento,
  origem,
  categoria_id,
  case
    when vencimento < current_date then 'atrasada'
    when vencimento = current_date then 'hoje'
    when vencimento <= current_date + 6 then 'semana'
    when vencimento <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date then 'mes'
    else 'depois'
  end as bucket,
  competencia
from unidas;

comment on view public.vw_contas_a_pagar is
  'Recorrentes ainda nao lancadas no mes + saidas com status_saida=prevista (inclui a folha automatica de professora), com bucket de vencimento, categoria_id e mes de competencia de origem.';
