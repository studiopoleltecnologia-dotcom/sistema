-- ============================================================
-- O convidado do semestral
-- 04/10/2026
-- ============================================================
-- Regulamento 11.1 e manual interno §11. O benefício está na coluna
-- `produtos.convidados_por_ciclo` desde setembro — seis produtos
-- semestrais com o valor 1 — e **nada no sistema o usa**. Hoje o
-- regulamento promete uma coisa que não existe.
--
--   11.1  1 convidado por ciclo, não cumulativo. Deve ser pessoa sem
--         plano ativo e que não tenha frequentado o Studio nos últimos
--         6 meses, participar da mesma aula do titular e atender aos
--         requisitos de nível e segurança. Depende de vaga.
--   §11   No-show do convidado após confirmação consome o benefício.
--
-- ## A decisão que define o resto: o convidado é um CLIENTE
--
-- Pedido da gestão: *"onde vamos cadastrar esse convidado, como isso vai
-- ser listado e organizado."*
--
-- A resposta não é uma tabela de nomes soltos. Para checar as duas
-- condições do 11.1 — sem plano ativo, sem treinar há 6 meses — é preciso
-- **saber quem a pessoa é**. Nome digitado num campo não responde isso;
-- um registro em `clientes` responde.
--
-- E aí o benefício deixa de ser só uma cortesia e passa a ser o que ele
-- comercialmente é: **uma máquina de lead qualificado.** Quem vem como
-- convidado é alguém que já conhece uma aluna, já entrou na sala e já
-- fez uma aula. É o lead mais quente que o estúdio consegue, e hoje ele
-- entraria e sairia sem deixar rastro.
--
-- Consequências, todas de graça:
--
-- * a conta dos 6 meses sai de `clientes.ultima_aula`, que o gatilho de
--   presença já mantém;
-- * o convidado entra no funil do CRM e no follow-up;
-- * se ele voltar no ano seguinte, o sistema reconhece.
--
-- ## O canal é próprio, e isso é o que faz a vaga funcionar
--
-- `canal_aula` += `convidado`. A reserva do convidado é um
-- `agendamentos` como qualquer outro, então, sem código novo:
--
-- | | |
-- |---|---|
-- | conta na ocupação da turma | o gatilho de vaga não olha canal |
-- | conta no mínimo de alunos | `quorum_da_aula` conta todos os canais |
-- | entra na chamada da professora | `vw_alunas_da_aula` não filtra canal |
-- | **não** consome crédito do titular | crédito só se mexe em `mensalista` |
-- | **não** gera receita | `integrar_presenca` só lança em wellhub/totalpass |
--
-- ⚠️ **A professora é paga pelo convidado.** O pagamento dela sai de
-- presença, não de canal, e está certo assim: ela deu aula para aquela
-- pessoa. Então o convidado tem custo — é custo de aquisição, e a
-- contrapartida é o lead. Fica dito para a conta não aparecer como
-- surpresa no fechamento.
--
-- ## Por que o aluno indica e a equipe confirma
--
-- O 11.1 condiciona o convidado a "requisitos de nível e segurança", e
-- isso não é checável por função: convidado iniciante numa turma de Pole
-- 2 é risco físico, não regra de negócio. Então o aluno **indica** e a
-- equipe **confirma** — mesmo desenho da turma fixa, pela mesma razão.
--
-- A confirmação é um clique: o banco já checou plano ativo, carência de
-- 6 meses, vaga na turma, benefício do ciclo e se o titular está mesmo
-- naquela aula. O que sobra para a pessoa decidir é o que só ela sabe.
--
-- ## O benefício se consome na CONFIRMAÇÃO, não na presença
--
-- O manual é explícito: no-show do convidado consome o benefício. Então
-- é a linha em `convidados` que representa o consumo, e ela nasce no
-- pedido. Cancelar **dentro do prazo de cancelamento de aula** devolve o
-- benefício, pela mesma lógica do crédito (4.5); depois disso, não.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Os enums
-- ------------------------------------------------------------
alter type public.canal_aula add value if not exists 'convidado';
alter type public.origem_cliente add value if not exists 'convidado';


-- ------------------------------------------------------------
-- 2. Os estados de um convite
-- ------------------------------------------------------------
do $$
begin
  create type public.status_convidado as enum (
    'solicitado',   -- o titular indicou, a equipe ainda não decidiu
    'confirmado',   -- reserva criada; o benefício do ciclo está consumido
    'recusado',
    'cancelado',    -- desistiu dentro do prazo: o benefício volta
    'compareceu',
    'faltou'        -- no-show: consome o benefício (manual interno §11)
  );
exception when duplicate_object then null;
end $$;


-- ------------------------------------------------------------
-- 3. A tabela
-- ------------------------------------------------------------
create table if not exists public.convidados (
  id uuid primary key default gen_random_uuid(),

  -- De quem é o benefício.
  matricula_id uuid not null references public.matriculas(id) on delete cascade,
  titular_cliente_id uuid not null references public.clientes(id) on delete cascade,
  ciclo integer not null,

  -- Quem é o convidado. É um `cliente` desde o pedido: sem isso não dá
  -- para checar as condições do 11.1 (ver cabeçalho).
  convidado_cliente_id uuid not null references public.clientes(id) on delete cascade,

  -- Qual aula. A mesma do titular (11.1), conferido no pedido.
  turma_id uuid not null references public.turmas(id),
  data date not null,

  status public.status_convidado not null default 'solicitado',

  -- A reserva, criada na confirmação. `on delete set null` porque
  -- cancelar o agendamento não apaga o histórico do convite.
  agendamento_id uuid references public.agendamentos(id) on delete set null,

  observacao text,
  motivo_decisao text,

  solicitada_por uuid references auth.users(id),
  solicitada_em timestamptz not null default now(),
  decidida_por uuid references auth.users(id),
  decidida_em timestamptz,

  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),

  constraint convidado_recusa_tem_motivo check (
    status <> 'recusado' or nullif(btrim(coalesce(motivo_decisao, '')), '') is not null
  ),
  -- O titular não é convidado de si mesmo.
  constraint convidado_nao_e_o_titular check (convidado_cliente_id <> titular_cliente_id)
);

comment on table public.convidados is
  'O benefício de convidado do semestral (regulamento 11.1). O convidado é um registro em clientes desde o pedido — é o que permite checar "sem plano ativo" e "sem treinar há 6 meses", e é o que transforma o benefício em lead do CRM.';

-- "1 por ciclo, não cumulativo", enforçado por índice: os estados que
-- CONSOMEM o benefício não podem coexistir. `cancelado` e `recusado`
-- ficam fora, porque devolvem o direito.
create unique index if not exists convidado_um_por_ciclo
  on public.convidados (matricula_id, ciclo)
  where status in ('solicitado', 'confirmado', 'compareceu', 'faltou');

create index if not exists convidados_por_status on public.convidados (status, data);
create index if not exists convidados_por_convidado on public.convidados (convidado_cliente_id);

drop trigger if exists convidados_atualizada_em on public.convidados;
create trigger convidados_atualizada_em
  before update on public.convidados
  for each row execute function public.set_atualizada_em();

alter table public.convidados enable row level security;

drop policy if exists "equipe ve convidados" on public.convidados;
create policy "equipe ve convidados" on public.convidados
  for select to authenticated using (public.is_operacional());

-- O titular vê os convites dele. NÃO vê os de outras pessoas, e o
-- recorte é pelo titular — o convidado não tem conta no portal.
drop policy if exists "titular ve os proprios convites" on public.convidados;
create policy "titular ve os proprios convites" on public.convidados
  for select to authenticated using (titular_cliente_id = public.cliente_atual());


-- ------------------------------------------------------------
-- 4. O convidado pode ser convidado?
-- ------------------------------------------------------------
-- As duas condições do 11.1, numa conta só.
create or replace function public.elegibilidade_convidado(p_cliente uuid)
returns table (ok boolean, motivo text)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  c record;
  cfg record;
  meses integer;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into c from public.clientes where id = p_cliente;
  if not found then
    return query select false, 'pessoa não encontrada'::text;
    return;
  end if;
  select * into cfg from public.config_agendamento where id;
  meses := coalesce(cfg.meses_sem_treinar_convidado, 6);

  if exists (
    select 1 from public.matriculas m
    where m.cliente_id = p_cliente
      and m.status <> 'cancelada'
      and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em >= hoje)
  ) then
    return query select false,
      'esta pessoa já tem plano ativo no Studio — o convidado é para quem ainda não treina aqui'::text;
    return;
  end if;

  if c.ultima_aula is not null
     and c.ultima_aula > hoje - (meses || ' months')::interval then
    return query select false,
      format('esta pessoa treinou aqui em %s; o convidado é para quem não frequenta há %s meses',
             to_char(c.ultima_aula, 'DD/MM/YYYY'), meses)::text;
    return;
  end if;

  return query select true, null::text;
end;
$function$;

comment on function public.elegibilidade_convidado(uuid) is
  'As duas condições do regulamento 11.1: sem plano ativo e sem treinar no Studio nos últimos N meses. A segunda sai de clientes.ultima_aula, que o gatilho de presença mantém.';

revoke execute on function public.elegibilidade_convidado(uuid) from public, anon;
grant execute on function public.elegibilidade_convidado(uuid) to authenticated;


-- ------------------------------------------------------------
-- 5. O titular tem benefício neste ciclo?
-- ------------------------------------------------------------
create or replace function public.beneficio_convidado(p_matricula uuid)
returns table (tem boolean, por_ciclo integer, ciclo integer, usado boolean, motivo text)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  m record;
  pr record;
  usado_em record;
begin
  select * into m from public.matriculas where id = p_matricula;
  if not found then
    return query select false, 0, 0, false, 'plano não encontrado'::text;
    return;
  end if;
  select * into pr from public.produtos where id = m.plano_id;

  por_ciclo := coalesce(pr.convidados_por_ciclo, 0);
  ciclo := m.ciclo_atual;

  if por_ciclo = 0 then
    return query select false, por_ciclo, ciclo, false,
      'este plano não inclui convidado'::text;
    return;
  end if;
  if m.status <> 'ativa' then
    return query select false, por_ciclo, ciclo, false,
      format('o plano precisa estar ativo para usar o convidado (está %s)', m.status)::text;
    return;
  end if;

  select * into usado_em from public.convidados cv
   where cv.matricula_id = p_matricula and cv.ciclo = m.ciclo_atual
     and cv.status in ('solicitado', 'confirmado', 'compareceu', 'faltou')
   limit 1;
  if found then
    usado := true;
    return query select false, por_ciclo, ciclo, true,
      case usado_em.status
        when 'solicitado' then 'você já indicou um convidado neste ciclo, esperando confirmação'
        when 'faltou' then 'o convidado deste ciclo não compareceu, e a falta consome o benefício'
        else 'o convidado deste ciclo já foi usado'
      end::text;
    return;
  end if;

  return query select true, por_ciclo, ciclo, false, null::text;
end;
$function$;

comment on function public.beneficio_convidado(uuid) is
  'Se este plano tem convidado disponível no ciclo corrente. Falta do convidado consome o benefício (manual interno §11); cancelamento no prazo devolve.';

revoke execute on function public.beneficio_convidado(uuid) from public, anon;
grant execute on function public.beneficio_convidado(uuid) to authenticated;


-- ------------------------------------------------------------
-- 6. Achar ou criar a pessoa
-- ------------------------------------------------------------
-- O convidado chega como nome e telefone. Se já existe no cadastro —
-- ex-aluna, lead antigo, alguém que fez experimental ano passado —, é
-- essa pessoa que tem de ser usada, e não um registro novo: criar
-- duplicata aqui destruiria justamente a conta dos 6 meses.
--
-- O casamento é pelo telefone, que é o identificador que a recepção
-- sempre tem. E-mail é opcional num convidado (ele não vai ter conta).
create or replace function public.cliente_do_convidado(
  p_nome text,
  p_telefone text,
  p_email text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  nome text := nullif(btrim(coalesce(p_nome, '')), '');
  tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'), '');
  mail text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  achado uuid;
begin
  if nome is null then raise exception 'diga o nome do convidado'; end if;
  if tel is null then
    raise exception 'o telefone do convidado é obrigatório — é por ele que a gente reconhece quem já passou aqui';
  end if;

  select id into achado from public.clientes
   where regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g') = tel
   order by criada_em limit 1;
  if achado is not null then
    return achado;
  end if;

  if mail is not null then
    select id into achado from public.clientes where lower(email) = mail order by criada_em limit 1;
    if achado is not null then
      return achado;
    end if;
  end if;

  insert into public.clientes (nome, telefone, email, origem, estagio)
  values (nome, p_telefone, mail, 'convidado', 'lead')
  returning id into achado;

  return achado;
end;
$function$;

revoke execute on function public.cliente_do_convidado(text, text, text) from public, anon;


-- ------------------------------------------------------------
-- 7. O titular indica
-- ------------------------------------------------------------
create or replace function public.indicar_convidado(
  p_matricula uuid,
  p_nome text,
  p_telefone text,
  p_turma uuid,
  p_data date,
  p_email text default null,
  p_observacao text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  m record;
  b record;
  el record;
  tit record;
  tu record;
  conv uuid;
  cv_id uuid;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  obs text := nullif(left(btrim(coalesce(p_observacao, '')), 1000), '');
  dados jsonb;
  destino text;
begin
  if auth.uid() is null then
    raise exception 'requer sessão autenticada';
  end if;

  select * into m from public.matriculas where id = p_matricula for update;
  if not found then raise exception 'plano não encontrado'; end if;

  if public.is_cliente() and not public.is_socia() then
    if m.cliente_id <> public.cliente_atual() then
      raise exception 'plano não encontrado';
    end if;
  elsif not public.is_operacional() then
    raise exception 'acesso restrito à equipe ou ao próprio aluno';
  end if;

  if p_data < hoje then
    raise exception 'escolha uma aula que ainda vai acontecer';
  end if;

  select * into b from public.beneficio_convidado(p_matricula);
  if not b.tem then raise exception '%', b.motivo; end if;

  select * into tu from public.turmas where id = p_turma and ativa;
  if not found then raise exception 'turma inexistente ou inativa'; end if;
  if tu.dia_semana <> extract(dow from p_data)::integer then
    raise exception '% não acontece em %', tu.modalidade, to_char(p_data, 'DD/MM');
  end if;

  -- Regulamento 11.1: "participar da mesma aula do titular". Vale a
  -- reserva por crédito OU o assento de turma fixa — nos dois casos o
  -- titular está naquela aula.
  if not exists (
    select 1 from public.agendamentos a
     where a.cliente_id = m.cliente_id and a.turma_id = p_turma
       and a.data = p_data and a.status = 'agendado'
  ) and not public.tem_assento_fixo(m.cliente_id, p_turma, p_data) then
    raise exception
      'o convidado participa da MESMA aula que você (11.1) — agende a sua antes de indicar';
  end if;

  conv := public.cliente_do_convidado(p_nome, p_telefone, p_email);
  if conv = m.cliente_id then
    raise exception 'esse telefone é o seu — o convidado tem de ser outra pessoa';
  end if;

  select * into el from public.elegibilidade_convidado(conv);
  if not el.ok then raise exception '%', el.motivo; end if;

  insert into public.convidados
    (matricula_id, titular_cliente_id, ciclo, convidado_cliente_id,
     turma_id, data, observacao, solicitada_por)
  values
    (p_matricula, m.cliente_id, m.ciclo_atual, conv,
     p_turma, p_data, obs, auth.uid())
  returning id into cv_id;

  select * into tit from public.clientes where id = m.cliente_id;

  dados := jsonb_build_object(
    'nome', tit.nome,
    'convidado', p_nome,
    'telefone_convidado', p_telefone,
    'turma', public.rotulo_turma(p_turma),
    'data', p_data,
    'horario', tu.horario,
    'observacao', obs,
    'solicitada_em', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI'));

  for destino in select public.emails_gestao() loop
    perform public.enfileirar_email('convidado_indicado', destino, dados,
      'convidado:' || cv_id::text || ':' || destino);
  end loop;

  return cv_id;
end;
$function$;

comment on function public.indicar_convidado(uuid, text, text, uuid, date, text, text) is
  'O titular indica o convidado de um ciclo. Confere o benefício, a elegibilidade da pessoa (11.1), a turma e se o titular está mesmo naquela aula. NÃO cria reserva: quem confirma é a equipe, porque nível e segurança não se checam por função.';

revoke execute on function public.indicar_convidado(uuid, text, text, uuid, date, text, text)
  from public, anon;
grant execute on function public.indicar_convidado(uuid, text, text, uuid, date, text, text)
  to authenticated;


-- ------------------------------------------------------------
-- 8. A equipe confirma
-- ------------------------------------------------------------
-- É aqui que a vaga é tomada. A reserva entra direto em `agendamentos`
-- com canal `convidado` e `matricula_id` nulo — o gatilho de capacidade
-- faz o resto, e nenhum crédito é tocado. Mesmo caminho da reserva
-- manual de TotalPass.
create or replace function public.confirmar_convidado(p_convite uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cv record;
  el record;
  ag uuid;
begin
  if auth.uid() is not null and not public.is_operacional() then
    raise exception 'acesso restrito à equipe';
  end if;

  select * into cv from public.convidados where id = p_convite for update;
  if not found then raise exception 'convite não encontrado'; end if;
  if cv.status <> 'solicitado' then
    raise exception 'este convite já foi decidido (%)', cv.status;
  end if;
  if cv.data < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'a aula deste convite já passou';
  end if;

  -- Revalida na hora de valer: entre a indicação e a confirmação a
  -- pessoa pode ter contratado um plano, e aí ela não é mais convidada.
  select * into el from public.elegibilidade_convidado(cv.convidado_cliente_id);
  if not el.ok then raise exception '%', el.motivo; end if;

  insert into public.agendamentos (cliente_id, turma_id, data, canal, status)
  values (cv.convidado_cliente_id, cv.turma_id, cv.data, 'convidado', 'agendado')
  returning id into ag;

  update public.convidados
  set status = 'confirmado', agendamento_id = ag,
      decidida_por = auth.uid(), decidida_em = now()
  where id = p_convite;

  -- O convidado passa a ser um lead que JÁ FEZ UMA AULA, que é o que
  -- `fez_experimental` significa na operação do funil — é a etapa que o
  -- follow-up já trata, e deixar em `lead` perderia a sequência pronta.
  -- O produto é outro, e `origem = 'convidado'` é o que distingue nos
  -- relatórios.
  update public.clientes
  set estagio = 'fez_experimental'
  where id = cv.convidado_cliente_id
    and estagio in ('lead', 'pediu_informacoes');

  perform public.avisar_convidado(p_convite, 'convidado_confirmado');

  return ag;
end;
$function$;

revoke execute on function public.confirmar_convidado(uuid) from public, anon;
grant execute on function public.confirmar_convidado(uuid) to authenticated;


create or replace function public.recusar_convidado(p_convite uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cv record;
  motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is not null and not public.is_operacional() then
    raise exception 'acesso restrito à equipe';
  end if;
  if motivo is null then
    raise exception 'diga por que está recusando — é o que o titular vai ler';
  end if;

  select * into cv from public.convidados where id = p_convite for update;
  if not found then raise exception 'convite não encontrado'; end if;
  if cv.status <> 'solicitado' then
    raise exception 'este convite já foi decidido (%)', cv.status;
  end if;

  -- Recusado NÃO consome o benefício: o índice único deixa de alcançar a
  -- linha e o titular pode indicar outra pessoa no mesmo ciclo. Recusar
  -- por nível e queimar o benefício do aluno seria punir quem seguiu a
  -- regra.
  update public.convidados
  set status = 'recusado', motivo_decisao = motivo,
      decidida_por = auth.uid(), decidida_em = now()
  where id = p_convite;

  perform public.avisar_convidado(p_convite, 'convidado_recusado');
end;
$function$;

revoke execute on function public.recusar_convidado(uuid, text) from public, anon;
grant execute on function public.recusar_convidado(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 9. Desistir
-- ------------------------------------------------------------
-- Dentro do prazo de cancelamento de aula, o benefício volta — mesma
-- lógica do crédito (4.5). Depois dele, o convite é encerrado como
-- `faltou` e o benefício fica consumido (manual interno §11).
create or replace function public.cancelar_convidado(p_convite uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cv record;
  tu record;
  cfg record;
  inicio timestamptz;
  no_prazo boolean;
begin
  select * into cv from public.convidados where id = p_convite for update;
  if not found then raise exception 'convite não encontrado'; end if;

  if public.is_cliente() and not public.is_socia() then
    if cv.titular_cliente_id <> public.cliente_atual() then
      raise exception 'este convite não é seu';
    end if;
  elsif auth.uid() is not null and not public.is_operacional() then
    raise exception 'acesso restrito';
  end if;

  if cv.status not in ('solicitado', 'confirmado') then
    raise exception 'este convite já está encerrado (%)', cv.status;
  end if;

  select * into cfg from public.config_agendamento where id;
  select * into tu from public.turmas where id = cv.turma_id;
  inicio := (cv.data + tu.horario) at time zone 'America/Sao_Paulo';
  no_prazo := inicio - now() >= (coalesce(cfg.horas_cancelamento, 4) || ' hours')::interval;

  -- Pedido ainda não confirmado volta sempre: não houve reserva, não
  -- houve vaga tomada, não há o que penalizar.
  if cv.status = 'solicitado' then
    no_prazo := true;
  end if;

  if cv.agendamento_id is not null then
    update public.agendamentos
    set status = 'cancelado', cancelado_em = now(),
        -- O cast e obrigatorio: um `case` devolve text, e literal solto
        -- coagiria para o enum mas CASE nao. Ja quebrou duas vezes neste
        -- projeto (status_parq, status_cobranca).
        origem_cancelamento = (case when public.is_cliente() then 'aluna' else 'socia' end)::public.origem_cancelamento
    where id = cv.agendamento_id and status = 'agendado';
  end if;

  update public.convidados
  set status = (case when no_prazo then 'cancelado' else 'faltou' end)::public.status_convidado,
      decidida_em = now(), decidida_por = auth.uid()
  where id = p_convite;

  return case when no_prazo then 'beneficio_devolvido' else 'beneficio_consumido' end;
end;
$function$;

comment on function public.cancelar_convidado(uuid) is
  'Desistência do convite. Dentro do prazo de cancelamento de aula o benefício volta (4.5); fora dele o convite vira falta e o benefício fica consumido (manual interno §11).';

revoke execute on function public.cancelar_convidado(uuid) from public, anon;
grant execute on function public.cancelar_convidado(uuid) to authenticated;


-- ------------------------------------------------------------
-- 10. O aviso ao titular
-- ------------------------------------------------------------
create or replace function public.avisar_convidado(p_convite uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare cv record; tit record; conv record;
begin
  select * into cv from public.convidados where id = p_convite;
  if not found then return; end if;
  select * into tit from public.clientes where id = cv.titular_cliente_id;
  select * into conv from public.clientes where id = cv.convidado_cliente_id;
  if tit.email is null then return; end if;

  perform public.enfileirar_email(p_tipo, tit.email,
    jsonb_build_object(
      'nome', tit.nome,
      'convidado', conv.nome,
      'turma', public.rotulo_turma(cv.turma_id),
      'data', cv.data,
      'motivo', cv.motivo_decisao),
    p_tipo || ':' || p_convite::text);
end;
$function$;

revoke execute on function public.avisar_convidado(uuid, text) from public, anon;


-- ------------------------------------------------------------
-- 11. A presença fecha o convite
-- ------------------------------------------------------------
-- Gatilho em `presencas`, e não rotina de fechamento: o desfecho do
-- convite é a presença, e quem marca presença é a professora na chamada.
-- Sem isto o convite ficaria `confirmado` para sempre e ninguém saberia
-- se a pessoa veio — que é a única informação que importa para o
-- follow-up depois.
create or replace function public.fechar_convite_na_presenca()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.convidados
  set status = (case when new.presente then 'compareceu' else 'faltou' end)::public.status_convidado
  where convidado_cliente_id = new.cliente_id
    and turma_id = new.turma_id
    and data = new.data_aula
    and status in ('confirmado', 'compareceu', 'faltou');
  return new;
end;
$function$;

drop trigger if exists convite_segue_a_presenca on public.presencas;
create trigger convite_segue_a_presenca
  after insert or update on public.presencas
  for each row execute function public.fechar_convite_na_presenca();


-- ------------------------------------------------------------
-- 12. As telas
-- ------------------------------------------------------------
create or replace view public.vw_convidados
with (security_invoker = true) as
select
  cv.id,
  cv.matricula_id,
  cv.ciclo,
  cv.status,
  cv.data,
  cv.turma_id,
  public.rotulo_turma(cv.turma_id) as turma_rotulo,
  t.modalidade,
  t.horario,
  cv.titular_cliente_id,
  tit.nome as titular_nome,
  tit.email as titular_email,
  pr.nome as plano_nome,
  cv.convidado_cliente_id,
  conv.nome as convidado_nome,
  conv.telefone as convidado_telefone,
  conv.email as convidado_email,
  conv.ultima_aula as convidado_ultima_aula,
  conv.estagio as convidado_funil,
  cv.agendamento_id,
  cv.observacao,
  cv.motivo_decisao,
  cv.solicitada_em,
  cv.decidida_em,
  dec.nome as decisor_nome
from public.convidados cv
join public.turmas t on t.id = cv.turma_id
join public.clientes tit on tit.id = cv.titular_cliente_id
join public.clientes conv on conv.id = cv.convidado_cliente_id
join public.matriculas m on m.id = cv.matricula_id
join public.produtos pr on pr.id = m.plano_id
left join public.socias dec on dec.id = cv.decidida_por;

grant select on public.vw_convidados to authenticated;


-- ------------------------------------------------------------
-- 13. O canal novo na chamada
-- ------------------------------------------------------------
comment on type public.canal_aula is
  'De onde veio a reserva. `convidado` é o benefício do semestral (11.1): conta na ocupação, na presença e no mínimo de alunos, paga a professora, e NÃO consome crédito nem gera receita.';
