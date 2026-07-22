-- ============================================================
-- Portal da Aluna — MVP (docs/04-PORTAL-ALUNA.md)
-- Novo papel de RLS "cliente", análogo a "socia":
--   contas_aluna (vínculo auth.users <-> clientes)
--   is_cliente() / cliente_atual() (mesmo padrão de is_socia())
--   handle_new_user() passa a rotear por papel (metadata 'papel')
--   RPCs agendar_aula/cancelar_agendamento liberadas para a própria
--   cliente (matricular() continua só-equipe até existir gateway
--   de pagamento — ver docs/04 seção 12, V1)
-- ============================================================

alter type public.origem_cliente add value 'portal_aluna';

-- ------------------------------------------------------------
-- CONTAS_ALUNA — vínculo 1:1 entre auth.users e clientes.
-- Cliente Wellhub pura nunca aparece aqui (regra 9.5 do CLAUDE.md);
-- só existe linha quando a cliente cria conta no Portal.
-- ------------------------------------------------------------
create table public.contas_aluna (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  cliente_id uuid not null unique references public.clientes (id) on delete cascade,
  aceite_lgpd_em timestamptz,
  versao_termo text,
  criada_em timestamptz not null default now()
);

alter table public.contas_aluna enable row level security;

create or replace function public.is_cliente()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contas_aluna where auth_user_id = (select auth.uid())
  );
$$;

create or replace function public.cliente_atual()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select cliente_id from public.contas_aluna where auth_user_id = (select auth.uid());
$$;

revoke execute on function public.is_cliente() from public, anon;
grant execute on function public.is_cliente() to authenticated;
revoke execute on function public.cliente_atual() from public, anon;
grant execute on function public.cliente_atual() to authenticated;

create policy "cliente ve a propria conta" on public.contas_aluna
  for select to authenticated using (auth_user_id = (select auth.uid()));

create policy "equipe ve contas de aluna" on public.contas_aluna
  for select to authenticated using (public.is_socia());

-- sem policy de insert/update/delete: só via criar_conta_aluna()
-- (security definer) e só na criação — LGPD é aceite no cadastro,
-- não editável depois (evita reescrever consentimento retroativamente).

-- ------------------------------------------------------------
-- HANDLE_NEW_USER — passa a rotear por papel.
-- Sem metadata 'papel' (fluxo atual da equipe, provisionado à mão)
-- continua virando sócia, exatamente como hoje. Só quando o Portal
-- manda papel='cliente' no signUp() que o trigger deixa de criar
-- sócia — o vínculo com clientes é feito por criar_conta_aluna(),
-- chamada em seguida pelo Portal (precisa casar com CRM existente,
-- não é um insert simples de trigger).
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (new.raw_user_meta_data ->> 'papel') = 'cliente' then
    return new;
  end if;

  insert into public.socias (id, nome)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- CRIAR_CONTA_ALUNA — casa o signup do Portal com um cliente já
-- existente no CRM (telefone) ou cria um novo (docs/04 seção 1.4).
-- Ambíguo (mais de um telefone igual) => cria novo, nunca casa no
-- escuro (equipe mescla depois se for o caso).
-- ------------------------------------------------------------
create or replace function public.criar_conta_aluna(
  p_nome text, p_telefone text, p_aceite_lgpd boolean, p_versao_termo text default 'v1'
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

  if p_telefone is not null and length(trim(p_telefone)) > 0 then
    select count(*) into candidatos from public.clientes where telefone = p_telefone;
  else
    candidatos := 0;
  end if;

  if candidatos = 1 then
    select id into c_id from public.clientes where telefone = p_telefone;
  else
    insert into public.clientes (nome, telefone, origem)
    values (p_nome, p_telefone, 'portal_aluna')
    returning id into c_id;
  end if;

  insert into public.contas_aluna (auth_user_id, cliente_id, aceite_lgpd_em, versao_termo)
  values (auth.uid(), c_id, now(), p_versao_termo);

  return c_id;
end;
$$;

revoke execute on function public.criar_conta_aluna(text, text, boolean, text) from public, anon;
grant execute on function public.criar_conta_aluna(text, text, boolean, text) to authenticated;

-- ------------------------------------------------------------
-- CLIENTES — a própria cliente vê e edita o próprio cadastro,
-- mas só os campos de dados pessoais (nunca estágio de funil,
-- responsável, vip, gympass_id — gestão interna da equipe).
-- ------------------------------------------------------------
create policy "cliente ve o proprio cadastro" on public.clientes
  for select to authenticated using (id = public.cliente_atual());

create policy "cliente atualiza o proprio cadastro" on public.clientes
  for update to authenticated
  using (id = public.cliente_atual())
  with check (id = public.cliente_atual());

create or replace function public.validar_edicao_cliente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_cliente() and not public.is_socia() then
    if new.estagio is distinct from old.estagio
      or new.origem is distinct from old.origem
      or new.responsavel_id is distinct from old.responsavel_id
      or new.vip is distinct from old.vip
      or new.gympass_id is distinct from old.gympass_id
      or new.primeiro_contato is distinct from old.primeiro_contato
      or new.ultima_aula is distinct from old.ultima_aula
      or new.ultima_conversa is distinct from old.ultima_conversa
    then
      raise exception 'campo não editável pela própria aluna';
    end if;
  end if;
  return new;
end;
$$;

create trigger clientes_valida_edicao_aluna
  before update on public.clientes
  for each row execute function public.validar_edicao_cliente();

-- ------------------------------------------------------------
-- CATÁLOGO — cliente enxerga a mesma grade/planos/regras que a
-- equipe usa para operar (docs/04 seção 10.3), nunca dados de
-- outra cliente.
-- ------------------------------------------------------------
create policy "cliente ve turmas ativas" on public.turmas
  for select to authenticated using (public.is_cliente() and ativa);

create policy "cliente ve planos ativos" on public.planos
  for select to authenticated using (public.is_cliente() and ativo);

create policy "cliente ve config agendamento" on public.config_agendamento
  for select to authenticated using (public.is_cliente());

create policy "cliente ve as proprias matriculas" on public.matriculas
  for select to authenticated using (cliente_id = public.cliente_atual());

create policy "cliente ve os proprios agendamentos" on public.agendamentos
  for select to authenticated using (cliente_id = public.cliente_atual());
-- sem policy de insert/update/delete direto: só via agendar_aula()/
-- cancelar_agendamento() (security definer), onde mora a validação
-- de vaga/crédito/prazo.

create policy "cliente ve os proprios eventos de agendamento"
  on public.agendamentos_eventos for select to authenticated
  using (exists (
    select 1 from public.agendamentos a
    where a.id = agendamentos_eventos.agendamento_id
      and a.cliente_id = public.cliente_atual()
  ));

create policy "cliente ve as proprias presencas" on public.presencas
  for select to authenticated using (cliente_id = public.cliente_atual());

-- Grade pública sem vazar dado sensível de professora (telefone,
-- valor_por_aluna_centavos): view enxerga só o necessário e roda
-- com o dono da view (sem security_invoker), não com o papel de
-- quem consulta — é a válvula de escape deliberada para expor um
-- recorte seguro de turmas+professoras sem dar select amplo nas
-- tabelas de origem. Não "corrigir" para security_invoker=true.
create view public.vw_grade_publica as
select
  t.id as turma_id,
  t.modalidade,
  t.dia_semana,
  t.horario,
  t.duracao_minutos,
  t.capacidade,
  p.nome as professora_nome
from public.turmas t
join public.professoras p on p.id = t.professora_id
where t.ativa;

grant select on public.vw_grade_publica to authenticated;

-- Vagas ocupadas por turma+data, agregado (sem identidade de
-- cliente) — mesma lógica de view "definer" acima.
create view public.vw_vagas_turma as
select turma_id, data, count(*) as ocupadas
from public.agendamentos
where status = 'agendado'
group by turma_id, data;

grant select on public.vw_vagas_turma to authenticated;

-- ------------------------------------------------------------
-- AGENDAR_AULA / CANCELAR_AGENDAMENTO — liberadas para a própria
-- cliente (matricular() fica só-equipe até existir gateway de
-- pagamento, docs/04 §10.1/§12 V1).
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
