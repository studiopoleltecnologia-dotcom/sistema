-- MRR (receita recorrente mensal) dos mensalistas.
--
-- Cada matrícula ativa vale, por mês, o preço de UM ciclo normalizado para 30
-- dias (`preco_centavos * 30 / vigencia_dias`). Assim:
--   - plano mensal (30 dias)     -> conta a mensalidade cheia;
--   - semestral (ciclo de 30d)   -> conta a mensalidade cheia (é a mesma
--     mensalidade cobrada 6x — CLAUDE.md §9.4), NÃO o pacote inteiro;
--   - pacote de 90 dias          -> conta 1/3 por mês (receita diluída).
--
-- É métrica financeira: só gestão vê. A view é `security_invoker` e ainda se
-- autofiltra por is_gestao() no WHERE — assim, mesmo que a secretaria (que lê
-- matriculas) consulte, recebe uma linha de zeros, nunca o faturamento. Segue
-- o padrão trancado-no-banco do Financeiro (CLAUDE.md §5.2).
--
-- Sempre devolve exatamente 1 linha (agregação sem group by) — casa com o
-- .single() do front, igual a vw_saldo_caixa.

create or replace view public.vw_mrr
with (security_invoker = true) as
with cfg as (
  select
    date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date as ini_mes,
    (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) + interval '1 month')::date as prox_mes
),
base as (
  select
    m.cliente_id,
    m.status,
    m.data_fim,
    m.criada_em,
    round(p.preco_centavos::numeric * 30 / greatest(p.vigencia_dias, 1))::bigint as mensal_centavos
  from public.matriculas m
  join public.planos p on p.id = m.plano_id
  where public.is_gestao()
)
select
  -- Receita recorrente: soma mensalizada das matrículas ativas.
  coalesce(sum(mensal_centavos) filter (where status = 'ativa'), 0)::bigint as mrr_centavos,
  count(distinct cliente_id) filter (where status = 'ativa')::int as clientes_ativos,
  case
    when count(distinct cliente_id) filter (where status = 'ativa') > 0
    then round(
      coalesce(sum(mensal_centavos) filter (where status = 'ativa'), 0)::numeric
      / count(distinct cliente_id) filter (where status = 'ativa')
    )::bigint
    else 0
  end as ticket_medio_centavos,
  -- Entradas do mês (novos mensalistas) — crescimento do MRR.
  count(*) filter (
    where status = 'ativa' and criada_em >= (select ini_mes from cfg)
  )::int as novos_mes,
  coalesce(sum(mensal_centavos) filter (
    where status = 'ativa' and criada_em >= (select ini_mes from cfg)
  ), 0)::bigint as mrr_novos_centavos,
  -- MRR em risco: quem está inadimplente (ciclo não pago) e pode cair.
  count(*) filter (where status = 'inadimplente')::int as inadimplentes,
  coalesce(sum(mensal_centavos) filter (where status = 'inadimplente'), 0)::bigint as mrr_em_risco_centavos,
  -- Renovações que vencem dentro do mês corrente — receita a confirmar.
  count(*) filter (
    where status = 'ativa'
      and data_fim >= (select ini_mes from cfg)
      and data_fim < (select prox_mes from cfg)
  )::int as renovacoes_mes,
  coalesce(sum(mensal_centavos) filter (
    where status = 'ativa'
      and data_fim >= (select ini_mes from cfg)
      and data_fim < (select prox_mes from cfg)
  ), 0)::bigint as mrr_renovacoes_centavos
from base;

comment on view public.vw_mrr is
  'Receita recorrente mensal (MRR) dos mensalistas, mensalizada por vigencia_dias. Gestão-only (is_gestao() no WHERE). 1 linha.';

grant select on public.vw_mrr to authenticated;
