-- ContasPage.tsx (Fase C) precisa do categoria_id para reaproveitar
-- lancarRecorrente() ao clicar "Pagar" num item de origem 'recorrente'
-- vindo de vw_contas_a_pagar — a view só tinha o nome da categoria.
-- categoria_id entra ANTES de bucket (create or replace não permite
-- reordenar colunas existentes) — precisa dropar e recriar.
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
    d.categoria_id
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
    s.categoria_id
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
  *,
  case
    when vencimento < current_date then 'atrasada'
    when vencimento = current_date then 'hoje'
    when vencimento <= current_date + 6 then 'semana'
    when vencimento <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date then 'mes'
    else 'depois'
  end as bucket
from unidas;

comment on view public.vw_contas_a_pagar is
  'Recorrentes ainda nao lancadas no mes + saidas com status_saida=prevista (inclui a folha automatica de professora), com bucket de vencimento e categoria_id para lancar/pagar direto da tela.';
