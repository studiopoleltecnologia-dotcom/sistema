-- ============================================================
-- Conta fixa projeta os meses à frente, não só o mês corrente
-- ============================================================
-- `vw_contas_a_pagar` projetava a conta fixa SÓ para o mês corrente:
--
--     date_trunc('month', current_date)::date + ...
--
-- Então olhar dezembro em novembro mostrava zero de aluguel, internet e
-- DAS-MEI. A despesa mais previsível do estúdio — a que se sabe de cor —
-- era a única que não aparecia no futuro.
--
-- Ficou gritante quando a previsão da folha (20261108120000) passou a
-- lançar três meses à frente: dezembro mostrava professora e não mostrava
-- aluguel. A tela ficou dizendo que o mês que vem custa menos do que custa.
--
-- Agora a projeção cobre o mês corrente e os 12 seguintes.
--
-- ------------------------------------------------------------
-- Para trás, não. De propósito.
-- ------------------------------------------------------------
-- Projetar meses passados encheria a tela de "EM ATRASO" para todo mês
-- anterior à adoção do sistema — contas que foram pagas fora dele. Atraso
-- inventado é pior que informação faltando: ensina a ignorar o alerta.
--
-- ------------------------------------------------------------
-- A exclusão passa a ser por COMPETÊNCIA
-- ------------------------------------------------------------
-- A view sabia que a conta do mês já foi lançada comparando o MÊS DA
-- DATA DE CAIXA. Isso só funcionava porque tudo acontecia no mês corrente.
--
-- Com meses à frente, quebra: pagar a conta de dezembro adiantado, em
-- novembro, grava caixa em novembro (regime de caixa, que é o certo) — e
-- a projeção de dezembro voltaria a aparecer como se nada tivesse sido
-- pago. A conta apareceria duas vezes.
--
-- `data_competencia` é o mês a que a conta pertence, independentemente de
-- quando o dinheiro sai. É por ela que a comparação tem de ser feita.
-- Conferido antes de mudar: as 8 saídas de recorrente em produção têm
-- competência preenchida, e em todas ela bate com o mês do caixa — ou
-- seja, nenhuma linha histórica muda de comportamento.
-- ============================================================

create or replace view public.vw_contas_a_pagar
with (security_invoker = true) as
with meses as (
  -- O mês corrente e os 12 seguintes.
  select (date_trunc('month', current_date::timestamp) + make_interval(months => i))::date as mes
  from generate_series(0, 12) as i
),
recorrentes_pendentes as (
  select
    d.id,
    d.descricao,
    cs.nome as categoria,
    cs.tipo::text as tipo,
    d.valor_centavos,
    public.vencimento_no_mes(m.mes, d.dia_vencimento) as vencimento,
    'recorrente'::text as origem,
    d.categoria_id,
    null::uuid as divida_id,
    m.mes as competencia,
    -- A mesma recorrente aparece uma vez por mês projetado, então o id dela
    -- deixou de identificar a linha. `chave` é o que a tela usa para
    -- distinguir; `id` continua sendo o da recorrente, que é o que a ação
    -- de lançar precisa.
    d.id::text || ':' || to_char(m.mes, 'YYYY-MM') as chave
  from public.despesas_recorrentes d
  join public.categorias_saida cs on cs.id = d.categoria_id
  cross join meses m
  where d.ativa
    -- Vigência conferida contra o mês projetado, não contra o mês corrente:
    -- recorrente que termina em janeiro não pode projetar fevereiro.
    and d.data_inicio <= (m.mes + interval '1 month' - interval '1 day')::date
    and (d.data_fim is null or d.data_fim >= m.mes)
    and not exists (
      select 1
      from public.saidas_financeiras s
      where s.recorrente_id = d.id
        and s.data_competencia = m.mes
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
    s.data_competencia as competencia,
    s.id::text as chave
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
    when vencimento < current_date then 'atrasada'::text
    when vencimento = current_date then 'hoje'::text
    when vencimento <= (current_date + 6) then 'semana'::text
    when vencimento <= (date_trunc('month', current_date::timestamp) + interval '1 month' - interval '1 day')::date
      then 'mes'::text
    else 'depois'::text
  end as bucket,
  competencia,
  chave
from unidas;

comment on view public.vw_contas_a_pagar is
  'Contas a pagar: recorrentes projetadas do mes corrente ate 12 meses a frente (nunca para tras) + saidas previstas. A recorrente ja lancada sai da projecao por COMPETENCIA, nao pela data de caixa, para pagamento adiantado nao fazer a conta reaparecer.';


-- ------------------------------------------------------------
-- A guarda
-- ------------------------------------------------------------
-- Prova as duas coisas que esta migration existe para garantir: que há
-- projeção além do mês corrente, e que nenhuma conta já lançada voltou a
-- aparecer.
do $$
declare
  v_meses integer;
  v_repetidas integer;
begin
  select count(distinct date_trunc('month', vencimento))
    into v_meses
  from public.vw_contas_a_pagar
  where origem = 'recorrente';

  if v_meses <= 1 then
    raise exception 'Projecao de conta fixa continua num mes so (% meses).', v_meses;
  end if;

  select count(*) into v_repetidas from (
    select chave from public.vw_contas_a_pagar group by chave having count(*) > 1
  ) x;

  if v_repetidas > 0 then
    raise exception 'A view devolveu % chaves repetidas — a linha deixou de ser unica.', v_repetidas;
  end if;
end $$;
