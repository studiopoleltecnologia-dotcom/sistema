-- ============================================================
-- Despesas recorrentes: modelo mensal de saídas fixas/variáveis.
-- Marcar como recorrente cria o modelo; todo mês ela aparece como
-- pendente na aba Saídas e entra no saldo projetado do fluxo de
-- caixa até ser lançada (1 clique). docs/01-NEGOCIO.md 7.1.
-- ============================================================

create table public.despesas_recorrentes (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  categoria_id uuid not null references public.categorias_saida (id),
  -- limitado a 28 para existir em todo mês
  dia_vencimento integer not null default 5 check (dia_vencimento between 1 and 28),
  ativa boolean not null default true,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

alter table public.despesas_recorrentes enable row level security;
create policy "socias gerenciam despesas recorrentes" on public.despesas_recorrentes
  for all to authenticated using (public.is_socia()) with check (public.is_socia());
create trigger despesas_recorrentes_atualizada_em
  before update on public.despesas_recorrentes
  for each row execute function public.set_atualizada_em();

-- saída lançada a partir de uma recorrente
alter table public.saidas_financeiras
  add column recorrente_id uuid references public.despesas_recorrentes (id) on delete set null;

-- uma recorrente só pode ser lançada uma vez por mês
-- (cast p/ timestamp: date_trunc sobre date resolve para a variante
-- com timezone, que não é IMMUTABLE e não pode entrar em índice)
create unique index saidas_recorrente_mes_unico
  on public.saidas_financeiras (recorrente_id, (date_trunc('month', data_caixa::timestamp)))
  where recorrente_id is not null;

-- Fluxo de caixa: o projetado passa a descontar as recorrentes
-- ainda não lançadas no mês corrente.
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
  where s.data_caixa >= cfg.saldo_inicial_data
),
previstas as (
  select coalesce(sum(valor_centavos), 0)::bigint as total
  from public.entradas_financeiras
  where status = 'prevista'
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
   + previstas.total - recorrentes_pendentes.total)::bigint
    as saldo_projetado_centavos,
  recorrentes_pendentes.total as recorrentes_pendentes_mes_centavos
from cfg, recebidas, pagas, previstas, recorrentes_pendentes;
