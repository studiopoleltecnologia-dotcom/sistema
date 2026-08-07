-- ============================================================
-- Análises (v1.2) — Inteligência de Clientes
--
-- Destravado pela ficha 360° (C1): clientes em risco, sumidos e
-- ranking. Mesma filosofia do resto do módulo: regra de limiar,
-- sem ML, sem tabela nova. Risco e Sumidos ficam abertos a
-- gestão+secretaria (RLS de clientes/matriculas/presencas já é
-- is_socia()); Ranking usa faturamento — gestão-only, mesma trava
-- is_gestao() de entradas_financeiras (a view não precisa de policy
-- própria: é security_invoker, então some sozinha para quem não é
-- gestão, exatamente como as views financeiras já fazem).
-- ============================================================

-- ------------------------------------------------------------
-- 1) fn_analise_clientes_sumidos — matrícula ativa/inadimplente
-- mas sem aula há p_dias (configurável, default 20). "Sem aula" usa
-- clientes.ultima_aula; sem nenhuma aula ainda, conta a partir do
-- início da matrícula.
-- ------------------------------------------------------------
create or replace function public.fn_analise_clientes_sumidos(p_dias integer default 20)
returns table (
  cliente_id uuid,
  nome text,
  telefone text,
  ultima_aula date,
  dias_sem_aula integer,
  matricula_id uuid,
  plano_id uuid,
  saldo_creditos integer,
  data_fim date
)
language sql
stable
set search_path = ''
as $$
  select
    c.id,
    c.nome,
    c.telefone,
    c.ultima_aula,
    (current_date - coalesce(c.ultima_aula, m.data_inicio))::int,
    m.id,
    m.plano_id,
    coalesce(sc.saldo, 0),
    m.data_fim
  from public.clientes c
  join lateral (
    select mm.id, mm.data_inicio, mm.data_fim, mm.plano_id
    from public.matriculas mm
    where mm.cliente_id = c.id and mm.status in ('ativa', 'inadimplente')
    order by mm.data_fim desc
    limit 1
  ) m on true
  left join public.vw_saldo_creditos sc on sc.matricula_id = m.id
  where (current_date - coalesce(c.ultima_aula, m.data_inicio)) >= p_dias
  order by 5 desc;
$$;

comment on function public.fn_analise_clientes_sumidos(integer) is
  'Clientes com matricula ativa/inadimplente mas sem aula ha p_dias (default 20).';

revoke execute on function public.fn_analise_clientes_sumidos(integer) from public, anon;
grant execute on function public.fn_analise_clientes_sumidos(integer) to authenticated;

-- ------------------------------------------------------------
-- 2) vw_analise_clientes_risco — score por sinais (limiar, não ML):
-- queda de frequência (2pt), faltas recentes (2pt), vencimento
-- próximo (2pt), poucos créditos (1pt), sem interação (1pt).
-- prioridade: score>=4 alta, >=2 média, senão baixa. Só entra quem
-- tem pelo menos 1 sinal aceso.
-- ------------------------------------------------------------
create or replace view public.vw_analise_clientes_risco
with (security_invoker = true) as
with presencas_atual as (
  select cliente_id,
    count(*) filter (where presente) as presentes,
    count(*) filter (where not presente) as faltas
  from public.presencas
  where data_aula >= (current_date - 28) and data_aula < current_date
  group by cliente_id
),
presencas_anterior as (
  select cliente_id, count(*) filter (where presente) as presentes
  from public.presencas
  where data_aula >= (current_date - 56) and data_aula < (current_date - 28)
  group by cliente_id
),
matricula_ativa as (
  select distinct on (cliente_id) cliente_id, id as matricula_id, plano_id, data_fim
  from public.matriculas
  where status in ('ativa', 'inadimplente')
  order by cliente_id, data_fim desc
),
base as (
  select
    c.id as cliente_id,
    c.nome,
    c.telefone,
    ma.matricula_id,
    ma.plano_id,
    ma.data_fim,
    coalesce(sc.saldo, 0) as saldo_creditos,
    coalesce(pa.presentes, 0) as presentes_atual,
    coalesce(pant.presentes, 0) as presentes_anterior,
    coalesce(pa.faltas, 0) as faltas_atual,
    c.ultima_conversa,
    (coalesce(pant.presentes, 0) >= 2
      and coalesce(pa.presentes, 0) < coalesce(pant.presentes, 0) * 0.5) as queda_frequencia,
    (coalesce(pa.faltas, 0) >= 2) as faltas_recentes,
    (ma.data_fim - current_date between 0 and 7) as vencimento_proximo,
    (coalesce(sc.saldo, 0) <= 1 and ma.data_fim - current_date > 7) as poucos_creditos,
    (c.ultima_conversa is null or current_date - c.ultima_conversa > 30) as sem_interacao
  from public.clientes c
  join matricula_ativa ma on ma.cliente_id = c.id
  left join presencas_atual pa on pa.cliente_id = c.id
  left join presencas_anterior pant on pant.cliente_id = c.id
  left join public.vw_saldo_creditos sc on sc.matricula_id = ma.matricula_id
)
select
  *,
  (queda_frequencia::int * 2 + faltas_recentes::int * 2 + vencimento_proximo::int * 2
    + poucos_creditos::int + sem_interacao::int) as score,
  case
    when (queda_frequencia::int * 2 + faltas_recentes::int * 2 + vencimento_proximo::int * 2
      + poucos_creditos::int + sem_interacao::int) >= 4 then 'alta'
    when (queda_frequencia::int * 2 + faltas_recentes::int * 2 + vencimento_proximo::int * 2
      + poucos_creditos::int + sem_interacao::int) >= 2 then 'media'
    else 'baixa'
  end as prioridade
from base
where queda_frequencia or faltas_recentes or vencimento_proximo or poucos_creditos or sem_interacao;

comment on view public.vw_analise_clientes_risco is
  'Clientes com pelo menos um sinal de risco (queda de frequencia, faltas, vencimento proximo, poucos creditos, sem interacao). Score de limiar, sem ML.';

grant select on public.vw_analise_clientes_risco to authenticated;

-- ------------------------------------------------------------
-- 3) vw_analise_clientes_ranking — maiores clientes. Mistura dado
-- operacional (tempo de casa, frequência) com financeiro
-- (faturamento) — por isso o uso pretendido é gestão-only na UI:
-- para quem não é gestão, a RLS de entradas_financeiras zera o
-- faturamento sem quebrar a query, mas o número ficaria enganoso
-- se exibido fora do contexto de gestão.
-- ------------------------------------------------------------
create or replace view public.vw_analise_clientes_ranking
with (security_invoker = true) as
select
  c.id as cliente_id,
  c.nome,
  (select min(m.data_inicio) from public.matriculas m where m.cliente_id = c.id) as aluno_desde,
  (select count(*) from public.matriculas m where m.cliente_id = c.id) as matriculas_total,
  (select coalesce(sum(greatest(m.ciclo_atual - 1, 0)), 0)::int
    from public.matriculas m where m.cliente_id = c.id) as ciclos_renovados,
  (select count(*) from public.presencas p
    where p.cliente_id = c.id and p.presente) as aulas_frequentadas,
  (select coalesce(sum(e.valor_centavos), 0)
    from public.entradas_financeiras e
    where e.cliente_id = c.id and e.status = 'recebida') as faturamento_centavos,
  (select count(*) from public.entradas_financeiras e
    where e.cliente_id = c.id and e.categoria in ('workshop', 'evento')
      and e.status = 'recebida') as workshops_eventos
from public.clientes c;

comment on view public.vw_analise_clientes_ranking is
  'Ranking de clientes: tempo de casa, renovacoes, frequencia e faturamento. Uso pretendido gestao-only (mistura dado financeiro).';

grant select on public.vw_analise_clientes_ranking to authenticated;
