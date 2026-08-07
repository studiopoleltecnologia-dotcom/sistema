-- ============================================================
-- Análises (v1) — Central de Alertas + horários/modalidade/professor
--
-- Nenhuma tabela nova: tudo é view/função sobre o que já existe
-- (turmas, agendamentos, presenças), mesmo padrão de vw_ocupacao_turma
-- e vw_pagamento_professoras. No volume de uma MEI, recomputar é
-- instantâneo — não há necessidade de cache/tabela de insights.
--
-- Módulo puramente operacional (sem valor financeiro), então lê
-- vw_professoras_nomes (não a tabela professoras, que é gestão-only
-- desde 20260721160000) — mesmo padrão da Agenda.
--
-- "Insuficiente" é o retorno deliberado quando não há ocorrências
-- bastantes num período: a tela precisa dizer "sem dado ainda" em vez
-- de forçar tendência sobre os poucos registros de teste do banco
-- hoje (ver docs/05-BACKLOG.md — operação real ainda no Wix).
-- ============================================================

-- ------------------------------------------------------------
-- 1) fn_ocupacao_turma — generaliza vw_ocupacao_turma (fixa em 56
-- dias) para um intervalo [p_inicio, p_fim) qualquer. Base para o
-- filtro de período e para comparar dois períodos (tendência).
-- ------------------------------------------------------------
create or replace function public.fn_ocupacao_turma(p_inicio date, p_fim date)
returns table (
  turma_id uuid,
  modalidade text,
  modalidade_id uuid,
  professora_id uuid,
  dia_semana integer,
  horario time,
  capacidade integer,
  ocorrencias int,
  reservas int,
  ocupacao_pct int
)
language sql
stable
set search_path = ''
as $$
  with janela as (
    select generate_series(p_inicio, p_fim - 1, interval '1 day')::date as dia
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
      and a.data >= p_inicio
      and a.data < p_fim
    group by a.turma_id
  )
  select
    t.id,
    t.modalidade,
    t.modalidade_id,
    t.professora_id,
    t.dia_semana,
    t.horario,
    t.capacidade,
    coalesce(o.n_ocorrencias, 0),
    coalesce(r.n_reservas, 0),
    case
      when coalesce(o.n_ocorrencias, 0) * t.capacidade > 0
      then round(100.0 * coalesce(r.n_reservas, 0) / (o.n_ocorrencias * t.capacidade))::int
      else 0
    end
  from public.turmas t
  left join ocorrencias o on o.turma_id = t.id
  left join reservas r on r.turma_id = t.id
  where t.ativa;
$$;

comment on function public.fn_ocupacao_turma(date, date) is
  'Ocupacao por turma num periodo [inicio, fim) qualquer. Base de vw_ocupacao_turma e das analises de tendencia.';

revoke execute on function public.fn_ocupacao_turma(date, date) from public, anon;
grant execute on function public.fn_ocupacao_turma(date, date) to authenticated;

-- vw_ocupacao_turma (Agenda → Ocupação) vira um wrapper fino, mesmo
-- resultado de antes, zero duplicação de lógica.
create or replace view public.vw_ocupacao_turma
with (security_invoker = true) as
select turma_id, modalidade, dia_semana, horario, capacidade, ocorrencias, reservas, ocupacao_pct
from public.fn_ocupacao_turma((current_date - 56)::date, current_date);

comment on view public.vw_ocupacao_turma is
  'Ocupacao media por turma nas ultimas 8 semanas (wrapper de fn_ocupacao_turma). Operacional.';

grant select on public.vw_ocupacao_turma to authenticated;

-- ------------------------------------------------------------
-- 2) vw_ocupacao_turma_tendencia — compara dois períodos de 28 dias
-- (atual vs. anterior) por turma. "insuficiente" quando faltam pelo
-- menos 2 ocorrências em algum dos dois períodos.
-- ------------------------------------------------------------
create or replace view public.vw_ocupacao_turma_tendencia
with (security_invoker = true) as
select
  atual.turma_id,
  atual.modalidade,
  atual.modalidade_id,
  atual.professora_id,
  atual.dia_semana,
  atual.horario,
  atual.capacidade,
  atual.ocorrencias as ocorrencias_atual,
  atual.reservas as reservas_atual,
  atual.ocupacao_pct as ocupacao_atual_pct,
  anterior.ocorrencias as ocorrencias_anterior,
  anterior.reservas as reservas_anterior,
  anterior.ocupacao_pct as ocupacao_anterior_pct,
  (atual.ocupacao_pct - anterior.ocupacao_pct) as delta_pp,
  case
    when atual.ocorrencias < 2 or anterior.ocorrencias < 2 then 'insuficiente'
    when (atual.ocupacao_pct - anterior.ocupacao_pct) >= 15 then 'crescendo'
    when (atual.ocupacao_pct - anterior.ocupacao_pct) <= -15 then 'caindo'
    else 'estavel'
  end as tendencia
from public.fn_ocupacao_turma((current_date - 28)::date, current_date) atual
join public.fn_ocupacao_turma((current_date - 56)::date, (current_date - 28)::date) anterior
  on anterior.turma_id = atual.turma_id;

comment on view public.vw_ocupacao_turma_tendencia is
  'Ocupacao das ultimas 4 semanas vs. as 4 anteriores, por turma. tendencia=insuficiente quando falta ocorrencia nos dois periodos.';

grant select on public.vw_ocupacao_turma_tendencia to authenticated;

-- ------------------------------------------------------------
-- 3) vw_analise_modalidade — ocupação (ponderada por vaga, não média
-- simples de %), alunas novas e taxa de falta por modalidade.
-- ------------------------------------------------------------
create or replace view public.vw_analise_modalidade
with (security_invoker = true) as
with ocupacao as (
  select
    mo.id as modalidade_id,
    mo.nome as modalidade,
    count(*) as turmas,
    sum(t.ocorrencias_atual) as ocorrencias_atual,
    sum(t.ocorrencias_anterior) as ocorrencias_anterior,
    case when sum(t.ocorrencias_atual * t.capacidade) > 0
      then round(100.0 * sum(t.reservas_atual) / sum(t.ocorrencias_atual * t.capacidade))::int
      else 0 end as ocupacao_atual_pct,
    case when sum(t.ocorrencias_anterior * t.capacidade) > 0
      then round(100.0 * sum(t.reservas_anterior) / sum(t.ocorrencias_anterior * t.capacidade))::int
      else 0 end as ocupacao_anterior_pct
  from public.vw_ocupacao_turma_tendencia t
  join public.modalidades mo on mo.id = t.modalidade_id
  group by mo.id, mo.nome
),
presencas_periodo as (
  select
    tu.modalidade_id,
    count(*) filter (where p.presente) as presentes,
    count(*) filter (where not p.presente) as faltas
  from public.presencas p
  join public.turmas tu on tu.id = p.turma_id
  where p.data_aula >= (current_date - 28) and p.data_aula < current_date
  group by tu.modalidade_id
),
primeira_presenca as (
  select distinct on (p.cliente_id) p.cliente_id, p.data_aula, p.turma_id
  from public.presencas p
  where p.presente
  order by p.cliente_id, p.data_aula asc
),
alunas_novas as (
  select tu.modalidade_id, count(*) as novas
  from primeira_presenca pp
  join public.turmas tu on tu.id = pp.turma_id
  where pp.data_aula >= (current_date - 28) and pp.data_aula < current_date
  group by tu.modalidade_id
)
select
  o.modalidade_id,
  o.modalidade,
  o.turmas,
  o.ocupacao_atual_pct,
  o.ocupacao_anterior_pct,
  (o.ocupacao_atual_pct - o.ocupacao_anterior_pct) as delta_pp,
  case
    when o.ocorrencias_atual = 0 or o.ocorrencias_anterior = 0 then 'insuficiente'
    when (o.ocupacao_atual_pct - o.ocupacao_anterior_pct) >= 15 then 'crescendo'
    when (o.ocupacao_atual_pct - o.ocupacao_anterior_pct) <= -15 then 'caindo'
    else 'estavel'
  end as tendencia,
  coalesce(pp.presentes, 0) as presentes_periodo,
  coalesce(pp.faltas, 0) as faltas_periodo,
  case when coalesce(pp.presentes, 0) + coalesce(pp.faltas, 0) > 0
    then round(100.0 * coalesce(pp.faltas, 0) / (coalesce(pp.presentes, 0) + coalesce(pp.faltas, 0)))::int
    else null end as taxa_falta_pct,
  coalesce(an.novas, 0) as alunas_novas_periodo
from ocupacao o
left join presencas_periodo pp on pp.modalidade_id = o.modalidade_id
left join alunas_novas an on an.modalidade_id = o.modalidade_id;

comment on view public.vw_analise_modalidade is
  'Ocupacao, tendencia, alunas novas e taxa de falta por modalidade (ultimas 4 semanas vs. 4 anteriores).';

grant select on public.vw_analise_modalidade to authenticated;

-- ------------------------------------------------------------
-- 4) vw_analise_professora — por (professora, modalidade): ocupação
-- própria vs. média da modalidade, taxa de falta, alunas novas.
-- Nome vem de vw_professoras_nomes (professoras é gestão-only).
-- ------------------------------------------------------------
create or replace view public.vw_analise_professora
with (security_invoker = true) as
with ocupacao as (
  select
    t.professora_id,
    t.modalidade_id,
    count(*) as turmas,
    sum(t.ocorrencias_atual) as ocorrencias_atual,
    sum(t.ocorrencias_anterior) as ocorrencias_anterior,
    case when sum(t.ocorrencias_atual * t.capacidade) > 0
      then round(100.0 * sum(t.reservas_atual) / sum(t.ocorrencias_atual * t.capacidade))::int
      else 0 end as ocupacao_atual_pct,
    case when sum(t.ocorrencias_anterior * t.capacidade) > 0
      then round(100.0 * sum(t.reservas_anterior) / sum(t.ocorrencias_anterior * t.capacidade))::int
      else 0 end as ocupacao_anterior_pct
  from public.vw_ocupacao_turma_tendencia t
  where t.modalidade_id is not null
  group by t.professora_id, t.modalidade_id
),
presencas_periodo as (
  select
    p.professora_id,
    tu.modalidade_id,
    count(*) filter (where p.presente) as presentes,
    count(*) filter (where not p.presente) as faltas
  from public.presencas p
  join public.turmas tu on tu.id = p.turma_id
  where p.data_aula >= (current_date - 28) and p.data_aula < current_date
  group by p.professora_id, tu.modalidade_id
),
primeira_presenca as (
  select distinct on (p.cliente_id) p.cliente_id, p.data_aula, p.turma_id, p.professora_id
  from public.presencas p
  where p.presente
  order by p.cliente_id, p.data_aula asc
),
alunas_novas as (
  select pp.professora_id, tu.modalidade_id, count(*) as novas
  from primeira_presenca pp
  join public.turmas tu on tu.id = pp.turma_id
  where pp.data_aula >= (current_date - 28) and pp.data_aula < current_date
  group by pp.professora_id, tu.modalidade_id
)
select
  pr.id as professora_id,
  pr.nome as professora,
  mo.id as modalidade_id,
  mo.nome as modalidade,
  o.turmas,
  o.ocupacao_atual_pct,
  o.ocupacao_anterior_pct,
  (o.ocupacao_atual_pct - o.ocupacao_anterior_pct) as delta_pp,
  case
    when o.ocorrencias_atual = 0 or o.ocorrencias_anterior = 0 then 'insuficiente'
    when (o.ocupacao_atual_pct - o.ocupacao_anterior_pct) >= 15 then 'crescendo'
    when (o.ocupacao_atual_pct - o.ocupacao_anterior_pct) <= -15 then 'caindo'
    else 'estavel'
  end as tendencia,
  am.ocupacao_atual_pct as media_modalidade_pct,
  (o.ocupacao_atual_pct - am.ocupacao_atual_pct) as vs_modalidade_pp,
  coalesce(pp2.presentes, 0) as presentes_periodo,
  coalesce(pp2.faltas, 0) as faltas_periodo,
  case when coalesce(pp2.presentes, 0) + coalesce(pp2.faltas, 0) > 0
    then round(100.0 * coalesce(pp2.faltas, 0) / (coalesce(pp2.presentes, 0) + coalesce(pp2.faltas, 0)))::int
    else null end as taxa_falta_pct,
  coalesce(an.novas, 0) as alunas_novas_periodo
from ocupacao o
join public.vw_professoras_nomes pr on pr.id = o.professora_id
join public.modalidades mo on mo.id = o.modalidade_id
left join public.vw_analise_modalidade am on am.modalidade_id = o.modalidade_id
left join presencas_periodo pp2 on pp2.professora_id = o.professora_id and pp2.modalidade_id = o.modalidade_id
left join alunas_novas an on an.professora_id = o.professora_id and an.modalidade_id = o.modalidade_id;

comment on view public.vw_analise_professora is
  'Por professora+modalidade: ocupacao propria vs. media da modalidade, falta e alunas novas. Nome via vw_professoras_nomes (professoras e gestao-only).';

grant select on public.vw_analise_professora to authenticated;

-- ------------------------------------------------------------
-- 5) vw_analise_resumo — cards do topo que não vêm de agregação
-- client-side simples (ocupação geral e horários críticos/lotados a
-- tela soma a partir de vw_ocupacao_turma_tendencia, como o
-- OcupacaoView já faz).
-- ------------------------------------------------------------
create or replace view public.vw_analise_resumo
with (security_invoker = true) as
with periodo as (
  select (current_date - 28)::date as inicio, current_date as fim
),
agend as (
  select
    count(*) filter (where status = 'cancelado' and cancelado_em >= (select inicio from periodo)) as cancelados,
    count(*) filter (
      where status = 'agendado'
        or (status = 'cancelado' and cancelado_em >= (select inicio from periodo))
    ) as base
  from public.agendamentos
  where data >= (select inicio from periodo) and data < (select fim from periodo)
)
select
  (select count(*) from public.matriculas where status = 'ativa') as alunos_ativos,
  (select count(*) from public.matriculas
    where criada_em >= (select inicio from periodo) and criada_em < (select fim from periodo)) as novos_alunos_periodo,
  case when ag.base > 0 then round(100.0 * ag.cancelados / ag.base)::int else 0 end as taxa_cancelamento_pct
from agend ag;

comment on view public.vw_analise_resumo is
  'Cards de resumo do modulo Analises: alunos ativos, novas matriculas e cancelamento nas ultimas 4 semanas.';

grant select on public.vw_analise_resumo to authenticated;

-- ------------------------------------------------------------
-- 6) vw_alertas — regras (não ML) sobre 2/3/4. severidade em
-- verde/amarelo/vermelho; origem_tipo+origem_id permitem ao front
-- destacar a linha de origem ao clicar no alerta.
-- ------------------------------------------------------------
create or replace view public.vw_alertas
with (security_invoker = true) as
select
  'turma'::text as origem_tipo,
  t.turma_id as origem_id,
  case
    when t.ocupacao_atual_pct >= 85 then 'verde'
    when t.tendencia = 'caindo' and t.delta_pp <= -20 then 'amarelo'
    else 'vermelho'
  end as severidade,
  'horario'::text as categoria,
  case
    when t.ocupacao_atual_pct >= 85 then
      t.modalidade || ' de ' ||
      (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[t.dia_semana + 1] ||
      ' às ' || to_char(t.horario, 'HH24:MI') || ' está quase lotada (' || t.ocupacao_atual_pct ||
      '%). Considere abrir outro horário.'
    when t.tendencia = 'caindo' and t.delta_pp <= -20 then
      t.modalidade || ' de ' ||
      (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[t.dia_semana + 1] ||
      ' às ' || to_char(t.horario, 'HH24:MI') || ' caiu de ' || t.ocupacao_anterior_pct || '% para ' ||
      t.ocupacao_atual_pct || '% de ocupação nas últimas semanas.'
    else
      t.modalidade || ' de ' ||
      (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[t.dia_semana + 1] ||
      ' às ' || to_char(t.horario, 'HH24:MI') || ' está com ocupação abaixo de 40% há quase 2 meses. ' ||
      'Vale repensar o horário.'
  end as texto
from public.vw_ocupacao_turma_tendencia t
where t.tendencia <> 'insuficiente'
  and (
    t.ocupacao_atual_pct >= 85
    or (t.tendencia = 'caindo' and t.delta_pp <= -20)
    or (t.ocupacao_atual_pct < 40 and t.ocupacao_anterior_pct < 40)
  )

union all

select
  'modalidade'::text,
  m.modalidade_id,
  case when m.tendencia = 'crescendo' then 'verde' else 'amarelo' end,
  'modalidade'::text,
  case
    when m.tendencia = 'crescendo' then
      m.modalidade || ' cresceu ' || m.delta_pp || ' pontos de ocupação nas últimas semanas.'
    else
      m.modalidade || ' caiu ' || abs(m.delta_pp) || ' pontos de ocupação nas últimas semanas.'
  end
from public.vw_analise_modalidade m
where m.tendencia <> 'insuficiente'
  and abs(m.delta_pp) >= 20

union all

select
  'professora'::text,
  pf.professora_id,
  case
    when pf.tendencia = 'caindo' and pf.delta_pp <= -20 then 'vermelho'
    when pf.vs_modalidade_pp >= 20 then 'verde'
    else 'amarelo'
  end,
  'professora'::text,
  case
    when pf.tendencia = 'caindo' and pf.delta_pp <= -20 then
      'Aulas de ' || pf.professora || ' em ' || pf.modalidade || ' caíram ' || abs(pf.delta_pp) ||
      ' pontos de ocupação nas últimas semanas.'
    when pf.vs_modalidade_pp >= 20 then
      'Aulas de ' || pf.professora || ' em ' || pf.modalidade || ' têm ocupação ' || pf.vs_modalidade_pp ||
      ' pontos acima da média da modalidade.'
    else
      'Aulas de ' || pf.professora || ' em ' || pf.modalidade || ' têm ocupação ' || abs(pf.vs_modalidade_pp) ||
      ' pontos abaixo da média da modalidade.'
  end
from public.vw_analise_professora pf
where pf.tendencia <> 'insuficiente'
  and (
    (pf.tendencia = 'caindo' and pf.delta_pp <= -20)
    or abs(pf.vs_modalidade_pp) >= 20
  );

comment on view public.vw_alertas is
  'Central de alertas: regras de limiar (nao ML) sobre ocupacao/tendencia de turma, modalidade e professora.';

grant select on public.vw_alertas to authenticated;
