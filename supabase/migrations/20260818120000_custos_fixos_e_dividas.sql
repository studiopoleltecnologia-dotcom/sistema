-- ============================================================
-- Custos fixos reais do estúdio + registro de dívidas (18/08/2026).
--
-- Recorrentes entram em despesas_recorrentes: aparecem sozinhas em
-- Recorrências e em Contas a pagar, sem mudança de front (as duas
-- telas já são inteiramente orientadas a dado). "Luz" é fixa mas de
-- valor variável — mesmo assim vira recorrente (categoria já é
-- 'variavel'), com o valor de hoje como estimativa: quem lança edita
-- o valor real na hora de marcar "Pagar", a recorrência em si não
-- muda.
--
-- Dívidas (empréstimos das sócias ao estúdio) são um caso diferente:
-- ainda não há decisão de COMO nem QUANDO pagar mês a mês, então não
-- podem entrar em despesas_recorrentes (tem vencimento obrigatório)
-- nem em saidas_financeiras (data_caixa obrigatória) sem inventar um
-- compromisso que não existe — isso contaminaria o saldo projetado
-- do fluxo de caixa e o DRE com um número fictício. Por isso ganham
-- tabela própria, só para visibilidade, de propósito fora do fluxo
-- de caixa até a alocação ser decidida.
-- ============================================================

-- ------------------------------------------------------------
-- Categorias novas (faltavam para os custos abaixo)
-- ------------------------------------------------------------
insert into public.categorias_saida (nome, tipo) values
  ('Água', 'fixa'),
  ('Serviços contratados', 'fixa');

-- ------------------------------------------------------------
-- Custos fixos mensais (valor não muda mês a mês)
-- dia_vencimento é um chute razoável — ajustável na tela de
-- Recorrências a qualquer momento.
-- ------------------------------------------------------------
insert into public.despesas_recorrentes (descricao, valor_centavos, categoria_id, dia_vencimento)
select 'Aluguel', 150000, id, 5 from public.categorias_saida where nome = 'Aluguel'
union all
select 'Taxa de água', 10000, id, 10 from public.categorias_saida where nome = 'Água'
union all
select 'Internet', 15000, id, 10 from public.categorias_saida where nome = 'Internet'
union all
select 'Marketing', 30000, id, 1 from public.categorias_saida where nome = 'Marketing'
-- DAS-MEI vence dia 20 (data oficial da Receita, não é chute).
union all
select 'DAS-MEI', 8800, id, 20 from public.categorias_saida where nome = 'DAS-MEI'
union all
select 'FitbyWix', 4990, id, 5 from public.categorias_saida where nome = 'App de agendamento'
union all
select 'Conta Google', 3920, id, 5 from public.categorias_saida where nome = 'Google Workspace'
union all
select 'Juliana', 30000, id, 5 from public.categorias_saida where nome = 'Serviços contratados';

-- Conta fixa de valor variável: recorrente todo mês, mas o valor
-- muda (categoria "Energia" já é 'variavel', sem migration própria).
-- 200 é a estimativa atual, editável a cada lançamento.
insert into public.despesas_recorrentes (descricao, valor_centavos, categoria_id, dia_vencimento)
select 'Luz (estimativa)', 20000, id, 15 from public.categorias_saida where nome = 'Energia';

-- ------------------------------------------------------------
-- DÍVIDAS — visibilidade de valores a devolver, fora do fluxo de
-- caixa (ver cabeçalho). gestão-only, mesmo padrão das outras
-- tabelas de dinheiro (is_gestao()).
-- ------------------------------------------------------------
create table public.dividas (
  id uuid primary key default gen_random_uuid(),
  credor text not null,
  descricao text,
  valor_centavos bigint not null check (valor_centavos > 0),
  quitada boolean not null default false,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

alter table public.dividas enable row level security;

create policy "gestao gerencia dividas" on public.dividas
  for all to authenticated using (public.is_gestao()) with check (public.is_gestao());

create trigger dividas_atualizada_em
  before update on public.dividas
  for each row execute function public.set_atualizada_em();

-- Marcela/Carol/Leticia = as 3 sócias (CLAUDE.md §1). Carol e Leticia
-- entraram em duas parcelas — mantidas separadas para não perder o
-- detalhe de composição.
insert into public.dividas (credor, descricao, valor_centavos) values
  ('Marcela', 'Empréstimo', 200000),
  ('Carol', 'Empréstimo', 300000),
  ('Carol', 'Empréstimo (parcela adicional)', 26100),
  ('Leticia', 'Empréstimo', 7824),
  ('Leticia', 'Empréstimo (parcela adicional)', 34000);
