-- ============================================================
-- Aula cancelada pelo estúdio
--
-- Até aqui o sistema não tinha como dizer "a aula de quinta às 19h30 não
-- vai acontecer". A equipe cancelava agendamento por agendamento — e cada
-- um passava pela regra do aluno (4h de antecedência), então quem tinha
-- agendado com menos de 4h PERDIA o crédito por um cancelamento que não
-- foi dele. O aluno de turma fixa nem aparecia: não tem agendamento.
--
-- Motivos que acontecem de verdade: imprevisto da professora, imprevisto
-- no estúdio ou na cidade, feriado, mínimo de alunos não atingido.
--
-- Um cancelamento, numa transação só:
--
--   1. registra a aula cancelada (turma + data), com motivo e recado;
--   2. encerra a lista de espera daquela aula — ANTES dos agendamentos,
--      porque cancelar agendamento chama a fila (chamar_fila_ao_cancelar)
--      e a primeira pessoa receberia "vagou!" de uma aula que não existe;
--   3. cancela os agendamentos e devolve o crédito SEMPRE (o prazo de 4h
--      é regra do cancelamento pelo aluno, não pelo estúdio);
--   4. dá 1 crédito de reposição a quem tem turma fixa (regulamento
--      2.3.10), que não conta no limite de reposições do aluno;
--   5. avisa cada pessoa afetada por e-mail.
--
-- E daí em diante o banco recusa agendamento e fila naquela aula.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Motivo
-- ------------------------------------------------------------
do $mig$
begin
  create type public.motivo_cancelamento_aula as enum
    ('professora', 'estudio', 'cidade', 'feriado', 'quorum', 'outro');
exception when duplicate_object then null;
end $mig$;

-- O texto que o aluno lê. Mora no banco para o e-mail e a tela dizerem a
-- mesma coisa.
create or replace function public.rotulo_motivo_cancelamento_aula(p public.motivo_cancelamento_aula)
returns text language sql immutable set search_path = '' as $fn$
  select case p
    when 'professora' then 'imprevisto da professora'
    when 'estudio'    then 'imprevisto no estúdio'
    when 'cidade'     then 'imprevisto na cidade'
    when 'feriado'    then 'feriado'
    when 'quorum'     then 'mínimo de alunos não atingido'
    else 'outro motivo'
  end;
$fn$;


-- ------------------------------------------------------------
-- 2. Configuração
-- ------------------------------------------------------------
-- Por quanto tempo vale o crédito de reposição do aluno de turma fixa.
-- Nunca menos que o fim do ciclo dele (ver cancelar_aulas).
alter table public.config_agendamento
  add column if not exists dias_validade_credito_aula_cancelada integer not null default 30;

alter table public.config_agendamento
  drop constraint if exists config_dias_credito_aula_cancelada_check;
alter table public.config_agendamento
  add constraint config_dias_credito_aula_cancelada_check
  check (dias_validade_credito_aula_cancelada between 1 and 120);

comment on column public.config_agendamento.dias_validade_credito_aula_cancelada is
  'Regulamento 2.3.10: validade (a partir da data da aula) do credito de reposicao dado a '
  'quem tem turma fixa quando o estudio cancela a aula. Nunca vence antes do fim do ciclo.';


-- ------------------------------------------------------------
-- 3. A aula cancelada
-- ------------------------------------------------------------
create table if not exists public.aulas_canceladas (
  id                      uuid primary key default gen_random_uuid(),
  turma_id                uuid not null references public.turmas (id),
  data                    date not null,
  motivo                  public.motivo_cancelamento_aula not null,
  -- Vai para o aluno (e-mail e portal). Não é nota interna.
  mensagem                text check (mensagem is null or length(mensagem) <= 500),
  repor_turma_fixa        boolean not null default true,
  cancelada_em            timestamptz not null default now(),
  cancelada_por           uuid,
  -- O que o cancelamento fez, para a equipe conferir depois.
  agendamentos_cancelados integer not null default 0,
  creditos_devolvidos     integer not null default 0,
  reposicoes_concedidas   integer not null default 0,
  fila_encerrada          integer not null default 0,
  agendamentos_app        integer not null default 0,
  reaberta_em             timestamptz,
  reaberta_por            uuid
);

comment on table public.aulas_canceladas is
  'Uma ocorrencia (turma + data) que o estudio cancelou. Escrita so por cancelar_aulas() '
  'e reabrir_aula(). Reabrir NAO restaura agendamentos nem recolhe creditos de reposicao: '
  'os alunos ja foram avisados e reagendam se quiserem.';

-- Uma aula cancelada por vez; depois de reaberta, pode ser cancelada de novo.
create unique index if not exists aulas_canceladas_vigente_unica
  on public.aulas_canceladas (turma_id, data)
  where reaberta_em is null;

create index if not exists aulas_canceladas_data_idx
  on public.aulas_canceladas (data);

alter table public.aulas_canceladas enable row level security;

-- Leitura para qualquer sessão: aluno, professora e equipe precisam saber
-- que a aula não vai acontecer, e a tabela não tem dado de pessoa — só
-- turma, data, motivo e o recado que a equipe escreveu PARA os alunos.
drop policy if exists "autenticado ve aulas canceladas" on public.aulas_canceladas;
create policy "autenticado ve aulas canceladas" on public.aulas_canceladas
  for select to authenticated using (true);


-- ------------------------------------------------------------
-- 4. Crédito de reposição ligado à aula cancelada
-- ------------------------------------------------------------
alter table public.creditos_lotes
  add column if not exists aula_cancelada_id uuid
    references public.aulas_canceladas (id) on delete set null;

comment on column public.creditos_lotes.aula_cancelada_id is
  'Lote dado como reposicao porque o ESTUDIO cancelou a aula (2.3.10). Nao conta no '
  'limite max_reposicoes_por_matricula, que e sobre reposicao pedida pelo aluno.';

-- Reescrita fiel de 20260719180000 com uma exceção: a reposição por aula
-- cancelada pelo estúdio não gasta o limite do aluno.
create or replace function public.validar_reposicao()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  usadas integer;
  maximo integer;
begin
  if new.motivo = 'reposicao' then
    if exists (
      select 1 from public.creditos_lotes l
      where l.id = new.lote_id and l.aula_cancelada_id is not null
    ) then
      return new;
    end if;

    select count(*) into usadas
    from public.creditos_eventos ce
    left join public.creditos_lotes l on l.id = ce.lote_id
    where ce.matricula_id = new.matricula_id
      and ce.motivo = 'reposicao'
      and l.aula_cancelada_id is null;
    select max_reposicoes_por_matricula into maximo from public.config_agendamento;
    if usadas >= maximo then
      raise exception 'limite de % reposições da matrícula atingido', maximo;
    end if;
  end if;
  return new;
end;
$$;


-- ------------------------------------------------------------
-- 5. Aula cancelada não recebe agendamento nem fila
-- ------------------------------------------------------------
-- Gatilho, e não checagem em agendar_aula(): vale para todo caminho que
-- cria agendamento — portal, equipe e a futura Booking API do Wellhub.
create or replace function public.recusar_aula_cancelada()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if exists (
    select 1 from public.aulas_canceladas ac
    where ac.turma_id = new.turma_id and ac.data = new.data and ac.reaberta_em is null
  ) then
    raise exception 'esta aula foi cancelada pelo estúdio';
  end if;
  return new;
end;
$fn$;

drop trigger if exists agendamentos_recusa_aula_cancelada on public.agendamentos;
create trigger agendamentos_recusa_aula_cancelada
  before insert on public.agendamentos
  for each row when (new.status = 'agendado')
  execute function public.recusar_aula_cancelada();

drop trigger if exists lista_espera_recusa_aula_cancelada on public.lista_espera;
create trigger lista_espera_recusa_aula_cancelada
  before insert on public.lista_espera
  for each row execute function public.recusar_aula_cancelada();


-- ------------------------------------------------------------
-- 6. Prévia — o que o cancelamento vai atingir
-- ------------------------------------------------------------
create or replace function public.previa_cancelamento_aulas(p_turmas uuid[], p_data date)
returns table (
  turma_id uuid,
  agendados integer,
  pelo_app integer,
  turma_fixa integer,
  na_fila integer,
  ja_cancelada boolean
)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if auth.uid() is null or not public.is_operacional() then
    raise exception 'acesso restrito à equipe';
  end if;

  return query
  select
    t.id,
    (select count(*)::integer from public.agendamentos a
      where a.turma_id = t.id and a.data = p_data and a.status = 'agendado'),
    (select count(*)::integer from public.agendamentos a
      where a.turma_id = t.id and a.data = p_data and a.status = 'agendado'
        and a.canal in ('wellhub', 'classpass')),
    public.assentos_fixos_ocupados(t.id, p_data),
    (select count(*)::integer from public.lista_espera le
      where le.turma_id = t.id and le.data = p_data and le.status in ('aguardando', 'notificada')),
    exists (select 1 from public.aulas_canceladas ac
            where ac.turma_id = t.id and ac.data = p_data and ac.reaberta_em is null)
  from public.turmas t
  where t.id = any (p_turmas);
end;
$fn$;


-- ------------------------------------------------------------
-- 7. Avisar uma pessoa (interno)
-- ------------------------------------------------------------
create or replace function public.avisar_aula_cancelada(
  p_cancelamento uuid, p_cliente uuid, p_dados jsonb
) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare c record;
begin
  select nome, email into c from public.clientes where id = p_cliente;
  if not found then return; end if;
  perform public.enfileirar_email(
    'aula_cancelada', c.email,
    p_dados || jsonb_build_object('nome', c.nome),
    'aula-cancelada:' || p_cancelamento || ':' || p_cliente
  );
end;
$fn$;


-- ------------------------------------------------------------
-- 8. Cancelar uma ou mais aulas de um dia
-- ------------------------------------------------------------
-- Uma data e várias turmas: o mesmo caminho serve para "a professora
-- faltou" (uma turma) e para "feriado" (o dia inteiro).
create or replace function public.cancelar_aulas(
  p_turmas uuid[],
  p_data date,
  p_motivo public.motivo_cancelamento_aula,
  p_mensagem text default null,
  p_repor_turma_fixa boolean default true
) returns integer
language plpgsql security definer set search_path = ''
as $fn$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  msg text := nullif(left(btrim(coalesce(p_mensagem, '')), 500), '');
  rotulo text := public.rotulo_motivo_cancelamento_aula(p_motivo);
  cfg record;
  t record;
  ag record;
  fx record;
  fl record;
  ac_id uuid;
  lote_origem uuid;
  lote uuid;
  devolveu boolean;
  validade date;
  detalhe text;
  base jsonb;
  n_aulas integer := 0;
  n_ag integer;
  n_dev integer;
  n_rep integer;
  n_fila integer;
  n_app integer;
begin
  -- Operação, não financeiro: a secretária é quem fica sabendo primeiro
  -- que a professora não vem. Devolver crédito não mexe em dinheiro.
  if auth.uid() is null or not public.is_operacional() then
    raise exception 'acesso restrito à equipe';
  end if;
  if p_data < hoje then
    raise exception 'não dá para cancelar aula de uma data que já passou';
  end if;
  if coalesce(array_length(p_turmas, 1), 0) = 0 then
    raise exception 'escolha pelo menos uma aula';
  end if;
  if p_motivo = 'outro' and msg is null then
    raise exception 'escreva o motivo — ele vai no aviso aos alunos';
  end if;

  select * into cfg from public.config_agendamento;

  for t in select * from public.turmas where id = any (p_turmas) order by horario loop
    if not t.ativa then
      raise exception 'a turma % (%) está inativa', t.modalidade, to_char(t.horario, 'HH24:MI');
    end if;
    if t.dia_semana <> extract(dow from p_data)::int then
      raise exception 'a turma % (%) não acontece em %',
        t.modalidade, to_char(t.horario, 'HH24:MI'), to_char(p_data, 'DD/MM');
    end if;
    -- Já cancelada: não é erro — no feriado a equipe marca o dia inteiro,
    -- mesmo que uma das aulas já tivesse sido cancelada antes.
    if exists (
      select 1 from public.aulas_canceladas ac
      where ac.turma_id = t.id and ac.data = p_data and ac.reaberta_em is null
    ) then
      continue;
    end if;

    insert into public.aulas_canceladas
      (turma_id, data, motivo, mensagem, repor_turma_fixa, cancelada_por)
    values (t.id, p_data, p_motivo, msg, p_repor_turma_fixa, auth.uid())
    returning id into ac_id;

    n_ag := 0; n_dev := 0; n_rep := 0; n_fila := 0; n_app := 0;
    base := jsonb_build_object(
      'modalidade', t.modalidade, 'data', p_data, 'horario', t.horario,
      'motivo', rotulo, 'mensagem', msg
    );

    -- ---- 1) Fila primeiro (ver cabeçalho) ----
    for fl in
      update public.lista_espera le
      set status = 'cancelada'
      where le.turma_id = t.id and le.data = p_data and le.status in ('aguardando', 'notificada')
      returning le.cliente_id
    loop
      n_fila := n_fila + 1;
      perform public.avisar_aula_cancelada(ac_id, fl.cliente_id,
        base || jsonb_build_object('situacao', 'fila'));
    end loop;

    -- ---- 2) Agendamentos: crédito volta sempre ----
    for ag in
      select * from public.agendamentos a
      where a.turma_id = t.id and a.data = p_data and a.status = 'agendado'
      for update
    loop
      update public.agendamentos
      set status = 'cancelado', cancelado_em = now(), origem_cancelamento = 'socia'
      where id = ag.id;
      n_ag := n_ag + 1;

      devolveu := false;
      if ag.matricula_id is not null then
        select ce.lote_id into lote_origem from public.creditos_eventos ce
        where ce.agendamento_id = ag.id and ce.motivo = 'agendamento'
        order by ce.criado_em limit 1;
        -- Sem evento de consumo não há o que devolver: chamar mesmo assim
        -- criaria um crédito do nada.
        if lote_origem is not null then
          devolveu := public.devolver_credito(ag.matricula_id, lote_origem, 'cancelamento', ag.id) is not null;
        end if;
      end if;
      if devolveu then n_dev := n_dev + 1; end if;
      if ag.canal in ('wellhub', 'classpass') then n_app := n_app + 1; end if;

      insert into public.agendamentos_eventos (agendamento_id, evento, detalhe, criado_por)
      values (ag.id, 'cancelado',
              'aula cancelada pelo estúdio (' || rotulo || ')'
                || case when devolveu then ' — crédito devolvido' else '' end,
              auth.uid());

      perform public.avisar_aula_cancelada(ac_id, ag.cliente_id,
        base || jsonb_build_object(
          'situacao', case when ag.canal in ('wellhub', 'classpass') then 'app' else 'agendada' end,
          'credito_devolvido', devolveu));
    end loop;

    -- ---- 3) Turma fixa: reposição (2.3.10) ----
    for fx in
      select m.id as matricula_id, m.cliente_id, m.data_fim, m.ciclo_atual
      from public.matricula_turmas mt
      join public.matriculas m on m.id = mt.matricula_id
      where mt.turma_id = t.id
        and mt.inicio <= p_data
        and (mt.fim is null or mt.fim >= p_data)
        and m.status <> 'cancelada'
        and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em >= p_data)
    loop
      lote := null;
      validade := null;
      if p_repor_turma_fixa then
        validade := greatest(fx.data_fim, p_data + cfg.dias_validade_credito_aula_cancelada);
        detalhe := 'Reposição: ' || t.modalidade || ' de ' || to_char(p_data, 'DD/MM')
                   || ' cancelada pelo estúdio (' || rotulo || ')';
        insert into public.creditos_lotes
          (matricula_id, ciclo, quantidade, validade, origem, detalhe, aula_cancelada_id)
        values (fx.matricula_id, fx.ciclo_atual, 1, validade, 'reposicao', detalhe, ac_id)
        returning id into lote;
        insert into public.creditos_eventos
          (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
        values (fx.matricula_id, lote, 1, 'reposicao', detalhe, auth.uid());
        n_rep := n_rep + 1;
      end if;

      perform public.avisar_aula_cancelada(ac_id, fx.cliente_id,
        base || jsonb_build_object(
          'situacao', 'turma_fixa',
          'reposicao', lote is not null,
          'validade_reposicao', validade));
    end loop;

    update public.aulas_canceladas
    set agendamentos_cancelados = n_ag,
        creditos_devolvidos = n_dev,
        reposicoes_concedidas = n_rep,
        fila_encerrada = n_fila,
        agendamentos_app = n_app
    where id = ac_id;

    n_aulas := n_aulas + 1;
  end loop;

  return n_aulas;
end;
$fn$;

comment on function public.cancelar_aulas(uuid[], date, public.motivo_cancelamento_aula, text, boolean) is
  'Estudio cancela uma ou mais aulas de um dia (professora, estudio, cidade, feriado, quorum). '
  'Encerra a fila antes dos agendamentos (senao a fila seria chamada), devolve o credito de '
  'todo agendamento sem olhar o prazo de 4h, da reposicao a quem tem turma fixa (2.3.10) e '
  'avisa cada aluno por e-mail. Aula ja cancelada e pulada, nao e erro.';


-- ------------------------------------------------------------
-- 9. Reabrir (cancelou por engano, ou o imprevisto se resolveu)
-- ------------------------------------------------------------
create or replace function public.reabrir_aula(p_cancelamento uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare ac record;
begin
  if auth.uid() is null or not public.is_operacional() then
    raise exception 'acesso restrito à equipe';
  end if;

  select * into ac from public.aulas_canceladas where id = p_cancelamento for update;
  if not found or ac.reaberta_em is not null then
    raise exception 'cancelamento inexistente ou já reaberto';
  end if;
  if ac.data < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'a aula já passou';
  end if;

  -- Só reabre a vaga. Os alunos já foram avisados e tiveram o crédito
  -- devolvido; reagendam se quiserem. A reposição dada à turma fixa fica
  -- com o aluno — tirar crédito de alguém depois de avisar seria pior.
  update public.aulas_canceladas
  set reaberta_em = now(), reaberta_por = auth.uid()
  where id = p_cancelamento;
end;
$fn$;


-- ------------------------------------------------------------
-- 10. Permissões
-- ------------------------------------------------------------
revoke execute on function public.recusar_aula_cancelada() from public, anon, authenticated;
revoke execute on function public.avisar_aula_cancelada(uuid, uuid, jsonb) from public, anon, authenticated;

revoke execute on function public.rotulo_motivo_cancelamento_aula(public.motivo_cancelamento_aula) from public, anon;
grant  execute on function public.rotulo_motivo_cancelamento_aula(public.motivo_cancelamento_aula) to authenticated;

revoke execute on function public.previa_cancelamento_aulas(uuid[], date) from public, anon;
grant  execute on function public.previa_cancelamento_aulas(uuid[], date) to authenticated;

revoke execute on function public.cancelar_aulas(uuid[], date, public.motivo_cancelamento_aula, text, boolean) from public, anon;
grant  execute on function public.cancelar_aulas(uuid[], date, public.motivo_cancelamento_aula, text, boolean) to authenticated;

revoke execute on function public.reabrir_aula(uuid) from public, anon;
grant  execute on function public.reabrir_aula(uuid) to authenticated;
