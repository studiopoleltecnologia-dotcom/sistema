-- ============================================================
-- Análises (v1.1) — Evolução semanal + ação sugerida nos alertas
--
-- Continuação de 20260729120000. Client Intelligence (score/sumidos)
-- e Previsões continuam fora: dependem de C1 (ficha 360 unificada) e
-- de meses de dado real, respectivamente (ver docs/05-BACKLOG.md).
-- Rankings e filtros de modalidade/professora não precisam de SQL
-- novo — são leitura/ordenação das views já existentes, resolvidos
-- no front.
-- ============================================================

-- ------------------------------------------------------------
-- 1) fn_evolucao_semanal — série semanal (ocupação, novos alunos,
-- cancelamentos, presenças/faltas) para os gráficos de evolução.
-- Semanas cheias (segunda a domingo), a semana corrente (em
-- andamento) não entra para não comparar bucket incompleto.
-- ------------------------------------------------------------
create or replace function public.fn_evolucao_semanal(p_semanas integer default 12)
returns table (
  semana_inicio date,
  semana_fim date,
  ocupacao_pct int,
  novos_alunos int,
  cancelamentos int,
  presentes int,
  faltas int
)
language sql
stable
set search_path = ''
as $$
  with semanas as (
    select (date_trunc('week', current_date)::date - (n * 7)) as inicio
    from generate_series(1, greatest(p_semanas, 1)) as n
  ),
  ocupacao as (
    select s.inicio, o.ocorrencias, o.reservas, o.capacidade
    from semanas s
    cross join lateral public.fn_ocupacao_turma(s.inicio, s.inicio + 7) o
  ),
  ocupacao_agg as (
    select
      inicio,
      case when sum(ocorrencias * capacidade) > 0
        then round(100.0 * sum(reservas) / sum(ocorrencias * capacidade))::int
        else 0 end as ocupacao_pct
    from ocupacao
    group by inicio
  ),
  novos as (
    select s.inicio, count(m.id)::int as n
    from semanas s
    left join public.matriculas m
      on m.criada_em >= s.inicio and m.criada_em < s.inicio + 7
    group by s.inicio
  ),
  cancel as (
    select s.inicio, count(a.id)::int as n
    from semanas s
    left join public.agendamentos a
      on a.status = 'cancelado'
      and a.cancelado_em >= s.inicio and a.cancelado_em < s.inicio + 7
    group by s.inicio
  ),
  pres as (
    select
      s.inicio,
      count(*) filter (where p.presente)::int as presentes,
      count(*) filter (where not p.presente)::int as faltas
    from semanas s
    left join public.presencas p
      on p.data_aula >= s.inicio and p.data_aula < s.inicio + 7
    group by s.inicio
  )
  select
    s.inicio,
    (s.inicio + 6)::date,
    coalesce(oa.ocupacao_pct, 0),
    coalesce(n.n, 0),
    coalesce(c.n, 0),
    coalesce(pr.presentes, 0),
    coalesce(pr.faltas, 0)
  from semanas s
  left join ocupacao_agg oa on oa.inicio = s.inicio
  left join novos n on n.inicio = s.inicio
  left join cancel c on c.inicio = s.inicio
  left join pres pr on pr.inicio = s.inicio
  order by s.inicio;
$$;

comment on function public.fn_evolucao_semanal(integer) is
  'Serie semanal (ocupacao, novos alunos, cancelamentos, presencas/faltas) para o grafico de evolucao. Semana corrente (incompleta) fica de fora.';

revoke execute on function public.fn_evolucao_semanal(integer) from public, anon;
grant execute on function public.fn_evolucao_semanal(integer) to authenticated;

-- ------------------------------------------------------------
-- 2) vw_alertas ganha acao_sugerida — rótulo curto e acionável ao
-- lado do texto explicativo (seção 8 do pedido original: sugestão +
-- motivo). Mesmas condições de antes, só acrescenta a coluna.
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
  end as texto,
  case
    when t.ocupacao_atual_pct >= 85 then 'Abrir novo horário'
    when t.tendencia = 'caindo' and t.delta_pp <= -20 then 'Investigar a queda'
    else 'Repensar o horário'
  end as acao_sugerida
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
  end,
  case
    when m.tendencia = 'crescendo' then 'Divulgar a modalidade / avaliar novo horário'
    else 'Investigar a queda da modalidade'
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
  end,
  case
    when pf.tendencia = 'caindo' and pf.delta_pp <= -20 then 'Conversar com a professora sobre a queda'
    when pf.vs_modalidade_pp >= 20 then 'Entender o que funciona bem e replicar'
    else 'Acompanhar de perto'
  end
from public.vw_analise_professora pf
where pf.tendencia <> 'insuficiente'
  and (
    (pf.tendencia = 'caindo' and pf.delta_pp <= -20)
    or abs(pf.vs_modalidade_pp) >= 20
  );

comment on view public.vw_alertas is
  'Central de alertas: regras de limiar (nao ML) sobre ocupacao/tendencia de turma, modalidade e professora. acao_sugerida e o rotulo curto e acionavel.';

grant select on public.vw_alertas to authenticated;
