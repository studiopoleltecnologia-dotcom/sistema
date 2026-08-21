-- ============================================================
-- Etapa 5 — As regras de agendamento passam a valer
--
-- A etapa 3 criou os campos. A etapa 4 fez a assinatura funcionar. Esta
-- faz o banco RECUSAR o que o regulamento proíbe. Até agora
-- `dias_antecedencia_agendamento` e `max_agendamentos_simultaneos`
-- eram cadastro decorativo: a equipe preenchia e nada acontecia.
--
-- Regras implementadas, transcritas do regulamento (item 4):
--
--   4.3  "no máximo 8 aulas agendadas simultaneamente, para que o saldo
--        acumulado não trave a agenda de quem quer treinar naquela
--        semana" -> produtos.max_agendamentos_simultaneos
--   4.7  "a partir de 3 faltas não canceladas NO MESMO CICLO, o
--        agendamento antecipado fica suspenso por 15 dias — nesse
--        período você continua treinando, mas reservando no mesmo dia
--        ou pela lista de espera"
--   INTERNO "quando a terceira falta acontecer, avisar por escrito no
--        mesmo dia e registrar. Não deixar a pessoa descobrir sozinha
--        na hora de agendar." -> e-mail automático, não é opcional
--   11.1 "tolerância de atraso: 15 minutos" -> vira config visível,
--        mas quem aplica é a professora na porta (ver nota abaixo)
--
-- Mais a janela de antecedência, que é decisão da equipe e não do
-- regulamento: 21 dias no semestral (registrado em 20/08/2026).
--
-- DUAS DECISÕES QUE VALE DEIXAR EXPLÍCITAS:
--
-- 1. Falta NÃO é presumida. Só conta como falta o que a professora
--    marcou como ausente. Agendamento passado que ninguém marcou não
--    vira falta automática — seria punir a aluna pelo esquecimento da
--    professora, e a suspensão do 4.7 é punição de verdade. O preço
--    disso é que uma falta não marcada não conta; para o buraco não
--    ficar invisível, criei `vw_aulas_sem_presenca`.
--
-- 2. Não existe bypass da equipe. As três travas valem para quem
--    agendar, inclusive a secretária agendando pela aluna. Um "furar
--    a regra" silencioso na mão de quem atende é como a regra morre na
--    prática. Se a operação provar que precisa de exceção, ela entra
--    depois como parâmetro explícito e auditado, não como brecha.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Config: os números da política, parametrizáveis
-- ------------------------------------------------------------
alter table public.config_agendamento
  add column if not exists faltas_para_suspensao integer not null default 3,
  add column if not exists dias_suspensao_faltas integer not null default 15,
  add column if not exists minutos_tolerancia_atraso integer not null default 15;

alter table public.config_agendamento
  drop constraint if exists config_faltas_check;
alter table public.config_agendamento
  add constraint config_faltas_check check (
    faltas_para_suspensao between 1 and 20
    and dias_suspensao_faltas between 1 and 180
    and minutos_tolerancia_atraso between 0 and 60
  );

comment on column public.config_agendamento.minutos_tolerancia_atraso is
  'Regulamento 11.1. O sistema NAO bloqueia entrada por atraso — quem '
  'aplica e a professora na porta. Mora aqui para a tela mostrar o '
  'numero certo e para mudar sem deploy.';


-- ------------------------------------------------------------
-- 2. Suspensão por faltas (regulamento 4.7)
-- ------------------------------------------------------------
create table if not exists public.suspensoes_agendamento (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id) on delete cascade,
  matricula_id  uuid references public.matriculas(id) on delete set null,
  inicio        date not null default current_date,
  fim           date not null,
  faltas        integer not null,
  motivo        text,
  revogada_em   timestamptz,
  revogada_por  uuid,
  criada_em     timestamptz not null default now(),
  check (fim >= inicio)
);

comment on table public.suspensoes_agendamento is
  'Suspensao do agendamento ANTECIPADO (regulamento 4.7). Nao impede '
  'treinar: no periodo a aluna reserva no mesmo dia ou entra na lista '
  'de espera. Historico preservado — revogar preenche revogada_em, '
  'nunca apaga a linha.';

create index if not exists suspensoes_vigentes_idx
  on public.suspensoes_agendamento (cliente_id, fim)
  where revogada_em is null;

alter table public.suspensoes_agendamento enable row level security;

drop policy if exists "operacao ve suspensoes" on public.suspensoes_agendamento;
create policy "operacao ve suspensoes" on public.suspensoes_agendamento
  for select to authenticated using (public.is_operacional());

drop policy if exists "gestao gerencia suspensoes" on public.suspensoes_agendamento;
create policy "gestao gerencia suspensoes" on public.suspensoes_agendamento
  for all to authenticated using (public.is_socia()) with check (public.is_socia());

-- A aluna precisa ver a própria suspensão. O regulamento é explícito
-- em "não deixar a pessoa descobrir sozinha na hora de agendar".
drop policy if exists "cliente ve a propria suspensao" on public.suspensoes_agendamento;
create policy "cliente ve a propria suspensao" on public.suspensoes_agendamento
  for select to authenticated using (cliente_id = public.cliente_atual());


-- ------------------------------------------------------------
-- 3. Helpers de leitura
-- ------------------------------------------------------------
create or replace function public.suspensao_vigente(p_cliente uuid)
returns date language sql stable security definer set search_path = '' as $fn$
  select max(s.fim)
  from public.suspensoes_agendamento s
  where s.cliente_id = p_cliente
    and s.revogada_em is null
    and current_date between s.inicio and s.fim;
$fn$;

comment on function public.suspensao_vigente(uuid) is
  'Devolve ate quando a suspensao vale, ou null. Definer porque o '
  'agendamento precisa dela mesmo quando quem chama e a propria aluna.';

-- Faltas não canceladas dentro do ciclo corrente da matrícula.
-- "No mesmo ciclo" do 4.7 é literal: renovou, a conta zera — o que é
-- coerente com a suspensão ser corretiva e não um cadastro negativo
-- permanente.
create or replace function public.faltas_no_ciclo(p_matricula uuid)
returns integer language sql stable security definer set search_path = '' as $fn$
  select count(*)::integer
  from public.presencas pr
  join public.agendamentos a on a.id = pr.agendamento_id
  join public.matriculas m on m.id = p_matricula
  where a.matricula_id = p_matricula
    and pr.presente = false
    and pr.data_aula between m.data_inicio and m.data_fim;
$fn$;


-- ------------------------------------------------------------
-- 4. agendar_aula() — as três travas
-- ------------------------------------------------------------
create or replace function public.agendar_aula(
  p_cliente uuid, p_turma uuid, p_data date, p_canal public.canal_aula
) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  a_id uuid;
  m_id uuid := null;
  lote uuid;
  pr record;
  cfg record;
  suspenso_ate date;
  abertos integer;
  limite_dias integer;
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

  select * into cfg from public.config_agendamento;

  if p_data < current_date then
    -- Aluna que treinou sem reservar entra por `registrar_presenca`,
    -- que aceita presença sem agendamento. Criar reserva no passado só
    -- serviria para burlar a contagem de vaga e de crédito.
    raise exception 'não dá para agendar aula em data que já passou';
  end if;

  if p_canal = 'mensalista' then
    select m.id into m_id
    from public.matriculas m
    where m.cliente_id = p_cliente
      and m.status = 'ativa'
      and public.saldo_disponivel(m.id, p_data) > 0
    order by (
      select min(l.validade) from public.creditos_lotes l
      where l.matricula_id = m.id and l.validade >= p_data
    ), m.data_fim
    limit 1;

    if m_id is null then
      if exists (
        select 1 from public.matriculas m
        where m.cliente_id = p_cliente and m.status = 'inadimplente'
      ) then
        raise exception 'plano com pagamento em aberto — regularize para voltar a agendar';
      end if;
      raise exception 'cliente sem créditos disponíveis para esta data';
    end if;

    select p.* into pr
    from public.produtos p
    join public.matriculas m on m.plano_id = p.id
    where m.id = m_id;

    -- ---- Trava 1: suspensão por faltas (4.7) ----
    -- Suspende o agendamento ANTECIPADO. Reservar para hoje continua
    -- liberado, e a lista de espera também — é o que o regulamento
    -- promete em troca ("você continua treinando").
    suspenso_ate := public.suspensao_vigente(p_cliente);
    if suspenso_ate is not null and p_data > current_date then
      raise exception
        'agendamento antecipado suspenso até % por faltas sem cancelamento — dá para reservar para hoje ou entrar na lista de espera',
        to_char(suspenso_ate, 'DD/MM');
    end if;

    -- ---- Trava 2: janela de antecedência ----
    limite_dias := coalesce(pr.dias_antecedencia_agendamento, 14);
    if p_data > current_date + limite_dias then
      raise exception 'este plano agenda com até % dias de antecedência (limite: %)',
        limite_dias, to_char(current_date + limite_dias, 'DD/MM');
    end if;

    -- ---- Trava 3: máximo de reservas em aberto (4.3) ----
    -- Conta só o que ainda vai acontecer: reserva de aula passada não
    -- trava a agenda de ninguém, que é o motivo declarado da regra.
    if pr.max_agendamentos_simultaneos is not null then
      select count(*) into abertos
      from public.agendamentos a
      where a.cliente_id = p_cliente
        and a.status = 'agendado'
        and a.data >= current_date;
      if abertos >= pr.max_agendamentos_simultaneos then
        raise exception
          'você já tem % aulas agendadas (limite do plano). Cancele ou faça uma delas para agendar outra',
          abertos;
      end if;
    end if;
  end if;

  insert into public.agendamentos (turma_id, data, cliente_id, canal, matricula_id)
  values (p_turma, p_data, p_cliente, p_canal, m_id)
  returning id into a_id;

  if m_id is not null then
    lote := public.consumir_credito(m_id, 'agendamento', a_id, p_data);
    if lote is null then
      -- Corrida: outro agendamento levou o último crédito entre o SELECT
      -- e o consumo. Aborta a transação inteira em vez de deixar a aula
      -- reservada de graça.
      raise exception 'cliente sem créditos disponíveis para esta data';
    end if;
  end if;

  insert into public.agendamentos_eventos (agendamento_id, evento, criado_por)
  values (a_id, 'agendado', auth.uid());

  return a_id;
end; $fn$;


-- ------------------------------------------------------------
-- 5. A terceira falta cria a suspensão e avisa (4.7 + procedimento)
-- ------------------------------------------------------------
create or replace function public.avaliar_faltas()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  ag record;
  cfg record;
  c record;
  n integer;
  s_id uuid;
  ate date;
begin
  -- Só interessa falta de aula que estava reservada. Aluna que entrou
  -- sem agendar (presença com agendamento_id null) não tem o que faltar.
  if new.presente or new.agendamento_id is null then
    return new;
  end if;
  -- Correção de marcação (presente -> ausente) conta; marcar ausente
  -- duas vezes, não.
  if tg_op = 'UPDATE' and old.presente = false then
    return new;
  end if;

  select * into ag from public.agendamentos where id = new.agendamento_id;
  if ag.matricula_id is null then
    return new;
  end if;

  select * into cfg from public.config_agendamento;
  n := public.faltas_no_ciclo(ag.matricula_id);

  if n < cfg.faltas_para_suspensao then
    return new;
  end if;

  -- Já suspensa: não empilha nem estende. A suspensão é por atingir o
  -- limite no ciclo, não por falta individual.
  if public.suspensao_vigente(new.cliente_id) is not null then
    return new;
  end if;

  ate := current_date + cfg.dias_suspensao_faltas;

  insert into public.suspensoes_agendamento
    (cliente_id, matricula_id, inicio, fim, faltas, motivo)
  values (new.cliente_id, ag.matricula_id, current_date, ate, n,
          n || ' faltas sem cancelamento no ciclo')
  returning id into s_id;

  -- "Avisar por escrito no mesmo dia" é procedimento do regulamento,
  -- não cortesia. Idempotente pela chave: uma suspensão, um e-mail.
  select nome, email into c from public.clientes where id = new.cliente_id;
  perform public.enfileirar_email(
    'suspensao_faltas', c.email,
    jsonb_build_object('nome', c.nome, 'faltas', n, 'ate', ate,
                       'dias', cfg.dias_suspensao_faltas),
    'susp:' || s_id
  );

  return new;
exception when others then
  -- Nunca derrubar a marcação de presença por causa da penalidade: a
  -- professora está com a turma na frente dela.
  raise warning 'avaliar_faltas falhou para presenca %: %', new.id, sqlerrm;
  return new;
end; $fn$;

drop trigger if exists presencas_avalia_faltas on public.presencas;
create trigger presencas_avalia_faltas
  after insert or update of presente on public.presencas
  for each row execute function public.avaliar_faltas();


-- ------------------------------------------------------------
-- 6. Revogar suspensão (a equipe erra, e a aluna não pode pagar)
-- ------------------------------------------------------------
create or replace function public.revogar_suspensao(p_suspensao uuid, p_motivo text default null)
returns boolean language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito à equipe';
  end if;

  update public.suspensoes_agendamento
  set revogada_em = now(),
      revogada_por = auth.uid(),
      motivo = coalesce(motivo, '') ||
               case when p_motivo is null then '' else ' | revogada: ' || p_motivo end
  where id = p_suspensao and revogada_em is null;

  return found;
end; $fn$;


-- ------------------------------------------------------------
-- 7. O buraco que a decisão 1 deixa, visível em vez de silencioso
-- ------------------------------------------------------------
-- Falta não é presumida, então aula passada que ninguém marcou não
-- conta para nada. Sem esta view isso seria invisível: a aluna sumiu,
-- a professora esqueceu de marcar e o sistema segue achando que está
-- tudo certo.
create or replace view public.vw_aulas_sem_presenca
with (security_invoker = true) as
select
  a.id as agendamento_id,
  a.data,
  a.turma_id,
  t.horario,
  t.modalidade,
  a.cliente_id,
  c.nome as cliente_nome,
  t.professora_id,
  a.canal
from public.agendamentos a
join public.turmas t on t.id = a.turma_id
join public.clientes c on c.id = a.cliente_id
left join public.presencas pr
  on pr.turma_id = a.turma_id and pr.data_aula = a.data and pr.cliente_id = a.cliente_id
where a.status = 'agendado'
  and a.data < current_date
  and pr.id is null;

comment on view public.vw_aulas_sem_presenca is
  'Aulas que ja aconteceram e ninguem marcou presenca nem falta. '
  'Existe porque falta NAO e presumida: sem esta lista, a marcacao '
  'esquecida sumiria e a regra do 4.7 furaria em silencio.';


-- ------------------------------------------------------------
-- 8. Permissões
-- ------------------------------------------------------------
revoke execute on function public.suspensao_vigente(uuid) from public, anon;
grant  execute on function public.suspensao_vigente(uuid) to authenticated;

revoke execute on function public.faltas_no_ciclo(uuid) from public, anon;
grant  execute on function public.faltas_no_ciclo(uuid) to authenticated;

revoke execute on function public.revogar_suspensao(uuid, text) from public, anon;
grant  execute on function public.revogar_suspensao(uuid, text) to authenticated;
