-- ============================================================
-- Catálogo de produtos — o estúdio não vende só plano
--
-- `planos` só sabia descrever "N créditos por ciclo, por M ciclos".
-- O regulamento vende outras seis coisas que não cabem nisso: aula
-- experimental (1 por pessoa, para quem nunca treinou), 2 experimentais
-- (validade de 15 dias), aula avulsa (30 dias), crédito extra (só para
-- quem tem plano ativo), aula particular e treino livre (não geram
-- crédito nenhum) — mais o Studio+, que exige Wellhub ativo e 4
-- check-ins nos últimos 30 dias.
--
-- O erro fácil aqui seria uma coluna `tipo` com sete valores e um
-- `case tipo when 'experimental' then ...` em cada regra. Em vez disso,
-- os sete produtos são COMBINAÇÕES de quatro atributos independentes:
-- como cobra, se entrega crédito, quanto tempo o crédito vale, e o que
-- exige de quem compra. Produto novo é uma linha, não um `if`.
--
-- `tipo_produto` existe só para agrupar e rotular na tela. Nenhuma
-- regra de negócio lê esse campo — quem decide comportamento são os
-- atributos. Isso é proposital: no dia em que a equipe inventar um
-- produto que não é nem plano nem pacote, nada quebra.
--
-- Duas capacidades pedidas em 20/08/2026, e que caem naturalmente aqui:
--   · plano personalizado (valor negociado para uma pessoa)
--   · pacote gratuito (cortesia, permuta, prêmio)
-- As duas são `visivel_no_catalogo = false`: existem no catálogo da
-- gestão e NÃO aparecem para o aluno. Ver a trava dupla no fim.
-- ============================================================

-- ------------------------------------------------------------
-- 1. planos → produtos
--
-- Rename e não tabela nova: preserva os dados, a PK, a FK de
-- `matriculas`, os índices, as policies e o trigger de atualizada_em.
-- Criar tabela nova exigiria migrar matrícula viva de aluno pagante,
-- que é risco sem contrapartida.
--
-- `matriculas.plano_id` mantém o nome de propósito. Renomear a coluna
-- arrastaria vw_saldo_creditos, vw_analise_clientes_* e o gatilho de
-- e-mail junto; ela vira `assinaturas.produto_id` na etapa seguinte,
-- quando `matriculas` for reescrita de qualquer jeito.
-- ------------------------------------------------------------

alter table if exists public.planos rename to produtos;

-- ------------------------------------------------------------
-- 2. Colunas que mudam de nome
--
-- Os nomes antigos descreviam um mundo só de planos e já vinham sendo
-- reinterpretados por comentário (ver 20260721130000, "As colunas
-- existentes mudam de significado"). Com serviço sem crédito no
-- catálogo, `quantidade` viraria francamente enganoso.
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='produtos' and column_name='quantidade') then
    alter table public.produtos rename column quantidade to creditos_por_ciclo;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='produtos' and column_name='vigencia_dias') then
    alter table public.produtos rename column vigencia_dias to periodicidade_dias;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='produtos' and column_name='ciclos') then
    alter table public.produtos rename column ciclos to ciclos_compromisso;
  end if;
end $$;

comment on column public.produtos.creditos_por_ciclo is
  'créditos entregues por ciclo (ou por compra, se cobrança única). 0 = não entrega crédito';
comment on column public.produtos.periodicidade_dias is
  'duração de UM ciclo em dias — 30 no mensal. Em compra única, a base da validade';
comment on column public.produtos.ciclos_compromisso is
  '1 = sem compromisso; 6 = semestral. Não confundir com "quantas vezes cobra": recorrente cobra até cancelar';

-- ------------------------------------------------------------
-- 3. Restrições que precisam ceder
--
-- `quantidade > 0` impedia aula particular e treino livre, que não
-- entregam crédito. `tipo = 'creditos'` era a trava de quando todo
-- produto era plano.
--
-- `preco_centavos >= 0` já estava certo desde o início e é o que
-- permite o pacote gratuito sem nenhuma mudança.
-- ------------------------------------------------------------

alter table public.produtos drop constraint if exists planos_sempre_creditos;
alter table public.produtos drop constraint if exists planos_quantidade_check;
alter table public.produtos drop constraint if exists produtos_creditos_nao_negativo;
alter table public.produtos
  add constraint produtos_creditos_nao_negativo check (creditos_por_ciclo >= 0);

-- Mesma trava, do outro lado: `matriculas.creditos_total > 0` recusaria
-- a matrícula de qualquer produto sem crédito. Enquanto serviço e plano
-- compartilharem `matricular()`, o zero precisa ser aceito.
alter table public.matriculas drop constraint if exists matriculas_creditos_total_check;
alter table public.matriculas
  add constraint matriculas_creditos_total_check check (creditos_total >= 0);

-- A coluna `tipo` (enum plano_tipo: creditos|semanal) era o resto do
-- modelo abandonado em 21/07. Sai para não conviver com tipo_produto e
-- virar duas fontes de verdade. O enum em si fica no banco, inofensivo.
alter table public.produtos drop column if exists tipo;

-- ------------------------------------------------------------
-- 4. Os atributos que substituem os condicionais
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_produto') then
    create type public.tipo_produto as enum ('plano', 'pacote', 'servico');
  end if;
end $$;

alter table public.produtos
  -- Só rótulo e agrupamento na tela. Nenhuma regra lê isto.
  add column if not exists tipo_produto public.tipo_produto not null default 'plano',
  add column if not exists descricao text,
  add column if not exists ordem integer not null default 0,

  -- COBRANÇA
  -- Recorrente cobra sozinho até alguém cancelar. É o ponto que o
  -- regulamento faz questão de deixar claro (1.3) e que o sistema
  -- descrevia errado: "mensal" não é uma cobrança única todo mês.
  add column if not exists renova_automaticamente boolean not null default false,

  -- ENTREGA
  add column if not exists gera_credito boolean not null default true,
  -- null = crédito morre no fim do ciclo (comportamento do plano).
  -- Número = validade própria (avulsa 30, 2 experimentais 15).
  add column if not exists validade_creditos_dias integer
    check (validade_creditos_dias is null or validade_creditos_dias > 0),
  add column if not exists acumula_creditos boolean not null default false,
  add column if not exists teto_acumulo_ciclos integer not null default 1
    check (teto_acumulo_ciclos >= 0),

  -- USO (as regras que a etapa seguinte vai enforçar em agendar_aula)
  -- null = sem limite. O regulamento dá 14 dias ao mensal e 21 ao
  -- semestral, então isto é atributo de produto e não config global.
  add column if not exists dias_antecedencia_agendamento integer
    check (dias_antecedencia_agendamento is null or dias_antecedencia_agendamento > 0),
  add column if not exists max_agendamentos_simultaneos integer
    check (max_agendamentos_simultaneos is null or max_agendamentos_simultaneos > 0),
  -- null = usa config_agendamento.horas_cancelamento (a regra da casa).
  add column if not exists horas_cancelamento integer
    check (horas_cancelamento is null or horas_cancelamento >= 0),
  add column if not exists limite_por_cliente integer
    check (limite_por_cliente is null or limite_por_cliente > 0),

  -- BENEFÍCIOS
  add column if not exists desconto_eventos_pct numeric(5,2) not null default 0
    check (desconto_eventos_pct >= 0 and desconto_eventos_pct <= 100),
  add column if not exists convidados_por_ciclo integer not null default 0
    check (convidados_por_ciclo >= 0),

  -- CICLO DE VIDA
  -- Regulamento 7.7: ao fim dos 6 ciclos o semestral vira mensal, não
  -- acaba. Aqui fica só o vínculo; quem age nele é a etapa seguinte.
  add column if not exists produto_sucessor_id uuid references public.produtos (id),

  -- VISIBILIDADE — é o que viabiliza plano personalizado e cortesia
  add column if not exists visivel_no_catalogo boolean not null default true;

comment on column public.produtos.visivel_no_catalogo is
  'false = só a gestão vende (plano personalizado, cortesia). Não aparece para o aluno — trava na policy E em matricular()';
comment on column public.produtos.tipo_produto is
  'rótulo para agrupar na tela. NENHUMA regra de negócio lê este campo — o comportamento vem dos atributos';
comment on column public.produtos.horas_cancelamento is
  'null = herda config_agendamento.horas_cancelamento';

-- Produtos que não entregam crédito não podem prometer validade nem
-- acúmulo: seriam campos preenchidos que nunca fazem nada.
alter table public.produtos drop constraint if exists produtos_credito_coerente;
alter table public.produtos add constraint produtos_credito_coerente check (
  gera_credito or (creditos_por_ciclo = 0 and validade_creditos_dias is null and not acumula_creditos)
);

-- ------------------------------------------------------------
-- 5. Modalidades cobertas — vazio = todas
--
-- O regulamento 3.8 é explícito: crédito de plano cobre a grade
-- regular, mas não particular, treino livre, aulão nem workshop. E o
-- painel do Wix já lista "válido para Pole, Flexibilidade, Calistenia"
-- ao montar um plano — é a mesma ideia.
-- ------------------------------------------------------------

create table if not exists public.produto_modalidades (
  produto_id uuid not null references public.produtos (id) on delete cascade,
  modalidade_id uuid not null references public.modalidades (id) on delete cascade,
  primary key (produto_id, modalidade_id)
);

comment on table public.produto_modalidades is
  'modalidades que o produto cobre. SEM linha nenhuma = cobre todas (não = cobre nada)';

alter table public.produto_modalidades enable row level security;

drop policy if exists "autenticado le produto_modalidades" on public.produto_modalidades;
create policy "autenticado le produto_modalidades" on public.produto_modalidades
  for select to authenticated using (true);

drop policy if exists "gestao gerencia produto_modalidades" on public.produto_modalidades;
create policy "gestao gerencia produto_modalidades" on public.produto_modalidades
  for all to authenticated using (public.is_gestao()) with check (public.is_gestao());

-- ------------------------------------------------------------
-- 6. Requisitos de elegibilidade — declarativos
--
-- Em vez de `if produto.nome = 'Studio+' then conta check-ins`, a regra
-- vira linha. Os três tipos cobrem tudo que o regulamento pede hoje:
--
--   nunca_treinou     — experimental, "para quem nunca treinou aqui"
--   plano_ativo       — crédito extra, "só para quem tem plano ativo"
--   checkins_wellhub  — Studio+, "4 check-ins nos últimos 30 dias"
--
-- O último é o mais interessante: o regulamento manda a equipe conferir
-- isso na mão, no Portal do Parceiro. Nós já temos o dado — check-in
-- Wellhub vira `presencas` com canal = 'wellhub' —, então dá para
-- verificar sozinhos quando a etapa de venda chegar.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_requisito_produto') then
    create type public.tipo_requisito_produto as enum
      ('nunca_treinou', 'plano_ativo', 'checkins_wellhub');
  end if;
end $$;

create table if not exists public.produto_requisitos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos (id) on delete cascade,
  tipo public.tipo_requisito_produto not null,
  -- quantos (4 check-ins). Ignorado pelos requisitos que não contam nada.
  parametro_int integer,
  -- em quantos dias (últimos 30).
  janela_dias integer check (janela_dias is null or janela_dias > 0),
  criada_em timestamptz not null default now(),
  unique (produto_id, tipo)
);

alter table public.produto_requisitos enable row level security;

drop policy if exists "autenticado le produto_requisitos" on public.produto_requisitos;
create policy "autenticado le produto_requisitos" on public.produto_requisitos
  for select to authenticated using (true);

drop policy if exists "gestao gerencia produto_requisitos" on public.produto_requisitos;
create policy "gestao gerencia produto_requisitos" on public.produto_requisitos
  for all to authenticated using (public.is_gestao()) with check (public.is_gestao());

-- ------------------------------------------------------------
-- 7. Trava do catálogo oculto — DUAS camadas, e as duas importam
--
-- Camada 1: a policy do aluno passa a exigir visivel_no_catalogo.
-- Camada 2: matricular() é SECURITY DEFINER, ou seja, RODA IGNORANDO
-- RLS. Sem a guarda dentro da função, um aluno que descobrisse o id de
-- um produto oculto poderia contratar a cortesia sozinho, chamando a
-- RPC direto — a policy não seria nem consultada. É o caso exato de
-- "não basta esconder no front".
-- ------------------------------------------------------------

drop policy if exists "cliente ve planos ativos" on public.produtos;
drop policy if exists "cliente ve produtos do catalogo" on public.produtos;
create policy "cliente ve produtos do catalogo" on public.produtos
  for select to authenticated
  using (public.is_cliente() and ativo and visivel_no_catalogo);

-- Renomeia as policies da equipe para acompanhar a tabela (mesma regra).
drop policy if exists "operacao ve planos" on public.produtos;
drop policy if exists "operacao ve produtos" on public.produtos;
create policy "operacao ve produtos" on public.produtos
  for select to authenticated using (public.is_operacional());

drop policy if exists "gestao gerencia planos" on public.produtos;
drop policy if exists "gestao gerencia produtos" on public.produtos;
create policy "gestao gerencia produtos" on public.produtos
  for all to authenticated using (public.is_gestao()) with check (public.is_gestao());

-- ------------------------------------------------------------
-- 8. matricular() — passa a ler `produtos` e a barrar o oculto
--
-- Mudou só o necessário: nome da tabela, nomes das colunas e a guarda
-- de visibilidade. A mecânica de ciclos continua a mesma; ela é
-- reescrita na etapa de assinaturas, não aqui.
-- ------------------------------------------------------------

create or replace function public.matricular(p_cliente uuid, p_plano uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  pr record;
  m_id uuid;
  autor uuid;
  eh_cliente boolean;
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

  insert into public.matriculas
    (cliente_id, plano_id, data_inicio, data_fim, creditos_total, ciclos_total, ciclo_atual)
  values
    (p_cliente, p_plano, current_date, current_date + pr.periodicidade_dias,
     pr.creditos_por_ciclo, pr.ciclos_compromisso, 1)
  returning id into m_id;

  if pr.creditos_por_ciclo > 0 then
    insert into public.creditos_eventos (matricula_id, delta, motivo, detalhe, criado_por)
    values (m_id, pr.creditos_por_ciclo, 'compra',
            pr.nome || ' — ciclo 1/' || pr.ciclos_compromisso, autor);
  end if;

  -- Cortesia não gera cobrança: uma entrada de R$ 0,00 só sujaria o
  -- financeiro e apareceria como "a receber" que ninguém vai receber.
  if pr.preco_centavos > 0 then
    insert into public.entradas_financeiras
      (descricao, valor_centavos, categoria, status, data_competencia, data_prevista, cliente_id)
    values
      ('Plano ' || pr.nome || ' — ciclo 1/' || pr.ciclos_compromisso, pr.preco_centavos,
       'mensalista', 'prevista', current_date, current_date, p_cliente);
  end if;

  return m_id;
end;
$$;

-- ------------------------------------------------------------
-- 9. renovar_ciclo() — mesma tabela nova, mesmos nomes novos
-- ------------------------------------------------------------

create or replace function public.renovar_ciclo(p_matricula uuid)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  m record;
  pr record;
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

  select * into pr from public.produtos where id = m.plano_id;

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
      data_fim = novo_inicio + pr.periodicidade_dias,
      status = 'ativa'
  where id = p_matricula;

  insert into public.creditos_eventos (matricula_id, delta, motivo, detalhe, criado_por)
  values (p_matricula, m.creditos_total, 'compra',
          pr.nome || ' — ciclo ' || (m.ciclo_atual + 1) || '/' || m.ciclos_total, auth.uid());

  if pr.preco_centavos > 0 then
    insert into public.entradas_financeiras
      (descricao, valor_centavos, categoria, status, data_competencia, data_prevista, cliente_id)
    values
      ('Plano ' || pr.nome || ' — ciclo ' || (m.ciclo_atual + 1) || '/' || m.ciclos_total,
       pr.preco_centavos, 'mensalista', 'prevista', novo_inicio, novo_inicio, m.cliente_id);
  end if;

  return m.ciclo_atual + 1;
end;
$$;

-- ------------------------------------------------------------
-- 10. O gatilho de e-mail de vencimento também lia `planos`
-- Sem isto, `enfileirar_vencimentos()` quebra no primeiro disparo do
-- cron — e falharia calado, de madrugada, sem ninguém olhando.
-- ------------------------------------------------------------

-- Cópia fiel de 20260724130000: só o `join public.planos` virou
-- `join public.produtos`. Assinatura de enfileirar_email, payload e
-- chave de idempotência ficam idênticos de propósito — mexer neles
-- aqui mudaria o e-mail que sai, que não é o assunto desta migration.
create or replace function public.enfileirar_vencimentos()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in
    select m.id, m.data_fim, c.nome, c.email, p.nome as plano, p.preco_centavos
    from public.matriculas m
    join public.clientes c on c.id = m.cliente_id
    join public.produtos p on p.id = m.plano_id
    where m.status = 'ativa' and m.data_fim = current_date + 3
  loop
    perform public.enfileirar_email(
      'vencimento', r.email,
      jsonb_build_object('nome', r.nome, 'plano', r.plano,
                         'data_fim', r.data_fim, 'valor_centavos', r.preco_centavos),
      'venc:' || r.id || ':' || r.data_fim
    );
    n := n + 1;
  end loop;
  return n;
end; $$;

revoke execute on function public.enfileirar_vencimentos() from public, anon;

-- ------------------------------------------------------------
-- 11. Retrocompatibilidade dos nomes de coluna nas RPCs
-- O parâmetro continua `p_plano` para não quebrar a chamada do front
-- antes do deploy do bundle novo. Vira `p_produto` na etapa seguinte.
-- ------------------------------------------------------------

revoke execute on function public.renovar_ciclo(uuid) from public, anon;
grant execute on function public.renovar_ciclo(uuid) to authenticated;
grant execute on function public.matricular(uuid, uuid) to authenticated;
