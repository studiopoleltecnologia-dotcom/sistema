-- Metas de faturamento (mês e ano) para a barra de progresso do dashboard.
--
-- Ficam em config_financeiro (linha única, gestão-only, já protegida). 0 = meta
-- não definida — o dashboard esconde a barra correspondente até a equipe
-- preencher em Config. Regime de caixa, igual ao MEI (conta quando entra).
alter table public.config_financeiro
  add column if not exists meta_faturamento_mensal_centavos bigint not null default 0,
  add column if not exists meta_faturamento_anual_centavos bigint not null default 0;

comment on column public.config_financeiro.meta_faturamento_mensal_centavos is
  'Meta de faturamento do mês (regime de caixa). 0 = não definida.';
comment on column public.config_financeiro.meta_faturamento_anual_centavos is
  'Meta de faturamento do ano (regime de caixa). 0 = não definida.';
