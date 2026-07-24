-- Fila de e-mails (outbox) + gatilhos por evento.
-- Cada evento do sistema enfileira um e-mail; a Edge Function enviar-emails
-- varre a fila, renderiza pelo `tipo` e envia. Desenho extensível: novos
-- e-mails = novo tipo + quem enfileira. Nada pode derrubar a operação que
-- dispara o e-mail (os gatilhos engolem exceções).

create type public.status_email as enum ('pendente', 'enviado', 'erro');

create table public.emails_fila (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  destinatario text not null,
  dados jsonb not null default '{}',
  ref text,                       -- dedup (ex.: 'lembrete:<agendamento_id>')
  status public.status_email not null default 'pendente',
  tentativas integer not null default 0,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index emails_fila_pendentes_idx on public.emails_fila (criado_em) where status = 'pendente';
create unique index emails_fila_ref_idx on public.emails_fila (ref) where ref is not null;

alter table public.emails_fila enable row level security;
create policy "gestao ve fila de emails" on public.emails_fila
  for select to authenticated using (public.is_gestao());

create or replace function public.enfileirar_email(
  p_tipo text, p_destinatario text, p_dados jsonb default '{}', p_ref text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_destinatario is null or length(trim(p_destinatario)) = 0 then return; end if;
  if p_ref is not null and exists (select 1 from public.emails_fila where ref = p_ref) then return; end if;
  insert into public.emails_fila (tipo, destinatario, dados, ref)
  values (p_tipo, p_destinatario, coalesce(p_dados, '{}'::jsonb), p_ref);
exception when others then
  null;
end; $$;

create or replace function public.email_vaga_liberada()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record; t record; mins integer;
begin
  if new.status = 'notificada' and old.status is distinct from 'notificada' then
    select nome, email into c from public.clientes where id = new.cliente_id;
    select modalidade, horario into t from public.turmas where id = new.turma_id;
    select minutos_reserva_espera into mins from public.config_agendamento;
    perform public.enfileirar_email(
      'vaga_liberada', c.email,
      jsonb_build_object('nome', c.nome, 'modalidade', t.modalidade,
                         'data', new.data, 'horario', t.horario, 'minutos', mins),
      'vaga:' || new.id || ':' || extract(epoch from new.notificada_em)::bigint
    );
  end if;
  return new;
exception when others then return new;
end; $$;

create trigger lista_espera_email after update on public.lista_espera
  for each row execute function public.email_vaga_liberada();

create or replace function public.email_confirmacao_agendamento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record; t record;
begin
  select nome, email into c from public.clientes where id = new.cliente_id;
  select modalidade, horario into t from public.turmas where id = new.turma_id;
  perform public.enfileirar_email(
    'confirmacao_agendamento', c.email,
    jsonb_build_object('nome', c.nome, 'modalidade', t.modalidade,
                       'data', new.data, 'horario', t.horario),
    'confirm:' || new.id
  );
  return new;
exception when others then return new;
end; $$;

create trigger agendamentos_email_confirmacao after insert on public.agendamentos
  for each row when (new.status = 'agendado')
  execute function public.email_confirmacao_agendamento();

create or replace function public.enfileirar_lembretes_aula()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in
    select a.id, a.data, c.nome, c.email, t.modalidade, t.horario
    from public.agendamentos a
    join public.clientes c on c.id = a.cliente_id
    join public.turmas t on t.id = a.turma_id
    where a.status = 'agendado' and a.data = current_date + 1
  loop
    perform public.enfileirar_email(
      'lembrete_aula', r.email,
      jsonb_build_object('nome', r.nome, 'modalidade', r.modalidade,
                         'data', r.data, 'horario', r.horario),
      'lembrete:' || r.id
    );
    n := n + 1;
  end loop;
  return n;
end; $$;

create or replace function public.enfileirar_vencimentos()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in
    select m.id, m.data_fim, c.nome, c.email, p.nome as plano, p.preco_centavos
    from public.matriculas m
    join public.clientes c on c.id = m.cliente_id
    join public.planos p on p.id = m.plano_id
    where m.status = 'ativa' and m.data_fim = current_date + 3
  loop
    perform public.enfileirar_email(
      'vencimento', r.email,
      jsonb_build_object('nome', r.nome, 'plano', r.plano,
                         'data_fim', r.data_fim, 'valor_centavos', r.preco_centavos),
      'venc:' || r.id || ':' || r.data_fim
    );
    n := n + 1;
  end loop;
  return n;
end; $$;

revoke execute on function public.enfileirar_email(text, text, jsonb, text) from public, anon;
revoke execute on function public.enfileirar_lembretes_aula() from public, anon;
revoke execute on function public.enfileirar_vencimentos() from public, anon;

select cron.schedule('lembretes-aula', '0 11 * * *', $$select public.enfileirar_lembretes_aula()$$);
select cron.schedule('vencimentos', '0 11 * * *', $$select public.enfileirar_vencimentos()$$);
