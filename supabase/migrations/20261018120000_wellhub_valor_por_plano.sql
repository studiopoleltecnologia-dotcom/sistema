-- ============================================================
-- Wellhub: o repasse depende do plano do assinante
-- 05/10/2026
-- ============================================================
-- A gestão, hoje: "o valor do check-in do Wellhub varia agora, porque
-- temos 2 tipos de planos — Silver+ e Gold. Tem que colocar um jeito de
-- isso não ficar fixo."
--
-- Até aqui todo check-in valia o mesmo:
-- `config_agendamento.valor_checkin_wellhub_centavos`, um número só. Com
-- dois níveis de assinatura, esse número está errado para metade dos
-- check-ins — e errado para MAIS da metade quando a Wellhub criar o
-- terceiro.
--
-- ## O dado já chega, e a gente jogava fora
--
-- O payload do check-in traz `gym.product`, e a documentação da Wellhub
-- diz textualmente que é "o plano do assinante (o que define o
-- repasse)", com `id` e `description`. O webhook recebia e descartava.
--
-- Então o desenho não precisa inventar nada: o plano vira COLUNA na
-- presença, e o valor sai de uma tabela de preços por plano.
--
-- ## O sistema aprende os planos sozinho
--
-- Plano que aparece pela primeira vez entra em `wellhub_planos`
-- automaticamente, com `confirmado = false` e o valor padrão da
-- configuração — e a equipe recebe um aviso no sino pedindo o valor.
--
-- É de propósito que ele não bloqueie nem deixe de lançar: o check-in
-- aconteceu, a aula foi dada, a professora vai ser paga. O que falta é
-- saber quanto a Wellhub paga, e isso é pergunta para a gestão, não
-- motivo para perder o registro.
--
-- ## O que continua valendo
--
-- A verdade do dinheiro continua sendo a CONCILIAÇÃO (CLAUDE.md 12.6):
-- a Wellhub não expõe financeiro por API, o relatório vem do Portal do
-- Parceiro e `conciliar_wellhub()` distribui o valor real entre os
-- check-ins do mês. Esta tabela melhora a PREVISÃO, que é o que a gestão
-- vê antes do dia 15 — não substitui o acerto.
--
-- E `valor = 0` continua significando "não sabemos quanto vale, não
-- lança". Plano novo com valor 0 não inventa receita.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A tabela de preços por plano
-- ------------------------------------------------------------
-- A chave é o `product_id` da Wellhub, não o nome: o nome é texto deles
-- e muda ("Gold" vira "Gold+"), o id é o que vem no evento e é o que o
-- `GET /setup/v1/gyms/:id/products` lista.
create table if not exists public.wellhub_planos (
  product_id integer primary key,
  descricao text,
  valor_centavos bigint not null default 0 check (valor_centavos >= 0),

  -- false = o sistema cadastrou sozinho ao ver o primeiro check-in e
  -- ninguém disse ainda quanto vale.
  confirmado boolean not null default false,
  ativo boolean not null default true,

  visto_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

comment on table public.wellhub_planos is
  'Quanto a Wellhub paga por check-in, por plano do assinante (Silver+, Gold…). O plano chega em gym.product no payload do check-in. confirmado = false significa que o sistema aprendeu o plano sozinho e ainda espera o valor da gestão.';

alter table public.wellhub_planos enable row level security;

-- Dinheiro: leitura e escrita da gestão.
drop policy if exists "gestao ve planos wellhub" on public.wellhub_planos;
create policy "gestao ve planos wellhub" on public.wellhub_planos
  for select to authenticated using (public.is_gestao());

drop policy if exists "gestao edita planos wellhub" on public.wellhub_planos;
create policy "gestao edita planos wellhub" on public.wellhub_planos
  for update to authenticated
  using (public.is_gestao()) with check (public.is_gestao());

-- Sem policy de insert: quem cadastra é o aprendizado automático abaixo.

drop trigger if exists wellhub_planos_atualizada_em on public.wellhub_planos;
create trigger wellhub_planos_atualizada_em
  before update on public.wellhub_planos
  for each row execute function public.set_atualizada_em();


-- ------------------------------------------------------------
-- 2. O plano fica na presença
-- ------------------------------------------------------------
-- Na presença e não só na entrada financeira: a presença é o fato, e é
-- ela que sobrevive a estorno, correção e reconciliação.
alter table public.presencas
  add column if not exists wellhub_product_id integer;

comment on column public.presencas.wellhub_product_id is
  'O plano Wellhub do assinante no momento do check-in (gym.product.id). Nulo em presença que não veio da Wellhub, ou de check-in anterior a 05/10/2026.';

create index if not exists presencas_wellhub_plano
  on public.presencas (wellhub_product_id) where wellhub_product_id is not null;


-- ------------------------------------------------------------
-- 3. Quanto vale um check-in
-- ------------------------------------------------------------
-- Uma conta só, usada pelo gatilho e pela tela. O padrão da configuração
-- deixa de ser "o valor" e passa a ser "o valor de quando não sabemos o
-- plano" — que é o que ele sempre foi, na verdade.
create or replace function public.valor_checkin_wellhub(p_product_id integer)
returns bigint
language sql
stable security definer
set search_path to ''
as $function$
  select coalesce(
    (select w.valor_centavos from public.wellhub_planos w
      where w.product_id = p_product_id and w.ativo),
    (select c.valor_checkin_wellhub_centavos from public.config_agendamento c where c.id),
    0
  )::bigint;
$function$;

comment on function public.valor_checkin_wellhub(integer) is
  'O repasse previsto de um check-in, pelo plano do assinante. Sem plano conhecido, usa config_agendamento.valor_checkin_wellhub_centavos como padrão. Zero = não lança receita.';

revoke execute on function public.valor_checkin_wellhub(integer) from public, anon;
grant execute on function public.valor_checkin_wellhub(integer) to authenticated;


-- ------------------------------------------------------------
-- 4. Aprender o plano que apareceu
-- ------------------------------------------------------------
create or replace function public.registrar_plano_wellhub(
  p_product_id integer,
  p_descricao text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ja boolean;
  destino text;
  dados jsonb;
  padrao bigint;
begin
  if p_product_id is null then return; end if;

  select true into ja from public.wellhub_planos where product_id = p_product_id;

  if ja then
    -- A descrição pode mudar de nome do lado deles; o valor, nunca se
    -- toca aqui — quem define é a gestão.
    update public.wellhub_planos
    set descricao = coalesce(nullif(btrim(coalesce(p_descricao, '')), ''), descricao),
        visto_em = now()
    where product_id = p_product_id;
    return;
  end if;

  select coalesce(valor_checkin_wellhub_centavos, 0) into padrao
  from public.config_agendamento where id;

  insert into public.wellhub_planos (product_id, descricao, valor_centavos, confirmado)
  values (p_product_id, nullif(btrim(coalesce(p_descricao, '')), ''), coalesce(padrao, 0), false)
  on conflict (product_id) do nothing;

  dados := jsonb_build_object(
    'nome', coalesce(nullif(btrim(coalesce(p_descricao, '')), ''), 'Plano ' || p_product_id),
    'product_id', p_product_id,
    'valor_padrao_centavos', coalesce(padrao, 0));

  for destino in select public.emails_gestao() loop
    perform public.enfileirar_email('wellhub_plano_novo', destino, dados,
      'wellhub-plano:' || p_product_id::text || ':' || destino);
  end loop;
end;
$function$;

comment on function public.registrar_plano_wellhub(integer, text) is
  'Cadastra o plano Wellhub na primeira vez que ele aparece num check-in e avisa a gestão para informar o valor. Nunca mexe no valor de um plano já cadastrado.';

revoke execute on function public.registrar_plano_wellhub(integer, text) from public, anon;


-- ------------------------------------------------------------
-- 5. O aviso no sino
-- ------------------------------------------------------------
insert into public.tipos_notificacao (tipo, rotulo, descricao, link, ordem) values
  ('wellhub_plano_novo', 'Plano Wellhub novo, sem valor',
   'Apareceu um plano de assinante que o sistema não conhecia. Até alguém informar o repasse, ele entra pelo valor padrão.',
   '#/financeiro/wellhub', 70)
on conflict (tipo) do update
set rotulo = excluded.rotulo, descricao = excluded.descricao,
    link = excluded.link, ordem = excluded.ordem;


-- ------------------------------------------------------------
-- 6. A configuração vira o PADRÃO, não o valor
-- ------------------------------------------------------------
comment on column public.config_agendamento.valor_checkin_wellhub_centavos is
  'Repasse previsto por check-in Wellhub quando o plano do assinante é desconhecido. Desde 05/10/2026 o valor normal vem de wellhub_planos (Silver+, Gold…), porque o repasse passou a depender do plano. Zero = não lança receita.';


-- ------------------------------------------------------------
-- 7. O gatilho que lanca a receita passa a olhar o plano
-- ------------------------------------------------------------
-- Gerada do arquivo de `20261003200000`. Duas diferencas: o valor sai de
-- `valor_checkin_wellhub()` e o lancamento virou upsert.
create or replace function public.integrar_presenca()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  valor bigint;
  prox15 date;
  rotulo text;
  cat public.categoria_entrada;
begin
  if new.presente then
    update public.clientes
    set ultima_aula = new.data_aula
    where id = new.cliente_id
      and (ultima_aula is null or ultima_aula < new.data_aula);

    if new.canal in ('wellhub', 'totalpass') then
      if new.canal = 'wellhub' then
        -- O valor depende do PLANO do assinante (Silver+, Gold…), que vem
        -- no payload do check-in. Sem plano conhecido, cai no padrão da
        -- configuração — que passou a ser justamente isso: o padrão.
        valor := public.valor_checkin_wellhub(new.wellhub_product_id);
        rotulo := 'Check-in Wellhub';
        cat := 'wellhub';
      else
        select valor_checkin_totalpass_centavos into valor from public.config_agendamento;
        rotulo := 'Check-in TotalPass';
        cat := 'totalpass';
      end if;

      -- Valor 0 = não sabemos quanto a plataforma paga. Não lança.
      if valor > 0 then
        prox15 := (date_trunc('month', new.data_aula) + interval '1 month + 14 days')::date;

        -- Upsert, e não "insere se não existir": o plano do assinante
        -- chega DEPOIS da presença (o check-in grava a presença e só
        -- então marca o plano), e o gatilho roda de novo nessa hora. Sem
        -- reprecificar, a receita ficaria congelada no valor padrão.
        -- Só mexe no que ainda não foi conciliado.
        update public.entradas_financeiras
        set valor_centavos = valor, descricao = rotulo
        where presenca_id = new.id and status = 'prevista';

        if not found then
          insert into public.entradas_financeiras
            (descricao, valor_centavos, categoria, status, data_competencia,
             data_prevista, cliente_id, presenca_id)
          select rotulo, valor, cat, 'prevista', new.data_aula,
                 prox15, new.cliente_id, new.id
          where not exists (
            select 1 from public.entradas_financeiras where presenca_id = new.id);
        end if;
      end if;
    end if;
  else
    -- correção de presença → falta: remove a previsão ainda não reconciliada
    delete from public.entradas_financeiras
    where presenca_id = new.id and status = 'prevista';
  end if;
  return new;
end;
$function$;

-- O gatilho tambem precisa acordar quando o PLANO muda, e nao so a
-- presenca: o check-in grava a presenca e so entao marca o plano. Sem
-- isso a receita ficaria congelada no valor padrao.
drop trigger if exists presencas_integra on public.presencas;
create trigger presencas_integra
  after insert or update of presente, wellhub_product_id on public.presencas
  for each row execute function public.integrar_presenca();


-- ------------------------------------------------------------
-- 8. O check-in guarda o plano
-- ------------------------------------------------------------
-- Gerada do arquivo de `20260808120000`. Duas diferencas: os dois
-- parametros novos e o registro do plano na presenca.
create or replace function public.registrar_checkin_wellhub(
  p_cliente        uuid,
  p_momento        timestamptz default now(),
  p_evento_externo text default null,
  -- O plano do assinante (`gym.product` no payload). É ele que define o
  -- repasse desde que a Wellhub passou a ter Silver+ e Gold.
  p_product_id integer default null,
  p_product_desc text default null
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

  -- O plano entra no cadastro assim que aparece, mesmo antes de alguém
  -- dizer quanto vale: é o que faz o sistema aprender os planos novos em
  -- vez de precificar errado em silêncio.
  perform public.registrar_plano_wellhub(p_product_id, p_product_desc);

  if escolhida is not null then
    pr_id := public.registrar_presenca(escolhida, d, p_cliente, true, 'wellhub');

    -- Depois da presença, porque é `registrar_presenca` que a cria. O
    -- gatilho de integração roda de novo neste update e reprecifica a
    -- receita com o plano certo.
    if p_product_id is not null then
      update public.presencas set wellhub_product_id = p_product_id where id = pr_id;
    end if;

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

revoke execute on function public.registrar_checkin_wellhub(uuid, timestamptz, text, integer, text) from public, anon, authenticated;

comment on function public.registrar_checkin_wellhub(uuid, timestamptz, text, integer, text) is
  'Registra o check-in Wellhub: decide a turma (9.7) e guarda o plano do assinante, que e o que define o repasse desde 05/10/2026.';

-- A assinatura antiga (3 parâmetros) sai de cena: ela continuaria
-- existindo ao lado da nova, e uma chamada com 3 argumentos cairia nela
-- — gravando o check-in sem o plano, em silêncio. Com ela fora, a
-- chamada de 3 argumentos resolve para a nova pelos defaults.
drop function if exists public.registrar_checkin_wellhub(uuid, timestamptz, text);
