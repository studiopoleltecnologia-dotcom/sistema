-- ============================================================
-- Booking API da Wellhub — o que faltava para a homologação (28/09/2026).
--
-- O time da Wellhub testou o booking-requested no sandbox e "não identificou
-- o fluxo de reservas ocorrendo". O que eles esperam:
--
--   booking-requested         -> PATCH do booking (RESERVED/REJECTED)
--                                + PATCH do slot com o total_booked novo
--   booking-canceled/
--   booking-late-canceled     -> SÓ o PATCH do slot. O cancelamento do
--                                booking é deles.
--
-- Causa, conferida no log e no banco: o webhook nunca mandava o PATCH do
-- slot. A reserva do teste (BK_BO3GPLB) foi criada e confirmada; o
-- total_booked é que ficou em 0.
--
-- Risco achado no caminho, não observado: a reserva tinha três passos
-- soltos (procura o booking -> agendar_aula -> grava o booking_number)
-- numa função de 2-3 s contra o orçamento de 1 s da Wellhub. Uma
-- reentrega no meio bateria no índice agendamentos_ativo_unico e mandaria
-- REJECTED enquanto a primeira mandava RESERVED. E a reentrega de um
-- booking já gravado nunca repetia o PATCH.
--
-- Aqui:
--   1. reservar_wellhub(): a reserva inteira numa transação, travada pelo
--      booking_number. Reentrega vira 'duplicado_ativo' e o webhook só
--      repete o PATCH — é isso que torna seguro responder 500 e deixar a
--      Wellhub tentar de novo.
--   2. wellhub_total_booked(): o número que vai no PATCH do slot. Mesma
--      regra de vaga do Portal (agendados de TODOS os canais + vagas de
--      turma fixa, CLAUDE.md 9.1), via assentos_fixos_ocupados(), que é a
--      função única dessa conta (20260908120000). Reserva segurada pela
--      lista de espera fica de fora, igual ao Portal: expira em minutos e
--      nada atualizaria o slot quando expirasse.
--   3. agendamentos.wellhub_confirmado_em: a prova que sobrevive ao log.
--      Log de Edge Function expira em dias; foi assim que ficamos sem saber
--      o que aconteceu com o booking do primeiro teste.
--   4. turmas_wellhub_slots.wellhub_class_id: a rota do PATCH do slot pede
--      o class_id. O payload traz, mas o cancelamento e as sincronizações
--      futuras precisam achar sem payload — e modalidades.wellhub_class_id
--      está vazio em produção de propósito (preencher lá faria o
--      publicar-grade usar class do sandbox no go-live).
--
-- Tudo interno: só o service_role (o webhook) executa.
-- ============================================================

alter table public.agendamentos
  add column wellhub_confirmado_em timestamptz;

comment on column public.agendamentos.wellhub_confirmado_em is
  'Quando a Wellhub aceitou o nosso PATCH RESERVED (HTTP 2xx). Com wellhub_booking_number preenchido e isto nulo, a reserva existe aqui mas não foi confirmada lá.';

alter table public.turmas_wellhub_slots
  add column wellhub_class_id text;

comment on column public.turmas_wellhub_slots.wellhub_class_id is
  'Class da Wellhub a que o slot pertence. A rota do PATCH do slot exige; sem isto, o fallback é modalidades.wellhub_class_id.';

-- ------------------------------------------------------------
-- total_booked de uma aula: o que o app da Wellhub precisa enxergar como
-- ocupado. least() porque a API recusa booked > capacity.
-- ------------------------------------------------------------
create or replace function public.wellhub_total_booked(p_turma uuid, p_data date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select least(
    t.capacidade,
    (select count(*)::int
       from public.agendamentos a
      where a.turma_id = p_turma
        and a.data = p_data
        and a.status = 'agendado')
    + public.assentos_fixos_ocupados(p_turma, p_data)
  )
  from public.turmas t
  where t.id = p_turma;
$$;

-- ------------------------------------------------------------
-- Slot da Wellhub -> nossa aula + ocupação atual. Null = slot que não
-- publicamos.
-- ------------------------------------------------------------
create or replace function public.wellhub_ocupacao_slot(p_slot text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'turma_id', s.turma_id,
    'data', s.data,
    'class_id', coalesce(s.wellhub_class_id, m.wellhub_class_id),
    'capacidade', t.capacidade,
    'total_booked', public.wellhub_total_booked(s.turma_id, s.data)
  )
  from public.turmas_wellhub_slots s
  join public.turmas t on t.id = s.turma_id
  left join public.modalidades m on m.id = t.modalidade_id
  where s.wellhub_slot_id = p_slot;
$$;

-- ------------------------------------------------------------
-- A reserva vinda do app. Devolve o desfecho em 'resultado':
--   reservado | duplicado_ativo | duplicado_cancelado | slot_desconhecido
--   | ja_agendado | lotada | aula_cancelada | fora_da_janela | erro
-- mais turma_id, data, class_id, capacidade e total_booked (já contando
-- esta reserva), para o webhook montar os dois PATCHes sem voltar ao banco.
-- ------------------------------------------------------------
create or replace function public.reservar_wellhub(
  p_token text,
  p_nome text,
  p_slot text,
  p_booking text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ag record;
  sl jsonb;
  v_turma uuid;
  v_data date;
  v_cliente uuid;
  v_agendamento uuid;
  v_resultado text;
  v_erro text;
begin
  if auth.uid() is not null then
    raise exception 'reservar_wellhub é de uso interno do webhook';
  end if;
  if coalesce(p_token, '') = '' or coalesce(p_slot, '') = ''
     or coalesce(p_booking, '') = '' then
    raise exception 'token, slot e booking_number são obrigatórios';
  end if;

  -- Duas entregas do mesmo booking se enfileiram aqui; a segunda já
  -- encontra o booking_number gravado pela primeira.
  perform pg_advisory_xact_lock(hashtextextended('wellhub-booking:' || p_booking, 0));

  select a.id, a.status, a.wellhub_confirmado_em
    into ag
    from public.agendamentos a
   where a.wellhub_booking_number = p_booking;
  if found then
    return coalesce(public.wellhub_ocupacao_slot(p_slot), '{}'::jsonb)
      || jsonb_build_object(
           'resultado', case when ag.status = 'agendado'
                             then 'duplicado_ativo' else 'duplicado_cancelado' end,
           'agendamento_id', ag.id,
           'confirmado', ag.wellhub_confirmado_em is not null);
  end if;

  sl := public.wellhub_ocupacao_slot(p_slot);
  if sl is null then
    return jsonb_build_object('resultado', 'slot_desconhecido');
  end if;
  v_turma := (sl->>'turma_id')::uuid;
  v_data := (sl->>'data')::date;

  -- clientes.gympass_id não tem índice único: sem a trava, duas reservas
  -- simultâneas de uma aluna nova criariam duas fichas.
  perform pg_advisory_xact_lock(hashtextextended('wellhub-token:' || p_token, 0));
  select c.id into v_cliente
    from public.clientes c
   where c.gympass_id = p_token
   order by c.criada_em
   limit 1;
  if v_cliente is null then
    insert into public.clientes (nome, origem, estagio, gympass_id)
    values (coalesce(nullif(btrim(p_nome), ''), 'Aluna Wellhub ' || p_token),
            'wellhub', 'ativa', p_token)
    returning id into v_cliente;
  end if;

  if exists (
    select 1 from public.agendamentos a
     where a.turma_id = v_turma and a.data = v_data
       and a.cliente_id = v_cliente and a.status = 'agendado'
  ) then
    return sl || jsonb_build_object('resultado', 'ja_agendado');
  end if;

  -- As mensagens abaixo são as de agendar_aula() e do gatilho de vaga
  -- (20260908120000, 20260921210000). Canal wellhub não passa pelas travas
  -- de crédito, então é só isso que pode recusar.
  begin
    v_agendamento := public.agendar_aula(v_cliente, v_turma, v_data, 'wellhub');
    update public.agendamentos
       set wellhub_booking_number = p_booking
     where id = v_agendamento;
  exception
    when unique_violation then
      v_resultado := 'ja_agendado';
      v_erro := sqlerrm;
    when others then
      v_erro := sqlerrm;
      v_resultado := case
        when v_erro like 'turma lotada%' then 'lotada'
        when v_erro like 'esta aula foi cancelada pelo estúdio%' then 'aula_cancelada'
        when v_erro like 'este aluno tem vaga fixa nesta turma%' then 'ja_agendado'
        when v_erro like 'não dá para agendar aula em data que já passou%' then 'fora_da_janela'
        else 'erro'
      end;
  end;

  if v_resultado is not null then
    return public.wellhub_ocupacao_slot(p_slot)
      || jsonb_build_object('resultado', v_resultado, 'erro', v_erro);
  end if;

  return public.wellhub_ocupacao_slot(p_slot)
    || jsonb_build_object('resultado', 'reservado',
                          'agendamento_id', v_agendamento,
                          'confirmado', false);
end;
$$;

-- Tirar de PUBLIC, que é onde o Postgres põe o EXECUTE por padrão
-- (20260921170000). Só o webhook, com service_role, chama.
revoke execute on function public.wellhub_total_booked(uuid, date) from public, anon, authenticated;
revoke execute on function public.wellhub_ocupacao_slot(text) from public, anon, authenticated;
revoke execute on function public.reservar_wellhub(text, text, text, text) from public, anon, authenticated;
grant execute on function public.wellhub_total_booked(uuid, date) to service_role;
grant execute on function public.wellhub_ocupacao_slot(text) to service_role;
grant execute on function public.reservar_wellhub(text, text, text, text) to service_role;
