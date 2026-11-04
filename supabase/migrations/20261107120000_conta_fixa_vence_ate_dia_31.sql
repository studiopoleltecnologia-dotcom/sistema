-- ============================================================
-- Conta fixa pode vencer dia 29, 30 ou 31
-- ============================================================
-- `despesas_recorrentes.dia_vencimento` era `check (between 1 and 28)`, e a
-- tela recusava 30 com "o valor deve ser menor ou igual a 28". Aluguel que
-- vence dia 30 não tinha como ser cadastrado com a data certa.
--
-- O 28 não era capricho: `vw_contas_a_pagar` calculava o vencimento como
--
--     date_trunc('month', current_date::timestamp)::date + (dia_vencimento - 1)
--
-- que é soma crua de dias. Com dia 30 em fevereiro, isso dá 1º de fevereiro
-- + 29 dias = 2 de MARÇO: a conta do mês vazava para o mês seguinte, e a
-- projeção parava de casar com o mês que a tela estava mostrando. Travar em
-- 28 era a forma barata de impedir o estrago.
--
-- A regra certa já existe neste banco e já foi decidida: `data_renovacao()`
-- faz `least(dia, último dia do mês)` desde 22/09/2026, que é como a
-- assinatura cobra e como todo boleto se comporta (CLAUDE.md §9.4). As
-- contas fixas simplesmente nunca a receberam.
--
-- Esta migration dá a mesma regra a elas, em três passos: a conta nomeada,
-- a view usando-a, e só então a trava afrouxada. Nesta ordem — afrouxar
-- antes de a view saber lidar deixaria uma janela em que cadastrar dia 31
-- quebra a projeção de fevereiro.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A conta, com nome
-- ------------------------------------------------------------
-- Imutável porque depende só dos argumentos — o que permite usá-la dentro
-- da view sem custo e, se um dia precisar, em índice.
create or replace function public.vencimento_no_mes(p_mes date, p_dia integer)
returns date
language sql
immutable
set search_path to ''
as $$
  select make_date(
    extract(year from date_trunc('month', p_mes))::integer,
    extract(month from date_trunc('month', p_mes))::integer,
    least(
      greatest(coalesce(p_dia, 1), 1),
      extract(day from date_trunc('month', p_mes) + interval '1 month' - interval '1 day')::integer
    )
  );
$$;

comment on function public.vencimento_no_mes(date, integer) is
  'O dia de vencimento dentro de um mes, caindo no ultimo dia quando o mes nao tem aquele dia (31 em fevereiro = dia 28 ou 29). Mesma regra de data_renovacao() para assinaturas.';


-- ------------------------------------------------------------
-- 2. A view passa a usá-la
-- ------------------------------------------------------------
-- ⚠️ `security_invoker=true` é obrigatório e está explícito: sem ele a view
-- passaria a rodar com os privilégios de quem a criou e devolveria dado
-- financeiro para quem não é gestão. Recriar view financeira sem repetir
-- esta opção é um furo de RLS, não um detalhe de sintaxe.
--
-- O resto da definição é o que já estava no ar — só os dois cálculos de
-- vencimento mudaram.
create or replace view public.vw_contas_a_pagar
with (security_invoker = true) as
with recorrentes_pendentes as (
  select
    d.id,
    d.descricao,
    cs.nome as categoria,
    cs.tipo::text as tipo,
    d.valor_centavos,
    public.vencimento_no_mes(date_trunc('month', current_date::timestamp)::date, d.dia_vencimento) as vencimento,
    'recorrente'::text as origem,
    d.categoria_id,
    null::uuid as divida_id,
    public.vencimento_no_mes(date_trunc('month', current_date::timestamp)::date, d.dia_vencimento) as competencia
  from public.despesas_recorrentes d
  join public.categorias_saida cs on cs.id = d.categoria_id
  where d.ativa
    and d.data_inicio <= (date_trunc('month', current_date::timestamp) + interval '1 month' - interval '1 day')::date
    and (d.data_fim is null or d.data_fim >= date_trunc('month', current_date::timestamp)::date)
    and not exists (
      select 1
      from public.saidas_financeiras s
      where s.recorrente_id = d.id
        and date_trunc('month', s.data_caixa::timestamp) = date_trunc('month', current_date::timestamp)
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
  -- `::text` explícito em todos os ramos: `create or replace view` exige que
  -- o tipo de cada coluna bata com o da view atual, e literal sem cast
  -- entra como `unknown`.
  case
    when vencimento < current_date then 'atrasada'::text
    when vencimento = current_date then 'hoje'::text
    when vencimento <= (current_date + 6) then 'semana'::text
    when vencimento <= (date_trunc('month', current_date::timestamp) + interval '1 month' - interval '1 day')::date
      then 'mes'::text
    else 'depois'::text
  end as bucket,
  competencia
from unidas;


-- ------------------------------------------------------------
-- 3. Agora sim, a trava afrouxa
-- ------------------------------------------------------------
alter table public.despesas_recorrentes
  drop constraint if exists despesas_recorrentes_dia_vencimento_check;

alter table public.despesas_recorrentes
  add constraint despesas_recorrentes_dia_vencimento_check
  check (dia_vencimento >= 1 and dia_vencimento <= 31);


-- ------------------------------------------------------------
-- 4. A guarda
-- ------------------------------------------------------------
-- Prova a regra nos dois casos que importam, em vez de confiar na leitura:
-- fevereiro encurta, e mês de 31 dias não encurta.
do $$
begin
  if public.vencimento_no_mes(date '2027-02-01', 31) <> date '2027-02-28' then
    raise exception 'vencimento_no_mes: dia 31 em fevereiro deveria cair no dia 28, veio %',
      public.vencimento_no_mes(date '2027-02-01', 31);
  end if;
  if public.vencimento_no_mes(date '2028-02-01', 30) <> date '2028-02-29' then
    raise exception 'vencimento_no_mes: ano bissexto deveria dar 29, veio %',
      public.vencimento_no_mes(date '2028-02-01', 30);
  end if;
  if public.vencimento_no_mes(date '2026-11-01', 30) <> date '2026-11-30' then
    raise exception 'vencimento_no_mes: novembro tem dia 30, veio %',
      public.vencimento_no_mes(date '2026-11-01', 30);
  end if;
  if public.vencimento_no_mes(date '2026-12-01', 31) <> date '2026-12-31' then
    raise exception 'vencimento_no_mes: dezembro tem dia 31, veio %',
      public.vencimento_no_mes(date '2026-12-01', 31);
  end if;
end $$;
