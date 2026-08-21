-- ============================================================
-- Etapa 4 — Assinaturas e lotes de crédito
--
-- O que a etapa 3 entregou foi CADASTRO: a equipe passou a conseguir
-- descrever qualquer produto. Esta etapa faz o sistema OBEDECER ao que
-- foi cadastrado. Cinco defeitos, todos verificados no banco antes de
-- escrever uma linha:
--
--   R1  Nada renova. `renovar_ciclo()` recusa quando
--       `ciclo_atual >= ciclos_total`, e o mensal nasce com 1 ciclo —
--       ou seja, trava no primeiro. Pior: ninguém a chama. Não há cron
--       nem trigger, só um botão manual em ProdutosPage. "Mensal" hoje
--       é um pacote de 30 dias que morre em silêncio.
--   R12 Preço não é congelado. A renovação lia `produtos.preco_centavos`
--       na hora, então um reajuste atingiria retroativamente quem já era
--       aluno — exatamente o que um contrato não pode fazer.
--   R4  Não existe lote nem validade. O razão é um balde único por
--       matrícula; `validade_creditos_dias` não é lido por ninguém e não
--       há como dizer "estes 4 vencem dia 20, aqueles 2 dia 30".
--   R3  Acúmulo do semestral não acontece. A renovação expirava 100% do
--       saldo, sempre. `acumula_creditos` e `teto_acumulo_ciclos` eram
--       decoração.
--   R2  `produto_sucessor_id` não faz nada: ao fim do 6º ciclo o
--       semestral simplesmente morre em vez de virar mensal.
--
-- E um defeito que apareceu ao testar com um login de aluno de verdade,
-- não previsto no plano:
--
--   R13 O ALUNO SEMPRE VÊ SALDO 0. `vw_saldo_creditos` é
--       `security_invoker` e `creditos_eventos` não tem policy de SELECT
--       para cliente — então o LEFT JOIN devolve zero linhas de evento e
--       o saldo soma 0 para todo mundo. Está assim em produção. O
--       agendamento funciona (a RPC é SECURITY DEFINER), mas a tela mente
--       para a aluna sobre quantas aulas ela tem.
--
-- Decisão estrutural desta migration: o crédito deixa de ser um número e
-- passa a ser um LOTE com validade. Saldo continua saindo do razão
-- append-only (`creditos_eventos`) — fonte de verdade única, sem coluna
-- de saldo materializada para divergir. `creditos_lotes` só guarda os
-- metadados do lote (quanto, de qual ciclo, até quando).
-- ============================================================


-- ------------------------------------------------------------
-- 1. Config: com quantos dias de antecedência a cobrança nasce
-- ------------------------------------------------------------
-- Casa com o e-mail de vencimento, que já sai em D-3
-- (`enfileirar_vencimentos`). Parametrizável porque é política
-- comercial, não constante de código (CLAUDE.md §9.4).
alter table public.config_agendamento
  add column if not exists dias_antecedencia_cobranca integer not null default 3;

alter table public.config_agendamento
  drop constraint if exists config_dias_cobranca_check;
alter table public.config_agendamento
  add constraint config_dias_cobranca_check
  check (dias_antecedencia_cobranca between 0 and 30);


-- ------------------------------------------------------------
-- 2. `matriculas` passa a ser a ASSINATURA
-- ------------------------------------------------------------
-- Não renomeio a tabela: acabei de renomear planos->produtos na etapa 3 e
-- outra troca de nome custaria mais churn do que esclarece. O que muda é
-- o significado, e ele fica escrito nos comentários de coluna.
--
-- `ciclos_total` era o nome errado para o conceito certo. Ele nunca
-- quis dizer "quantos ciclos esta assinatura terá" — quer dizer
-- "quantos ciclos a aluna se comprometeu a pagar antes de poder sair
-- sem multa". Um mensal tem compromisso 1 e vida infinita.
do $mig$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matriculas'
      and column_name = 'ciclos_total'
  ) then
    alter table public.matriculas rename column ciclos_total to ciclos_compromisso;
  end if;
end $mig$;

alter table public.matriculas
  add column if not exists preco_contratado_centavos bigint,
  add column if not exists renova_automaticamente boolean not null default false,
  add column if not exists cancelada_em timestamptz,
  add column if not exists cancelamento_efetivo_em date;

-- Backfill defensivo. Hoje há 0 matrículas nos dois ambientes, mas a
-- migration não pode depender disso: entre escrever e aplicar, alguém
-- pode contratar pela tela.
update public.matriculas m
set preco_contratado_centavos = coalesce(m.preco_contratado_centavos, p.preco_centavos),
    renova_automaticamente    = coalesce(p.renova_automaticamente, false)
from public.produtos p
where p.id = m.plano_id;

alter table public.matriculas
  alter column preco_contratado_centavos set not null;

alter table public.matriculas
  drop constraint if exists matriculas_preco_contratado_check;
alter table public.matriculas
  add constraint matriculas_preco_contratado_check
  check (preco_contratado_centavos >= 0);

-- ESTA é a causa-raiz do R1, e ela é estrutural, não lógica:
-- `check (ciclo_atual <= ciclos_total)`. Com o mensal nascendo com 1
-- ciclo, o banco tornava o ciclo 2 IMPOSSÍVEL — mesmo que a função
-- deixasse passar, o constraint recusaria. Não é só uma regra a mais:
-- enquanto ela existir, nenhuma assinatura recorrente pode existir.
--
-- O compromisso continua tendo significado (permanência mínima, multa,
-- direito de sair), mas ele não é mais um teto de vida da assinatura.
alter table public.matriculas
  drop constraint if exists matriculas_ciclo_dentro_do_total;

comment on column public.matriculas.preco_contratado_centavos is
  'Preco de UM ciclo, congelado na contratacao. A renovacao NUNCA rele produtos.preco_centavos — reajuste vale so para quem contratar depois.';
comment on column public.matriculas.ciclos_compromisso is
  'Permanencia minima em ciclos. 1 = sem compromisso. NAO e o fim da assinatura: com renova_automaticamente, ela segue alem do compromisso.';
comment on column public.matriculas.renova_automaticamente is
  'Copiado do produto na contratacao. Congelado junto com o preco: mudar o produto depois nao converte assinatura antiga em recorrente.';
comment on column public.matriculas.cancelamento_efetivo_em is
  'Cancelamento vale no FIM do ciclo pago, nao na hora. Os creditos ja pagos continuam valendo ate expirarem (CLAUDE.md 9.4).';


-- ------------------------------------------------------------
-- 3. Lotes de crédito
-- ------------------------------------------------------------
create table if not exists public.creditos_lotes (
  id           uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas(id) on delete cascade,
  ciclo        integer not null,
  quantidade   integer not null check (quantidade > 0),
  concedido_em date not null default current_date,
  validade     date not null,
  origem       public.motivo_credito not null default 'compra',
  detalhe      text,
  criado_em    timestamptz not null default now()
);

comment on table public.creditos_lotes is
  'Um lote = uma concessao de creditos com validade propria. O SALDO nao mora aqui: sai de creditos_eventos, que continua sendo o razao append-only e a unica fonte de verdade. Aqui ficam so os metadados.';

create index if not exists creditos_lotes_fifo_idx
  on public.creditos_lotes (matricula_id, validade, criado_em);

alter table public.creditos_eventos
  add column if not exists lote_id uuid references public.creditos_lotes(id) on delete cascade;

comment on column public.creditos_eventos.lote_id is
  'De qual lote o movimento saiu/entrou. Devolucao de cancelamento volta para o lote de origem — senao o credito ressuscitaria com validade nova.';

create index if not exists creditos_eventos_lote_idx
  on public.creditos_eventos (lote_id);


-- ------------------------------------------------------------
-- 4. Backfill: cada matrícula existente vira um lote
-- ------------------------------------------------------------
-- Saldo líquido atual da matrícula vira um lote com validade no fim do
-- ciclo corrente, e todos os eventos órfãos passam a apontar para ele.
-- Assim o saldo antes e depois da migration é idêntico.
do $mig$
declare r record; novo_lote uuid;
begin
  -- Só quem tem evento órfão. Sem este filtro, reaplicar a migration
  -- criaria um lote vazio por matrícula a cada execução.
  for r in
    select m.id, m.ciclo_atual, m.data_fim,
           coalesce(sum(ce.delta), 0) as saldo
    from public.matriculas m
    join public.creditos_eventos ce on ce.matricula_id = m.id
    where exists (
      select 1 from public.creditos_eventos o
      where o.matricula_id = m.id and o.lote_id is null
    )
    group by m.id, m.ciclo_atual, m.data_fim
  loop
    insert into public.creditos_lotes
      (matricula_id, ciclo, quantidade, validade, origem, detalhe)
    values
      (r.id, r.ciclo_atual, greatest(r.saldo, 1), r.data_fim, 'ajuste',
       'lote de migracao — saldo consolidado da etapa 4')
    returning id into novo_lote;

    update public.creditos_eventos
    set lote_id = novo_lote
    where matricula_id = r.id and lote_id is null;
  end loop;
end $mig$;

-- A partir daqui todo movimento pertence a um lote. Sem isto, um evento
-- órfão ficaria invisível para a view de saldo e sumiria do extrato.
alter table public.creditos_eventos
  alter column lote_id set not null;


-- ------------------------------------------------------------
-- 5. RLS — inclui a correção do saldo 0 (R13)
-- ------------------------------------------------------------
alter table public.creditos_lotes enable row level security;

drop policy if exists "socias gerenciam lotes" on public.creditos_lotes;
create policy "socias gerenciam lotes" on public.creditos_lotes
  for all to authenticated using (public.is_socia()) with check (public.is_socia());

-- A aluna precisa ver os PRÓPRIOS lotes: o regulamento promete que ela
-- consegue conferir o que aconteceu com o saldo dela. Sem isto a tela
-- mostra 0 e ela liga para o estúdio.
drop policy if exists "cliente ve os proprios lotes" on public.creditos_lotes;
create policy "cliente ve os proprios lotes" on public.creditos_lotes
  for select to authenticated using (
    exists (
      select 1 from public.matriculas m
      where m.id = creditos_lotes.matricula_id
        and m.cliente_id = public.cliente_atual()
    )
  );

-- Este era o buraco: `vw_saldo_creditos` é security_invoker e o cliente
-- não tinha NENHUMA policy de leitura em creditos_eventos, então o saldo
-- somava 0 para todo aluno, em produção, hoje.
drop policy if exists "cliente ve os proprios creditos" on public.creditos_eventos;
create policy "cliente ve os proprios creditos" on public.creditos_eventos
  for select to authenticated using (
    exists (
      select 1 from public.matriculas m
      where m.id = creditos_eventos.matricula_id
        and m.cliente_id = public.cliente_atual()
    )
  );


-- ------------------------------------------------------------
-- 6. Views
-- ------------------------------------------------------------
-- Saldo por lote. `vencido` é derivado da data, não de um flag gravado:
-- se o cron de expiração não rodar, o saldo ainda fica certo. O cron só
-- escreve o evento de expiração para a aluna VER o que houve — ele não é
-- responsável pela correção do número.
create or replace view public.vw_creditos_lotes
with (security_invoker = true) as
select
  l.id as lote_id,
  l.matricula_id,
  m.cliente_id,
  l.ciclo,
  l.quantidade,
  l.concedido_em,
  l.validade,
  l.origem,
  l.detalhe,
  coalesce(sum(ce.delta), 0)::integer as saldo,
  (l.validade < current_date) as vencido
from public.creditos_lotes l
join public.matriculas m on m.id = l.matricula_id
left join public.creditos_eventos ce on ce.lote_id = l.id
group by l.id, m.cliente_id;

comment on view public.vw_creditos_lotes is
  'Extrato por lote — e o que responde "meus 6 creditos vencem quando?".';

-- Mantém o contrato de colunas da view antiga (o front depende delas),
-- mas o `saldo` agora IGNORA lote vencido. Antes, crédito vencido
-- continuava somando até alguém rodar a expiração à mão.
--
-- Precisa de DROP e não de REPLACE porque `ciclos_total` virou
-- `ciclos_compromisso`: replace não renomeia coluna de saída. E a
-- análise de risco pendura nesta view, então cai junto e volta logo
-- abaixo, idêntica — o `saldo` que ela lê é que fica mais honesto.
drop view if exists public.vw_analise_clientes_risco;
drop view if exists public.vw_saldo_creditos;
create view public.vw_saldo_creditos
with (security_invoker = true) as
select
  m.id as matricula_id,
  m.cliente_id,
  m.plano_id,
  m.status,
  m.data_inicio,
  m.data_fim,
  m.creditos_total,
  m.ciclo_atual,
  m.ciclos_compromisso,
  m.renova_automaticamente,
  m.preco_contratado_centavos,
  m.cancelamento_efetivo_em,
  coalesce(sum(ce.delta) filter (where l.validade >= current_date), 0)::integer as saldo,
  coalesce(sum(ce.delta), 0)::integer as saldo_bruto,
  min(l.validade) filter (where l.validade >= current_date) as proxima_validade
from public.matriculas m
left join public.creditos_lotes l on l.matricula_id = m.id
left join public.creditos_eventos ce on ce.lote_id = l.id
group by m.id;

comment on view public.vw_saldo_creditos is
  'saldo = so o que ainda vale hoje. saldo_bruto inclui lote vencido — serve para explicar a diferenca na tela, nunca para autorizar aula.';

-- Recriada sem nenhuma mudança de lógica: ela só caiu por depender da
-- view acima. O ganho vem de graça — "poucos_creditos" passa a olhar
-- crédito que ainda vale, não crédito que já venceu.
create view public.vw_analise_clientes_risco
with (security_invoker = true) as
with presencas_atual as (
  select cliente_id,
         count(*) filter (where presente) as presentes,
         count(*) filter (where not presente) as faltas
  from public.presencas
  where data_aula >= current_date - 28 and data_aula < current_date
  group by cliente_id
), presencas_anterior as (
  select cliente_id, count(*) filter (where presente) as presentes
  from public.presencas
  where data_aula >= current_date - 56 and data_aula < current_date - 28
  group by cliente_id
), matricula_ativa as (
  select distinct on (cliente_id) cliente_id, id as matricula_id, plano_id, data_fim
  from public.matriculas
  where status = any (array['ativa'::public.status_matricula, 'inadimplente'::public.status_matricula])
  order by cliente_id, data_fim desc
), base as (
  select c.id as cliente_id, c.nome, c.telefone,
         ma.matricula_id, ma.plano_id, ma.data_fim,
         coalesce(sc.saldo, 0) as saldo_creditos,
         coalesce(pa.presentes, 0::bigint) as presentes_atual,
         coalesce(pant.presentes, 0::bigint) as presentes_anterior,
         coalesce(pa.faltas, 0::bigint) as faltas_atual,
         c.ultima_conversa,
         coalesce(pant.presentes, 0::bigint) >= 2
           and coalesce(pa.presentes, 0::bigint)::numeric
               < (coalesce(pant.presentes, 0::bigint)::numeric * 0.5) as queda_frequencia,
         coalesce(pa.faltas, 0::bigint) >= 2 as faltas_recentes,
         (ma.data_fim - current_date) >= 0 and (ma.data_fim - current_date) <= 7 as vencimento_proximo,
         coalesce(sc.saldo, 0) <= 1 and (ma.data_fim - current_date) > 7 as poucos_creditos,
         c.ultima_conversa is null or (current_date - c.ultima_conversa) > 30 as sem_interacao
  from public.clientes c
  join matricula_ativa ma on ma.cliente_id = c.id
  left join presencas_atual pa on pa.cliente_id = c.id
  left join presencas_anterior pant on pant.cliente_id = c.id
  left join public.vw_saldo_creditos sc on sc.matricula_id = ma.matricula_id
)
select cliente_id, nome, telefone, matricula_id, plano_id, data_fim, saldo_creditos,
       presentes_atual, presentes_anterior, faltas_atual, ultima_conversa,
       queda_frequencia, faltas_recentes, vencimento_proximo, poucos_creditos, sem_interacao,
       queda_frequencia::integer * 2 + faltas_recentes::integer * 2
         + vencimento_proximo::integer * 2 + poucos_creditos::integer
         + sem_interacao::integer as score,
       case
         when queda_frequencia::integer * 2 + faltas_recentes::integer * 2
              + vencimento_proximo::integer * 2 + poucos_creditos::integer
              + sem_interacao::integer >= 4 then 'alta'
         when queda_frequencia::integer * 2 + faltas_recentes::integer * 2
              + vencimento_proximo::integer * 2 + poucos_creditos::integer
              + sem_interacao::integer >= 2 then 'media'
         else 'baixa'
       end as prioridade
from base
where queda_frequencia or faltas_recentes or vencimento_proximo or poucos_creditos or sem_interacao;


-- ------------------------------------------------------------
-- 7. Consumo e devolução de crédito
-- ------------------------------------------------------------
-- FIFO por VALIDADE, não por data de criação: o que morre antes sai
-- primeiro. É o que o regulamento chama de consumo FIFO e é o único
-- critério que não desperdiça crédito da aluna.
create or replace function public.consumir_credito(
  p_matricula uuid,
  p_motivo public.motivo_credito,
  p_agendamento uuid default null,
  p_para_data date default null
) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  lote uuid;
  alvo date := coalesce(p_para_data, current_date);
begin
  -- `for update` no lote escolhido: duas reservas simultâneas da mesma
  -- aluna não podem consumir o mesmo último crédito.
  select l.id into lote
  from public.creditos_lotes l
  where l.matricula_id = p_matricula
    and l.validade >= alvo
    and coalesce((select sum(ce.delta) from public.creditos_eventos ce
                  where ce.lote_id = l.id), 0) > 0
  order by l.validade, l.criado_em
  limit 1
  for update;

  if lote is null then
    return null;
  end if;

  insert into public.creditos_eventos
    (matricula_id, lote_id, delta, motivo, agendamento_id, criado_por)
  values (p_matricula, lote, -1, p_motivo, p_agendamento, auth.uid());

  return lote;
end; $fn$;

comment on function public.consumir_credito(uuid, public.motivo_credito, uuid, date) is
  'Escolhe o lote que vence primeiro e ainda cobre a data da aula. Devolve o lote usado (null = sem credito). p_para_data existe porque reservar aula para daqui a 20 dias nao pode gastar credito que vence em 5 — o credito estaria morto na hora da aula.';

create or replace function public.devolver_credito(
  p_matricula uuid,
  p_lote uuid,
  p_motivo public.motivo_credito,
  p_agendamento uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  destino uuid;
  fim date;
begin
  -- Devolve ao lote de origem, se ele ainda vale.
  select l.id into destino from public.creditos_lotes l
  where l.id = p_lote and l.validade >= current_date;

  -- Lote de origem já venceu: devolver nele seria devolver um crédito
  -- morto. Cai no lote vivo que vence primeiro.
  if destino is null then
    select l.id into destino from public.creditos_lotes l
    where l.matricula_id = p_matricula and l.validade >= current_date
    order by l.validade, l.criado_em limit 1;
  end if;

  -- Nenhum lote vivo: a aluna cancelou dentro do prazo mas o ciclo
  -- inteiro venceu no meio. Não é culpa dela — abre um lote próprio,
  -- válido até o fim do ciclo corrente da assinatura.
  if destino is null then
    select m.data_fim into fim from public.matriculas m where m.id = p_matricula;
    if fim is null or fim < current_date then
      return null;
    end if;
    insert into public.creditos_lotes
      (matricula_id, ciclo, quantidade, validade, origem, detalhe)
    select m.id, m.ciclo_atual, 1, fim, p_motivo, 'devolucao sem lote vivo'
    from public.matriculas m where m.id = p_matricula
    returning id into destino;
  end if;

  insert into public.creditos_eventos
    (matricula_id, lote_id, delta, motivo, agendamento_id, criado_por)
  values (p_matricula, destino, 1, p_motivo, p_agendamento, auth.uid());

  return destino;
end; $fn$;

create or replace function public.saldo_disponivel(p_matricula uuid, p_para_data date default null)
returns integer language sql stable security definer set search_path = '' as $fn$
  select coalesce(sum(ce.delta), 0)::integer
  from public.creditos_lotes l
  join public.creditos_eventos ce on ce.lote_id = l.id
  where l.matricula_id = p_matricula
    and l.validade >= coalesce(p_para_data, current_date);
$fn$;


-- ------------------------------------------------------------
-- 8. Cobrança do ciclo: entrada financeira ligada à assinatura
-- ------------------------------------------------------------
-- Antes, a ligação entre a entrada e a matrícula existia só no texto da
-- descrição. Isso impede saber se o ciclo N+1 foi pago sem fazer parsing
-- de string — e é o gancho onde o webhook do Asaas vai encaixar depois.
alter table public.entradas_financeiras
  add column if not exists matricula_id uuid references public.matriculas(id) on delete set null,
  add column if not exists ciclo integer;

-- Uma cobrança por ciclo. Cancelada não conta: refazer uma cobrança
-- cancelada é operação legítima da equipe.
create unique index if not exists entradas_matricula_ciclo_idx
  on public.entradas_financeiras (matricula_id, ciclo)
  where matricula_id is not null and status <> 'cancelada';

create or replace function public.cobrar_ciclo(
  p_matricula uuid,
  p_ciclo integer,
  p_vencimento date
) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  m record;
  pr record;
  e_id uuid;
begin
  select * into m from public.matriculas where id = p_matricula;
  if not found then return null; end if;
  -- Cortesia e plano personalizado gratuito não geram cobrança: uma
  -- entrada de R$ 0,00 só sujaria o financeiro como "a receber" que
  -- ninguém vai receber.
  if m.preco_contratado_centavos <= 0 then return null; end if;

  select nome into pr from public.produtos where id = m.plano_id;

  insert into public.entradas_financeiras
    (descricao, valor_centavos, categoria, status,
     data_competencia, data_prevista, cliente_id, matricula_id, ciclo)
  values
    (coalesce(pr.nome, 'Plano') || ' — ciclo ' || p_ciclo,
     m.preco_contratado_centavos, 'mensalista', 'prevista',
     p_vencimento, p_vencimento, m.cliente_id, p_matricula, p_ciclo)
  on conflict do nothing
  returning id into e_id;

  return e_id;
end; $fn$;

comment on function public.cobrar_ciclo(uuid, integer, date) is
  'Idempotente pelo indice unico (matricula, ciclo): o cron pode rodar duas vezes no mesmo dia sem cobrar em dobro.';


-- ------------------------------------------------------------
-- 9. matricular() — agora abre a assinatura e o primeiro lote
-- ------------------------------------------------------------
create or replace function public.matricular(p_cliente uuid, p_plano uuid)
returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  pr record;
  m_id uuid;
  lote uuid;
  autor uuid;
  eh_cliente boolean;
  fim date;
  validade date;
  ja_tem integer;
begin
  eh_cliente := public.is_cliente();

  if auth.uid() is not null then
    if eh_cliente then
      if p_cliente <> public.cliente_atual() then
        raise exception 'aluno só pode contratar para si mesmo';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito à equipe ou ao próprio aluno';
    end if;
  end if;

  autor := case when public.is_socia() then auth.uid() end;

  select * into pr from public.produtos where id = p_plano and ativo;
  if not found then
    raise exception 'produto inexistente ou inativo';
  end if;

  -- A trava que a RLS não consegue dar aqui (SECURITY DEFINER).
  -- Mensagem deliberadamente igual à de produto inexistente: dizer
  -- "este é oculto" confirmaria a existência dele para quem tentou.
  if eh_cliente and not pr.visivel_no_catalogo then
    raise exception 'produto inexistente ou inativo';
  end if;

  -- `limite_por_cliente` era cadastro sem efeito. Sem isto, dava para
  -- contratar o mesmo plano várias vezes seguidas pelo portal (foi o
  -- que aconteceu no teste: 3 assinaturas iguais para a mesma aluna).
  if pr.limite_por_cliente is not null then
    select count(*) into ja_tem from public.matriculas
    where cliente_id = p_cliente and plano_id = p_plano
      and status <> 'cancelada';
    if ja_tem >= pr.limite_por_cliente then
      raise exception 'limite de % contratação(ões) deste produto por cliente já atingido',
        pr.limite_por_cliente;
    end if;
  end if;

  fim := current_date + pr.periodicidade_dias;

  insert into public.matriculas
    (cliente_id, plano_id, data_inicio, data_fim, creditos_total,
     ciclos_compromisso, ciclo_atual,
     preco_contratado_centavos, renova_automaticamente)
  values
    (p_cliente, p_plano, current_date, fim,
     pr.creditos_por_ciclo, pr.ciclos_compromisso, 1,
     pr.preco_centavos, coalesce(pr.renova_automaticamente, false))
  returning id into m_id;

  if pr.gera_credito and pr.creditos_por_ciclo > 0 then
    -- Validade própria do produto quando houver; senão, o fim do ciclo.
    validade := current_date + coalesce(pr.validade_creditos_dias, pr.periodicidade_dias);

    insert into public.creditos_lotes
      (matricula_id, ciclo, quantidade, validade, origem, detalhe)
    values (m_id, 1, pr.creditos_por_ciclo, validade, 'compra',
            pr.nome || ' — ciclo 1')
    returning id into lote;

    insert into public.creditos_eventos
      (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
    values (m_id, lote, pr.creditos_por_ciclo, 'compra',
            pr.nome || ' — ciclo 1', autor);
  end if;

  perform public.cobrar_ciclo(m_id, 1, current_date);

  return m_id;
end; $fn$;


-- ------------------------------------------------------------
-- 10. renovar_ciclo() — o coração da correção do R1/R2/R3/R12
-- ------------------------------------------------------------
create or replace function public.renovar_ciclo(p_matricula uuid)
returns integer language plpgsql security definer set search_path = '' as $fn$
declare
  m record;
  pr record;
  suc record;
  novo_ciclo integer;
  novo_inicio date;
  novo_fim date;
  validade date;
  lote uuid;
  excedente integer;
  teto integer;
  sucedeu boolean := false;
  r record;
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
  -- Cancelada é cancelada: não renova nem antes nem depois da data
  -- efetiva. Sem isto, a mensagem que sobra é "compromisso encerrado",
  -- que manda a equipe investigar o lugar errado.
  if m.cancelada_em is not null then
    raise exception 'assinatura cancelada — não renova (créditos valem até %)',
      m.cancelamento_efetivo_em;
  end if;

  select * into pr from public.produtos where id = m.plano_id;

  -- ---- Fim do compromisso: sucessão, continuação ou parada ----
  if m.ciclo_atual >= m.ciclos_compromisso then
    if pr.produto_sucessor_id is not null then
      -- R2: o semestral vira mensal em vez de morrer. Preço volta a ser
      -- congelado, agora no valor do sucessor — é um contrato novo.
      select * into suc from public.produtos where id = pr.produto_sucessor_id and ativo;
      if found then
        -- `ciclo_atual` não pode ir a zero (check > 0), então a contagem
        -- do contrato novo é decidida pelo flag, não zerando a coluna.
        update public.matriculas
        set plano_id = suc.id,
            preco_contratado_centavos = suc.preco_centavos,
            ciclos_compromisso = suc.ciclos_compromisso,
            creditos_total = suc.creditos_por_ciclo,
            renova_automaticamente = coalesce(suc.renova_automaticamente, false)
        where id = p_matricula;

        select * into m from public.matriculas where id = p_matricula;
        pr := suc;
        sucedeu := true;
      end if;
    end if;

    -- Sem sucessor e sem recorrência, acabou mesmo.
    if not sucedeu and not m.renova_automaticamente then
      raise exception 'compromisso encerrado (ciclo % de %) — contrate um plano novo',
        m.ciclo_atual, m.ciclos_compromisso;
    end if;
  end if;

  -- Sucessão reinicia a contagem: é contrato novo, ciclo 1.
  novo_ciclo  := case when sucedeu then 1 else m.ciclo_atual + 1 end;
  novo_inicio := m.data_fim + 1;
  novo_fim    := novo_inicio + pr.periodicidade_dias;

  -- ---- Expiração do ciclo que fecha ----
  -- R3: só expira quando o produto NÃO acumula. Quando acumula, o lote
  -- simplesmente segue vivo até a validade dele — e o teto abaixo é que
  -- impede a bola de neve.
  if not coalesce(pr.acumula_creditos, false) then
    for r in
      select l.id, coalesce(sum(ce.delta), 0) as saldo
      from public.creditos_lotes l
      left join public.creditos_eventos ce on ce.lote_id = l.id
      where l.matricula_id = p_matricula and l.ciclo <= m.ciclo_atual
      group by l.id
      having coalesce(sum(ce.delta), 0) > 0
    loop
      insert into public.creditos_eventos
        (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
      values (p_matricula, r.id, -r.saldo, 'expiracao',
              'fim do ciclo ' || m.ciclo_atual, auth.uid());
    end loop;
  end if;

  -- ---- Avança a assinatura ----
  update public.matriculas
  set ciclo_atual = novo_ciclo,
      data_inicio = novo_inicio,
      data_fim    = novo_fim,
      creditos_total = pr.creditos_por_ciclo,
      status = case when status = 'inadimplente' then 'ativa'::public.status_matricula
                    else status end
  where id = p_matricula;

  -- ---- Novo lote ----
  if pr.gera_credito and pr.creditos_por_ciclo > 0 then
    validade := novo_inicio + coalesce(pr.validade_creditos_dias, pr.periodicidade_dias);

    insert into public.creditos_lotes
      (matricula_id, ciclo, quantidade, validade, origem, detalhe)
    values (p_matricula, novo_ciclo, pr.creditos_por_ciclo, validade, 'compra',
            pr.nome || ' — ciclo ' || novo_ciclo)
    returning id into lote;

    insert into public.creditos_eventos
      (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
    values (p_matricula, lote, pr.creditos_por_ciclo, 'compra',
            pr.nome || ' — ciclo ' || novo_ciclo, auth.uid());
  end if;

  -- ---- Teto de acúmulo ----
  -- R3, segunda metade: acumular não é acumular para sempre. Estourou o
  -- teto, o excesso queima pelos lotes mais velhos (que venceriam antes
  -- de qualquer jeito).
  teto := pr.teto_acumulo_ciclos;
  if coalesce(pr.acumula_creditos, false) and teto is not null and pr.creditos_por_ciclo > 0 then
    excedente := public.saldo_disponivel(p_matricula) - (teto * pr.creditos_por_ciclo);
    if excedente > 0 then
      for r in
        select l.id, coalesce(sum(ce.delta), 0) as saldo
        from public.creditos_lotes l
        left join public.creditos_eventos ce on ce.lote_id = l.id
        where l.matricula_id = p_matricula and l.validade >= current_date
        group by l.id
        having coalesce(sum(ce.delta), 0) > 0
        order by min(l.validade), min(l.criado_em)
      loop
        exit when excedente <= 0;
        insert into public.creditos_eventos
          (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
        values (p_matricula, r.id, -least(r.saldo, excedente), 'expiracao',
                'teto de acúmulo (' || teto || ' ciclos)', auth.uid());
        excedente := excedente - least(r.saldo, excedente);
      end loop;
    end if;
  end if;

  -- Cobrança do ciclo novo, se ainda não existir (o cron normalmente já
  -- criou em D-3; este `perform` cobre a renovação manual da equipe).
  perform public.cobrar_ciclo(p_matricula, novo_ciclo, novo_inicio);

  return novo_ciclo;
end; $fn$;


-- ------------------------------------------------------------
-- 11. agendar_aula() / cancelar_agendamento() sobre lotes
-- ------------------------------------------------------------
-- Mudança de critério: a autorização deixa de ser "a data cai na janela
-- da matrícula" e passa a ser "existe crédito que ainda vale NA DATA DA
-- AULA". É mais correto e resolve um bug de borda que a janela criava:
-- renovando o ciclo, data_inicio pulava para frente e a aluna perdia os
-- últimos dias do ciclo que ela já tinha pago.
create or replace function public.agendar_aula(
  p_cliente uuid, p_turma uuid, p_data date, p_canal public.canal_aula
) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  a_id uuid;
  m_id uuid := null;
  lote uuid;
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
    -- Com mais de uma assinatura ativa (uso híbrido, pacote avulso em
    -- cima do plano), a escolha era `order by data_fim` — a data do
    -- CICLO. Errado desde que o crédito passou a ter validade própria:
    -- um pacote com validade curta dentro de uma assinatura longa
    -- ficaria para depois e venceria sem uso. O critério certo é o
    -- crédito que morre primeiro, o mesmo FIFO de consumir_credito().
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

create or replace function public.cancelar_agendamento(
  p_agendamento uuid, p_origem public.origem_cancelamento
) returns boolean language plpgsql security definer set search_path = '' as $fn$
declare
  ag record;
  t record;
  limite timestamptz;
  horas integer;
  lote_origem uuid;
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
    -- Prazo específico do produto vence o padrão global: um pacote pode
    -- ter regra própria de cancelamento (etapa 3 já cadastra isso).
    select coalesce(pr.horas_cancelamento, cfg.horas_cancelamento) into horas
    from public.matriculas m
    join public.produtos pr on pr.id = m.plano_id
    cross join public.config_agendamento cfg
    where m.id = ag.matricula_id;

    select horario into t from public.turmas where id = ag.turma_id;
    limite := (ag.data + t.horario) - make_interval(hours => horas);

    if now() < limite then
      -- Volta para o MESMO lote que pagou a reserva.
      select lote_id into lote_origem from public.creditos_eventos
      where agendamento_id = p_agendamento and motivo = 'agendamento'
      order by criado_em limit 1;

      devolveu := public.devolver_credito(
        ag.matricula_id, lote_origem, 'cancelamento', p_agendamento
      ) is not null;
    end if;
  end if;

  insert into public.agendamentos_eventos (agendamento_id, evento, detalhe, criado_por)
  values (p_agendamento, 'cancelado',
          case when devolveu then 'crédito devolvido' else 'fora do prazo — crédito mantido' end,
          auth.uid());

  return devolveu;
end; $fn$;


-- ------------------------------------------------------------
-- 12. Cancelar a assinatura (fim do ciclo, não na hora)
-- ------------------------------------------------------------
create or replace function public.cancelar_assinatura(
  p_matricula uuid, p_motivo text default null
) returns date language plpgsql security definer set search_path = '' as $fn$
declare m record;
begin
  select * into m from public.matriculas where id = p_matricula for update;
  if not found then raise exception 'matrícula inexistente'; end if;

  if auth.uid() is not null then
    if public.is_cliente() then
      if m.cliente_id <> public.cliente_atual() then
        raise exception 'aluna só pode cancelar a própria assinatura';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito à equipe ou à própria aluna';
    end if;
  end if;

  if m.status = 'cancelada' then
    raise exception 'assinatura já cancelada';
  end if;

  -- Não apaga crédito nem encerra na hora: o ciclo já pago vale até o
  -- fim. Só desliga a renovação (CLAUDE.md §9.4).
  update public.matriculas
  set cancelada_em = now(),
      cancelamento_efetivo_em = m.data_fim,
      renova_automaticamente = false,
      motivo_cancelamento = coalesce(p_motivo, motivo_cancelamento)
  where id = p_matricula;

  -- A cobrança do próximo ciclo, se já tiver sido gerada e não paga,
  -- deixa de fazer sentido.
  update public.entradas_financeiras
  set status = 'cancelada'
  where matricula_id = p_matricula and ciclo > m.ciclo_atual and status = 'prevista';

  return m.data_fim;
end; $fn$;

comment on function public.cancelar_assinatura(uuid, text) is
  'Cancela no FIM do ciclo pago. Devolve a data em que deixa de valer, para a tela conseguir dizer "voce tem aula ate DD/MM".';


-- ------------------------------------------------------------
-- 13. A rotina diária que faz a recorrência acontecer (R1)
-- ------------------------------------------------------------
-- Ordem importa: cobra antes de vencer, renova quem pagou, marca quem
-- não pagou, encerra quem cancelou, e só então registra as expirações.
create or replace function public.processar_assinaturas()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  cfg record;
  r record;
  n_cobrancas integer := 0;
  n_renovadas integer := 0;
  n_inadimplentes integer := 0;
  n_encerradas integer := 0;
  n_expiracoes integer := 0;
  pago boolean;
begin
  select * into cfg from public.config_agendamento;

  -- 1) Cobrança do próximo ciclo, em D-<antecedência>.
  for r in
    select m.id, m.ciclo_atual, m.data_fim
    from public.matriculas m
    where m.status in ('ativa', 'inadimplente')
      and m.renova_automaticamente
      and m.cancelamento_efetivo_em is null
      and m.data_fim = current_date + cfg.dias_antecedencia_cobranca
  loop
    if public.cobrar_ciclo(r.id, r.ciclo_atual + 1, r.data_fim + 1) is not null then
      n_cobrancas := n_cobrancas + 1;
    end if;
  end loop;

  -- 2) Ciclo terminou: renova quem pagou, marca inadimplente quem não.
  --    A renovação acontece na VIRADA, não na hora do pagamento — senão
  --    a assinatura avançaria as datas antes da hora e a aluna perderia
  --    os últimos dias do ciclo que ela já tinha pago.
  for r in
    select m.id, m.ciclo_atual, m.preco_contratado_centavos
    from public.matriculas m
    where m.status = 'ativa'
      and m.data_fim < current_date
      and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em > current_date)
  loop
    if not exists (
      select 1 from public.matriculas mm
      where mm.id = r.id and mm.renova_automaticamente
    ) then
      continue;
    end if;

    -- Gratuito (cortesia) não tem o que cobrar: renova direto.
    pago := r.preco_contratado_centavos <= 0 or exists (
      select 1 from public.entradas_financeiras e
      where e.matricula_id = r.id and e.ciclo = r.ciclo_atual + 1
        and e.status = 'recebida'
    );

    if pago then
      begin
        perform public.renovar_ciclo(r.id);
        n_renovadas := n_renovadas + 1;
      exception when others then
        -- Uma assinatura problemática não pode derrubar a rotina das
        -- outras. O erro fica no log do cron.
        raise warning 'renovacao falhou para %: %', r.id, sqlerrm;
      end;
    else
      perform public.marcar_inadimplente(r.id);
      n_inadimplentes := n_inadimplentes + 1;
    end if;
  end loop;

  -- 3) Cancelamento programado que chegou a hora.
  update public.matriculas
  set status = 'cancelada'
  where cancelamento_efetivo_em is not null
    and cancelamento_efetivo_em < current_date
    and status <> 'cancelada';
  get diagnostics n_encerradas = row_count;

  -- 4) Expiração VISÍVEL. A view de saldo já ignora lote vencido, então
  --    isto não corrige número nenhum — existe para a aluna conseguir
  --    ler no extrato o que aconteceu com os créditos dela.
  for r in
    select l.id as lote_id, l.matricula_id, l.validade,
           coalesce(sum(ce.delta), 0) as saldo
    from public.creditos_lotes l
    left join public.creditos_eventos ce on ce.lote_id = l.id
    where l.validade < current_date
    group by l.id
    having coalesce(sum(ce.delta), 0) > 0
  loop
    insert into public.creditos_eventos
      (matricula_id, lote_id, delta, motivo, detalhe)
    values (r.matricula_id, r.lote_id, -r.saldo, 'expiracao',
            'validade em ' || r.validade);
    n_expiracoes := n_expiracoes + 1;
  end loop;

  return jsonb_build_object(
    'cobrancas', n_cobrancas,
    'renovadas', n_renovadas,
    'inadimplentes', n_inadimplentes,
    'encerradas', n_encerradas,
    'expiracoes', n_expiracoes
  );
end; $fn$;

comment on function public.processar_assinaturas() is
  'Rotina diaria da recorrencia. Idempotente: cobrar_ciclo tem indice unico, a renovacao so pega ciclo vencido e a expiracao so pega lote com saldo.';


-- ------------------------------------------------------------
-- 14. Cron
-- ------------------------------------------------------------
-- 08:00 UTC = 05:00 em São Paulo: roda antes de qualquer aula e antes de
-- a equipe abrir o sistema, então ninguém vê estado meio-renovado.
do $mig$
begin
  perform cron.unschedule('processar-assinaturas');
exception when others then null;
end $mig$;

select cron.schedule('processar-assinaturas', '0 8 * * *',
                     'select public.processar_assinaturas()');


-- ------------------------------------------------------------
-- 15. Permissões
-- ------------------------------------------------------------
revoke execute on function public.consumir_credito(uuid, public.motivo_credito, uuid, date) from public, anon, authenticated;
revoke execute on function public.devolver_credito(uuid, uuid, public.motivo_credito, uuid) from public, anon, authenticated;
revoke execute on function public.cobrar_ciclo(uuid, integer, date) from public, anon, authenticated;
revoke execute on function public.processar_assinaturas() from public, anon, authenticated;

revoke execute on function public.saldo_disponivel(uuid, date) from public, anon;
grant  execute on function public.saldo_disponivel(uuid, date) to authenticated;

revoke execute on function public.cancelar_assinatura(uuid, text) from public, anon;
grant  execute on function public.cancelar_assinatura(uuid, text) to authenticated;

revoke execute on function public.renovar_ciclo(uuid) from public, anon;
grant  execute on function public.renovar_ciclo(uuid) to authenticated;
grant  execute on function public.matricular(uuid, uuid) to authenticated;
