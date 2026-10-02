-- ============================================================
-- Quórum: a aula sem o mínimo de alunos se cancela sozinha
-- 02/10/2026
-- ============================================================
-- Pedido da gestão, em letra: *"isso é IMPORTANTÍSSIMO. Precisa ser pauta
-- urgente. O sistema precisa funcionar igual o wix, cancelando as aulas
-- que não tiverem esse mínimo de alunos."*
--
-- Regulamento do Aluno de 01/10/2026, itens 5.1–5.3:
--
--   5.1  as aulas são confirmadas com o mínimo de 2 alunos com
--        participação confirmada **até 4 horas antes** do início;
--   5.2  sem o mínimo, a aula pode ser cancelada e o crédito, aula ou
--        benefício usado na reserva é devolvido;
--   5.3  a regra **não se aplica** à turma que tenha pelo menos 1 aluno
--        com Plano Turma Fixa ativo — essa aula acontece de todo jeito.
--
-- ## Por que 4h é o mesmo número do cancelamento, e isso importa
--
-- O prazo de cancelamento gratuito também é 4h (`horas_cancelamento`). A
-- coincidência não é decorativa: às 4h antes a lista de presença está
-- **fechada para desistência sem custo**, então é o primeiro instante em
-- que dá para decidir sem punir quem ia cancelar.
--
-- Mesmo assim os dois valores são colunas separadas. Mudar o prazo de
-- cancelamento do aluno não pode mover em silêncio a hora em que o
-- estúdio decide cancelar a aula — são decisões de negócio diferentes que
-- hoje calham de ter o mesmo número.
--
-- ## A decisão é tomada UMA vez, e fica registrada
--
-- `conferencias_quorum` existe por dois motivos, e o segundo é o que
-- importa de verdade:
--
-- 1. **Idempotência.** O cron roda a cada 10 minutos. Sem o registro, uma
--    aula confirmada às 4h seria reconferida às 3h50 — e se alguém
--    cancelasse em cima da hora (perdendo o crédito, mas liberando a
--    vaga), o cron cancelaria uma aula **já confirmada**, com gente a
--    caminho. A chave única (turma, data) impede isso.
-- 2. **Explicar depois.** "Por que a minha aula de terça foi cancelada?"
--    tem resposta com número: quantos estavam agendados, qual era o
--    mínimo, se havia turma fixa, e a que hora a conta foi feita.
--
-- ## A trava do cron atrasado
--
-- Se o cron ficar parado e voltar com uma aula a 40 minutos de começar,
-- cancelar seria pior que fazer a aula com uma pessoa: já tem alguém
-- saindo de casa. Abaixo de `horas_minimas_para_cancelar` (2h) a aula é
-- registrada como `sem_tempo` e **acontece**. Isso também é o que torna
-- seguro publicar este cron no meio do dia.
--
-- ## O que NÃO entra aqui
--
-- A vaga da turma fixa liberada por inadimplência (regulamento 13.3) fica
-- de fora por decisão da gestão: *"não precisa ser algo no sistema. Será
-- algo manual. O sistema só precisa nos avisar que a cobrança não foi
-- realizada."* O aviso é bloco 12.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Os três parâmetros
-- ------------------------------------------------------------
alter table public.config_agendamento
  add column if not exists minimo_alunos_turma integer not null default 2,
  add column if not exists horas_conferencia_quorum numeric(4,1) not null default 4,
  add column if not exists horas_minimas_para_cancelar numeric(4,1) not null default 2;

do $$
begin
  alter table public.config_agendamento
    add constraint quorum_parametros_coerentes check (
      minimo_alunos_turma > 0
      and horas_conferencia_quorum > 0
      and horas_minimas_para_cancelar >= 0
      and horas_minimas_para_cancelar < horas_conferencia_quorum
    );
exception when duplicate_object then null;
end $$;

comment on column public.config_agendamento.minimo_alunos_turma is
  'Mínimo de alunos confirmados para a aula acontecer (regulamento 5.1). Vale como padrão; a turma pode ter o seu próprio em turmas.minimo_alunos.';
comment on column public.config_agendamento.horas_conferencia_quorum is
  'Quantas horas antes do início a conta é feita (regulamento 5.1: 4h). Coluna separada de horas_cancelamento de propósito: hoje são o mesmo número, mas são decisões diferentes.';
comment on column public.config_agendamento.horas_minimas_para_cancelar is
  'Dentro deste prazo a aula NÃO é mais cancelada por quórum, mesmo abaixo do mínimo: já tem aluno a caminho. Protege contra cron atrasado.';


-- ------------------------------------------------------------
-- 2. A turma pode ter mínimo próprio
-- ------------------------------------------------------------
-- É também como se diz "esta aula acontece sempre": mínimo 1.
-- Melhor que uma marca por ocorrência, que alguém teria de lembrar de pôr
-- toda semana.
alter table public.turmas
  add column if not exists minimo_alunos integer
    check (minimo_alunos is null or minimo_alunos > 0);

comment on column public.turmas.minimo_alunos is
  'Mínimo próprio desta turma. Null = usa config_agendamento.minimo_alunos_turma. Pôr 1 é como se diz "esta aula acontece mesmo com uma pessoa".';


-- ------------------------------------------------------------
-- 3. O registro da conferência
-- ------------------------------------------------------------
create table if not exists public.conferencias_quorum (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  data date not null,

  -- O retrato da conta, não só o resultado: é o que responde "por que a
  -- minha aula foi cancelada?" três semanas depois.
  agendados integer not null,
  fixos integer not null,
  minimo integer not null,

  decisao text not null check (decisao in ('confirmada', 'cancelada', 'sem_tempo', 'ja_cancelada')),
  motivo text,

  -- Preenchido quando a decisão foi cancelar: liga à aula_cancelada, que é
  -- quem devolveu os créditos e avisou os alunos.
  cancelamento_id uuid references public.aulas_canceladas(id) on delete set null,

  conferida_em timestamptz not null default now(),
  inicio_da_aula timestamptz not null,

  -- Uma conferência por aula. É esta linha que garante que a decisão é
  -- tomada uma vez só.
  unique (turma_id, data)
);

comment on table public.conferencias_quorum is
  'A decisão de quórum de cada aula, tomada uma vez e guardada com os números que a geraram. A chave única (turma, data) é o que impede o cron de reconferir uma aula já confirmada.';

create index if not exists conferencias_quorum_por_data
  on public.conferencias_quorum (data desc, conferida_em desc);

alter table public.conferencias_quorum enable row level security;

-- Leitura para a operação: a secretária precisa ver o que o sistema
-- cancelou de madrugada. Sem coluna de dinheiro, nada a esconder dela.
drop policy if exists "equipe le conferencias de quorum" on public.conferencias_quorum;
create policy "equipe le conferencias de quorum" on public.conferencias_quorum
  for select to authenticated using (public.is_operacional());

-- Escrita só pela função: uma linha gravada à mão faria o cron pular a
-- aula e ela aconteceria vazia.


-- ------------------------------------------------------------
-- 4. cancelar_aulas aceita o cron
-- ------------------------------------------------------------
-- Reescrita FIEL de `20260921210000` (§8). Só a guarda muda — o corpo é
-- copiado do arquivo original, não redigitado.
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
  --
  -- `auth.uid() is null` passa: é a convenção da casa para contexto de
  -- serviço (migration, cron, webhook), e é o que permite a conferência de
  -- quórum cancelar sozinha. Antes a guarda recusava, e era o único motivo
  -- pelo qual o cron não podia reusar esta função — a alternativa seria
  -- duplicar o cancelamento inteiro num segundo lugar.
  if auth.uid() is not null and not public.is_operacional() then
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


-- ------------------------------------------------------------
-- 5. A conta do quórum, num lugar só
-- ------------------------------------------------------------
-- Três lugares precisam dela: a conferência automática, a tela da equipe
-- e o "conferir agora". Uma definição, como em `ocupacao_assento_fixo`.
create or replace function public.quorum_da_aula(p_turma uuid, p_data date)
returns table (
  agendados integer,
  fixos integer,
  minimo integer,
  atende boolean,
  motivo text
)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  t record;
  padrao integer;
begin
  select * into t from public.turmas where id = p_turma;
  if not found then
    return;
  end if;

  select minimo_alunos_turma into padrao from public.config_agendamento;
  minimo := coalesce(t.minimo_alunos, padrao, 2);

  -- Conta TODOS os canais. Aluna de Wellhub ou TotalPass é presença
  -- confirmada igual à mensalista: a aula acontece para ela também, e o
  -- regulamento fala de "alunos com participação confirmada", não de
  -- alunos de plano.
  agendados := (
    select count(*)::integer from public.agendamentos a
     where a.turma_id = p_turma and a.data = p_data and a.status = 'agendado'
  );

  fixos := public.assentos_fixos_ocupados(p_turma, p_data);

  if fixos >= 1 then
    -- Regulamento 5.3. Quem comprou a vaga daquele horário não perde a
    -- aula porque ninguém mais apareceu — foi exatamente isso que ele
    -- pagou para ter.
    atende := true;
    motivo := 'turma fixa ativa (5.3)';
  elsif agendados >= minimo then
    atende := true;
    motivo := 'mínimo atingido';
  else
    atende := false;
    motivo := 'abaixo do mínimo';
  end if;

  return next;
end;
$function$;

comment on function public.quorum_da_aula(uuid, date) is
  'Quantos alunos a aula tem, qual o mínimo dela e se acontece. Conta todos os canais; turma com assento fixo ativo acontece sempre (regulamento 5.3).';

revoke execute on function public.quorum_da_aula(uuid, date) from public, anon;
grant execute on function public.quorum_da_aula(uuid, date) to authenticated;


-- ------------------------------------------------------------
-- 5b. Horas como a gente escreve
-- ------------------------------------------------------------
-- `numeric(4,1)` imprime "4.0", e "até 4.0 horas antes" numa mensagem
-- para o aluno é o tipo de detalhe que denuncia texto gerado por máquina.
-- Inteiro sai inteiro; fração sai com vírgula, que é como se escreve em
-- português.
create or replace function public.horas_em_texto(p numeric)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
    when p is null then ''
    when p = trunc(p) then trunc(p)::integer::text
    else replace(trim(to_char(p, 'FM9999990.0')), '.', ',')
  end;
$function$;

revoke execute on function public.horas_em_texto(numeric) from public, anon;
grant execute on function public.horas_em_texto(numeric) to authenticated;


-- ------------------------------------------------------------
-- 6. A conferência
-- ------------------------------------------------------------
-- Entra pelo cron a cada 10 minutos, e a equipe também pode chamar.
-- Devolve o que decidiu, para o log do cron dizer algo útil.
create or replace function public.conferir_quorum(p_agora timestamptz default null)
returns table (
  turma_id uuid,
  data date,
  decisao text,
  agendados integer,
  minimo integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cfg record;
  agora timestamptz;
  hoje date;
  r record;
  q record;
  ac_id uuid;
  dec text;
  mot text;
begin
  -- Contexto de serviço (cron) ou equipe operacional.
  if auth.uid() is not null and not public.is_operacional() then
    raise exception 'acesso restrito à equipe';
  end if;

  select * into cfg from public.config_agendamento;
  agora := coalesce(p_agora, now());
  hoje := (agora at time zone 'America/Sao_Paulo')::date;

  for r in
    -- Hoje e amanhã bastam: a janela é de horas, e a virada do dia em São
    -- Paulo cai dentro dela. Dois dias × 46 turmas é consulta de nada.
    select
      t.id,
      t.modalidade,
      t.horario,
      d.dia,
      ((d.dia + t.horario) at time zone 'America/Sao_Paulo') as inicio
    from public.turmas t
    cross join lateral (
      select g::date as dia
      from generate_series(hoje::timestamp, (hoje + 1)::timestamp, interval '1 day') g
    ) d
    where t.ativa
      and extract(dow from d.dia)::integer = t.dia_semana
    order by d.dia, t.horario
  loop
    -- Já começou: não há o que decidir.
    continue when r.inicio <= agora;
    -- Fora da janela de conferência.
    continue when r.inicio - agora > (cfg.horas_conferencia_quorum || ' hours')::interval;
    -- Já conferida: a decisão é tomada uma vez (ver cabeçalho).
    continue when exists (
      select 1 from public.conferencias_quorum c
       where c.turma_id = r.id and c.data = r.dia
    );

    select * into q from public.quorum_da_aula(r.id, r.dia);
    ac_id := null;

    if exists (
      select 1 from public.aulas_canceladas ac
       where ac.turma_id = r.id and ac.data = r.dia and ac.reaberta_em is null
    ) then
      -- Feriado, imprevisto da professora: a aula já não acontece. Grava
      -- para o cron não reconferir, sem mexer em nada.
      dec := 'ja_cancelada';
      mot := 'aula já estava cancelada por outro motivo';

    elsif q.atende then
      dec := 'confirmada';
      mot := q.motivo;

    elsif r.inicio - agora < (cfg.horas_minimas_para_cancelar || ' hours')::interval then
      -- Tarde demais para cancelar sem prejudicar quem já está vindo.
      dec := 'sem_tempo';
      mot := 'abaixo do mínimo, mas dentro de '
             || public.horas_em_texto(cfg.horas_minimas_para_cancelar)
             || 'h do início — a aula acontece';

    else
      -- Cancela pelo caminho único: devolve crédito de todos os canais,
      -- encerra a fila, dá reposição a quem tem turma fixa e avisa cada
      -- aluno por e-mail.
      perform public.cancelar_aulas(
        array[r.id], r.dia, 'quorum',
        'A turma não atingiu o mínimo de alunos confirmados até '
          || public.horas_em_texto(cfg.horas_conferencia_quorum)
          || ' horas antes do início. O seu crédito já voltou para você e pode ser usado em outra aula.',
        true);

      select ac.id into ac_id from public.aulas_canceladas ac
       where ac.turma_id = r.id and ac.data = r.dia and ac.reaberta_em is null
       order by ac.cancelada_em desc limit 1;

      dec := 'cancelada';
      mot := q.motivo;

      perform public.avisar_gestao_quorum(r.id, r.dia, q.agendados, q.minimo, ac_id);
    end if;

    insert into public.conferencias_quorum
      (turma_id, data, agendados, fixos, minimo, decisao, motivo,
       cancelamento_id, conferida_em, inicio_da_aula)
    values
      (r.id, r.dia, q.agendados, q.fixos, q.minimo, dec, mot,
       ac_id, agora, r.inicio);

    return query select r.id, r.dia, dec, q.agendados, q.minimo;
  end loop;
end;
$function$;

comment on function public.conferir_quorum(timestamptz) is
  'Confere o quórum das aulas que entraram na janela e cancela as que estão abaixo do mínimo (regulamento 5.1–5.3). Decide uma vez por aula e grava o retrato da conta. Roda no cron a cada 10 min; a equipe pode chamar para conferir na hora.';

revoke execute on function public.conferir_quorum(timestamptz) from public, anon;
grant execute on function public.conferir_quorum(timestamptz) to authenticated;


-- ------------------------------------------------------------
-- 7. O aviso à gestão
-- ------------------------------------------------------------
-- Cancelamento automático sem aviso é o pior dos dois mundos: ninguém
-- confia no sistema e ninguém sabe o que aconteceu. A equipe recebe a
-- aula, os números e o caminho para reabrir, se quiser fazer a aula
-- mesmo assim (`reabrir_aula`).
create or replace function public.avisar_gestao_quorum(
  p_turma uuid,
  p_data date,
  p_agendados integer,
  p_minimo integer,
  p_cancelamento uuid
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  dados jsonb;
  destino text;
begin
  select jsonb_build_object(
    'turma', public.rotulo_turma(p_turma),
    'data', p_data,
    'horario', t.horario,
    'modalidade', t.modalidade,
    'agendados', p_agendados,
    'minimo', p_minimo,
    'professora', pf.nome
  ) into dados
  from public.turmas t
  left join public.professoras pf on pf.id = t.professora_id
  where t.id = p_turma;

  for destino in select public.emails_gestao() loop
    perform public.enfileirar_email(
      'aula_cancelada_quorum', destino, dados,
      'quorum:' || p_turma::text || ':' || p_data::text || ':' || destino);
  end loop;
end;
$function$;

revoke execute on function public.avisar_gestao_quorum(uuid, date, integer, integer, uuid)
  from public, anon;


-- ------------------------------------------------------------
-- 8. A tela da equipe
-- ------------------------------------------------------------
create or replace view public.vw_conferencias_quorum
with (security_invoker = true) as
select
  c.id,
  c.turma_id,
  c.data,
  t.modalidade,
  t.horario,
  s.nome as sala_nome,
  pf.nome as professora_nome,
  c.agendados,
  c.fixos,
  c.minimo,
  c.decisao,
  c.motivo,
  c.cancelamento_id,
  c.conferida_em,
  c.inicio_da_aula,
  (ac.reaberta_em is not null) as reaberta
from public.conferencias_quorum c
join public.turmas t on t.id = c.turma_id
left join public.salas s on s.id = t.sala_id
left join public.professoras pf on pf.id = t.professora_id
left join public.aulas_canceladas ac on ac.id = c.cancelamento_id;

grant select on public.vw_conferencias_quorum to authenticated;


-- ------------------------------------------------------------
-- 9. O cron
-- ------------------------------------------------------------
-- A cada 10 minutos: a decisão sai no máximo 10 min depois de a aula
-- entrar na janela, então o aluno é avisado com ~3h50 de antecedência.
--
-- Não precisa do Vault (§14.4 do CLAUDE.md): é SQL puro, não chama Edge
-- Function nenhuma, então é idêntico e inofensivo nos dois ambientes.
select cron.unschedule('conferir-quorum')
  where exists (select 1 from cron.job where jobname = 'conferir-quorum');

select cron.schedule(
  'conferir-quorum',
  '*/10 * * * *',
  $$select count(*) from public.conferir_quorum()$$
);
