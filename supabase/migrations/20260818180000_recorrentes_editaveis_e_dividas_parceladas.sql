-- ============================================================
-- Manutenção de recorrentes + dívida parcelada (18/08/2026).
--
-- Três mudanças de modelo, todas nascidas do uso real da tela:
--
-- 1. despesas_recorrentes não tinha vigência nem observações, e o front
--    só sabia criar/desativar. Trocar o valor do aluguel exigia apagar e
--    recriar — perdendo o histórico de qual saída veio de qual modelo.
--
-- 2. dividas era um valor único + boolean 'quitada'. Não cabia abatimento
--    parcial ("paguei 1.000 dos 5.000 em agosto"), nem saldo restante,
--    nem histórico.
--
-- 3. A migration de hoje (20260818120000) deixou dívida FORA do fluxo de
--    caixa de propósito, com o argumento de que não havia decisão de
--    quando/como pagar. Essa decisão passou a existir: o cronograma de
--    parcelas. Então o isolamento cai.
--
-- Uma escolha resolve (2) e (3) de uma vez: parcela de dívida É uma saída
-- (saidas_financeiras.divida_id). Programada = status_saida 'prevista' no
-- mês certo; paga = 'paga'. Daí decorre sozinho: aparece em Saídas no mês
-- respectivo, o histórico de abatimentos é a lista dessas linhas, e o
-- saldo restante é o total menos a soma das pagas. Sem tabela de parcelas
-- e sem cadastro duplicado.
--
-- Contrapartida contábil (decidida com a gestão em 18/08/2026): devolver
-- empréstimo NÃO é despesa do mês — é devolução de dinheiro que já entrou.
-- Então a parcela sai do CAIXA mas fica fora do DRE, senão o mês da
-- parcela grande apareceria como prejuízo inexistente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Vigência e observações nas recorrentes
-- ------------------------------------------------------------
alter table public.despesas_recorrentes
  add column data_inicio date not null default current_date,
  add column data_fim date,
  add column observacoes text;

comment on column public.despesas_recorrentes.data_fim is
  'Ultimo mes de vigencia. Null = sem prazo definido (o caso comum).';

alter table public.despesas_recorrentes
  add constraint recorrente_periodo_valido
    check (data_fim is null or data_fim >= data_inicio);

-- ------------------------------------------------------------
-- 2. O elo dívida -> saída
-- ------------------------------------------------------------
alter table public.saidas_financeiras
  add column divida_id uuid references public.dividas (id) on delete set null;

create index saidas_divida_idx on public.saidas_financeiras (divida_id)
  where divida_id is not null;

comment on column public.saidas_financeiras.divida_id is
  'Preenchido quando a saida e abatimento de uma divida. Fica fora do DRE '
  '(devolucao de emprestimo nao e despesa), mas conta no caixa.';

-- categoria_id é NOT NULL, então as parcelas precisam de uma categoria.
-- O tipo aqui é só para satisfazer o schema: quem decide o agrupamento na
-- tela e a exclusão do DRE é o divida_id, nunca o tipo.
insert into public.categorias_saida (nome, tipo) values
  ('Pagamento de dívida', 'variavel')
on conflict (nome) do nothing;

-- ------------------------------------------------------------
-- 3. "Fixo planejado" era o mesmo que "Fixo recorrente" para a gestão
--    (confirmado em 18/08/2026). O valor continua no enum porque
--    remover valor de enum no Postgres exige recriar o tipo e o DRE
--    histórico ainda referencia a string — mas deixa de ser usado, e o
--    front para de oferecê-lo.
-- ------------------------------------------------------------
update public.categorias_saida
   set tipo = 'fixa'
 where tipo = 'fixa_planejada';

-- ------------------------------------------------------------
-- 4. vw_contas_a_pagar: expõe tipo e divida_id (o front agrupa por eles)
--    e passa a respeitar a vigência da recorrente.
--    Colunas novas no meio => drop + create (create or replace não
--    reordena coluna existente).
-- ------------------------------------------------------------
drop view if exists public.vw_contas_a_pagar;

create view public.vw_contas_a_pagar
with (security_invoker = true) as
with recorrentes_pendentes as (
  select
    d.id,
    d.descricao,
    cs.nome as categoria,
    cs.tipo::text as tipo,
    d.valor_centavos,
    (date_trunc('month', current_date)::date + (d.dia_vencimento - 1)) as vencimento,
    'recorrente'::text as origem,
    d.categoria_id,
    null::uuid as divida_id,
    (date_trunc('month', current_date)::date + (d.dia_vencimento - 1)) as competencia
  from public.despesas_recorrentes d
  join public.categorias_saida cs on cs.id = d.categoria_id
  where d.ativa
    -- Vigência: fora da janela, a recorrente não é obrigação deste mês.
    and d.data_inicio <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
    and (d.data_fim is null or d.data_fim >= date_trunc('month', current_date)::date)
    and not exists (
      select 1 from public.saidas_financeiras s
      where s.recorrente_id = d.id
        and date_trunc('month', s.data_caixa) = date_trunc('month', current_date)
    )
),
saidas_previstas as (
  select
    s.id,
    s.descricao,
    cs.nome as categoria,
    cs.tipo::text as tipo,
    s.valor_centavos,
    coalesce(s.data_prevista, s.data_caixa) as vencimento,
    'saida'::text as origem,
    s.categoria_id,
    s.divida_id,
    s.data_competencia as competencia
  from public.saidas_financeiras s
  join public.categorias_saida cs on cs.id = s.categoria_id
  where s.status_saida = 'prevista'
),
unidas as (
  select * from recorrentes_pendentes
  union all
  select * from saidas_previstas
)
select
  id,
  descricao,
  categoria,
  tipo,
  valor_centavos,
  vencimento,
  origem,
  categoria_id,
  divida_id,
  case
    when vencimento < current_date then 'atrasada'
    when vencimento = current_date then 'hoje'
    when vencimento <= current_date + 6 then 'semana'
    when vencimento <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date then 'mes'
    else 'depois'
  end as bucket,
  competencia
from unidas;

comment on view public.vw_contas_a_pagar is
  'Recorrentes vigentes ainda nao lancadas no mes + saidas com '
  'status_saida=prevista (folha de professora, parcelas de divida). '
  'tipo e divida_id alimentam o agrupamento de Saidas em Fixo/Variavel/Dividas.';

-- ------------------------------------------------------------
-- 5. vw_saldo_caixa: única mudança é a vigência da recorrente.
--
--    O filtro status_saida='paga' e o desconto das saídas previstas do
--    projetado JÁ existiam desde 20260805020000 — a parcela programada
--    portanto já nascia fora do saldo atual e dentro do projetado, que é
--    o comportamento correto. Mantidas as 5 colunas da view atual
--    (saidas_previstas_centavos inclusive): create or replace não pode
--    remover coluna de view, e derrubar essa coluna quebraria quem a lê.
-- ------------------------------------------------------------
create or replace view public.vw_saldo_caixa
with (security_invoker = true) as
with cfg as (
  select saldo_inicial_centavos, saldo_inicial_data from public.config_financeiro
),
recebidas as (
  select coalesce(sum(e.valor_centavos), 0)::bigint as total
  from public.entradas_financeiras e, cfg
  where e.status = 'recebida' and e.data_caixa >= cfg.saldo_inicial_data
),
pagas as (
  select coalesce(sum(s.valor_centavos), 0)::bigint as total
  from public.saidas_financeiras s, cfg
  where s.status_saida = 'paga' and s.data_caixa >= cfg.saldo_inicial_data
),
previstas as (
  select coalesce(sum(valor_centavos), 0)::bigint as total
  from public.entradas_financeiras
  where status = 'prevista'
),
saidas_previstas as (
  select coalesce(sum(valor_centavos), 0)::bigint as total
  from public.saidas_financeiras
  where status_saida = 'prevista'
),
recorrentes_pendentes as (
  select coalesce(sum(d.valor_centavos), 0)::bigint as total
  from public.despesas_recorrentes d
  where d.ativa
    -- Fora da vigencia, a recorrente nao e obrigacao deste mes.
    and d.data_inicio <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
    and (d.data_fim is null or d.data_fim >= date_trunc('month', current_date)::date)
    and not exists (
      select 1 from public.saidas_financeiras s
      where s.recorrente_id = d.id
        and date_trunc('month', s.data_caixa) = date_trunc('month', current_date)
    )
)
select
  (cfg.saldo_inicial_centavos + recebidas.total - pagas.total)::bigint
    as saldo_atual_centavos,
  previstas.total as previsto_em_aberto_centavos,
  (cfg.saldo_inicial_centavos + recebidas.total - pagas.total
   + previstas.total - recorrentes_pendentes.total - saidas_previstas.total)::bigint
    as saldo_projetado_centavos,
  recorrentes_pendentes.total as recorrentes_pendentes_mes_centavos,
  saidas_previstas.total as saidas_previstas_centavos
from cfg, recebidas, pagas, previstas, recorrentes_pendentes, saidas_previstas;

comment on view public.vw_saldo_caixa is
  'Saldo atual (caixa realizado) e projetado. O projetado soma entradas '
  'previstas e desconta saidas previstas + recorrentes VIGENTES ainda nao '
  'lancadas no mes.';

-- ------------------------------------------------------------
-- 5b. vw_saidas_mensal: o gráfico de evolução de despesa conta caixa
--     realizado, então parcela apenas programada não entra (a view ainda
--     somava qualquer status, porque data_caixa é NOT NULL com default).
--     Abatimento de dívida também fica fora: o gráfico compara custo de
--     operação, e devolução de capital não é custo (mesma régua do DRE).
-- ------------------------------------------------------------
create or replace view public.vw_saidas_mensal
with (security_invoker = true) as
select
  cs.tipo,
  date_trunc('month', s.data_caixa)::date as mes,
  count(*) as lancamentos,
  sum(s.valor_centavos)::bigint as total_centavos
from public.saidas_financeiras s
join public.categorias_saida cs on cs.id = s.categoria_id
where s.status_saida = 'paga'
  and s.divida_id is null
group by cs.tipo, 2;

comment on view public.vw_saidas_mensal is
  'Despesa paga por tipo e mes de caixa. Exclui saidas apenas previstas e '
  'abatimentos de divida (devolucao de capital, nao custo de operacao).';

-- ------------------------------------------------------------
-- 6. vw_dre_competencia: parcela de dívida sai do resultado.
--    É aqui que a decisão contábil vira código.
-- ------------------------------------------------------------
create or replace view public.vw_dre_competencia
with (security_invoker = true) as
select
  date_trunc('month', data_competencia)::date as mes,
  'receita'::text as tipo,
  categoria::text as categoria,
  sum(valor_centavos)::bigint as total_centavos,
  count(*) as lancamentos,
  null::text as subtipo
from public.entradas_financeiras
where status <> 'cancelada'
group by 1, 3

union all

select
  date_trunc('month', s.data_competencia)::date as mes,
  'despesa'::text as tipo,
  cs.nome as categoria,
  sum(s.valor_centavos)::bigint as total_centavos,
  count(*) as lancamentos,
  cs.tipo::text as subtipo
from public.saidas_financeiras s
join public.categorias_saida cs on cs.id = s.categoria_id
where s.status_saida <> 'cancelada'
  -- Devolver emprestimo nao e despesa do mes: sai do caixa, fica fora do
  -- resultado. Sem isto, o mes da parcela grande vira prejuizo ficticio.
  and s.divida_id is null
group by 1, 3, cs.tipo;

comment on view public.vw_dre_competencia is
  'Receita e despesa por mes de competencia (independente de status). '
  'Abatimento de divida (divida_id) fica fora: e devolucao de capital, '
  'nao despesa. subtipo = tipo_saida (so despesa).';
