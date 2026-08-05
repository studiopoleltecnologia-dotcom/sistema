-- Inscrições de eventos abertos (Pic Nic Day e futuras edições).
--
-- Diferente do resto do sistema, esta tabela recebe INSERT de gente sem conta:
-- a página pública de inscrição escreve com a anon key. Por isso:
--   * INSERT é liberado para anon, mas com WITH CHECK que impede a pessoa
--     marcar a própria inscrição como paga;
--   * SELECT é negado a anon — a lista tem nome e telefone de terceiros e
--     vazaria se qualquer um pudesse ler;
--   * confirmação de pagamento é ato da equipe, feito pelo comprovante que
--     chega no WhatsApp.

create table if not exists public.inscricoes_evento (
  id                 uuid primary key default gen_random_uuid(),
  evento             text not null default 'picnic-day-2026-08-30',
  nome               text not null,
  telefone           text not null,
  tipo_ingresso      text not null,
  nome_acompanhante  text,
  valor_centavos     integer not null,
  pago               boolean not null default false,
  pago_em            timestamptz,
  confirmado_por     uuid references auth.users (id),
  observacoes        text,
  criado_em          timestamptz not null default now(),

  constraint inscricoes_evento_evento_chk
    check (char_length(evento) between 3 and 60),
  constraint inscricoes_evento_nome_chk
    check (char_length(btrim(nome)) between 2 and 120),
  constraint inscricoes_evento_telefone_chk
    check (char_length(btrim(telefone)) between 8 and 30),
  constraint inscricoes_evento_tipo_chk
    check (tipo_ingresso in ('individual', 'dupla')),
  constraint inscricoes_evento_acompanhante_chk
    check (
      (tipo_ingresso = 'individual' and nome_acompanhante is null)
      or (tipo_ingresso = 'dupla'
          and char_length(btrim(coalesce(nome_acompanhante, ''))) between 2 and 120)
    ),
  constraint inscricoes_evento_valor_chk
    check (valor_centavos between 100 and 100000),
  constraint inscricoes_evento_obs_chk
    check (observacoes is null or char_length(observacoes) <= 500),
  -- pago e pago_em andam juntos: não existe "pago sem data" nem o contrário
  constraint inscricoes_evento_pago_chk
    check ((pago = false and pago_em is null) or (pago = true and pago_em is not null))
);

comment on table public.inscricoes_evento is
  'Inscrições em eventos abertos ao público. Recebe INSERT anônimo da página de inscrição; leitura restrita à equipe.';
comment on column public.inscricoes_evento.pago is
  'Confirmado pela equipe ao receber o comprovante do Pix. Nunca preenchido pela pessoa que se inscreve.';
comment on column public.inscricoes_evento.evento is
  'Slug da edição, para a tabela servir às próximas sem migration nova.';

create index if not exists inscricoes_evento_evento_criado_idx
  on public.inscricoes_evento (evento, criado_em desc);

alter table public.inscricoes_evento enable row level security;

-- Privilégios explícitos: anon só escreve, nunca lê.
revoke all on public.inscricoes_evento from anon, authenticated;
grant insert on public.inscricoes_evento to anon;
grant select, insert, update, delete on public.inscricoes_evento to authenticated;

drop policy if exists inscricoes_evento_insert_publico on public.inscricoes_evento;
create policy inscricoes_evento_insert_publico
  on public.inscricoes_evento
  for insert
  to anon, authenticated
  with check (
    pago = false
    and pago_em is null
    and confirmado_por is null
    and observacoes is null
  );

drop policy if exists inscricoes_evento_select_equipe on public.inscricoes_evento;
create policy inscricoes_evento_select_equipe
  on public.inscricoes_evento
  for select
  to authenticated
  using (public.is_operacional());

drop policy if exists inscricoes_evento_update_equipe on public.inscricoes_evento;
create policy inscricoes_evento_update_equipe
  on public.inscricoes_evento
  for update
  to authenticated
  using (public.is_operacional())
  with check (public.is_operacional());

drop policy if exists inscricoes_evento_delete_gestao on public.inscricoes_evento;
create policy inscricoes_evento_delete_gestao
  on public.inscricoes_evento
  for delete
  to authenticated
  using (public.is_gestao());
