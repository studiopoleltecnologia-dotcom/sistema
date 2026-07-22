-- ============================================================
-- M1 — Cadastros de contato + autoria real nos livros-razão
--
-- 1) Os três portais pedem os mesmos 4 campos de cadastro
--    (nome, telefone, email, data de nascimento). Faltavam
--    clientes.email, professoras.email e professoras.data_nascimento.
--
-- 2) criado_por em creditos_eventos/agendamentos_eventos apontava
--    para socias(id). Quem opera não sendo da equipe (aluna hoje,
--    professora a partir da M3) não existe em socias, então a
--    migration 20260719230000 contornou gravando null — a autoria
--    sumia justamente nos eventos de quem não é da equipe.
--    Aqui a FK passa a apontar para auth.users(id), que é o
--    denominador comum dos três papéis, e as funções voltam a
--    gravar auth.uid() direto.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CAMPOS DE CONTATO
-- ------------------------------------------------------------

-- clientes já tem nome, telefone e data_nascimento (gatilho de
-- aniversário do Follow-up); só faltava o e-mail.
alter table public.clientes add column if not exists email text;

alter table public.professoras add column if not exists email text;
alter table public.professoras add column if not exists data_nascimento date;

-- E-mail da professora é a chave do convite (M3): é por ele que o
-- signup dela casa com o cadastro que a equipe criou. Duas
-- professoras com o mesmo e-mail tornariam esse casamento ambíguo.
create unique index if not exists professoras_email_unico
  on public.professoras (lower(email)) where email is not null;

-- ------------------------------------------------------------
-- 2. AUTORIA — criado_por passa a referenciar auth.users
-- ------------------------------------------------------------

alter table public.creditos_eventos
  drop constraint if exists creditos_eventos_criado_por_fkey;
alter table public.creditos_eventos
  add constraint creditos_eventos_criado_por_fkey
  foreign key (criado_por) references auth.users (id) on delete set null;

alter table public.agendamentos_eventos
  drop constraint if exists agendamentos_eventos_criado_por_fkey;
alter table public.agendamentos_eventos
  add constraint agendamentos_eventos_criado_por_fkey
  foreign key (criado_por) references auth.users (id) on delete set null;

-- ------------------------------------------------------------
-- 3. FUNÇÕES — voltam a gravar auth.uid() como autor
-- Corpo idêntico ao da 20260719230000, menos a variável `autor`.
-- ------------------------------------------------------------

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
  if auth.uid() is not null then
    if public.is_cliente() then
      if p_cliente <> public.cliente_atual() then
        raise exception 'aluna só pode contratar plano para si mesma';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito à equipe ou à própria cliente';
    end if;
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
  if auth.uid() is not null then
    if public.is_cliente() then
      if p_cliente <> public.cliente_atual() then
        raise exception 'aluna só pode agendar em nome de si mesma';
      end if;
      if p_canal <> 'mensalista' then
        raise exception 'aluna só agenda pelo canal mensalista';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito à equipe ou à própria cliente';
    end if;
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
  if auth.uid() is not null then
    if public.is_cliente() then
      if p_origem <> 'aluna' then
        raise exception 'origem de cancelamento inválida para este papel';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito à equipe ou à própria cliente';
    end if;
  end if;

  select * into ag from public.agendamentos where id = p_agendamento for update;
  if not found or ag.status <> 'agendado' then
    raise exception 'agendamento inexistente ou já cancelado';
  end if;

  if public.is_cliente() and ag.cliente_id <> public.cliente_atual() then
    raise exception 'aluna só pode cancelar a própria reserva';
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

-- ------------------------------------------------------------
-- 4. CRIAR_CONTA_ALUNA — passa a receber e-mail e nascimento.
-- Assinatura antiga removida (não deixar overload ambíguo).
-- Casamento com o CRM agora tenta telefone e depois e-mail; segue
-- valendo a regra de não casar no escuro quando há ambiguidade
-- (docs/04 §8.1: melhor criar nova e a equipe mesclar depois do
-- que vincular à pessoa errada).
-- ------------------------------------------------------------

drop function if exists public.criar_conta_aluna(text, text, boolean, text);

create or replace function public.criar_conta_aluna(
  p_nome text,
  p_telefone text,
  p_email text,
  p_data_nascimento date,
  p_aceite_lgpd boolean,
  p_versao_termo text default 'v1'
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  c_id uuid;
  candidatos integer;
begin
  if auth.uid() is null then
    raise exception 'requer sessão autenticada';
  end if;
  if public.is_socia() then
    raise exception 'conta da equipe não pode virar conta de aluna';
  end if;
  if exists (select 1 from public.contas_aluna where auth_user_id = auth.uid()) then
    raise exception 'esta conta já está vinculada a uma cliente';
  end if;
  if not p_aceite_lgpd then
    raise exception 'aceite dos termos é obrigatório para criar a conta';
  end if;

  -- 1ª tentativa: telefone.
  if p_telefone is not null and length(trim(p_telefone)) > 0 then
    select count(*) into candidatos from public.clientes where telefone = p_telefone;
    if candidatos = 1 then
      select id into c_id from public.clientes where telefone = p_telefone;
    end if;
  end if;

  -- 2ª tentativa: e-mail.
  if c_id is null and p_email is not null and length(trim(p_email)) > 0 then
    select count(*) into candidatos from public.clientes
    where lower(email) = lower(p_email);
    if candidatos = 1 then
      select id into c_id from public.clientes where lower(email) = lower(p_email);
    end if;
  end if;

  if c_id is null then
    insert into public.clientes (nome, telefone, email, data_nascimento, origem)
    values (p_nome, p_telefone, p_email, p_data_nascimento, 'portal_aluna')
    returning id into c_id;
  else
    -- Casou com cadastro existente: completa lacunas sem sobrescrever
    -- o que a equipe já tinha registrado.
    update public.clientes
    set email = coalesce(email, p_email),
        telefone = coalesce(telefone, p_telefone),
        data_nascimento = coalesce(data_nascimento, p_data_nascimento)
    where id = c_id;
  end if;

  insert into public.contas_aluna (auth_user_id, cliente_id, aceite_lgpd_em, versao_termo)
  values (auth.uid(), c_id, now(), p_versao_termo);

  return c_id;
end;
$$;

revoke execute on function
  public.criar_conta_aluna(text, text, text, date, boolean, text) from public, anon;
grant execute on function
  public.criar_conta_aluna(text, text, text, date, boolean, text) to authenticated;
