-- ============================================================
-- Financeiro — 3 níveis de despesa (redesign do módulo)
-- Hoje `tipo_saida` só distingue fixa/variável. O pedido de negócio
-- separa em 3: Fixo Recorrente (mensal, automático — aluguel,
-- internet, contador, softwares), Fixo Planejado (não mensal, mas
-- previsto — manutenção, marketing, eventos) e Variável (operacional
-- — professoras, comissões, materiais).
-- ============================================================

alter type public.tipo_saida add value 'fixa_planejada';

-- Espelha vw_mix_receita_mensal (já existente para entradas), agora
-- para saídas por tipo — alimenta os gráficos de evolução/comparação
-- de despesas sem cálculo pesado no client (docs/03-DADOS-ANALITICOS).
create view public.vw_saidas_mensal
with (security_invoker = true) as
select
  cs.tipo,
  date_trunc('month', s.data_caixa)::date as mes,
  count(*) as lancamentos,
  sum(s.valor_centavos)::bigint as total_centavos
from public.saidas_financeiras s
join public.categorias_saida cs on cs.id = s.categoria_id
group by cs.tipo, 2;
