-- ============================================================
-- Fase 1 — Clientes + CRM
-- Tabelas: socias, clientes, interacoes_crm
-- Regras: RLS por "é sócia" (ver CLAUDE.md seção 3); funil e
-- origem como enums (decisão validada com as sócias).
-- ============================================================

-- Estágios do funil exatamente como em docs/01-NEGOCIO.md seção 4.
create type public.estagio_funil as enum (
  'lead',
  'pediu_informacoes',
  'agendou_experimental',
  'fez_experimental',
  'ativa',
  'inativa',
  'em_retorno',
  'ex_aluna'
);

create type public.origem_cliente as enum (
  'whatsapp',
  'instagram',
  'wellhub',
  'classpass',
  'indicacao',
  'passou_na_porta',
  'outros'
);

create type public.tipo_interacao as enum (
  'nota',
  'whatsapp',
  'conversa',
  'mudanca_estagio'
);

-- ------------------------------------------------------------
-- SÓCIAS — perfil 1:1 com auth.users; base do RLS do sistema.
-- ------------------------------------------------------------
create table public.socias (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  criada_em timestamptz not null default now()
);

alter table public.socias enable row level security;

-- security definer: consulta socias sem recursão de RLS.
create or replace function public.is_socia()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.socias where id = (select auth.uid()));
$$;

-- Hoje todo login criado no Auth é de sócia (signup é controlado pelas 3).
-- Quando alunas/professoras ganharem acesso (Fases 2/4), este trigger passa
-- a rotear por papel em vez de assumir sócia.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.socias (id, nome)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: sócias que já tinham login antes desta migration.
insert into public.socias (id, nome)
select id, coalesce(raw_user_meta_data ->> 'nome', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

create policy "socias veem socias"
  on public.socias for select
  to authenticated
  using (public.is_socia());

create policy "socia atualiza o proprio perfil"
  on public.socias for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- insert/delete apenas via trigger/admin — sem policy = negado.

-- ------------------------------------------------------------
-- CLIENTES — cadastro central do CRM (docs/01-NEGOCIO.md seção 4).
-- ------------------------------------------------------------
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  instagram text,
  origem public.origem_cliente not null default 'outros',
  estagio public.estagio_funil not null default 'lead',
  modalidade text,
  responsavel_id uuid references public.socias (id) on delete set null,
  primeiro_contato date not null default current_date,
  -- alimentada automaticamente pela Presença na Fase 4
  ultima_aula date,
  ultima_conversa date,
  -- gatilho de aniversário do Follow-up (Fase 3)
  data_nascimento date,
  vip boolean not null default false,
  -- casa com o webhook Wellhub na Fase 4 (CLAUDE.md 12.5)
  gympass_id text,
  observacoes text,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index clientes_estagio_idx on public.clientes (estagio);
create index clientes_responsavel_idx on public.clientes (responsavel_id);

alter table public.clientes enable row level security;

create policy "socias gerenciam clientes"
  on public.clientes for all
  to authenticated
  using (public.is_socia())
  with check (public.is_socia());

create or replace function public.set_atualizada_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizada_em := now();
  return new;
end;
$$;

create trigger clientes_atualizada_em
  before update on public.clientes
  for each row execute function public.set_atualizada_em();

-- ------------------------------------------------------------
-- INTERAÇÕES CRM — histórico append-only por cliente.
-- Consumido pelo Follow-up (Fase 3).
-- ------------------------------------------------------------
create table public.interacoes_crm (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  -- null = registrada pelo sistema (seed, automações)
  socia_id uuid references public.socias (id) on delete set null,
  tipo public.tipo_interacao not null default 'nota',
  descricao text not null,
  criada_em timestamptz not null default now()
);

create index interacoes_crm_cliente_idx
  on public.interacoes_crm (cliente_id, criada_em desc);

alter table public.interacoes_crm enable row level security;

create policy "socias veem interacoes"
  on public.interacoes_crm for select
  to authenticated
  using (public.is_socia());

create policy "socias registram interacoes"
  on public.interacoes_crm for insert
  to authenticated
  with check (public.is_socia());

create policy "autora apaga a propria interacao"
  on public.interacoes_crm for delete
  to authenticated
  using (socia_id = (select auth.uid()));

-- sem policy de update: histórico não se edita.

-- Toda mudança de estágio no funil vira registro automático no histórico.
create or replace function public.log_mudanca_estagio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estagio is distinct from old.estagio then
    insert into public.interacoes_crm (cliente_id, socia_id, tipo, descricao)
    values (
      new.id,
      auth.uid(),
      'mudanca_estagio',
      old.estagio::text || ' -> ' || new.estagio::text
    );
  end if;
  return new;
end;
$$;

create trigger clientes_log_estagio
  after update on public.clientes
  for each row execute function public.log_mudanca_estagio();
