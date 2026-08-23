-- ============================================================
-- Booking API da Wellhub — modelo de dados para Class/Slot (CLAUDE.md 12.3,
-- docs/interno/wellhub-api-referencia.md §5).
--
-- PROBLEMA. A Booking API não tem conceito de recorrência semanal: uma
-- turma nossa (dia_semana + horario, repete toda semana) não é um Slot —
-- Slot é uma ocorrência DATADA (occur_date). Cada turma ativa precisa gerar
-- um Slot por semana, publicado com antecedência (job em
-- wellhub-publicar-grade, fora desta migration). turmas_wellhub_slots é o
-- mapa turma+data -> slot da Wellhub, para o publicador não duplicar e para
-- o webhook (booking-requested) achar de volta a turma a partir do
-- slot.id que a Wellhub manda.
--
-- Além disso, Class/Slot exigem um product_id que não escolhemos livremente
-- (vem de GET /setup/v1/gyms/:gym_id/products — no sandbox, 1095 Outdoor).
-- Isso fica como secret de Edge Function (WELLHUB_DEFAULT_PRODUCT_ID), não
-- no banco.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Catálogo de modalidades: 3 nomes que vieram do import da grade real
--    (docs/05-BACKLOG.md §10 item 1) e não existiam ainda (o catálogo tinha
--    "Pole Dance 1/2", não "Pole Dance" simples). Mesmo padrão de backfill
--    da migration original (20260722125000).
-- ------------------------------------------------------------
insert into public.modalidades (nome)
values ('Pole Dance'), ('Bases de Salto'), ('Aula de Pole Spin')
on conflict do nothing;

update public.turmas t
set modalidade_id = m.id
from public.modalidades m
where t.modalidade_id is null
  and lower(t.modalidade) = lower(m.nome);

-- ------------------------------------------------------------
-- 2. Uma Class da Wellhub por modalidade — criada uma vez, reaproveitada
--    por todas as turmas daquela modalidade.
-- ------------------------------------------------------------
alter table public.modalidades add column wellhub_class_id text;

create unique index modalidades_wellhub_class_id_unico
  on public.modalidades (wellhub_class_id)
  where wellhub_class_id is not null;

-- ------------------------------------------------------------
-- 3. Mapa turma + ocorrência datada -> Slot da Wellhub.
--    Sem valor monetário (mesmo espírito de checkins_pendentes): é
--    metadado de sincronização, não dado de negócio.
-- ------------------------------------------------------------
create table public.turmas_wellhub_slots (
  id             uuid primary key default gen_random_uuid(),
  turma_id       uuid not null references public.turmas (id) on delete cascade,
  data           date not null,
  wellhub_slot_id text not null,
  publicado_em   timestamptz not null default now(),

  unique (turma_id, data),
  unique (wellhub_slot_id)
);

comment on table public.turmas_wellhub_slots is
  'Mapa turma+data -> Slot publicado na Wellhub Booking API. Escrito só pelo publicador (service_role); a equipe só lê.';

alter table public.turmas_wellhub_slots enable row level security;

create policy "operacao ve turmas_wellhub_slots"
  on public.turmas_wellhub_slots for select
  to authenticated using (public.is_operacional());

-- ------------------------------------------------------------
-- 4. Amarração do agendamento à reserva da Wellhub. É a chave que
--    checkin-booking-occurred usa para achar a turma sem heurística —
--    ao contrário do check-in avulso (registrar_checkin_wellhub), que
--    precisa da fila checkins_pendentes por não ter esse vínculo.
-- ------------------------------------------------------------
alter table public.agendamentos add column wellhub_booking_number text;

create unique index agendamentos_wellhub_booking_number_unico
  on public.agendamentos (wellhub_booking_number)
  where wellhub_booking_number is not null;

-- ------------------------------------------------------------
-- 5. Job diário que publica a grade — mesmo molde de disparar_emails()
--    (20260806120000_cron_emails_via_vault.sql): lê project_url/anon_key do
--    Vault do próprio projeto, chama a Edge Function via net.http_post.
--    Ambiente sem os segredos no Vault não faz nada, de propósito — mesma
--    trava de isolamento DEV/PROD.
-- ------------------------------------------------------------
create or replace function public.disparar_publicacao_grade_wellhub()
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'anon_key';

  if v_url is null or v_key is null then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/wellhub-publicar-grade',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.disparar_publicacao_grade_wellhub() is
  'Chama a Edge Function wellhub-publicar-grade DESTE projeto, lendo project_url e '
  'anon_key do Vault local. Sem esses segredos no Vault, não faz nada.';

revoke all on function public.disparar_publicacao_grade_wellhub() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'publicar-grade-wellhub') then
    perform cron.unschedule('publicar-grade-wellhub');
  end if;
end
$$;

select cron.schedule(
  'publicar-grade-wellhub',
  '0 6 * * *',
  $$select public.disparar_publicacao_grade_wellhub();$$
);
