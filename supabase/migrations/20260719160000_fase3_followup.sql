-- ============================================================
-- Fase 3 — Follow-up automático
-- Tabelas: followup_regras (dias configuráveis), followups
-- Função:  gerar_followups() — varre CRM + financeiro e cria
--          pendências; roda via pg_cron diário e via RPC.
-- Gatilhos: docs/01-NEGOCIO.md seção 6 (inatividade fica 100%
-- automática só na Fase 4 — hoje usa ultima_aula manual).
-- ============================================================

create type public.tipo_followup as enum (
  'lead_sumido',
  'experimental_sem_retorno',
  'cliente_inativa',
  'aniversario',
  'vencimento_plano'
);

create type public.status_followup as enum ('pendente', 'concluido', 'dispensado');

-- ------------------------------------------------------------
-- REGRAS — os "X dias" de cada gatilho, editáveis pelas sócias.
-- ------------------------------------------------------------
create table public.followup_regras (
  tipo public.tipo_followup primary key,
  dias integer not null check (dias >= 0),
  ativa boolean not null default true,
  atualizada_em timestamptz not null default now()
);

insert into public.followup_regras (tipo, dias) values
  ('lead_sumido', 7),
  ('experimental_sem_retorno', 5),
  ('cliente_inativa', 15),
  ('aniversario', 0),
  ('vencimento_plano', 3);

alter table public.followup_regras enable row level security;

create policy "socias veem regras de followup"
  on public.followup_regras for select
  to authenticated using (public.is_socia());

create policy "socias ajustam regras de followup"
  on public.followup_regras for update
  to authenticated using (public.is_socia()) with check (public.is_socia());

-- conjunto fixo pelo enum: sem insert/delete.

create trigger followup_regras_atualizada_em
  before update on public.followup_regras
  for each row execute function public.set_atualizada_em();

-- ------------------------------------------------------------
-- FOLLOWUPS — pendências geradas para as sócias agirem.
-- ------------------------------------------------------------
create table public.followups (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo public.tipo_followup not null,
  detalhe text,
  -- vencimento_plano: aponta a mensalidade prevista que originou
  entrada_id uuid references public.entradas_financeiras (id) on delete cascade,
  status public.status_followup not null default 'pendente',
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid references public.socias (id) on delete set null
);

-- nunca duas pendências abertas do mesmo gatilho p/ a mesma cliente
create unique index followups_pendente_unico
  on public.followups (cliente_id, tipo) where status = 'pendente';
create index followups_status_idx on public.followups (status, criado_em desc);

alter table public.followups enable row level security;

create policy "socias gerenciam followups"
  on public.followups for all
  to authenticated using (public.is_socia()) with check (public.is_socia());

-- ------------------------------------------------------------
-- GERADOR — chamado pelo cron (sem sessão) e pela UI (RPC).
-- security definer: precisa ler/escrever sob as regras do dono;
-- guarda interna barra usuárias autenticadas que não são sócias.
-- ------------------------------------------------------------
create or replace function public.gerar_followups()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  regra record;
  novas integer;
  total integer := 0;
begin
  -- cron roda sem auth.uid(); usuária logada precisa ser sócia
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito às sócias';
  end if;

  -- LEAD SUMIDO: lead/pediu_informacoes sem conversa há X dias
  select * into regra from public.followup_regras where tipo = 'lead_sumido';
  if regra.ativa then
    insert into public.followups (cliente_id, tipo, detalhe)
    select c.id, 'lead_sumido',
      'Sem conversa há ' || (current_date - coalesce(c.ultima_conversa, c.primeiro_contato)) || ' dias'
    from public.clientes c
    where c.estagio in ('lead', 'pediu_informacoes')
      and coalesce(c.ultima_conversa, c.primeiro_contato) <= current_date - regra.dias
      and not exists (
        select 1 from public.followups f
        where f.cliente_id = c.id and f.tipo = 'lead_sumido'
          and (f.status = 'pendente'
               or f.criado_em > now() - make_interval(days => regra.dias))
      )
    on conflict do nothing;
    get diagnostics novas = row_count;
    total := total + novas;
  end if;

  -- EXPERIMENTAL SEM RETORNO: fez experimental e não avançou em X dias
  select * into regra from public.followup_regras where tipo = 'experimental_sem_retorno';
  if regra.ativa then
    insert into public.followups (cliente_id, tipo, detalhe)
    select c.id, 'experimental_sem_retorno',
      'Fez experimental e não retornou (' ||
      (current_date - coalesce(
        (select max(mf.ocorreu_em)::date from public.movimentacoes_funil mf
         where mf.cliente_id = c.id and mf.estagio_para = 'fez_experimental'),
        c.ultima_conversa, c.primeiro_contato)) || ' dias)'
    from public.clientes c
    where c.estagio = 'fez_experimental'
      and coalesce(
        (select max(mf.ocorreu_em)::date from public.movimentacoes_funil mf
         where mf.cliente_id = c.id and mf.estagio_para = 'fez_experimental'),
        c.ultima_conversa, c.primeiro_contato) <= current_date - regra.dias
      and not exists (
        select 1 from public.followups f
        where f.cliente_id = c.id and f.tipo = 'experimental_sem_retorno'
          and (f.status = 'pendente'
               or f.criado_em > now() - make_interval(days => regra.dias))
      )
    on conflict do nothing;
    get diagnostics novas = row_count;
    total := total + novas;
  end if;

  -- CLIENTE INATIVA: ativa sem aula há X dias (manual até a Fase 4)
  select * into regra from public.followup_regras where tipo = 'cliente_inativa';
  if regra.ativa then
    insert into public.followups (cliente_id, tipo, detalhe)
    select c.id, 'cliente_inativa',
      'Sem aula há ' || (current_date - c.ultima_aula) || ' dias'
    from public.clientes c
    where c.estagio = 'ativa'
      and c.ultima_aula is not null
      and c.ultima_aula <= current_date - regra.dias
      and not exists (
        select 1 from public.followups f
        where f.cliente_id = c.id and f.tipo = 'cliente_inativa'
          and (f.status = 'pendente'
               or f.criado_em > now() - make_interval(days => regra.dias))
      )
    on conflict do nothing;
    get diagnostics novas = row_count;
    total := total + novas;
  end if;

  -- ANIVERSÁRIO: hoje; não repete no mesmo ano (janela de 300 dias)
  select * into regra from public.followup_regras where tipo = 'aniversario';
  if regra.ativa then
    insert into public.followups (cliente_id, tipo, detalhe)
    select c.id, 'aniversario', 'Aniversário hoje 🎉'
    from public.clientes c
    where c.data_nascimento is not null
      and to_char(c.data_nascimento, 'MM-DD') = to_char(current_date, 'MM-DD')
      and not exists (
        select 1 from public.followups f
        where f.cliente_id = c.id and f.tipo = 'aniversario'
          and (f.status = 'pendente' or f.criado_em > now() - interval '300 days')
      )
    on conflict do nothing;
    get diagnostics novas = row_count;
    total := total + novas;
  end if;

  -- VENCIMENTO: mensalidade prevista vencendo em X dias (integra Fase 2)
  select * into regra from public.followup_regras where tipo = 'vencimento_plano';
  if regra.ativa then
    insert into public.followups (cliente_id, tipo, detalhe, entrada_id)
    select e.cliente_id, 'vencimento_plano',
      'Mensalidade de R$ ' || to_char(e.valor_centavos / 100.0, 'FM999G990D00') ||
      ' prevista para ' || to_char(e.data_prevista, 'DD/MM'),
      e.id
    from public.entradas_financeiras e
    where e.status = 'prevista'
      and e.categoria = 'mensalista'
      and e.cliente_id is not null
      and e.data_prevista is not null
      and e.data_prevista <= current_date + regra.dias
      and not exists (
        select 1 from public.followups f where f.entrada_id = e.id
      )
    on conflict do nothing;
    get diagnostics novas = row_count;
    total := total + novas;
  end if;

  return total;
end;
$$;

-- só sócias (RPC) e o cron (postgres, dono) executam
revoke execute on function public.gerar_followups() from public, anon;
grant execute on function public.gerar_followups() to authenticated;

-- ------------------------------------------------------------
-- CRON — gera pendências todo dia às 09:00 UTC (06:00 BRT).
-- ------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'gerar-followups-diario',
  '0 9 * * *',
  'select public.gerar_followups()'
);
