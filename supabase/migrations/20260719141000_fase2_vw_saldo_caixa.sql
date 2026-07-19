-- Fluxo de caixa: saldo atual → previstas em aberto → saldo projetado
-- (docs/01-NEGOCIO.md 7.1). Fórmula no banco, não no front.
create view public.vw_saldo_caixa
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
  where s.data_caixa >= cfg.saldo_inicial_data
),
previstas as (
  select coalesce(sum(valor_centavos), 0)::bigint as total
  from public.entradas_financeiras
  where status = 'prevista'
)
select
  (cfg.saldo_inicial_centavos + recebidas.total - pagas.total)::bigint
    as saldo_atual_centavos,
  previstas.total as previsto_em_aberto_centavos,
  (cfg.saldo_inicial_centavos + recebidas.total - pagas.total + previstas.total)::bigint
    as saldo_projetado_centavos
from cfg, recebidas, pagas, previstas;
