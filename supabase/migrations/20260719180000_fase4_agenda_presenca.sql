-- ============================================================
-- Fase 4 (núcleo interno) — Agenda & Presença + Professoras + Planos
-- Regras de negócio da seção 9 do CLAUDE.md validadas NO BANCO:
--   9.1 vaga única compartilhada (capacidade em trigger com lock)
--   9.2 auditoria (agendamentos_eventos + creditos_eventos append-only)
--   9.3 prazo de cancelamento configurável (config_agendamento)
--   9.4 planos/créditos personalizáveis; no-show consome crédito
-- Integrações (seção 5): presença → ultima_aula da cliente e
-- entrada Wellhub "a reconciliar"; pagamento professora por view.
-- ============================================================

create type public.canal_aula as enum ('mensalista', 'wellhub', 'classpass', 'avulsa');
create type public.status_agendamento as enum ('agendado', 'cancelado');
create type public.origem_cancelamento as enum ('aluna', 'socia', 'professora', 'sistema');
create type public.tipo_evento_agendamento as enum ('agendado', 'cancelado', 'presenca', 'falta');
create type public.plano_tipo as enum ('creditos', 'semanal');
create type public.status_matricula as enum ('ativa', 'pausada', 'cancelada');
create type public.motivo_credito as enum
  ('compra', 'agendamento', 'cancelamento', 'reposicao', 'ajuste');

-- ------------------------------------------------------------
-- PROFESSORAS — pagas por aluna presente (docs/03 seção 2).
-- ------------------------------------------------------------
create table public.professoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  valor_por_aluna_centavos bigint not null check (valor_por_aluna_centavos >= 0),
  ativa boolean not null default true,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

alter table public.professoras enable row level security;
create policy "socias gerenciam professoras" on public.professoras
  for all to authenticated using (public.is_socia()) with check (public.is_socia());
create trigger professoras_atualizada_em
  before update on public.professoras
  for each row execute function public.set_atualizada_em();

-- ------------------------------------------------------------
-- TURMAS — grade semanal; capacidade é a vaga única da regra 9.1.
-- dia_semana: 0=domingo … 6=sábado (convenção do extract(dow)).
-- ------------------------------------------------------------
create table public.turmas (
  id uuid primary key default gen_random_uuid(),
  modalidade text not null default 'Pole Dance',
  professora_id uuid not null references public.professoras (id),
  dia_semana integer not null check (dia_semana between 0 and 6),
  horario time not null,
  duracao_minutos integer not null default 60 check (duracao_minutos > 0),
  capacidade integer not null check (capacidade > 0),
  ativa boolean not null default true,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

alter table public.turmas enable row level security;
create policy "socias gerenciam turmas" on public.turmas
  for all to authenticated using (public.is_socia()) with check (public.is_socia());
create trigger turmas_atualizada_em
  before update on public.turmas
  for each row execute function public.set_atualizada_em();

-- ------------------------------------------------------------
-- CONFIG AGENDAMENTO — regras 9.3/9.4, editáveis a qualquer momento.
-- ------------------------------------------------------------
create table public.config_agendamento (
  id boolean primary key default true check (id),
  horas_cancelamento integer not null default 4 check (horas_cancelamento >= 0),
  max_reposicoes_por_matricula integer not null default 2
    check (max_reposicoes_por_matricula >= 0),
  -- valor estimado por check-in Wellhub p/ gerar "a reconciliar"
  valor_checkin_wellhub_centavos bigint not null default 1500
    check (valor_checkin_wellhub_centavos >= 0),
  atualizada_em timestamptz not null default now()
);

insert into public.config_agendamento default values;

alter table public.config_agendamento enable row level security;
create policy "socias veem config agendamento" on public.config_agendamento
  for select to authenticated using (public.is_socia());
create policy "socias ajustam config agendamento" on public.config_agendamento
  for update to authenticated using (public.is_socia()) with check (public.is_socia());
create trigger config_agendamento_atualizada_em
  before update on public.config_agendamento
  for each row execute function public.set_atualizada_em();

-- ------------------------------------------------------------
-- PLANOS — cadastráveis/personalizáveis pelas sócias (9.4).
-- quantidade: nº de créditos (tipo creditos) ou aulas/semana (tipo semanal).
-- ------------------------------------------------------------
create table public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo public.plano_tipo not null,
  quantidade integer not null check (quantidade > 0),
  vigencia_dias integer not null check (vigencia_dias > 0),
  preco_centavos bigint not null check (preco_centavos >= 0),
  ativo boolean not null default true,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

alter table public.planos enable row level security;
create policy "socias gerenciam planos" on public.planos
  for all to authenticated using (public.is_socia()) with check (public.is_socia());
create trigger planos_atualizada_em
  before update on public.planos
  for each row execute function public.set_atualizada_em();

-- ------------------------------------------------------------
-- MATRÍCULAS — contrato da cliente com um plano.
-- ------------------------------------------------------------
create table public.matriculas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  plano_id uuid not null references public.planos (id),
  data_inicio date not null default current_date,
  data_fim date not null,
  creditos_total integer not null check (creditos_total > 0),
  status public.status_matricula not null default 'ativa',
  motivo_cancelamento text,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index matriculas_cliente_idx on public.matriculas (cliente_id);

alter table public.matriculas enable row level security;
create policy "socias gerenciam matriculas" on public.matriculas
  for all to authenticated using (public.is_socia()) with check (public.is_socia());
create trigger matriculas_atualizada_em
  before update on public.matriculas
  for each row execute function public.set_atualizada_em();

-- ------------------------------------------------------------
-- AGENDAMENTOS — estado atual (9.1) + eventos append-only (9.2).
-- ------------------------------------------------------------
create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas (id),
  data date not null,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  canal public.canal_aula not null,
  -- crédito consumido de qual matrícula (canal mensalista)
  matricula_id uuid references public.matriculas (id),
  status public.status_agendamento not null default 'agendado',
  cancelado_em timestamptz,
  origem_cancelamento public.origem_cancelamento,
  criado_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create unique index agendamentos_ativo_unico
  on public.agendamentos (turma_id, data, cliente_id) where status = 'agendado';
create index agendamentos_turma_data_idx on public.agendamentos (turma_id, data);
create index agendamentos_cliente_idx on public.agendamentos (cliente_id);

alter table public.agendamentos enable row level security;
create policy "socias gerenciam agendamentos" on public.agendamentos
  for all to authenticated using (public.is_socia()) with check (public.is_socia());
create trigger agendamentos_atualizada_em
  before update on public.agendamentos
  for each row execute function public.set_atualizada_em();

-- Regra 9.1 no banco: capacidade validada com lock por turma+data —
-- duas sessões não levam a última vaga ao mesmo tempo.
create or replace function public.validar_vaga_agendamento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t record;
  ocupadas integer;
begin
  select capacidade, dia_semana, ativa into t
  from public.turmas where id = new.turma_id;
  if not t.ativa then
    raise exception 'turma inativa';
  end if;
  if extract(dow from new.data) <> t.dia_semana then
    raise exception 'data % não corresponde ao dia da semana da turma', new.data;
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(new.turma_id::text || ':' || new.data::text, 0));
  select count(*) into ocupadas
  from public.agendamentos
  where turma_id = new.turma_id and data = new.data and status = 'agendado';
  if ocupadas >= t.capacidade then
    raise exception 'turma lotada (% vagas)', t.capacidade;
  end if;
  return new;
end;
$$;

create trigger agendamentos_valida_vaga
  before insert on public.agendamentos
  for each row when (new.status = 'agendado')
  execute function public.validar_vaga_agendamento();

create table public.agendamentos_eventos (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.agendamentos (id) on delete cascade,
  evento public.tipo_evento_agendamento not null,
  detalhe text,
  criado_por uuid references public.socias (id) on delete set null,
  criado_em timestamptz not null default now()
);

create index agendamentos_eventos_idx
  on public.agendamentos_eventos (agendamento_id, criado_em);

alter table public.agendamentos_eventos enable row level security;
create policy "socias veem eventos de agendamento" on public.agendamentos_eventos
  for select to authenticated using (public.is_socia());
create policy "socias registram eventos de agendamento" on public.agendamentos_eventos
  for insert to authenticated with check (public.is_socia());
-- append-only: sem update/delete.

-- ------------------------------------------------------------
-- CRÉDITOS — livro-razão (9.4): saldo é sempre derivado.
-- ------------------------------------------------------------
create table public.creditos_eventos (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas (id) on delete cascade,
  delta integer not null check (delta <> 0),
  motivo public.motivo_credito not null,
  agendamento_id uuid references public.agendamentos (id) on delete set null,
  detalhe text,
  criado_por uuid references public.socias (id) on delete set null,
  criado_em timestamptz not null default now()
);

create index creditos_eventos_matricula_idx
  on public.creditos_eventos (matricula_id, criado_em);

alter table public.creditos_eventos enable row level security;
create policy "socias veem creditos" on public.creditos_eventos
  for select to authenticated using (public.is_socia());
create policy "socias registram creditos" on public.creditos_eventos
  for insert to authenticated with check (public.is_socia());
-- append-only: sem update/delete.

-- Reposições limitadas por matrícula (config max_reposicoes_por_matricula).
create or replace function public.validar_reposicao()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  usadas integer;
  maximo integer;
begin
  if new.motivo = 'reposicao' then
    select count(*) into usadas from public.creditos_eventos
    where matricula_id = new.matricula_id and motivo = 'reposicao';
    select max_reposicoes_por_matricula into maximo from public.config_agendamento;
    if usadas >= maximo then
      raise exception 'limite de % reposições da matrícula atingido', maximo;
    end if;
  end if;
  return new;
end;
$$;

create trigger creditos_valida_reposicao
  before insert on public.creditos_eventos
  for each row execute function public.validar_reposicao();

-- ------------------------------------------------------------
-- PRESENÇAS — o dado mais valioso do sistema (docs/03 seção 2).
-- ------------------------------------------------------------
create table public.presencas (
  id uuid primary key default gen_random_uuid(),
  -- null = aluna incluída na hora, sem agendamento (regra 9.6)
  agendamento_id uuid references public.agendamentos (id) on delete set null,
  turma_id uuid not null references public.turmas (id),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  professora_id uuid not null references public.professoras (id),
  data_aula date not null,
  canal public.canal_aula not null,
  presente boolean not null,
  criado_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  unique (turma_id, data_aula, cliente_id)
);

create index presencas_professora_idx on public.presencas (professora_id, data_aula);
create index presencas_cliente_idx on public.presencas (cliente_id, data_aula desc);

alter table public.presencas enable row level security;
create policy "socias gerenciam presencas" on public.presencas
  for all to authenticated using (public.is_socia()) with check (public.is_socia());
create trigger presencas_atualizada_em
  before update on public.presencas
  for each row execute function public.set_atualizada_em();

-- vínculo presença → entrada financeira (conciliação Wellhub)
alter table public.entradas_financeiras
  add column presenca_id uuid references public.presencas (id) on delete set null;

-- Integrações do check-in (seção 5 do CLAUDE.md):
-- presente → ultima_aula da cliente; wellhub → entrada "a reconciliar".
create or replace function public.integrar_presenca()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  valor bigint;
  prox15 date;
begin
  if new.presente then
    update public.clientes
    set ultima_aula = new.data_aula
    where id = new.cliente_id
      and (ultima_aula is null or ultima_aula < new.data_aula);

    if new.canal = 'wellhub' and not exists (
      select 1 from public.entradas_financeiras where presenca_id = new.id
    ) then
      select valor_checkin_wellhub_centavos into valor from public.config_agendamento;
      if valor > 0 then
        prox15 := (date_trunc('month', new.data_aula) + interval '1 month + 14 days')::date;
        insert into public.entradas_financeiras
          (descricao, valor_centavos, categoria, status, data_competencia,
           data_prevista, cliente_id, presenca_id)
        values
          ('Check-in Wellhub', valor, 'wellhub', 'prevista', new.data_aula,
           prox15, new.cliente_id, new.id);
      end if;
    end if;
  else
    -- correção de presença → falta: remove a previsão ainda não reconciliada
    delete from public.entradas_financeiras
    where presenca_id = new.id and status = 'prevista';
  end if;
  return new;
end;
$$;

create trigger presencas_integra
  after insert or update of presente on public.presencas
  for each row execute function public.integrar_presenca();

-- ------------------------------------------------------------
-- FUNÇÕES DE NEGÓCIO (RPC) — caminho único para operar a agenda.
-- security definer + guarda de sócia (mesmo padrão da Fase 3).
-- ------------------------------------------------------------

-- Matricular cliente num plano: cria matrícula + credita o ledger +
-- gera a cobrança como entrada prevista no Financeiro (1 clique p/ receber).
create or replace function public.matricular(p_cliente uuid, p_plano uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  pl record;
  m_id uuid;
  total integer;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito às sócias';
  end if;

  select * into pl from public.planos where id = p_plano and ativo;
  if not found then
    raise exception 'plano inexistente ou inativo';
  end if;

  total := case pl.tipo
    when 'creditos' then pl.quantidade
    else pl.quantidade * ceil(pl.vigencia_dias / 7.0)::integer
  end;

  insert into public.matriculas (cliente_id, plano_id, data_fim, creditos_total)
  values (p_cliente, p_plano, current_date + pl.vigencia_dias, total)
  returning id into m_id;

  insert into public.creditos_eventos (matricula_id, delta, motivo, detalhe, criado_por)
  values (m_id, total, 'compra', pl.nome, auth.uid());

  insert into public.entradas_financeiras
    (descricao, valor_centavos, categoria, status, data_competencia, data_prevista, cliente_id)
  values
    ('Plano ' || pl.nome, pl.preco_centavos, 'mensalista', 'prevista',
     current_date, current_date, p_cliente);

  return m_id;
end;
$$;

-- Agendar aula: consome crédito se mensalista (matrícula vigente com saldo).
create or replace function public.agendar_aula(
  p_cliente uuid, p_turma uuid, p_data date, p_canal public.canal_aula
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  a_id uuid;
  m_id uuid := null;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito às sócias';
  end if;

  if p_canal = 'mensalista' then
    select m.id into m_id
    from public.matriculas m
    where m.cliente_id = p_cliente and m.status = 'ativa'
      and p_data between m.data_inicio and m.data_fim
      and coalesce((select sum(delta) from public.creditos_eventos ce
                    where ce.matricula_id = m.id), 0) > 0
    order by m.data_fim
    limit 1;
    if m_id is null then
      raise exception 'cliente sem créditos disponíveis para esta data';
    end if;
  end if;

  insert into public.agendamentos (turma_id, data, cliente_id, canal, matricula_id)
  values (p_turma, p_data, p_cliente, p_canal, m_id)
  returning id into a_id;

  if m_id is not null then
    insert into public.creditos_eventos
      (matricula_id, delta, motivo, agendamento_id, criado_por)
    values (m_id, -1, 'agendamento', a_id, auth.uid());
  end if;

  insert into public.agendamentos_eventos (agendamento_id, evento, criado_por)
  values (a_id, 'agendado', auth.uid());

  return a_id;
end;
$$;

-- Cancelar: libera a vaga sempre (9.1); crédito volta só dentro do prazo
-- configurado (9.3/9.4). Retorna true se o crédito foi devolvido.
create or replace function public.cancelar_agendamento(
  p_agendamento uuid, p_origem public.origem_cancelamento
)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  ag record;
  t record;
  limite timestamptz;
  horas integer;
  devolveu boolean := false;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito às sócias';
  end if;

  select * into ag from public.agendamentos where id = p_agendamento for update;
  if not found or ag.status <> 'agendado' then
    raise exception 'agendamento inexistente ou já cancelado';
  end if;

  update public.agendamentos
  set status = 'cancelado', cancelado_em = now(), origem_cancelamento = p_origem
  where id = p_agendamento;

  if ag.matricula_id is not null then
    select horas_cancelamento into horas from public.config_agendamento;
    select horario into t from public.turmas where id = ag.turma_id;
    limite := (ag.data + t.horario) - make_interval(hours => horas);
    if now() < limite then
      insert into public.creditos_eventos
        (matricula_id, delta, motivo, agendamento_id, criado_por)
      values (ag.matricula_id, 1, 'cancelamento', p_agendamento, auth.uid());
      devolveu := true;
    end if;
  end if;

  insert into public.agendamentos_eventos (agendamento_id, evento, detalhe, criado_por)
  values (p_agendamento, 'cancelado',
          case when devolveu then 'crédito devolvido' else 'fora do prazo — crédito mantido' end,
          auth.uid());

  return devolveu;
end;
$$;

-- Presença/falta de agendada ou inclusão de aluna sem agendamento (9.6).
-- No-show: crédito já consumido no agendamento permanece consumido (9.4).
create or replace function public.registrar_presenca(
  p_turma uuid, p_data date, p_cliente uuid, p_presente boolean,
  p_canal public.canal_aula default 'avulsa'
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  ag record;
  prof uuid;
  canal_final public.canal_aula;
  pr_id uuid;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito às sócias';
  end if;

  select professora_id into prof from public.turmas where id = p_turma;
  if prof is null then
    raise exception 'turma inexistente';
  end if;

  select * into ag from public.agendamentos
  where turma_id = p_turma and data = p_data and cliente_id = p_cliente
    and status = 'agendado';

  canal_final := coalesce(ag.canal, p_canal);

  insert into public.presencas
    (agendamento_id, turma_id, cliente_id, professora_id, data_aula, canal, presente)
  values (ag.id, p_turma, p_cliente, prof, p_data, canal_final, p_presente)
  on conflict (turma_id, data_aula, cliente_id)
  do update set presente = excluded.presente
  returning id into pr_id;

  if ag.id is not null then
    insert into public.agendamentos_eventos (agendamento_id, evento, criado_por)
    values (ag.id, case when p_presente then 'presenca' else 'falta' end, auth.uid());
  end if;

  return pr_id;
end;
$$;

revoke execute on function public.matricular(uuid, uuid) from public, anon;
revoke execute on function public.agendar_aula(uuid, uuid, date, public.canal_aula) from public, anon;
revoke execute on function public.cancelar_agendamento(uuid, public.origem_cancelamento) from public, anon;
revoke execute on function public.registrar_presenca(uuid, date, uuid, boolean, public.canal_aula) from public, anon;
grant execute on function public.matricular(uuid, uuid) to authenticated;
grant execute on function public.agendar_aula(uuid, uuid, date, public.canal_aula) to authenticated;
grant execute on function public.cancelar_agendamento(uuid, public.origem_cancelamento) to authenticated;
grant execute on function public.registrar_presenca(uuid, date, uuid, boolean, public.canal_aula) to authenticated;

-- ------------------------------------------------------------
-- VIEWS — fórmulas no banco.
-- ------------------------------------------------------------

-- Pagamento de professoras: por aluna presente (docs/01 seção 3).
create view public.vw_pagamento_professoras
with (security_invoker = true) as
select
  pr.professora_id,
  p.nome as professora,
  date_trunc('month', pr.data_aula)::date as mes,
  count(distinct (pr.turma_id, pr.data_aula)) as aulas,
  count(*) filter (where pr.presente) as alunas_presentes,
  (count(*) filter (where pr.presente) * p.valor_por_aluna_centavos)::bigint
    as total_centavos
from public.presencas pr
join public.professoras p on p.id = pr.professora_id
group by pr.professora_id, p.nome, p.valor_por_aluna_centavos, 3;

-- Saldo de créditos por matrícula (ledger somado).
create view public.vw_saldo_creditos
with (security_invoker = true) as
select
  m.id as matricula_id,
  m.cliente_id,
  m.plano_id,
  m.status,
  m.data_inicio,
  m.data_fim,
  m.creditos_total,
  coalesce(sum(ce.delta), 0)::integer as saldo
from public.matriculas m
left join public.creditos_eventos ce on ce.matricula_id = m.id
group by m.id;
