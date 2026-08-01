-- Análise de ocupação das turmas — "turma cheia → abrir horário; vazia →
-- repensar". Ocupação média das últimas 8 semanas por turma recorrente:
--   ocupacao_pct = reservas ativas / (ocorrências do dia da semana × capacidade)
--
-- As ocorrências vêm do calendário (generate_series), não dos agendamentos —
-- senão uma aula sem ninguém não contaria e a ocupação sairia inflada.
-- Conta reservas 'agendado' (demanda), inclui todos os canais (mensalista +
-- Wellhub disputam a mesma vaga, CLAUDE.md §9.1). Dado operacional, sem valor
-- financeiro: security_invoker respeita o RLS de turmas/agendamentos.

create or replace view public.vw_ocupacao_turma
with (security_invoker = true) as
with janela as (
  select generate_series(
    (current_date - interval '56 days')::date,
    (current_date - interval '1 day')::date,
    interval '1 day'
  )::date as dia
),
ocorrencias as (
  select t.id as turma_id, count(*)::int as n_ocorrencias
  from public.turmas t
  join janela j on extract(dow from j.dia)::int = t.dia_semana
  where t.ativa
  group by t.id
),
reservas as (
  select a.turma_id, count(*)::int as n_reservas
  from public.agendamentos a
  where a.status = 'agendado'
    and a.data >= (current_date - interval '56 days')::date
    and a.data < current_date
  group by a.turma_id
)
select
  t.id as turma_id,
  t.modalidade,
  t.dia_semana,
  t.horario,
  t.capacidade,
  coalesce(o.n_ocorrencias, 0) as ocorrencias,
  coalesce(r.n_reservas, 0) as reservas,
  case
    when coalesce(o.n_ocorrencias, 0) * t.capacidade > 0
    then round(100.0 * coalesce(r.n_reservas, 0) / (o.n_ocorrencias * t.capacidade))::int
    else 0
  end as ocupacao_pct
from public.turmas t
left join ocorrencias o on o.turma_id = t.id
left join reservas r on r.turma_id = t.id
where t.ativa;

comment on view public.vw_ocupacao_turma is
  'Ocupacao media por turma nas ultimas 8 semanas (reservas ativas / ocorrencias x capacidade). Operacional.';

grant select on public.vw_ocupacao_turma to authenticated;
