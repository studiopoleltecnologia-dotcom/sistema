-- Fase B do redesenho financeiro (competência × caixa): as views que
-- faltavam. Mesma convenção das views financeiras já existentes
-- (security_invoker; fórmula no banco, não no front — CLAUDE.md 3.4).
--
-- vw_dre_competencia — receita/despesa por MÊS DE COMPETÊNCIA,
-- independente de já ter entrado/saído dinheiro. Espelha o par
-- vw_mix_receita_mensal + vw_saidas_mensal (que são por data_caixa),
-- agora por data_competencia.
create view public.vw_dre_competencia
with (security_invoker = true) as
select
  date_trunc('month', data_competencia)::date as mes,
  'receita'::text as tipo,
  categoria::text as categoria,
  sum(valor_centavos)::bigint as total_centavos,
  count(*) as lancamentos
from public.entradas_financeiras
where status <> 'cancelada'
group by 1, 3

union all

select
  date_trunc('month', s.data_competencia)::date as mes,
  'despesa'::text as tipo,
  cs.nome as categoria,
  sum(s.valor_centavos)::bigint as total_centavos,
  count(*) as lancamentos
from public.saidas_financeiras s
join public.categorias_saida cs on cs.id = s.categoria_id
where s.status_saida <> 'cancelada'
group by 1, 3;

comment on view public.vw_dre_competencia is
  'Receita e despesa por mes de competencia (independente de status). Resultado operacional real do mes, mesmo com dinheiro ainda nao movimentado.';

-- ------------------------------------------------------------
-- vw_contas_a_receber — formaliza em view o que ContasPage.tsx (aba
-- "a receber") já calculava no cliente: entradas 'prevista', com o
-- mesmo bucket de vencimento (atrasada/hoje/semana/mes/depois).
-- ------------------------------------------------------------
create view public.vw_contas_a_receber
with (security_invoker = true) as
select
  id,
  descricao,
  categoria::text as categoria,
  valor_centavos,
  coalesce(data_prevista, current_date) as vencimento,
  case
    when coalesce(data_prevista, current_date) < current_date then 'atrasada'
    when coalesce(data_prevista, current_date) = current_date then 'hoje'
    when coalesce(data_prevista, current_date) <= current_date + 6 then 'semana'
    when coalesce(data_prevista, current_date)
      <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date then 'mes'
    else 'depois'
  end as bucket
from public.entradas_financeiras
where status = 'prevista';

comment on view public.vw_contas_a_receber is
  'Entradas previstas (nao recebidas ainda), com bucket de vencimento. Formaliza o calculo que ContasPage.tsx fazia no cliente.';

-- ------------------------------------------------------------
-- vw_contas_a_pagar — hoje ContasPage.tsx (aba "a pagar") só mostra
-- despesas_recorrentes pendentes do mês; ignora qualquer saída avulsa
-- lançada adiantado (inclusive a folha automática de professora, que
-- nunca aparecia aqui). Une as duas fontes: recorrente ainda não
-- lançada + saida_financeira já lançada com status_saida='prevista'.
-- ------------------------------------------------------------
create view public.vw_contas_a_pagar
with (security_invoker = true) as
with recorrentes_pendentes as (
  select
    d.id,
    d.descricao,
    cs.nome as categoria,
    d.valor_centavos,
    (date_trunc('month', current_date)::date + (d.dia_vencimento - 1)) as vencimento,
    'recorrente'::text as origem
  from public.despesas_recorrentes d
  join public.categorias_saida cs on cs.id = d.categoria_id
  where d.ativa
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
    s.valor_centavos,
    coalesce(s.data_prevista, s.data_caixa) as vencimento,
    'saida'::text as origem
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
  *,
  case
    when vencimento < current_date then 'atrasada'
    when vencimento = current_date then 'hoje'
    when vencimento <= current_date + 6 then 'semana'
    when vencimento <= (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date then 'mes'
    else 'depois'
  end as bucket
from unidas;

comment on view public.vw_contas_a_pagar is
  'Recorrentes ainda nao lancadas no mes + saidas com status_saida=prevista (inclui a folha automatica de professora), com bucket de vencimento.';

-- ------------------------------------------------------------
-- sync_folha_financeiro: a saída gerada nasce 'prevista' quando o
-- vencimento (dia 15 do mês seguinte) ainda está no futuro — só assim
-- ela aparece em vw_contas_a_pagar. Se o fechamento for aprovado
-- depois que o vencimento já passou (caso raro), nasce 'paga' direto.
-- data_caixa continua igual a antes desta migration (sem mudança no
-- Fluxo de Caixa, que soma saidas por data_caixa independente de status).
-- ------------------------------------------------------------
create or replace function public.sync_folha_financeiro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_cat uuid;
  v_nome text;
  v_venc date;
  v_competencia date;
  v_status public.status_saida;
begin
  if tg_op = 'UPDATE'
     and old.status = 'aprovado'
     and new.status is distinct from 'aprovado' then
    delete from public.saidas_financeiras where fechamento_id = new.id;
    return new;
  end if;

  if new.status = 'aprovado'
     and (tg_op = 'INSERT' or old.status is distinct from 'aprovado') then

    v_total := coalesce(new.bruto_centavos, 0)
      + coalesce((select sum(valor_centavos) from public.fechamento_ajustes
                  where fechamento_id = new.id), 0);

    select id into v_cat from public.categorias_saida where nome = 'Professoras' limit 1;
    select nome into v_nome from public.professoras where id = new.professora_id;

    v_competencia := to_date(new.competencia || '-01', 'YYYY-MM-DD');
    v_venc := (v_competencia + interval '1 month' + interval '14 days')::date;
    v_status := case when v_venc > current_date then 'prevista' else 'paga' end;

    if v_cat is not null then
      insert into public.saidas_financeiras
        (descricao, valor_centavos, categoria_id, data_caixa,
         data_competencia, data_prevista, status_saida, fechamento_id)
      values
        (format('Pagamento %s (%s)', coalesce(v_nome, 'professora'), new.competencia),
         v_total, v_cat, v_venc, v_competencia, v_venc, v_status, new.id)
      on conflict (fechamento_id) where fechamento_id is not null
      do update set
        valor_centavos = excluded.valor_centavos,
        data_caixa = excluded.data_caixa,
        data_competencia = excluded.data_competencia,
        data_prevista = excluded.data_prevista,
        status_saida = excluded.status_saida,
        descricao = excluded.descricao,
        atualizada_em = now();
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_folha_financeiro() from public, anon, authenticated;

-- ------------------------------------------------------------
-- vw_saldo_caixa: "pagas" passa a olhar só status_saida='paga' (saída
-- que já saiu de fato); novo bucket saidas_previstas_centavos desconta
-- do projetado, ao lado das recorrentes ainda não lançadas.
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
