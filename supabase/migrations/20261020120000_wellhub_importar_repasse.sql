-- ============================================================
-- Wellhub: importar o relatório e casar linha a linha
-- 06/10/2026
-- ============================================================
-- A gestão mandou o relatório de setembro do Portal do Parceiro, e ele
-- derruba a premissa dos dois PRs anteriores. Vale escrever o que o
-- arquivo mostra, porque é a fonte mais confiável que temos:
--
--   159 check-ins, 63 pessoas, R$ 3.711,48 no mês.
--
--   | valor | quantos | quando |
--   |---|---|---|
--   | 27,13 | 129 | 02/09 a 24/09 |
--   | 27,09 |   1 | 22/09 (quatro centavos a menos, caso isolado) |
--   | 30,77 |   6 | 30/09 e 01/10 |
--   | 0,00  |  23 | **todas** as "Visita experimental" |
--
-- Três conclusões, e as duas primeiras contrariam o que construímos:
--
-- 1. **A tarifa muda no TEMPO, não por plano do assinante.** 27,13 até o
--    dia 24 e 30,77 no fim do mês — e nenhum dia tem duas tarifas pagas
--    diferentes convivendo. Precificar por plano (Silver+/Gold) não
--    explica o que o dado mostra.
--
-- 2. **O relatório não traz o plano do assinante em lugar nenhum.** A
--    coluna "Produto" é O NOSSO serviço ("Dança e Outros Serviços",
--    "Pole Dance"), descrita como "o produto no qual seu visitante fez
--    check-in". Ou seja, `gym.product` do payload é o nosso produto, não
--    a assinatura dele — ao contrário do que a nossa referência de API
--    dizia, e que foi a base do `20261018120000`.
--
-- 3. **Visita experimental paga zero**, e o relatório marca isso numa
--    coluna própria. A regra da gestão estava certa; a nossa heurística
--    ("primeira visita da pessoa") acerta 22 dos 23 casos de setembro —
--    serve de palpite, mas quem sabe de verdade é o relatório.
--
-- ## O que isso mudou no desenho
--
-- O preço previsto deixa de querer adivinhar: **o relatório é a fonte**,
-- e a previsão passa a se calibrar por ele. Nada é jogado fora —
-- `wellhub_planos` continua valendo como tarifa por produto nosso, que é
-- o que a coluna "Produto" de fato identifica —, mas o caminho principal
-- vira a importação linha a linha.
--
-- ## Como a importação casa
--
-- O relatório traz, por linha: data, hora, **ID do Wellhub**, visitante,
-- produto, tipo de check-in e valor pago. O ID é o mesmo
-- `clientes.gympass_id` que o webhook grava, então o casamento é por
-- **(gympass_id, data)** — e, quando a pessoa tem mais de um check-in no
-- mesmo dia, por ordem de horário.
--
-- O que não casa não some: fica registrado dos dois lados, porque é
-- exatamente aí que mora o problema a resolver (check-in que a Wellhub
-- pagou e nós não registramos, ou presença nossa que eles não pagaram).
-- ============================================================


-- ------------------------------------------------------------
-- 1. O relatório, como ele veio
-- ------------------------------------------------------------
-- Guardar a linha crua, e não só o efeito dela, é o que permite
-- reimportar, conferir e discutir com a Wellhub meses depois.
create table if not exists public.wellhub_repasse_linhas (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,

  -- Como veio no arquivo
  data date not null,
  hora time,
  gympass_id text not null,
  visitante text,
  produto text,
  tipo_checkin text,
  valor_centavos bigint not null check (valor_centavos >= 0),
  moeda text,

  -- O que casamos
  presenca_id uuid references public.presencas(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  -- 'casada' | 'sem_presenca' (eles pagaram e não temos registro)
  situacao text not null default 'sem_presenca',

  importada_em timestamptz not null default now(),
  importada_por uuid references auth.users(id)
);

comment on table public.wellhub_repasse_linhas is
  'O relatório de repasse do Portal do Parceiro, linha a linha, como veio. É a fonte da verdade do dinheiro Wellhub: a previsão por tarifa é só palpite até isto chegar.';

-- Reimportar a mesma competência não pode duplicar. A chave é o que
-- identifica um check-in no arquivo deles.
create unique index if not exists wellhub_repasse_linha_unica
  on public.wellhub_repasse_linhas (competencia, gympass_id, data, coalesce(hora, '00:00'::time));

create index if not exists wellhub_repasse_por_presenca
  on public.wellhub_repasse_linhas (presenca_id) where presenca_id is not null;

alter table public.wellhub_repasse_linhas enable row level security;

drop policy if exists "gestao ve repasse wellhub" on public.wellhub_repasse_linhas;
create policy "gestao ve repasse wellhub" on public.wellhub_repasse_linhas
  for select to authenticated using (public.is_gestao());

-- Escrita só pela RPC definer abaixo.


-- ------------------------------------------------------------
-- 2. Importar e casar
-- ------------------------------------------------------------
-- Recebe as linhas do relatório como jsonb (a tela monta a partir do que
-- a gestão colar da planilha) e faz três coisas, nesta ordem:
--
--   1. grava as linhas, substituindo uma importação anterior da mesma
--      competência — reimportar é normal, o relatório sai de novo;
--   2. casa cada linha com uma presença nossa e grava o valor REAL na
--      entrada financeira, marcando recebida. Valor zero (visita
--      experimental) cancela a entrada em vez de virar receita de R$ 0;
--   3. devolve o retrato: quanto o relatório pagou, quanto prevíamos, e
--      os dois tipos de sobra — a deles sem a nossa presença e a nossa
--      sem a linha deles.
create or replace function public.importar_repasse_wellhub(
  p_competencia date,
  p_linhas jsonb,
  p_data_caixa date default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ini date := date_trunc('month', p_competencia)::date;
  fim date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  dcaixa date := coalesce(p_data_caixa, (now() at time zone 'America/Sao_Paulo')::date);
  l record;
  pres uuid;
  cli uuid;
  n_casadas integer := 0;
  n_sem_presenca integer := 0;
  total bigint := 0;
  previsto bigint;
  ultima bigint;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito à gestão';
  end if;
  if p_linhas is null or jsonb_array_length(p_linhas) = 0 then
    raise exception 'nenhuma linha para importar';
  end if;

  -- O previsto ANTES de mexer: depois do casamento os valores já são os
  -- reais, e a comparação deixaria de existir.
  select coalesce(sum(valor_centavos), 0) into previsto
  from public.entradas_financeiras
  where categoria = 'wellhub' and status = 'prevista'
    and data_competencia >= ini and data_competencia < fim;

  delete from public.wellhub_repasse_linhas where competencia = ini;

  for l in
    select
      (x->>'data')::date as data,
      nullif(x->>'hora', '')::time as hora,
      btrim(x->>'gympass_id') as gympass_id,
      nullif(btrim(coalesce(x->>'visitante', '')), '') as visitante,
      nullif(btrim(coalesce(x->>'produto', '')), '') as produto,
      nullif(btrim(coalesce(x->>'tipo', '')), '') as tipo,
      round(coalesce((x->>'valor')::numeric, 0) * 100)::bigint as valor_centavos,
      nullif(btrim(coalesce(x->>'moeda', '')), '') as moeda
    from jsonb_array_elements(p_linhas) as x
    order by (x->>'data')::date, nullif(x->>'hora', '')::time
  loop
    pres := null;
    cli := null;

    -- O casamento: mesma pessoa (gympass_id), mesmo dia. Quando há mais
    -- de um check-in no dia, a primeira presença ainda não casada é a
    -- desta linha — por isso o laço vem ordenado por hora.
    select p.id, p.cliente_id into pres, cli
    from public.presencas p
    join public.clientes c on c.id = p.cliente_id
    where c.gympass_id = l.gympass_id
      and p.data_aula = l.data
      and p.canal = 'wellhub'
      and not exists (
        select 1 from public.wellhub_repasse_linhas w
        where w.presenca_id = p.id and w.competencia = ini)
    order by p.criado_em
    limit 1;

    insert into public.wellhub_repasse_linhas
      (competencia, data, hora, gympass_id, visitante, produto, tipo_checkin,
       valor_centavos, moeda, presenca_id, cliente_id, situacao, importada_por)
    values
      (ini, l.data, l.hora, l.gympass_id, l.visitante, l.produto, l.tipo,
       l.valor_centavos, l.moeda, pres, cli,
       case when pres is null then 'sem_presenca' else 'casada' end, auth.uid())
    on conflict do nothing;

    total := total + l.valor_centavos;

    if pres is null then
      n_sem_presenca := n_sem_presenca + 1;
    else
      n_casadas := n_casadas + 1;

      if l.valor_centavos > 0 then
        update public.entradas_financeiras
        set valor_centavos = l.valor_centavos,
            status = 'recebida',
            data_caixa = dcaixa
        where presenca_id = pres and status <> 'cancelada';
      else
        -- Visita experimental: a Wellhub não paga. Cancelar em vez de
        -- deixar entrada de R$ 0,00 sujando o financeiro — é a mesma
        -- regra que `integrar_presenca()` já aplica.
        update public.entradas_financeiras
        set status = 'cancelada'
        where presenca_id = pres and status = 'prevista';
      end if;
    end if;
  end loop;

  -- A previsão se calibra pelo relatório: a tarifa do check-in pago mais
  -- RECENTE é a que vale daqui para frente. É isto que responde "o valor
  -- pode mudar" sem ninguém ter de manter tabela.
  select valor_centavos into ultima
  from public.wellhub_repasse_linhas
  where competencia = ini and valor_centavos > 0
  order by data desc, hora desc nulls last
  limit 1;

  if ultima is not null then
    update public.config_agendamento set valor_checkin_wellhub_centavos = ultima where id;
    -- Planos que ninguém confirmou acompanham; o que a gestão digitou
    -- fica como está.
    update public.wellhub_planos set valor_centavos = ultima where not confirmado;
  end if;

  return jsonb_build_object(
    'competencia', to_char(ini, 'MM/YYYY'),
    'linhas', jsonb_array_length(p_linhas),
    'casadas', n_casadas,
    'sem_presenca', n_sem_presenca,
    'nossas_sem_linha', (
      select count(*) from public.entradas_financeiras e
      where e.categoria = 'wellhub' and e.status = 'prevista'
        and e.data_competencia >= ini and e.data_competencia < fim),
    'total_centavos', total,
    'previsto_centavos', previsto,
    'diferenca_centavos', total - previsto,
    'tarifa_aprendida_centavos', ultima);
end;
$function$;

comment on function public.importar_repasse_wellhub(date, jsonb, date) is
  'Importa o relatório do Portal do Parceiro linha a linha, casa cada check-in com a presença pelo (gympass_id, data) e grava o valor REAL. Reimportar a mesma competência substitui a anterior. Calibra a tarifa prevista pela linha paga mais recente — é o que faz o sistema não depender de ninguém manter preço à mão.';

revoke execute on function public.importar_repasse_wellhub(date, jsonb, date) from public, anon;
grant execute on function public.importar_repasse_wellhub(date, jsonb, date) to authenticated;


-- ------------------------------------------------------------
-- 3. As duas sobras, para a tela mostrar
-- ------------------------------------------------------------
-- Check-in que a Wellhub pagou e que não temos registrado é dinheiro que
-- entrou sem presença — some da chamada da professora e da ocupação.
-- Presença nossa sem linha no relatório é o contrário: alguém treinou e
-- não foi pago. Os dois são conversa com eles, e os dois precisam ter
-- endereço na tela.
create or replace view public.vw_repasse_sem_presenca
with (security_invoker = true) as
select
  w.competencia,
  w.data,
  w.hora,
  w.gympass_id,
  w.visitante,
  w.produto,
  w.tipo_checkin,
  w.valor_centavos,
  (select c.id from public.clientes c where c.gympass_id = w.gympass_id) as cliente_conhecido
from public.wellhub_repasse_linhas w
where w.situacao = 'sem_presenca'
order by w.data, w.hora;

grant select on public.vw_repasse_sem_presenca to authenticated;

comment on view public.vw_repasse_sem_presenca is
  'Check-ins que o relatório da Wellhub pagou e que não têm presença nossa. Cada linha é um aluno que entrou sem o sistema registrar — a professora não viu na chamada e a ocupação da turma ficou errada.';
