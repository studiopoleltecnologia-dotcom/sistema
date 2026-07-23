-- === Remuneração flexível das professoras (PR1) ===
-- Antes existia só valor_por_aluna_centavos. O contrato real é escalonado
-- (piso com 1 aluna, valor de dia cheio de falta, passagem) e cada professora
-- pode ter um modelo diferente (por aluna / por hora / fixo).

create type public.modelo_remuneracao as enum ('por_aluna', 'por_hora', 'fixo');

alter table public.professoras
  add column modelo public.modelo_remuneracao not null default 'por_aluna',
  add column piso_uma_aluna_centavos integer not null default 0,
  add column valor_dia_sem_alunas_centavos integer not null default 0,
  add column valor_hora_centavos integer not null default 0,
  add column valor_fixo_mes_centavos integer not null default 0,
  add column valor_passagem_dia_centavos integer not null default 0,
  add column percentual_passagem integer not null default 0;

comment on column public.professoras.piso_uma_aluna_centavos is
  'Piso quando só 1 aluna presente (contrato: R$50). 0 = usa valor_por_aluna.';
comment on column public.professoras.valor_dia_sem_alunas_centavos is
  'Pago quando a aula rodou mas todas faltaram (contrato: R$75/dia). Aproximação por aula.';
comment on column public.professoras.percentual_passagem is
  '% da passagem reembolsado por dia trabalhado (contrato: 70). 0 = sem passagem.';

-- Recria a view de pagamento aplicando o modelo. Mantém mes como DATE
-- (o front filtra por mes = 'YYYY-MM-01') e acrescenta horas e dias.
drop view if exists public.vw_pagamento_professoras;

create view public.vw_pagamento_professoras
with (security_invoker = true) as
with aulas as (
  select
    pr.professora_id,
    pr.data_aula,
    pr.turma_id,
    date_trunc('month', pr.data_aula)::date as mes,
    count(*) filter (where pr.presente) as presentes,
    max(t.duracao_minutos) as duracao_minutos
  from public.presencas pr
  join public.turmas t on t.id = pr.turma_id
  group by pr.professora_id, pr.data_aula, pr.turma_id
),
por_aula as (
  select
    a.professora_id, a.mes, a.data_aula, a.presentes, a.duracao_minutos,
    case
      when p.modelo <> 'por_aluna' then 0
      when a.presentes >= 2 then a.presentes * p.valor_por_aluna_centavos
      when a.presentes = 1 then greatest(p.piso_uma_aluna_centavos, p.valor_por_aluna_centavos)
      else p.valor_dia_sem_alunas_centavos
    end as valor_aula
  from aulas a
  join public.professoras p on p.id = a.professora_id
)
select
  pa.professora_id,
  p.nome as professora,
  pa.mes,
  count(*)::int as aulas,
  coalesce(sum(pa.presentes), 0)::int as alunas_presentes,
  (
    case p.modelo
      when 'fixo' then p.valor_fixo_mes_centavos
      when 'por_hora' then round(coalesce(sum(pa.duracao_minutos), 0) / 60.0 * p.valor_hora_centavos)::int
      else coalesce(sum(pa.valor_aula), 0)::int
    end
    + round(count(distinct pa.data_aula) * p.valor_passagem_dia_centavos * p.percentual_passagem / 100.0)::int
  )::int as total_centavos,
  round(coalesce(sum(pa.duracao_minutos), 0) / 60.0, 1) as horas,
  count(distinct pa.data_aula)::int as dias
from por_aula pa
join public.professoras p on p.id = pa.professora_id
group by
  pa.professora_id, p.nome, pa.mes, p.modelo,
  p.valor_fixo_mes_centavos, p.valor_hora_centavos,
  p.valor_passagem_dia_centavos, p.percentual_passagem;
