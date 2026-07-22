-- ============================================================
-- M6 — Lista de espera para aula lotada
-- Decisão da equipe em 21/07/2026: quando vaga, avisa por e-mail a
-- PRIMEIRA da fila e segura a vaga para ela por 30 min; se não
-- agendar nesse prazo, passa para a próxima.
--
-- O ponto delicado: "segurar a vaga" precisa valer no banco. Se
-- fosse só aviso, outra aluna qualquer poderia agendar no intervalo
-- e a fila viraria enfeite. Por isso validar_vaga_agendamento()
-- passa a contar a reserva em aberto como se fosse vaga ocupada —
-- menos para a própria aluna que foi notificada.
--
-- O envio do e-mail ainda não existe (depende de domínio próprio +
-- provedor). A fila já registra quem deve ser avisada e quando, em
-- `email_enviado_em` — nulo = e-mail pendente. Quando o envio
-- entrar, ele só precisa varrer essas linhas.
-- ============================================================

create type public.status_lista_espera as enum (
  'aguardando',   -- na fila, ninguém avisou ainda
  'notificada',   -- vaga abriu, e-mail disparado, 30 min correndo
  'expirada',     -- não agendou a tempo, passou a vez
  'confirmada',   -- agendou — virou reserva de verdade
  'cancelada'     -- saiu da fila por conta própria
);

create table public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas (id) on delete cascade,
  data date not null,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  status public.status_lista_espera not null default 'aguardando',
  notificada_em timestamptz,
  email_enviado_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Ordem da fila é por criado_em; sem coluna `posicao` para não ter
-- que renumerar todo mundo quando alguém desiste.
create index lista_espera_fila_idx
  on public.lista_espera (turma_id, data, criado_em);

-- Mesma lógica do índice parcial de agendamentos: a aluna só pode
-- ter uma inscrição viva por aula, mas pode voltar depois de sair.
create unique index lista_espera_ativa_unica
  on public.lista_espera (turma_id, data, cliente_id)
  where status in ('aguardando', 'notificada');

alter table public.lista_espera enable row level security;

create policy "equipe gerencia lista de espera" on public.lista_espera
  for all to authenticated using (public.is_socia()) with check (public.is_socia());

create policy "cliente ve a propria fila" on public.lista_espera
  for select to authenticated using (cliente_id = public.cliente_atual());
-- sem insert/delete direto: só pelas RPCs, onde mora a validação de
-- que a turma está mesmo lotada.

-- Prazo da reserva, configurável pela equipe como os demais (9.3).
alter table public.config_agendamento
  add column if not exists minutos_reserva_espera integer not null default 30
  check (minutos_reserva_espera > 0);

comment on column public.config_agendamento.minutos_reserva_espera is
  'quanto tempo a vaga fica reservada para a primeira da fila avisada';

-- ------------------------------------------------------------
-- VAGA — passa a respeitar a reserva de quem está na fila
-- ------------------------------------------------------------

create or replace function public.validar_vaga_agendamento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t record;
  ocupadas integer;
  reservadas integer;
begin
  select * into t from public.turmas where id = new.turma_id for update;
  if not found then
    raise exception 'turma inexistente';
  end if;

  select count(*) into ocupadas
  from public.agendamentos
  where turma_id = new.turma_id and data = new.data and status = 'agendado';

  -- Vagas seguradas para OUTRAS alunas da fila, ainda dentro do prazo.
  select count(*) into reservadas
  from public.lista_espera le
  cross join public.config_agendamento cfg
  where le.turma_id = new.turma_id
    and le.data = new.data
    and le.status = 'notificada'
    and le.cliente_id <> new.cliente_id
    and le.notificada_em > now() - make_interval(mins => cfg.minutos_reserva_espera);

  if ocupadas + reservadas >= t.capacidade then
    raise exception 'turma lotada (% vagas)', t.capacidade;
  end if;

  return new;
end;
$$;

-- Agendou? sai da fila como 'confirmada'. Trigger em vez de código
-- dentro de agendar_aula() para valer em qualquer caminho que crie
-- agendamento (portal, equipe, futura Booking API do Wellhub).
create or replace function public.resolver_lista_espera()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.lista_espera
  set status = 'confirmada'
  where turma_id = new.turma_id and data = new.data
    and cliente_id = new.cliente_id
    and status in ('aguardando', 'notificada');
  return new;
end;
$$;

create trigger agendamentos_resolve_fila
  after insert on public.agendamentos
  for each row when (new.status = 'agendado')
  execute function public.resolver_lista_espera();

-- ------------------------------------------------------------
-- ENTRAR / SAIR
-- ------------------------------------------------------------

create or replace function public.entrar_lista_espera(p_turma uuid, p_data date)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  cli uuid;
  t record;
  ocupadas integer;
  le_id uuid;
begin
  if public.is_cliente() then
    cli := public.cliente_atual();
  elsif public.is_socia() then
    raise exception 'use a versão com cliente explícito para inscrever alguém pela equipe';
  else
    raise exception 'acesso restrito à aluna';
  end if;

  select * into t from public.turmas where id = p_turma and ativa;
  if not found then
    raise exception 'turma inexistente';
  end if;
  if p_data < current_date then
    raise exception 'não dá para entrar na fila de uma aula que já passou';
  end if;

  if exists (
    select 1 from public.agendamentos
    where turma_id = p_turma and data = p_data
      and cliente_id = cli and status = 'agendado'
  ) then
    raise exception 'você já tem reserva nesta aula';
  end if;

  -- Fila só existe se a aula estiver cheia; senão a aluna deveria
  -- simplesmente agendar, e mandá-la para a fila seria enganoso.
  select count(*) into ocupadas
  from public.agendamentos
  where turma_id = p_turma and data = p_data and status = 'agendado';

  if ocupadas < t.capacidade then
    raise exception 'ainda há vaga nesta aula — agende direto';
  end if;

  insert into public.lista_espera (turma_id, data, cliente_id)
  values (p_turma, p_data, cli)
  returning id into le_id;

  return le_id;
end;
$$;

create or replace function public.sair_lista_espera(p_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  le record;
begin
  select * into le from public.lista_espera where id = p_id;
  if not found then
    return false;
  end if;
  if not (public.is_socia() or le.cliente_id = public.cliente_atual()) then
    raise exception 'você só pode sair da própria fila';
  end if;

  update public.lista_espera set status = 'cancelada'
  where id = p_id and status in ('aguardando', 'notificada');

  -- Se quem saiu era a notificada, a vaga que estava segurada volta
  -- a circular: chama a próxima em vez de deixar a vaga parada.
  if le.status = 'notificada' then
    perform public.promover_lista_espera(le.turma_id, le.data);
  end if;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- PROMOVER — expira quem perdeu o prazo e avisa a próxima
-- ------------------------------------------------------------

create or replace function public.promover_lista_espera(p_turma uuid, p_data date)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  cfg record;
  t record;
  ocupadas integer;
  reservadas integer;
  proxima record;
begin
  select * into cfg from public.config_agendamento;

  -- 1. quem foi avisada e não agendou a tempo perde a vez
  update public.lista_espera
  set status = 'expirada'
  where turma_id = p_turma and data = p_data
    and status = 'notificada'
    and notificada_em <= now() - make_interval(mins => cfg.minutos_reserva_espera);

  -- 2. sobrou vaga?
  select * into t from public.turmas where id = p_turma;
  if not found then return null; end if;

  select count(*) into ocupadas
  from public.agendamentos
  where turma_id = p_turma and data = p_data and status = 'agendado';

  select count(*) into reservadas
  from public.lista_espera
  where turma_id = p_turma and data = p_data
    and status = 'notificada'
    and notificada_em > now() - make_interval(mins => cfg.minutos_reserva_espera);

  if ocupadas + reservadas >= t.capacidade then
    return null;
  end if;

  -- 3. avisa a primeira da fila (FIFO por criado_em)
  select * into proxima
  from public.lista_espera
  where turma_id = p_turma and data = p_data and status = 'aguardando'
  order by criado_em
  limit 1
  for update skip locked;

  if not found then return null; end if;

  update public.lista_espera
  set status = 'notificada', notificada_em = now()
  where id = proxima.id;

  -- email_enviado_em fica nulo de propósito: é a marca de "e-mail
  -- pendente" que o envio vai varrer quando existir.
  return proxima.cliente_id;
end;
$$;

-- Cancelou uma reserva? a vaga liberada vai para a fila na hora.
create or replace function public.chamar_fila_ao_cancelar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelado' and old.status = 'agendado' then
    perform public.promover_lista_espera(new.turma_id, new.data);
  end if;
  return new;
end;
$$;

create trigger agendamentos_chama_fila
  after update on public.agendamentos
  for each row execute function public.chamar_fila_ao_cancelar();

-- Varredura periódica: sem ela, uma reserva expirada só passaria
-- para a próxima quando alguém mexesse naquela aula por acaso.
create or replace function public.processar_listas_espera()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select distinct turma_id, data
    from public.lista_espera
    where status in ('aguardando', 'notificada')
      and data >= current_date
  loop
    if public.promover_lista_espera(r.turma_id, r.data) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

revoke execute on function public.entrar_lista_espera(uuid, date) from public, anon;
grant execute on function public.entrar_lista_espera(uuid, date) to authenticated;
revoke execute on function public.sair_lista_espera(uuid) from public, anon;
grant execute on function public.sair_lista_espera(uuid) to authenticated;
revoke execute on function public.promover_lista_espera(uuid, date) from public, anon;
revoke execute on function public.processar_listas_espera() from public, anon;

-- Posição na fila, calculada — nunca guardada, para não desalinhar
-- quando alguém desiste no meio.
create view public.vw_posicao_fila
with (security_invoker = true) as
select
  le.id,
  le.turma_id,
  le.data,
  le.cliente_id,
  le.status,
  le.notificada_em,
  row_number() over (
    partition by le.turma_id, le.data order by le.criado_em
  ) as posicao
from public.lista_espera le
where le.status in ('aguardando', 'notificada');

grant select on public.vw_posicao_fila to authenticated;

-- Varredura da fila a cada 10 min: expira reservas vencidas e chama
-- a próxima. Sem isso, uma vaga segurada por quem não confirmou só
-- voltaria a circular quando alguém mexesse naquela aula por acaso.
select cron.schedule(
  'processar-listas-espera',
  '*/10 * * * *',
  $$select public.processar_listas_espera()$$
);
