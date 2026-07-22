-- ============================================================
-- Portal da Aluna — autocompra de plano (docs/04 seção 8.2 revista)
-- A aluna contrata sozinha qualquer plano ativo do catálogo que a
-- equipe cadastra no admin. Sem gateway ainda (V1): a contratação
-- libera os créditos e gera a entrada financeira 'prevista' — igual
-- ao fluxo manual da equipe; o pagamento é combinado fora do app.
--
-- Correção incluída: criado_por em creditos_eventos e
-- agendamentos_eventos referencia socias(id) — quando quem opera é
-- a aluna, auth.uid() não existe em socias e o insert violaria a
-- FK. Passa a gravar null (= sistema/aluna); a autoria da aluna já
-- fica registrada em agendamentos.cliente_id / origem 'aluna'.
-- ============================================================

create or replace function public.matricular(p_cliente uuid, p_plano uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  pl record;
  m_id uuid;
  total integer;
  autor uuid;
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

  autor := case when public.is_socia() then auth.uid() end;

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
  values (m_id, total, 'compra', pl.nome, autor);

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
  autor uuid;
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

  autor := case when public.is_socia() then auth.uid() end;

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
    values (m_id, -1, 'agendamento', a_id, autor);
  end if;

  insert into public.agendamentos_eventos (agendamento_id, evento, criado_por)
  values (a_id, 'agendado', autor);

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
  autor uuid;
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

  autor := case when public.is_socia() then auth.uid() end;

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
      values (ag.matricula_id, 1, 'cancelamento', p_agendamento, autor);
      devolveu := true;
    end if;
  end if;

  insert into public.agendamentos_eventos (agendamento_id, evento, detalhe, criado_por)
  values (p_agendamento, 'cancelado',
          case when devolveu then 'crédito devolvido' else 'fora do prazo — crédito mantido' end,
          autor);

  return devolveu;
end;
$$;
