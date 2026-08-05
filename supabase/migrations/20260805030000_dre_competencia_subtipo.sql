-- DrePage.tsx agrupa despesa por tipo_saida (Fixo Recorrente / Fixo
-- Planejado / Variável) antes de por categoria — mesma UX de hoje, só
-- trocando caixa por competência. vw_dre_competencia (Fase B) não
-- carregava essa informação; adiciona subtipo (null para receita).
create or replace view public.vw_dre_competencia
with (security_invoker = true) as
select
  date_trunc('month', data_competencia)::date as mes,
  'receita'::text as tipo,
  categoria::text as categoria,
  sum(valor_centavos)::bigint as total_centavos,
  count(*) as lancamentos,
  null::text as subtipo
from public.entradas_financeiras
where status <> 'cancelada'
group by 1, 3

union all

select
  date_trunc('month', s.data_competencia)::date as mes,
  'despesa'::text as tipo,
  cs.nome as categoria,
  sum(s.valor_centavos)::bigint as total_centavos,
  count(*) as lancamentos,
  cs.tipo::text as subtipo
from public.saidas_financeiras s
join public.categorias_saida cs on cs.id = s.categoria_id
where s.status_saida <> 'cancelada'
group by 1, 3, cs.tipo;

comment on view public.vw_dre_competencia is
  'Receita e despesa por mes de competencia (independente de status). subtipo = tipo_saida (so despesa), para agrupar como o DRE ja fazia.';
