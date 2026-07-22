-- ============================================================
-- M5 — Planos sempre por crédito, cobrança em ciclos, inadimplência
-- Decisões da equipe em 21/07/2026:
--   · todo plano é por crédito ("Mensal 4", "Mensal 8", "Mensal 12")
--   · mensal = 1 ciclo; semestral = 6 ciclos da MESMA mensalidade
--     (o semestral é cobrado mês a mês, não à vista)
--   · crédito não usado expira no fim do ciclo
--   · ciclo não pago bloqueia novos agendamentos na hora
--
-- Como o modelo ficou, sem inventar tabela nova: um plano passa a
-- ser "N créditos por ciclo × quantos ciclos", e a matrícula guarda
-- em que ciclo a aluna está. A janela data_inicio/data_fim da
-- matrícula é a do CICLO CORRENTE — é ela que agendar_aula() já
-- consulta, então a regra de vaga/crédito continua valendo sem
-- precisar ser reescrita.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PLANOS
-- As colunas existentes mudam de significado; sem coluna nova
-- além de `ciclos`, para não duplicar conceito.
-- ------------------------------------------------------------

alter table public.planos
  add column if not exists ciclos integer not null default 1 check (ciclos > 0);

comment on column public.planos.quantidade is
  'créditos liberados a cada ciclo (ex.: 4, 8, 12)';
comment on column public.planos.vigencia_dias is
  'duração de UM ciclo em dias (30 = mensal)';
comment on column public.planos.preco_centavos is
  'preço de UM ciclo — o semestral cobra este mesmo valor 6 vezes';
comment on column public.planos.ciclos is
  '1 = mensal sem compromisso; 6 = semestral (mesma mensalidade, 6 cobranças)';

-- Converte os planos de teste que ainda eram 'semanal' para crédito,
-- usando a mesma fórmula que matricular() aplicava (aulas/semana ×
-- semanas do ciclo). Só então dá para travar o tipo.
update public.planos
set quantidade = greatest(1, quantidade * ceil(vigencia_dias / 7.0)::integer),
    tipo = 'creditos'
where tipo = 'semanal';

alter table public.planos
  drop constraint if exists planos_sempre_creditos;
alter table public.planos
  add constraint planos_sempre_creditos check (tipo = 'creditos');

-- ------------------------------------------------------------
-- 2. MATRÍCULAS — em que ciclo do compromisso a aluna está
-- ------------------------------------------------------------

alter table public.matriculas
  add column if not exists ciclos_total integer not null default 1 check (ciclos_total > 0);
alter table public.matriculas
  add column if not exists ciclo_atual integer not null default 1 check (ciclo_atual > 0);

alter table public.matriculas
  drop constraint if exists matriculas_ciclo_dentro_do_total;
alter table public.matriculas
  add constraint matriculas_ciclo_dentro_do_total check (ciclo_atual <= ciclos_total);

comment on column public.matriculas.creditos_total is
  'créditos liberados por ciclo (não o total do compromisso)';
comment on column public.matriculas.data_inicio is
  'início do CICLO CORRENTE (não do compromisso inteiro)';
comment on column public.matriculas.data_fim is
  'fim do CICLO CORRENTE — é a janela que agendar_aula() consulta';

-- ------------------------------------------------------------
-- 3. MATRICULAR — abre o compromisso e libera só o 1º ciclo
-- ------------------------------------------------------------

create or replace function public.matricular(p_cliente uuid, p_plano uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  pl record;
  m_id uuid;
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

  insert into public.matriculas
    (cliente_id, plano_id, data_inicio, data_fim, creditos_total, ciclos_total, ciclo_atual)
  values
    (p_cliente, p_plano, current_date, current_date + pl.vigencia_dias,
     pl.quantidade, pl.ciclos, 1)
  returning id into m_id;

  -- Só os créditos do 1º ciclo. Os demais entram em renovar_ciclo(),
  -- a cada pagamento confirmado — é isso que impede a aluna de um
  -- semestral queimar os 6 meses de crédito na primeira semana.
  insert into public.creditos_eventos (matricula_id, delta, motivo, detalhe, criado_por)
  values (m_id, pl.quantidade, 'compra', pl.nome || ' — ciclo 1/' || pl.ciclos, auth.uid());

  insert into public.entradas_financeiras
    (descricao, valor_centavos, categoria, status, data_competencia, data_prevista, cliente_id)
  values
    ('Plano ' || pl.nome || ' — ciclo 1/' || pl.ciclos, pl.preco_centavos, 'mensalista',
     'prevista', current_date, current_date, p_cliente);

  return m_id;
end;
$$;

-- ------------------------------------------------------------
-- 4. RENOVAR_CICLO — chamada a cada pagamento confirmado
-- (pela equipe hoje; pelo webhook do gateway quando existir)
-- ------------------------------------------------------------

create or replace function public.renovar_ciclo(p_matricula uuid)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  m record;
  pl record;
  saldo integer;
  novo_inicio date;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito à equipe';
  end if;

  select * into m from public.matriculas where id = p_matricula for update;
  if not found then
    raise exception 'matrícula inexistente';
  end if;
  if m.status = 'cancelada' then
    raise exception 'matrícula cancelada não renova';
  end if;
  if m.ciclo_atual >= m.ciclos_total then
    raise exception 'compromisso encerrado (ciclo % de %) — contrate um plano novo',
      m.ciclo_atual, m.ciclos_total;
  end if;

  select * into pl from public.planos where id = m.plano_id;

  -- Crédito não usado morre com o ciclo. Fica registrado no livro-razão
  -- como 'expiracao' em vez de sumir, para a aluna conseguir ver o que
  -- aconteceu com o saldo dela.
  select coalesce(sum(delta), 0) into saldo
  from public.creditos_eventos where matricula_id = p_matricula;

  if saldo > 0 then
    insert into public.creditos_eventos (matricula_id, delta, motivo, detalhe, criado_por)
    values (p_matricula, -saldo, 'expiracao',
            'fim do ciclo ' || m.ciclo_atual || '/' || m.ciclos_total, auth.uid());
  end if;

  novo_inicio := m.data_fim + 1;

  update public.matriculas
  set ciclo_atual = m.ciclo_atual + 1,
      data_inicio = novo_inicio,
      data_fim = novo_inicio + pl.vigencia_dias,
      status = 'ativa'  -- pagou: destrava quem estava inadimplente
  where id = p_matricula;

  insert into public.creditos_eventos (matricula_id, delta, motivo, detalhe, criado_por)
  values (p_matricula, m.creditos_total, 'compra',
          pl.nome || ' — ciclo ' || (m.ciclo_atual + 1) || '/' || m.ciclos_total, auth.uid());

  insert into public.entradas_financeiras
    (descricao, valor_centavos, categoria, status, data_competencia, data_prevista, cliente_id)
  values
    ('Plano ' || pl.nome || ' — ciclo ' || (m.ciclo_atual + 1) || '/' || m.ciclos_total,
     pl.preco_centavos, 'mensalista', 'prevista', novo_inicio, novo_inicio, m.cliente_id);

  return m.ciclo_atual + 1;
end;
$$;

revoke execute on function public.renovar_ciclo(uuid) from public, anon;
grant execute on function public.renovar_ciclo(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. MARCAR_INADIMPLENTE — cobrança do ciclo não entrou
-- Não apaga crédito nem cancela: só impede agendar dali em diante.
-- ------------------------------------------------------------

create or replace function public.marcar_inadimplente(p_matricula uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito à equipe';
  end if;

  update public.matriculas
  set status = 'inadimplente'
  where id = p_matricula and status = 'ativa';

  return found;
end;
$$;

revoke execute on function public.marcar_inadimplente(uuid) from public, anon;
grant execute on function public.marcar_inadimplente(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. AGENDAR_AULA — mensagem honesta quando o bloqueio é dívida
-- A seleção já exigia status='ativa', então a inadimplente sempre
-- foi recusada. O que faltava era dizer o motivo certo: "sem
-- créditos" mandaria a aluna comprar mais em vez de regularizar.
-- ------------------------------------------------------------

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
      if exists (
        select 1 from public.matriculas m
        where m.cliente_id = p_cliente and m.status = 'inadimplente'
          and p_data between m.data_inicio and m.data_fim
      ) then
        raise exception 'plano com pagamento em aberto — regularize para voltar a agendar';
      end if;
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
