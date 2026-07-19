-- ============================================================
-- Fase 2 — Financeiro + MEI
-- Tabelas: entradas_financeiras, saidas_financeiras,
--          categorias_saida, config_financeiro, reserva_movimentos
-- Views:   vw_mei_acumulado, vw_mix_receita_mensal
-- Correção Fase 1: movimentacoes_funil (contrato analítico,
--          docs/03-DADOS-ANALITICOS.md seção 1)
-- Dinheiro em centavos (bigint); regime de caixa via data_caixa.
-- ============================================================

create type public.categoria_entrada as enum (
  'mensalista', 'wellhub', 'classpass', 'avulsa', 'workshop', 'evento', 'outros'
);

-- 'prevista' cobre tanto "a receber" (mensalista) quanto
-- "a reconciliar" (wellhub/classpass) — ver CLAUDE.md 12.5/12.6.
create type public.status_entrada as enum ('prevista', 'recebida');

create type public.tipo_saida as enum ('fixa', 'variavel');

create type public.tipo_movimento_reserva as enum ('aporte', 'retirada');

-- ------------------------------------------------------------
-- CORREÇÃO FASE 1 — transições de funil como evento estruturado
-- (o log em interacoes_crm é texto para leitura humana; esta
-- tabela é a fonte das análises de funil/conversão).
-- ------------------------------------------------------------
create table public.movimentacoes_funil (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  socia_id uuid references public.socias (id) on delete set null,
  estagio_de public.estagio_funil not null,
  estagio_para public.estagio_funil not null,
  -- preenchível depois (ex: motivo de saída/perda)
  motivo text,
  ocorreu_em timestamptz not null default now()
);

create index movimentacoes_funil_cliente_idx
  on public.movimentacoes_funil (cliente_id, ocorreu_em desc);
create index movimentacoes_funil_estagio_idx
  on public.movimentacoes_funil (estagio_para, ocorreu_em);

alter table public.movimentacoes_funil enable row level security;

create policy "socias veem movimentacoes de funil"
  on public.movimentacoes_funil for select
  to authenticated using (public.is_socia());

create policy "socias registram movimentacoes de funil"
  on public.movimentacoes_funil for insert
  to authenticated with check (public.is_socia());

create policy "socias anotam motivo"
  on public.movimentacoes_funil for update
  to authenticated using (public.is_socia()) with check (public.is_socia());

-- trigger da Fase 1 passa a alimentar as duas tabelas
create or replace function public.log_mudanca_estagio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estagio is distinct from old.estagio then
    insert into public.interacoes_crm (cliente_id, socia_id, tipo, descricao)
    values (
      new.id,
      auth.uid(),
      'mudanca_estagio',
      old.estagio::text || ' -> ' || new.estagio::text
    );
    insert into public.movimentacoes_funil (cliente_id, socia_id, estagio_de, estagio_para)
    values (new.id, auth.uid(), old.estagio, new.estagio);
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- CONFIG FINANCEIRO — parâmetros ajustáveis pelas sócias
-- (linha única; limite MEI parametrizável conforme CLAUDE.md 8).
-- ------------------------------------------------------------
create table public.config_financeiro (
  id boolean primary key default true check (id),
  limite_mei_centavos bigint not null default 8100000 check (limite_mei_centavos > 0),
  percentual_reserva numeric(4, 1) not null default 12.0
    check (percentual_reserva >= 0 and percentual_reserva <= 100),
  meta_reserva_meses integer not null default 3 check (meta_reserva_meses > 0),
  saldo_inicial_centavos bigint not null default 0,
  saldo_inicial_data date not null default current_date,
  atualizada_em timestamptz not null default now()
);

insert into public.config_financeiro default values;

alter table public.config_financeiro enable row level security;

create policy "socias veem config financeiro"
  on public.config_financeiro for select
  to authenticated using (public.is_socia());

create policy "socias ajustam config financeiro"
  on public.config_financeiro for update
  to authenticated using (public.is_socia()) with check (public.is_socia());

-- sem insert/delete: linha única criada acima.

create trigger config_financeiro_atualizada_em
  before update on public.config_financeiro
  for each row execute function public.set_atualizada_em();

-- ------------------------------------------------------------
-- CATEGORIAS DE SAÍDA — editáveis pelas sócias (não enum).
-- ------------------------------------------------------------
create table public.categorias_saida (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  tipo public.tipo_saida not null,
  ativa boolean not null default true,
  criada_em timestamptz not null default now()
);

alter table public.categorias_saida enable row level security;

create policy "socias gerenciam categorias de saida"
  on public.categorias_saida for all
  to authenticated using (public.is_socia()) with check (public.is_socia());

-- categorias do doc de negócio (docs/01-NEGOCIO.md seção 3) — domínio, não seed
insert into public.categorias_saida (nome, tipo) values
  ('Aluguel', 'fixa'),
  ('Internet', 'fixa'),
  ('DAS-MEI', 'fixa'),
  ('Google Workspace', 'fixa'),
  ('Domínio', 'fixa'),
  ('App de agendamento', 'fixa'),
  ('Marketing', 'fixa'),
  ('Social media', 'fixa'),
  ('Professoras', 'variavel'),
  ('Energia', 'variavel'),
  ('Materiais', 'variavel'),
  ('Manutenção', 'variavel'),
  ('Limpeza', 'variavel'),
  ('Compras', 'variavel');

-- ------------------------------------------------------------
-- ENTRADAS — data_competencia (serviço) ≠ data_caixa (dinheiro).
-- MEI e fluxo de caixa usam SEMPRE data_caixa (regime de caixa).
-- ------------------------------------------------------------
create table public.entradas_financeiras (
  id uuid primary key default gen_random_uuid(),
  descricao text,
  valor_centavos bigint not null check (valor_centavos > 0),
  categoria public.categoria_entrada not null,
  status public.status_entrada not null default 'recebida',
  data_competencia date not null default current_date,
  -- previsão de recebimento (fluxo de caixa projetado);
  -- wellhub: repasse dia 15 do mês seguinte (CLAUDE.md 12.6)
  data_prevista date,
  data_caixa date,
  cliente_id uuid references public.clientes (id) on delete set null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  constraint entrada_recebida_tem_data_caixa
    check (status <> 'recebida' or data_caixa is not null)
);

create index entradas_data_caixa_idx on public.entradas_financeiras (data_caixa);
create index entradas_categoria_idx on public.entradas_financeiras (categoria);
create index entradas_status_idx on public.entradas_financeiras (status);
create index entradas_cliente_idx on public.entradas_financeiras (cliente_id);

alter table public.entradas_financeiras enable row level security;

create policy "socias gerenciam entradas"
  on public.entradas_financeiras for all
  to authenticated using (public.is_socia()) with check (public.is_socia());

create trigger entradas_atualizada_em
  before update on public.entradas_financeiras
  for each row execute function public.set_atualizada_em();

-- ------------------------------------------------------------
-- SAÍDAS
-- ------------------------------------------------------------
create table public.saidas_financeiras (
  id uuid primary key default gen_random_uuid(),
  descricao text,
  valor_centavos bigint not null check (valor_centavos > 0),
  categoria_id uuid not null references public.categorias_saida (id),
  data_caixa date not null default current_date,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index saidas_data_caixa_idx on public.saidas_financeiras (data_caixa);
create index saidas_categoria_idx on public.saidas_financeiras (categoria_id);

alter table public.saidas_financeiras enable row level security;

create policy "socias gerenciam saidas"
  on public.saidas_financeiras for all
  to authenticated using (public.is_socia()) with check (public.is_socia());

create trigger saidas_atualizada_em
  before update on public.saidas_financeiras
  for each row execute function public.set_atualizada_em();

-- ------------------------------------------------------------
-- RESERVA DE CAIXA — aportes/retiradas reais (política 10–15%).
-- ------------------------------------------------------------
create table public.reserva_movimentos (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_movimento_reserva not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  data date not null default current_date,
  observacao text,
  criada_em timestamptz not null default now()
);

create index reserva_movimentos_data_idx on public.reserva_movimentos (data);

alter table public.reserva_movimentos enable row level security;

create policy "socias gerenciam reserva"
  on public.reserva_movimentos for all
  to authenticated using (public.is_socia()) with check (public.is_socia());

-- ------------------------------------------------------------
-- VIEWS — fórmulas no banco (CLAUDE.md 3.4); security_invoker
-- garante que o RLS das tabelas-base vale também na view.
-- ------------------------------------------------------------
create view public.vw_mei_acumulado
with (security_invoker = true) as
with cfg as (
  select limite_mei_centavos from public.config_financeiro
),
ano as (
  select coalesce(sum(valor_centavos), 0)::bigint as faturamento
  from public.entradas_financeiras
  where status = 'recebida'
    and data_caixa >= date_trunc('year', current_date)
    and data_caixa < date_trunc('year', current_date) + interval '1 year'
)
select
  ano.faturamento as faturamento_ano_centavos,
  cfg.limite_mei_centavos,
  round(100.0 * ano.faturamento / cfg.limite_mei_centavos, 1) as percentual_limite,
  (ano.faturamento::numeric / greatest(extract(doy from current_date), 1) * 365)::bigint
    as projecao_dezembro_centavos,
  greatest(cfg.limite_mei_centavos - ano.faturamento, 0) as falta_para_limite_centavos
from ano, cfg;

create view public.vw_mix_receita_mensal
with (security_invoker = true) as
select
  date_trunc('month', data_caixa)::date as mes,
  categoria,
  sum(valor_centavos)::bigint as total_centavos,
  count(*) as lancamentos
from public.entradas_financeiras
where status = 'recebida' and data_caixa is not null
group by 1, 2;
