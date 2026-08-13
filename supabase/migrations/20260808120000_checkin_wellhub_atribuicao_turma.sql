-- ============================================================
-- Atribuição de turma no check-in Wellhub (CLAUDE.md 9 / 12.5)
--
-- PROBLEMA. `registrarCheckin()` no webhook escolhia a turma só por
-- dia da semana + janela de horário e desempatava com o PRIMEIRO item
-- de uma query sem `order by`. Com duas salas na mesma hora (Pole na
-- Sala 1, Treino Livre na Sala 2) a escolha era arbitrária. E a
-- tolerância de 30 min sobrepõe janelas mesmo com uma sala só: a turma
-- das 10h (60 min) cobre 09:30–11:00 e a das 11h cobre 10:30–12:00.
-- Como `registrar_presenca()` deriva a professora DA TURMA, turma
-- errada = professora errada recebe (CLAUDE.md 8). Erro silencioso.
--
-- DECISÃO. A escolha sai do TypeScript e vem para o banco, e quando o
-- horário não é suficiente o sistema NÃO adivinha: enfileira em
-- `checkins_pendentes` para a equipe atribuir.
--
--   1. agendamento ativo do aluno no dia, dentro das candidatas → turma exata
--   2. exatamente uma turma candidata                           → atribui
--   3. duas ou mais candidatas                                  → pendente (ambíguo)
--   4. nenhuma candidata                                        → pendente (sem turma)
--
-- RECEITA. Não se cria entrada financeira "provisória". `conciliar_wellhub()`
-- recebe o total REAL do repasse e o rateia entre as previstas da
-- competência — o valor em caixa/MEI não depende da contagem. O que se
-- faz é impedir fechar a competência com fila aberta (guard no fim
-- deste arquivo): a pendência é o rastro, e ela precisa ser resolvida
-- antes, senão a aula (e o pagamento da professora) somem da folha.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Fila de check-ins que o sistema se recusou a atribuir.
--
-- Sem NENHUMA coluna monetária, de propósito: é isso que deixa a fila
-- ser operacional (secretaria enxerga) sem vazar valor — o dinheiro
-- continua só em `entradas_financeiras`, que é gestão-only.
--
-- Sem enum de status/motivo: os dois são derivados, e um enum
-- redundante exigiria check constraints só para manter a redundância
-- coerente.
--   motivo = cardinality(turmas_candidatas) = 0 ? 'sem_turma' : 'ambiguo'
--   status = resolvido_em is null      → pendente
--            resolvido_em + turma_id   → atribuído
--            resolvido_em sem turma_id → descartado
-- ------------------------------------------------------------
create table public.checkins_pendentes (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes (id) on delete cascade,
  momento           timestamptz not null default now(),
  -- dia do check-in no fuso do estúdio — não é a data UTC de `momento`
  data_checkin      date not null,
  turmas_candidatas uuid[] not null default '{}',
  -- id do evento na Wellhub, quando o payload trouxer (campo a confirmar
  -- na homologação); é a chave de idempotência preferencial
  evento_externo_id text,
  turma_id          uuid references public.turmas (id),
  presenca_id       uuid references public.presencas (id) on delete set null,
  observacao        text,
  resolvido_em      timestamptz,
  resolvido_por     uuid references auth.users (id),

  -- Enquanto aberta, nada de resolução preenchido. Não se exige
  -- `presenca_id` junto de `turma_id`: o FK é `on delete set null`, e
  -- apagar uma presença (correção de lançamento) é legítimo — o que
  -- registra a atribuição é `turma_id`, `presenca_id` é só o ponteiro.
  constraint checkin_pendente_sem_resolucao
    check (resolvido_em is not null or (turma_id is null and presenca_id is null))
);

-- Idempotência de reentrega. Os dois índices são DISJUNTOS (um exige
-- `evento_externo_id` não nulo, o outro exige nulo), então um mesmo
-- insert nunca dispara os dois.
--
-- O índice do evento é escopado por (cliente, dia) e NÃO global de
-- propósito: qual campo do payload é o id do evento ainda é pergunta
-- aberta com a Wellhub. Se vier algo constante ou reaproveitado (o
-- `gym_id`, por exemplo), um índice global faria a PRIMEIRA pendência
-- casar com todo check-in seguinte de QUALQUER aluno — todos virariam
-- "duplicado", sem presença e sem receita. Escopado, o pior caso
-- degrada para o mesmo comportamento do índice de fallback abaixo
-- (uma pendência por aluno por dia), que é conhecido e tolerável.
create unique index checkins_pendentes_evento_unico
  on public.checkins_pendentes (cliente_id, data_checkin, evento_externo_id)
  where evento_externo_id is not null;

create unique index checkins_pendentes_aberto_unico
  on public.checkins_pendentes (cliente_id, data_checkin)
  where resolvido_em is null and evento_externo_id is null;

create index checkins_pendentes_fila_idx
  on public.checkins_pendentes (data_checkin desc)
  where resolvido_em is null;

comment on table public.checkins_pendentes is
  'Check-ins (hoje só Wellhub) que o sistema recusou-se a atribuir: horário ambíguo (2+ turmas candidatas) ou nenhuma turma no horário. Sem valor monetário de propósito. Resolver por resolver_checkin_pendente().';
comment on column public.checkins_pendentes.turmas_candidatas is
  'Snapshot das turmas plausíveis no instante do check-in. Vazio = motivo sem_turma.';
comment on column public.checkins_pendentes.evento_externo_id is
  'Id do evento na Wellhub, quando o payload trouxer. Sem ele a idempotência cai no par (cliente, dia).';

-- ------------------------------------------------------------
-- 2. RLS — operação VÊ, ninguém escreve direto.
-- A escrita é só pelas RPCs security definer e pelo webhook
-- (service_role, que ignora RLS).
-- `is_operacional()` e não `is_socia()`: tabela nova já nasce no
-- destino do CLAUDE.md 5.2, como em salas/modalidades.
-- ------------------------------------------------------------
alter table public.checkins_pendentes enable row level security;

create policy "operacao ve checkins pendentes"
  on public.checkins_pendentes for select
  to authenticated using (public.is_operacional());

-- ------------------------------------------------------------
-- 3. View da tela — a fila só é resolvível se der para reconhecer a
-- pessoa e as turmas. O cliente Wellhub costuma nascer como
-- "Aluna Wellhub <token>", então o gympass_id e a hora são o que
-- identifica de fato.
-- security_invoker: herda as policies de checkins_pendentes e clientes.
-- Professora vem de vw_professoras_nomes, NUNCA de `professoras`
-- (gestão-only) — mesmo padrão da Agenda.
-- ------------------------------------------------------------
create view public.vw_checkins_pendentes
with (security_invoker = true) as
select
  cp.id,
  cp.cliente_id,
  c.nome        as cliente,
  c.gympass_id,
  cp.momento,
  cp.data_checkin,
  extract(dow from cp.data_checkin)::int as dia_semana,
  cp.turmas_candidatas,
  case when cardinality(cp.turmas_candidatas) = 0
       then 'sem_turma' else 'ambiguo' end as motivo,
  (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'turma_id',   t.id,
        'horario',    t.horario,
        'modalidade', t.modalidade,
        'sala',       s.nome,
        'professora', pn.nome
      ) order by t.horario), '[]'::jsonb)
    from public.turmas t
    left join public.salas s                 on s.id  = t.sala_id
    left join public.vw_professoras_nomes pn on pn.id = t.professora_id
    where t.id = any (cp.turmas_candidatas)
  ) as candidatas
from public.checkins_pendentes cp
join public.clientes c on c.id = cp.cliente_id
where cp.resolvido_em is null;

grant select on public.vw_checkins_pendentes to authenticated;

comment on view public.vw_checkins_pendentes is
  'Fila aberta de check-ins sem turma atribuída, com o aluno e as turmas candidatas rotuladas — contrato único da aba Agenda > Pendências.';

-- ------------------------------------------------------------
-- 4. Entrada de máquina: decide a turma ou enfileira.
-- Chamada só pelo webhook (service_role). Devolve jsonb para o
-- webhook ecoar no corpo e para a homologação ser verificável.
-- ------------------------------------------------------------
create or replace function public.registrar_checkin_wellhub(
  p_cliente        uuid,
  p_momento        timestamptz default now(),
  p_evento_externo text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  lt         timestamp;
  d          date;
  min_ck     int;
  candidatas uuid[];
  n_cand     int;
  escolhida  uuid;
  n_ag       int;
  pend       public.checkins_pendentes%rowtype;
  pend_id    uuid;
  pr_id      uuid;
begin
  -- Uso interno do webhook. Não fica exposta ao `authenticated`: é
  -- security definer e grava presença (que gera dinheiro).
  if auth.uid() is not null then
    raise exception 'registrar_checkin_wellhub é uso interno do webhook';
  end if;

  lt     := p_momento at time zone 'America/Sao_Paulo';
  d      := lt::date;
  min_ck := (extract(epoch from lt::time) / 60)::int;

  -- Reentrega de um evento já conhecido: devolve o desfecho anterior
  -- em vez de reprocessar. Escopado por (cliente, dia) pelo motivo
  -- explicado no índice `checkins_pendentes_evento_unico`.
  if p_evento_externo is not null then
    select * into pend from public.checkins_pendentes
     where cliente_id = p_cliente and data_checkin = d
       and evento_externo_id = p_evento_externo;
    if found then
      return jsonb_build_object(
        'resultado', case when pend.resolvido_em is null then 'pendente' else 'duplicado' end,
        'pendencia_id', pend.id,
        'motivo', case when cardinality(pend.turmas_candidatas) = 0
                       then 'sem_turma' else 'ambiguo' end);
    end if;
  end if;

  -- Candidatas: turmas ativas do dia da semana cuja janela cobre o
  -- momento. Janela = [horario - 30min, horario + duracao].
  -- Os 30 min são os MESMOS que já vigoravam no webhook. Não viraram
  -- config de propósito: baixar a tolerância faria a janela da turma
  -- das 11h começar depois das 10:45 e o check-in ambíguo das 10:45
  -- viraria candidata única — mudaria o desfecho, não só o ajuste.
  -- (proposta futura: tolerância assimétrica, ver backlog)
  -- Minutos-do-dia em int, não aritmética de `time`: evita wrap na meia-noite.
  select coalesce(array_agg(t.id order by t.horario, t.id), '{}')
    into candidatas
    from public.turmas t
   where t.ativa
     and t.dia_semana = extract(dow from d)::int
     and min_ck >= (extract(epoch from t.horario) / 60)::int - 30
     and min_ck <= (extract(epoch from t.horario) / 60)::int + t.duracao_minutos;

  n_cand := cardinality(candidatas);

  -- Nível 1 — agendamento ativo do aluno no dia, restrito às candidatas
  -- (senão um agendamento das 19h capturaria um check-in das 10h).
  if n_cand > 0 then
    -- (array_agg(...))[1] e não min(): uuid não tem operador de ordem
    select count(*), (array_agg(a.turma_id))[1] into n_ag, escolhida
      from public.agendamentos a
     where a.cliente_id = p_cliente and a.data = d
       and a.status = 'agendado' and a.turma_id = any (candidatas);
    if n_ag <> 1 then
      escolhida := null;  -- 0 não ajuda; 2+ é ambíguo do mesmo jeito
    end if;
  end if;

  -- Nível 2 — candidata única.
  if escolhida is null and n_cand = 1 then
    escolhida := candidatas[1];
  end if;

  if escolhida is not null then
    pr_id := public.registrar_presenca(escolhida, d, p_cliente, true, 'wellhub');
    return jsonb_build_object('resultado', 'presenca',
                              'turma_id', escolhida, 'presenca_id', pr_id);
  end if;

  -- Níveis 3 e 4 — NÃO escolher. Enfileirar.
  begin
    insert into public.checkins_pendentes
      (cliente_id, momento, data_checkin, turmas_candidatas, evento_externo_id)
    values (p_cliente, p_momento, d, candidatas, p_evento_externo)
    returning id into pend_id;
  exception when unique_violation then
    -- entrega concorrente: em READ COMMITTED o re-select depois da
    -- exceção enxerga a linha que a transação vencedora commitou.
    select id into pend_id from public.checkins_pendentes
     where cliente_id = p_cliente and data_checkin = d
       and (
         (p_evento_externo is not null and evento_externo_id = p_evento_externo)
         or (p_evento_externo is null and resolvido_em is null
             and evento_externo_id is null)
       )
     limit 1;
    -- Não achou? A linha conflitante foi resolvida entre a exceção e o
    -- re-select. Devolver 200 com pendencia_id nulo perderia o check-in
    -- em silêncio; erro faz o webhook responder 500 e a Wellhub reentregar.
    if pend_id is null then
      raise exception 'conflito ao enfileirar check-in do cliente % em % — reentregar', p_cliente, d;
    end if;
  end;

  return jsonb_build_object(
    'resultado', 'pendente',
    'motivo', case when n_cand = 0 then 'sem_turma' else 'ambiguo' end,
    'candidatas', n_cand,
    'pendencia_id', pend_id);
end;
$$;

revoke execute on function public.registrar_checkin_wellhub(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.registrar_checkin_wellhub(uuid, timestamptz, text)
  to service_role;

-- ------------------------------------------------------------
-- 5. Resolução pela equipe. Um RPC só: `p_turma` null = descartar.
-- ------------------------------------------------------------
create or replace function public.resolver_checkin_pendente(
  p_pendencia  uuid,
  p_turma      uuid,                   -- null = DESCARTAR (exige observação)
  p_observacao text default null
)
returns uuid                           -- presenca_id, ou null no descarte
language plpgsql security definer
set search_path = ''
as $$
declare
  pend      public.checkins_pendentes%rowtype;
  dow_turma int;
  pr_id     uuid;
begin
  if auth.uid() is not null and not public.is_operacional() then
    raise exception 'acesso restrito à equipe (gestão ou secretaria)';
  end if;

  select * into pend from public.checkins_pendentes
   where id = p_pendencia for update;
  if not found then
    raise exception 'pendência inexistente';
  end if;
  if pend.resolvido_em is not null then
    raise exception 'pendência já resolvida em %', pend.resolvido_em;
  end if;

  -- Descarte
  if p_turma is null then
    if p_observacao is null or length(trim(p_observacao)) = 0 then
      raise exception 'descarte exige um motivo (observação)';
    end if;
    update public.checkins_pendentes
       set resolvido_em = now(), resolvido_por = auth.uid(), observacao = p_observacao
     where id = p_pendencia;
    return null;
  end if;

  -- `registrar_presenca()` não valida dia da semana — sem esta checagem
  -- um clique errado criaria presença fora da grade. Não exigimos que a
  -- turma esteja entre as candidatas (senão 'sem_turma' seria
  -- irresolvível) nem que esteja `ativa` (turma desativada depois do
  -- check-in ainda é histórico legítimo).
  select t.dia_semana into dow_turma from public.turmas t where t.id = p_turma;
  if dow_turma is null then
    raise exception 'turma inexistente';
  end if;
  if dow_turma <> extract(dow from pend.data_checkin)::int then
    raise exception 'a turma escolhida não acontece no dia do check-in';
  end if;

  -- A entrada financeira nasce daqui, pelo trigger integrar_presenca()
  -- INALTERADO.
  pr_id := public.registrar_presenca(p_turma, pend.data_checkin,
                                     pend.cliente_id, true, 'wellhub');

  -- Se a presença já existia (a professora incluiu o aluno na aula antes
  -- de alguém resolver a fila), registrar_presenca só atualiza `presente`
  -- e o canal fica o que era. Corrige de 'avulsa' para 'wellhub'; nunca
  -- sobrescreve 'mensalista' (aí o agendamento manda e não há receita
  -- Wellhub — ver backlog).
  update public.presencas set canal = 'wellhub'
   where id = pr_id and canal = 'avulsa';

  -- Corrigiu o canal? Então a entrada financeira ainda NÃO existe: o
  -- trigger integrar_presenca é `update of presente` e já rodou acima,
  -- quando o canal ainda era 'avulsa'. Sem este toque, o check-in que a
  -- Wellhub VAI pagar ficaria sem nenhum lançamento — a mesma perda
  -- silenciosa que esta migration existe para eliminar. O trigger é
  -- idempotente (só insere se não houver entrada com esse presenca_id).
  if found then
    update public.presencas set presente = presente where id = pr_id;
  end if;

  update public.checkins_pendentes
     set turma_id = p_turma, presenca_id = pr_id,
         resolvido_em = now(), resolvido_por = auth.uid(),
         observacao = coalesce(p_observacao, observacao)
   where id = p_pendencia;

  return pr_id;
end;
$$;

revoke execute on function public.resolver_checkin_pendente(uuid, uuid, text)
  from public, anon;
grant execute on function public.resolver_checkin_pendente(uuid, uuid, text)
  to authenticated;

-- ------------------------------------------------------------
-- 5.1 BUG PRÉ-EXISTENTE em registrar_presenca() — corrigido aqui porque
-- o nível 1 da hierarquia (desempate por agendamento) esbarra nele.
--
-- `case when p_presente then 'presenca' else 'falta' end` resolve para
-- TEXT (num CASE os literais unknown viram text), e não existe cast
-- implícito de text para enum. Resultado: a função levantava
--   "column evento is of type tipo_evento_agendamento but expression is of type text"
-- SEMPRE que o aluno tinha agendamento ativo — ou seja, o caminho
-- mensalista inteiro (aba Dia e portal da professora marcando presença
-- de quem reservou). Nunca apareceu porque a Agenda ainda não tem uso
-- real (a grade vive no Wix), mas está assim em produção.
--
-- Corpo idêntico ao de 20260721110000; muda só o cast explícito.
-- ------------------------------------------------------------
create or replace function public.registrar_presenca(
  p_turma uuid,
  p_data date,
  p_cliente uuid,
  p_presente boolean,
  p_canal public.canal_aula default 'avulsa'::public.canal_aula
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  ag record;
  prof uuid;
  canal_final public.canal_aula;
  pr_id uuid;
begin
  select professora_id into prof from public.turmas where id = p_turma;
  if prof is null then
    raise exception 'turma inexistente';
  end if;

  if auth.uid() is not null then
    if public.is_professora() then
      if prof <> public.professora_atual() then
        raise exception 'professora só registra presença nas próprias turmas';
      end if;
      if p_data > current_date then
        raise exception 'não dá para registrar presença de aula que ainda não aconteceu';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito à equipe ou à professora da turma';
    end if;
  end if;

  select * into ag from public.agendamentos
  where turma_id = p_turma and data = p_data and cliente_id = p_cliente
    and status = 'agendado';

  canal_final := coalesce(ag.canal, p_canal);

  insert into public.presencas
    (agendamento_id, turma_id, cliente_id, professora_id, data_aula, canal, presente)
  values (ag.id, p_turma, p_cliente, prof, p_data, canal_final, p_presente)
  on conflict (turma_id, data_aula, cliente_id)
  do update set presente = excluded.presente
  returning id into pr_id;

  if ag.id is not null then
    insert into public.agendamentos_eventos (agendamento_id, evento, criado_por)
    values (ag.id,
            (case when p_presente then 'presenca' else 'falta' end)
              ::public.tipo_evento_agendamento,
            auth.uid());
  end if;

  return pr_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. conciliar_wellhub() — corpo original de 20260719200000 mais o
-- guard da fila. Fechar a competência com pendência aberta esconderia
-- a aula e o pagamento da professora: `fechamentos_professora` congela
-- o snapshot na aprovação, então resolver depois não entra na folha.
-- ------------------------------------------------------------
create or replace function public.conciliar_wellhub(
  p_mes date,
  p_valor_total_centavos bigint,
  p_data_caixa date default null
)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  ini date := date_trunc('month', p_mes)::date;
  fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  dcaixa date := coalesce(p_data_caixa, current_date);
  n integer;
  n_pend integer;
  base bigint;
  resto bigint;
  primeiro uuid;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito às sócias';
  end if;
  if p_valor_total_centavos <= 0 then
    raise exception 'valor do repasse deve ser maior que zero';
  end if;

  -- Fila aberta na competência trava a conciliação (ver cabeçalho).
  select count(*) into n_pend
  from public.checkins_pendentes
  where resolvido_em is null
    and data_checkin >= ini and data_checkin < fim;

  if n_pend > 0 then
    raise exception
      '% check-in(s) pendentes de atribuição em % — resolva em Agenda > Pendências antes de conciliar',
      n_pend, to_char(ini, 'MM/YYYY');
  end if;

  select count(*) into n
  from public.entradas_financeiras
  where categoria = 'wellhub' and status = 'prevista'
    and data_competencia >= ini and data_competencia < fim;

  if n = 0 then
    raise exception 'nenhum check-in a reconciliar na competência %',
      to_char(ini, 'MM/YYYY');
  end if;

  base := p_valor_total_centavos / n;
  resto := p_valor_total_centavos - base * n;
  if base = 0 then
    -- repasse menor que 1 centavo por check-in (ex: teto de visitas):
    -- caso raro — tratar manualmente para não distorcer os lançamentos
    raise exception 'valor menor que o número de check-ins (%) — concilie manualmente', n;
  end if;

  select id into primeiro
  from public.entradas_financeiras
  where categoria = 'wellhub' and status = 'prevista'
    and data_competencia >= ini and data_competencia < fim
  order by data_competencia, criada_em
  limit 1;

  update public.entradas_financeiras
  set valor_centavos = base + case when id = primeiro then resto else 0 end,
      status = 'recebida',
      data_caixa = dcaixa
  where categoria = 'wellhub' and status = 'prevista'
    and data_competencia >= ini and data_competencia < fim;

  return n;
end;
$$;

revoke execute on function public.conciliar_wellhub(date, bigint, date) from public, anon;
grant execute on function public.conciliar_wellhub(date, bigint, date) to authenticated;
