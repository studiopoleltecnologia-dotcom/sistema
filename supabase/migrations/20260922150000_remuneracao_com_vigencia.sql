-- ============================================================
-- Remuneração das professoras: regras com vigência, piso/teto e
-- percentual · folha editável
-- 22/09/2026
--
-- ------------------------------------------------------------
-- O defeito que motiva a migration
-- ------------------------------------------------------------
-- `vw_pagamento_professoras` lê o cadastro ATUAL de `professoras` para
-- valorar aulas de QUALQUER mês, e `fechamentos_professora` só congela
-- o snapshot na aprovação. Ou seja: cadastrar a tabela nova de outubro
-- RECALCULA setembro, se o fechamento de setembro ainda não tiver sido
-- aprovado. Isso é dinheiro de professora mudando sozinho.
--
-- A correção é uma só: o valor de uma aula passa a ser função da DATA
-- DA AULA, resolvido contra regras que têm vigência. Mudar a tabela de
-- outubro não alcança setembro porque a regra de setembro continua
-- vigente em setembro.
--
-- ------------------------------------------------------------
-- O que o modelo antigo não expressava
-- ------------------------------------------------------------
-- 1. UM modelo por professora. Não havia recorte por turma nem por
--    modalidade — e a mesma professora pode ter contratos diferentes
--    dependendo da aula que dá.
-- 2. Não havia TETO. `piso_uma_aluna_centavos` cobria só o caso de 1
--    aluna. A tabela do Pole (decisão da gestão, D19) precisa de piso
--    com 2, degrau a partir de 3 e teto a partir de 5:
--        2 alunas → R$45 (piso)   3 → R$54   4 → R$72   5+ → R$90 (teto)
--    Com "R$18 por aluna" puro dariam R$36 (abaixo do piso) e, com 6
--    alunas, R$108 (acima do teto). Nenhum dos extremos funcionava.
-- 3. Não havia PERCENTUAL sobre mensalidade. Já existe contrato
--    fechado: Defesa Pessoal Feminina, 50/50 sobre a mensalidade
--    contratada (D20).
--
-- ------------------------------------------------------------
-- Como a regra é escolhida
-- ------------------------------------------------------------
-- Por especificidade, do mais específico para o mais geral, sempre
-- dentro da vigência que cobre a data da aula:
--     turma > modalidade > professora > padrão do estúdio
-- Uma linha com `professora_id` nulo vale para todas; com
-- `modalidade_id` preenchido vale só naquela modalidade. É isso que
-- deixa a regra do Pole ser UMA linha para todas as professoras (D19)
-- sem apagar o contrato individual de ninguém.
--
-- ------------------------------------------------------------
-- Folha editável (D3)
-- ------------------------------------------------------------
-- `fechamento_ajustes` só somava e subtraía linhas avulsas (bônus,
-- desconto, passagem). NÃO dava para corrigir o valor de UMA aula.
-- `fechamento_aulas` passa a guardar `valor_calculado_centavos` (o que
-- o sistema achou) e `valor_ajustado_centavos` + motivo + autor (o que
-- a gestão decidiu). Os dois ficam: o total usa o ajustado quando
-- existe, e a conta original continua auditável.
--
-- ------------------------------------------------------------
-- Compatibilidade
-- ------------------------------------------------------------
-- As colunas de remuneração em `professoras` NÃO são removidas: o
-- portal da professora lê `valor_por_aluna_centavos`, e elas viram a
-- semente da primeira regra, com vigência ABERTA. A regra do Pole entra
-- em 01/10 por modalidade e ganha das pessoais por especificidade, sem
-- precisar encerrá-las — ver seção 9. Nenhum cálculo histórico muda.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Tipos
-- ------------------------------------------------------------

create type public.tipo_remuneracao as enum (
  'por_aluna',    -- valor por aluno presente, com piso, teto e faixas
  'por_hora',     -- valor da hora × duração da aula
  'fixo_aula',    -- valor fechado por aula dada, independente de presença
  'fixo_mes',     -- salário do mês, não entra na conta por aula
  'percentual'    -- % sobre uma base (ver base_percentual)
);

create type public.base_percentual as enum (
  'mensalidade_contratada'  -- soma das mensalidades de quem está matriculado na turma
);


-- ------------------------------------------------------------
-- 2) Regras
-- ------------------------------------------------------------

create table public.regras_remuneracao (
  id uuid primary key default gen_random_uuid(),

  -- Escopo. Todos nulos = padrão do estúdio. Quanto mais preenchido,
  -- mais específico — e mais forte na hora de escolher.
  professora_id uuid references public.professoras(id) on delete cascade,
  modalidade_id uuid references public.modalidades(id) on delete cascade,
  turma_id uuid references public.turmas(id) on delete cascade,

  tipo public.tipo_remuneracao not null,

  valor_centavos integer not null default 0,   -- por_aluna / por_hora / fixo_aula / fixo_mes
  percentual numeric(5,2),                     -- tipo = percentual
  base_percentual public.base_percentual,      -- idem

  piso_centavos integer,                       -- nulo = sem piso
  teto_centavos integer,                       -- nulo = sem teto
  valor_sem_alunos_centavos integer not null default 0,  -- aula rodou, ninguém veio (D3)

  vigencia_inicio date not null,
  vigencia_fim date,                           -- nulo = vigente

  observacao text,
  criada_em timestamptz not null default now(),
  criada_por uuid references auth.users(id) default auth.uid(),

  constraint percentual_tem_base check (
    (tipo <> 'percentual') or (percentual is not null and base_percentual is not null)
  ),
  constraint piso_menor_que_teto check (
    piso_centavos is null or teto_centavos is null or piso_centavos <= teto_centavos
  ),
  constraint vigencia_coerente check (
    vigencia_fim is null or vigencia_fim >= vigencia_inicio
  )
);

comment on table public.regras_remuneracao is
  'Quanto a professora recebe, por escopo (turma > modalidade > professora > '
  'padrão) e por período. A vigência é o que impede a tabela nova de '
  'recalcular o mês passado: o valor de uma aula é função da data DELA.';
comment on column public.regras_remuneracao.valor_sem_alunos_centavos is
  'Aula que aconteceu com todos os agendados ausentes (D3, 22/09). Só vale '
  'quando houve agendamento: sem ninguém marcado, a aula não entra na folha.';

-- Duas regras do MESMO escopo não podem valer ao mesmo tempo — senão a
-- escolha vira sorteio. `daterange` + exclusão resolve no banco.
create extension if not exists btree_gist;

alter table public.regras_remuneracao
  add constraint regras_remuneracao_sem_sobreposicao
  exclude using gist (
    coalesce(professora_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    coalesce(modalidade_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    coalesce(turma_id,      '00000000-0000-0000-0000-000000000000'::uuid) with =,
    daterange(vigencia_inicio, vigencia_fim, '[]') with &&
  );

create index on public.regras_remuneracao (professora_id);
create index on public.regras_remuneracao (modalidade_id);
create index on public.regras_remuneracao (turma_id);

alter table public.regras_remuneracao enable row level security;
create policy "gestao gerencia regras_remuneracao" on public.regras_remuneracao
  for all using (public.is_gestao()) with check (public.is_gestao());


-- Faixas: tabela irregular de degraus, para o contrato que piso/valor/
-- teto não expressam (2→45, 3→60, 4→70, 5→90, por exemplo). O Pole NÃO
-- usa: lá piso+valor+teto dão a tabela inteira. Quando existe faixa,
-- ela manda — então precisa ser completa.
create table public.regras_remuneracao_faixas (
  id uuid primary key default gen_random_uuid(),
  regra_id uuid not null references public.regras_remuneracao(id) on delete cascade,
  min_alunos integer not null check (min_alunos >= 0),
  valor_centavos integer not null,
  unique (regra_id, min_alunos)
);

comment on table public.regras_remuneracao_faixas is
  'Degrau por quantidade de alunos presentes, para tabela IRREGULAR que '
  'piso/valor/teto não expressam. Vale a maior faixa cujo min_alunos <= '
  'presentes, então a tabela precisa ser completa: uma faixa solta em 2 '
  'valeria também para 3, 4 e 9. Sem faixa nenhuma, cai no cálculo do tipo.';

alter table public.regras_remuneracao_faixas enable row level security;
create policy "gestao gerencia faixas" on public.regras_remuneracao_faixas
  for all using (public.is_gestao()) with check (public.is_gestao());


-- ------------------------------------------------------------
-- 3) Resolver a regra de uma aula
-- ------------------------------------------------------------

create or replace function public.resolver_regra_remuneracao(
  p_professora uuid,
  p_turma uuid,
  p_data date
) returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select r.id
  from public.regras_remuneracao r
  left join public.turmas t on t.id = p_turma
  where r.vigencia_inicio <= p_data
    and (r.vigencia_fim is null or r.vigencia_fim >= p_data)
    and (r.professora_id is null or r.professora_id = p_professora)
    and (r.turma_id      is null or r.turma_id      = p_turma)
    and (r.modalidade_id is null or r.modalidade_id = t.modalidade_id)
  -- Especificidade: turma pesa mais que modalidade, que pesa mais que
  -- professora. Desempate pela vigência mais recente.
  order by
    (r.turma_id      is not null)::int * 4
  + (r.modalidade_id is not null)::int * 2
  + (r.professora_id is not null)::int desc,
    r.vigencia_inicio desc
  limit 1;
$$;

comment on function public.resolver_regra_remuneracao(uuid, uuid, date) is
  'A regra que valia para esta aula NESTA data. Escopo mais específico '
  'ganha (turma > modalidade > professora > padrão).';


-- ------------------------------------------------------------
-- 4) Quanto vale uma aula
-- ------------------------------------------------------------

create or replace function public.valor_da_aula(
  p_professora uuid,
  p_turma uuid,
  p_data date,
  p_presentes integer,
  p_duracao_minutos integer default null
) returns bigint
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  r record;
  t record;
  v bigint;
  faixa integer;
  base bigint;
begin
  select * into r from public.regras_remuneracao
  where id = public.resolver_regra_remuneracao(p_professora, p_turma, p_data);

  -- Sem regra vigente a aula vale zero, e isso é de propósito: é
  -- visível no fechamento e a gestão corrige. Inventar um valor
  -- seria pior — pagaria errado calado.
  if not found then
    return 0;
  end if;

  select * into t from public.turmas where id = p_turma;

  -- Aula que aconteceu e ninguém veio (D3).
  if coalesce(p_presentes, 0) = 0 then
    return r.valor_sem_alunos_centavos;
  end if;

  case r.tipo
    when 'fixo_mes' then
      -- Não entra na conta por aula; soma uma vez no mês.
      return 0;

    when 'fixo_aula' then
      v := r.valor_centavos;

    when 'por_hora' then
      v := round(
        coalesce(p_duracao_minutos, t.duracao_minutos, 60)::numeric / 60.0
        * r.valor_centavos
      );

    when 'percentual' then
      -- Base: mensalidade contratada de quem está matriculado NA TURMA
      -- (Turma Fixa). É a conta do contrato de 22/09 — 50/50 sobre a
      -- mensalidade contratada, não sobre a recebida.
      select coalesce(sum(m.preco_contratado_centavos), 0) into base
      from public.matricula_turmas mt
      join public.matriculas m on m.id = mt.matricula_id
      where mt.turma_id = p_turma
        and mt.inicio <= p_data
        and (mt.fim is null or mt.fim >= p_data)
        and m.status <> 'cancelada';
      -- Rateado pelas ocorrências da turma no mês: o percentual é
      -- mensal, o pagamento é por aula.
      v := round(base * r.percentual / 100.0 / greatest(
        (select count(*) from generate_series(
           date_trunc('month', p_data)::date,
           (date_trunc('month', p_data) + interval '1 month - 1 day')::date,
           '1 day')  as d
         where extract(dow from d)::int = t.dia_semana), 1));

    else -- 'por_aluna'
      -- Faixa primeiro: a maior cujo mínimo cabe no número de presentes.
      select valor_centavos into faixa
      from public.regras_remuneracao_faixas
      where regra_id = r.id and min_alunos <= p_presentes
      order by min_alunos desc
      limit 1;

      v := coalesce(faixa, p_presentes::bigint * r.valor_centavos);
  end case;

  if r.piso_centavos is not null then v := greatest(v, r.piso_centavos); end if;
  if r.teto_centavos is not null then v := least(v, r.teto_centavos); end if;

  return v;
end;
$$;

comment on function public.valor_da_aula(uuid, uuid, date, integer, integer) is
  'Valor de UMA aula, determinístico pela data dela. Faixa > cálculo do '
  'tipo, depois piso e teto. É a função que impede a tabela de outubro '
  'de recalcular setembro.';

revoke execute on function public.resolver_regra_remuneracao(uuid, uuid, date) from public, anon;
revoke execute on function public.valor_da_aula(uuid, uuid, date, integer, integer) from public, anon;
grant execute on function public.resolver_regra_remuneracao(uuid, uuid, date) to authenticated;
grant execute on function public.valor_da_aula(uuid, uuid, date, integer, integer) to authenticated;


-- ------------------------------------------------------------
-- 5) Detalhe por aula no fechamento (folha editável — D3)
-- ------------------------------------------------------------

create table public.fechamento_aulas (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos_professora(id) on delete cascade,
  turma_id uuid not null references public.turmas(id),
  data_aula date not null,
  presentes integer not null default 0,
  regra_id uuid references public.regras_remuneracao(id),

  valor_calculado_centavos bigint not null,
  valor_ajustado_centavos bigint,
  motivo_ajuste text,
  ajustado_em timestamptz,
  ajustado_por uuid references auth.users(id),

  criado_em timestamptz not null default now(),
  unique (fechamento_id, turma_id, data_aula),

  constraint ajuste_tem_motivo check (
    valor_ajustado_centavos is null or nullif(btrim(motivo_ajuste), '') is not null
  )
);

comment on table public.fechamento_aulas is
  'Uma linha por aula da competência: o que o sistema calculou e o que a '
  'gestão decidiu. Guardar os dois responde "por que este mês veio '
  'diferente" sem reconstituir nada.';
comment on column public.fechamento_aulas.valor_ajustado_centavos is
  'Nulo = vale o calculado. Preenchido exige motivo (constraint): valor '
  'de folha mudado sem justificativa é o que ninguém consegue explicar '
  'depois.';

create index on public.fechamento_aulas (fechamento_id);

alter table public.fechamento_aulas enable row level security;
create policy "gestao gerencia fechamento_aulas" on public.fechamento_aulas
  for all using (public.is_gestao()) with check (public.is_gestao());


-- ------------------------------------------------------------
-- 6) A view passa a chamar a função
-- ------------------------------------------------------------

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
), por_aula as (
  select
    a.professora_id,
    a.mes,
    a.data_aula,
    a.turma_id,
    a.presentes,
    a.duracao_minutos,
    public.valor_da_aula(
      a.professora_id, a.turma_id, a.data_aula,
      a.presentes::integer, a.duracao_minutos::integer
    ) as valor_aula
  from aulas a
)
select
  pa.professora_id,
  p.nome as professora,
  pa.mes,
  count(*)::integer as aulas,
  coalesce(sum(pa.presentes), 0)::integer as alunas_presentes,
  (
    coalesce(sum(pa.valor_aula), 0)
    -- Salário fixo entra uma vez no mês, não por aula.
    + coalesce((
        select r.valor_centavos from public.regras_remuneracao r
        where r.professora_id = pa.professora_id
          and r.tipo = 'fixo_mes'
          and r.turma_id is null and r.modalidade_id is null
          and r.vigencia_inicio <= (pa.mes + interval '1 month - 1 day')::date
          and (r.vigencia_fim is null or r.vigencia_fim >= pa.mes)
        order by r.vigencia_inicio desc limit 1
      ), 0)
    -- Passagem segue no cadastro: é reembolso por dia trabalhado, não
    -- remuneração de aula, e não muda com a tabela nova.
    + round((count(distinct pa.data_aula) * p.valor_passagem_dia_centavos
             * p.percentual_passagem)::numeric / 100.0)
  )::bigint as total_centavos,
  round(coalesce(sum(pa.duracao_minutos), 0)::numeric / 60.0, 1) as horas,
  count(distinct pa.data_aula)::integer as dias
from por_aula pa
join public.professoras p on p.id = pa.professora_id
group by pa.professora_id, p.nome, pa.mes,
         p.valor_passagem_dia_centavos, p.percentual_passagem;

comment on view public.vw_pagamento_professoras is
  'Folha prevista por competência. O valor de cada aula vem de '
  'valor_da_aula(), resolvido contra a regra vigente NA DATA DA AULA.';


-- ------------------------------------------------------------
-- 7) Semente: o que está em `professoras` vira a regra até 30/09
-- ------------------------------------------------------------
-- Vigência fechada em 30/09/2026 para as professoras de Pole (a regra
-- nova entra em 01/10, D19) e aberta para as demais. Sem isso, a aula
-- de setembro perderia a regra e passaria a valer zero.

insert into public.regras_remuneracao
  (professora_id, tipo, valor_centavos, piso_centavos,
   valor_sem_alunos_centavos, vigencia_inicio, observacao)
select
  p.id,
  case p.modelo
    when 'por_hora' then 'por_hora'::public.tipo_remuneracao
    when 'fixo'     then 'fixo_mes'::public.tipo_remuneracao
    else                 'por_aluna'::public.tipo_remuneracao
  end,
  case p.modelo
    when 'por_hora' then p.valor_hora_centavos
    when 'fixo'     then p.valor_fixo_mes_centavos
    else                 p.valor_por_aluna_centavos::integer
  end,
  nullif(p.piso_uma_aluna_centavos, 0),
  p.valor_dia_sem_alunas_centavos,
  date '2020-01-01',   -- cobre todo o histórico já lançado
  'Semente do cadastro antigo (migration 20260922150000)'
from public.professoras p;


-- ------------------------------------------------------------
-- 8) A tabela do Pole a partir de 01/10/2026 (D19)
-- ------------------------------------------------------------
-- Decisão da gestão em 22/09: vale para TODAS as professoras que dão
-- aula de modalidades de Pole Dance, a partir de 01/10.
--   2 alunas → R$45 (piso)   3 → R$54   4 → R$72   5+ → R$90 (teto)
-- Uma linha por modalidade de Pole, com professora_id nulo: pega todo
-- mundo sem apagar contrato individual de ninguém.

do $$
declare
  m record;
begin
  for m in
    select id, nome from public.modalidades
    where nome in (
      'Pole 1', 'Pole 1 e 2', 'Pole 2', 'Pole Dance',
      'Pole Dance 1', 'Pole Dance 1 e 2', 'Pole Dance 2',
      'Pole Coreográfico', 'Pole Mix', 'Pole on Heels', 'Pole Power',
      'Pole Silk', 'Pole Spin 1', 'Pole Spin 1 e 2',
      'Aula de Pole Spin', 'Bases de Inversão'
    )
  loop
    -- SEM faixa: piso + valor por aluna + teto já expressam a tabela
    -- inteira, e conferem nos seis pontos:
    --   1 → 1.800 → piso  → R$45      4 → 7.200        → R$72
    --   2 → 3.600 → piso  → R$45      5 → 9.000        → R$90
    --   3 → 5.400         → R$54      9 → 16.200 → teto → R$90
    --
    -- A primeira versão tinha uma faixa em min_alunos = 2 → R$45, e o
    -- teste no DEV mostrou por que isso estava errado: faixa é degrau
    -- de tabela COMPLETA, então a de mínimo 2 valia para 2, 3, 4 e 9 —
    -- tudo virava R$45. Faixa serve para tabela irregular, que não é o
    -- caso aqui.
    insert into public.regras_remuneracao
      (modalidade_id, tipo, valor_centavos, piso_centavos, teto_centavos,
       vigencia_inicio, observacao)
    values
      (m.id, 'por_aluna', 1800, 4500, 9000, date '2026-10-01',
       'Tabela do Pole (D19, 22/09): piso R$45, R$18/aluna a partir de 3, teto R$90');
  end loop;
end $$;


-- ------------------------------------------------------------
-- 9) A semente NÃO é fechada em 30/09 — de propósito
-- ------------------------------------------------------------
-- A tentação é encerrar a regra pessoal das professoras de Pole em
-- 30/09, para deixar explícito que a tabela nova assume. Seria um bug:
-- quem dá Pole E Yoga ficaria sem regra nenhuma no Yoga a partir de
-- 01/10, e a aula passaria a valer zero.
--
-- A especificidade já resolve sozinha, aula por aula:
--   · aula de Pole em outubro   → regra da modalidade (peso 2) ganha
--                                 da regra pessoal (peso 1);
--   · aula de Yoga em outubro   → só a regra pessoal casa, e vale;
--   · aula de Pole em setembro  → a regra da modalidade ainda não
--                                 vigia, então vale a pessoal.
--
-- Ou seja: a regra pessoal continua aberta e continua certa. É o
-- desenho funcionando, não uma ponta solta.



-- ------------------------------------------------------------
-- 10) Quem escreve em `fechamento_aulas`
-- ------------------------------------------------------------
-- A tabela sem RPC seria peso morto. `montar_fechamento()` fotografa a
-- competência: uma linha por aula dada, com o valor que a regra vigente
-- NAQUELA data produziu. Reexecutar atualiza o que ainda não foi
-- ajustado à mão e preserva o que foi — refazer a foto não pode
-- apagar a decisão de quem mexeu.

create or replace function public.montar_fechamento(
  p_professora uuid,
  p_competencia text
) returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  fech uuid;
  ini date := (p_competencia || '-01')::date;
  fim date := ((p_competencia || '-01')::date + interval '1 month - 1 day')::date;
  n integer := 0;
begin
  if auth.uid() is null or not public.is_gestao() then
    raise exception 'acesso restrito à gestão';
  end if;

  select id into fech from public.fechamentos_professora
  where professora_id = p_professora and competencia = p_competencia;

  if fech is null then
    insert into public.fechamentos_professora (professora_id, competencia)
    values (p_professora, p_competencia)
    returning id into fech;
  end if;

  if exists (select 1 from public.fechamentos_professora
             where id = fech and status = 'aprovado') then
    raise exception 'este fechamento já foi aprovado — reabra antes de remontar';
  end if;

  insert into public.fechamento_aulas
    (fechamento_id, turma_id, data_aula, presentes, regra_id, valor_calculado_centavos)
  select
    fech,
    pr.turma_id,
    pr.data_aula,
    count(*) filter (where pr.presente)::integer,
    public.resolver_regra_remuneracao(p_professora, pr.turma_id, pr.data_aula),
    public.valor_da_aula(
      p_professora, pr.turma_id, pr.data_aula,
      count(*) filter (where pr.presente)::integer,
      max(t.duracao_minutos)::integer
    )
  from public.presencas pr
  join public.turmas t on t.id = pr.turma_id
  where pr.professora_id = p_professora
    and pr.data_aula between ini and fim
  group by pr.turma_id, pr.data_aula
  on conflict (fechamento_id, turma_id, data_aula) do update
    set presentes = excluded.presentes,
        regra_id = excluded.regra_id,
        valor_calculado_centavos = excluded.valor_calculado_centavos
    -- O ajuste manual sobrevive à remontagem: quem mexeu tinha um
    -- motivo, e ele está gravado ao lado.
    where public.fechamento_aulas.valor_ajustado_centavos is null;

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.montar_fechamento(uuid, text) is
  'Fotografa a competência em fechamento_aulas, uma linha por aula. '
  'Reexecutável: atualiza o que ainda não foi ajustado à mão e preserva '
  'o que foi.';


-- Corrigir o valor de UMA aula (D3: "tudo precisa ser editável").
create or replace function public.ajustar_aula_fechamento(
  p_aula uuid,
  p_valor_centavos bigint,
  p_motivo text
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  fech record;
begin
  if auth.uid() is null or not public.is_gestao() then
    raise exception 'acesso restrito à gestão';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'escreva o motivo do ajuste — ele fica no histórico da folha';
  end if;
  if p_valor_centavos < 0 then
    raise exception 'o valor de uma aula não pode ser negativo — use um ajuste de desconto';
  end if;

  select f.* into fech
  from public.fechamentos_professora f
  join public.fechamento_aulas fa on fa.fechamento_id = f.id
  where fa.id = p_aula;

  if not found then
    raise exception 'aula inexistente no fechamento';
  end if;
  if fech.status = 'aprovado' then
    raise exception 'fechamento aprovado — reabra antes de ajustar';
  end if;

  update public.fechamento_aulas
  set valor_ajustado_centavos = p_valor_centavos,
      motivo_ajuste = btrim(p_motivo),
      ajustado_em = now(),
      ajustado_por = auth.uid()
  where id = p_aula;
end;
$$;


-- Desfazer o ajuste: volta a valer o que o sistema calculou.
create or replace function public.desfazer_ajuste_aula(p_aula uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or not public.is_gestao() then
    raise exception 'acesso restrito à gestão';
  end if;
  update public.fechamento_aulas fa
  set valor_ajustado_centavos = null, motivo_ajuste = null,
      ajustado_em = null, ajustado_por = null
  from public.fechamentos_professora f
  where f.id = fa.fechamento_id and fa.id = p_aula and f.status <> 'aprovado';
  if not found then
    raise exception 'aula inexistente ou fechamento já aprovado';
  end if;
end;
$$;

revoke execute on function public.montar_fechamento(uuid, text) from public, anon;
revoke execute on function public.ajustar_aula_fechamento(uuid, bigint, text) from public, anon;
revoke execute on function public.desfazer_ajuste_aula(uuid) from public, anon;
grant execute on function public.montar_fechamento(uuid, text) to authenticated;
grant execute on function public.ajustar_aula_fechamento(uuid, bigint, text) to authenticated;
grant execute on function public.desfazer_ajuste_aula(uuid) to authenticated;


-- ------------------------------------------------------------
-- 11) O total da competência, já com os ajustes
-- ------------------------------------------------------------
-- A view de pagamento continua servindo à previsão ao vivo. Esta traz o
-- que a gestão de fato decidiu pagar, aula por aula.

create or replace view public.vw_fechamento_total
with (security_invoker = true) as
select
  f.id as fechamento_id,
  f.professora_id,
  f.competencia,
  f.status,
  count(fa.id)::integer as aulas,
  coalesce(sum(fa.presentes), 0)::integer as alunas_presentes,
  coalesce(sum(fa.valor_calculado_centavos), 0)::bigint as calculado_centavos,
  coalesce(sum(coalesce(fa.valor_ajustado_centavos, fa.valor_calculado_centavos)), 0)::bigint
    as aulas_centavos,
  count(fa.valor_ajustado_centavos)::integer as aulas_ajustadas,
  coalesce((select sum(aj.valor_centavos) from public.fechamento_ajustes aj
            where aj.fechamento_id = f.id), 0)::bigint as ajustes_centavos,
  (coalesce(sum(coalesce(fa.valor_ajustado_centavos, fa.valor_calculado_centavos)), 0)
   + coalesce((select sum(aj.valor_centavos) from public.fechamento_ajustes aj
               where aj.fechamento_id = f.id), 0))::bigint as total_centavos
from public.fechamentos_professora f
left join public.fechamento_aulas fa on fa.fechamento_id = f.id
group by f.id, f.professora_id, f.competencia, f.status;

comment on view public.vw_fechamento_total is
  'O que a gestão decidiu pagar na competência: soma das aulas (ajustada '
  'quando houve ajuste) mais os lançamentos avulsos de fechamento_ajustes.';
