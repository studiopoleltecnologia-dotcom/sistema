-- ============================================================
-- Mensalidade por Turma Fixa (regulamento v3, itens 1.3, 2.3, 3.10-3.14,
-- 4.3, 4.4, 4.8, 4.9, 4.12, 6.3-6.6, 11.1)
--
-- O catálogo até aqui sabia vender uma coisa só: crédito. Todo produto
-- entrega N créditos por ciclo e o aluno gasta onde quiser. O formato
-- novo inverte a lógica: o aluno NÃO recebe crédito nenhum, e em troca
-- uma vaga de UMA turma específica da grade passa a ser dele enquanto
-- ele pagar. Não é um plano de "1 crédito por semana" — é assinatura de
-- assento.
--
-- Duas consequências que decidem a modelagem inteira:
--
--   1. O vínculo é com a TURMA, não com a modalidade. "Calistenia" não
--      identifica nada: existem 3 turmas de Calistenia na semana e
--      contratar uma não dá acesso às outras (2.3.4). Por isso o vínculo
--      aponta para `turmas.id`, que já carrega modalidade + professora +
--      dia + horário. Mudar de dia ou de horário é troca de turma, mesmo
--      na mesma modalidade (6.6) — e isso sai de graça quando a chave é
--      a turma.
--
--   2. A vaga sai da capacidade ANTES de qualquer reserva. Turma de 10
--      com 4 matrículas fixas oferece 6 vagas para crédito, avulsa,
--      Wellhub e TotalPass (4.4). Isso não pode ser cálculo de tela: é o
--      mesmo `validar_vaga_agendamento()` que já protege a capacidade
--      hoje que precisa enxergar o assento fixo, senão a Booking API do
--      Wellhub vende a vaga de alguém que já pagou por ela.
--
-- O QUE NÃO MUDOU, DE PROPÓSITO:
--
--   · `matriculas` continua sendo a mesma tabela. Turma fixa é uma
--     assinatura como qualquer outra — tem ciclo, preço congelado,
--     renovação automática, inadimplência e cancelamento no fim do
--     ciclo. Criar `matriculas_turma_fixa` duplicaria `renovar_ciclo`,
--     `cobrar_ciclo`, `processar_assinaturas` e o cron inteiro.
--   · `renovar_ciclo()` e `matricular()` já tratam `gera_credito=false`
--     sem criar lote (etapa 4). A turma fixa renova e cobra sem uma
--     linha nova ali.
--   · A penalidade de suspensão por faltas (4.12) já NÃO alcança a
--     turma fixa: `avaliar_faltas()` desiste quando a presença não tem
--     agendamento, e aluno de turma fixa nunca agenda. É por construção,
--     não por `if`.
--
-- O DISCRIMINADOR É UM ATRIBUTO, NÃO UM TIPO. `produtos.turmas_fixas`
-- responde "quantos assentos esta assinatura reserva": 0 = produto de
-- crédito/serviço (tudo que existe hoje), 1 ou 2 = turma fixa. Um campo
-- só carrega o comportamento E o limite do item 10 do pedido ("impedir
-- selecionar mais turmas do que o produto permite"). Um enum
-- `product_type` ao lado de `tipo_produto` seria a segunda fonte de
-- verdade que a etapa 3 tomou o cuidado de não criar.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Produto: quantos assentos a assinatura reserva
-- ------------------------------------------------------------
alter table public.produtos
  add column if not exists turmas_fixas integer not null default 0
    check (turmas_fixas >= 0);

comment on column public.produtos.turmas_fixas is
  '0 = produto por credito ou servico avulso. 1 ou 2 = Mensalidade por Turma Fixa: '
  'quantas turmas da grade a matricula reserva. E o unico campo que discrimina o '
  'formato — nao existe enum de tipo de plano.';

-- Regulamento 2.3.7 e 3.11: turma fixa NAO gera saldo de credito. As
-- duas coisas juntas seriam um plano hibrido que ninguem vende e que
-- deixaria `agendar_aula` sem saber qual regra aplicar.
alter table public.produtos drop constraint if exists produtos_turma_fixa_sem_credito;
alter table public.produtos add constraint produtos_turma_fixa_sem_credito check (
  turmas_fixas = 0 or (not gera_credito and creditos_por_ciclo = 0)
);


-- ------------------------------------------------------------
-- 2. Elegibilidade da modalidade (regulamento 2.3.6)
--
-- "Nao esta disponivel para Pole Dance e suas variacoes, incluindo
-- Heels, Spin, Power, Bases e demais modalidades derivadas, nem para
-- Flexibilidade."
--
-- Flag por MODALIDADE e nao por categoria: a grade real tem "Bases de
-- Salto" na categoria Danca e "Flexibilidade" em Condicionamento, ou
-- seja, `categoria = 'Pole'` deixaria as duas passarem. E flag editavel
-- e nao lista no codigo porque o regulamento fala em "demais
-- modalidades derivadas" — modalidade nova de Pole nasce toda semana e
-- ninguem vai abrir PR para marcar uma.
-- ------------------------------------------------------------
alter table public.modalidades
  add column if not exists elegivel_turma_fixa boolean not null default true;

comment on column public.modalidades.elegivel_turma_fixa is
  'Regulamento 2.3.6. false = nao pode ser contratada como Mensalidade por Turma '
  'Fixa. Quem aplica e matricular_turma_fixa()/adicionar_turma_fixa(), no banco — '
  'a tela so esconde o que o banco ja recusaria.';

-- Semeadura inicial. `where elegivel_turma_fixa` evita reverter uma
-- decisao que a equipe tenha tomado depois pela tela.
update public.modalidades m
set elegivel_turma_fixa = false
where m.elegivel_turma_fixa
  and (
    -- Pole e todas as derivadas, pelo nome (a categoria nao basta).
    m.nome ilike '%pole%'
    or m.nome ilike '%heels%'
    or m.nome ilike '%spin%'
    or m.nome ilike '%power%'
    or m.nome ilike '%bases%'
    or m.nome ilike '%flexibilidade%'
    -- Treino Livre nao e aula: e uso de sala sem professora, com preco
    -- proprio (regulamento 8) e fora da cobertura de plano (3.8).
    -- Assinar assento nele contradiz os dois itens.
    or m.nome ilike '%treino livre%'
    -- Rede de seguranca: qualquer modalidade da categoria Pole que o
    -- nome nao pegue.
    or exists (
      select 1 from public.categorias_modalidade c
      where c.id = m.categoria_id and c.nome ilike 'pole%'
    )
  );


-- ------------------------------------------------------------
-- 3. O vinculo: matricula -> turma, com historia
--
-- Tabela e nao coluna em `matriculas` porque o plano de 2 turmas
-- existe (2.3.5) e porque a troca precisa de historico: a equipe tem
-- que conseguir responder "em que turma essa pessoa estava em marco".
-- `fim` no lugar de delete e o que preserva isso.
--
-- `inicio` no futuro e a peca que faz a regra 6.5 funcionar sem cron:
-- "a troca passa a valer a partir da proxima renovacao" vira um vinculo
-- novo com `inicio = data_fim + 1`. Como a contagem de vaga e sempre
-- avaliada NA DATA DA AULA, o assento velho segura ate a virada e o
-- novo ja segura dali em diante, sozinho.
-- ------------------------------------------------------------
create table if not exists public.matricula_turmas (
  id            uuid primary key default gen_random_uuid(),
  matricula_id  uuid not null references public.matriculas (id) on delete cascade,
  turma_id      uuid not null references public.turmas (id),
  inicio        date not null default current_date,
  -- null = vigente por prazo indeterminado (enquanto a matricula viver)
  fim           date,
  motivo_saida  text,
  criada_em     timestamptz not null default now(),
  criada_por    uuid,
  check (fim is null or fim >= inicio)
);

comment on table public.matricula_turmas is
  'Assento reservado: qual turma da grade pertence a esta matricula, e desde/ate '
  'quando. Uma linha por turma contratada (o plano de 2 turmas tem duas). Trocar '
  'de turma NAO edita a linha — fecha a antiga com `fim` e abre outra, senao o '
  'historico de "onde essa pessoa treinava" se perde.';

comment on column public.matricula_turmas.inicio is
  'Pode ser futuro: e assim que a troca "a partir da proxima renovacao" (6.5) fica '
  'agendada sem cron nenhum.';

-- Mesma turma, duas vezes, ao mesmo tempo, na mesma matricula: nao.
-- Depois de encerrado o vinculo, voltar para a mesma turma pode.
create unique index if not exists matricula_turmas_vigente_unica
  on public.matricula_turmas (matricula_id, turma_id)
  where fim is null;

create index if not exists matricula_turmas_turma_idx
  on public.matricula_turmas (turma_id, inicio, fim);

create index if not exists matricula_turmas_matricula_idx
  on public.matricula_turmas (matricula_id);

alter table public.matricula_turmas enable row level security;

-- Operacao (gestao + secretaria) enxerga: a secretaria precisa saber
-- quem tem assento em qual turma para atender no balcao, e a tabela nao
-- tem nenhuma coluna monetaria.
drop policy if exists "operacao ve matricula_turmas" on public.matricula_turmas;
create policy "operacao ve matricula_turmas" on public.matricula_turmas
  for select to authenticated using (public.is_operacional());

-- Escrita so pelas RPCs (SECURITY DEFINER). Um insert direto pularia a
-- checagem de vaga e de elegibilidade, que sao o ponto da tabela.
drop policy if exists "gestao gerencia matricula_turmas" on public.matricula_turmas;
create policy "gestao gerencia matricula_turmas" on public.matricula_turmas
  for all to authenticated using (public.is_gestao()) with check (public.is_gestao());

-- O aluno ve o proprio assento no portal.
drop policy if exists "cliente ve as proprias turmas fixas" on public.matricula_turmas;
create policy "cliente ve as proprias turmas fixas" on public.matricula_turmas
  for select to authenticated using (
    exists (
      select 1 from public.matriculas m
      where m.id = matricula_turmas.matricula_id
        and m.cliente_id = public.cliente_atual()
    )
  );

-- A professora ve quem tem assento nas turmas dela (entra na chamada,
-- ver vw_alunas_da_aula mais abaixo).
drop policy if exists "professora ve assentos das proprias turmas" on public.matricula_turmas;
create policy "professora ve assentos das proprias turmas" on public.matricula_turmas
  for select to authenticated using (
    exists (
      select 1 from public.turmas t
      where t.id = matricula_turmas.turma_id
        and t.professora_id = public.professora_atual()
    )
  );


-- ------------------------------------------------------------
-- 4. Quantos assentos fixos uma turma tem ocupados numa data
--
-- Uma funcao so, usada por TODOS os lugares que contam vaga. Repetir
-- este predicado em quatro consultas seria a forma garantida de as
-- quatro divergirem no primeiro ajuste.
--
-- `status <> 'cancelada'`: inadimplente MANTEM o assento. A vaga foi
-- contratada por mes (4.12); liberar por atraso de pagamento faria o
-- estudio vender o lugar de quem depois regulariza e nao teria mais
-- onde treinar. Quem cobra e o Financeiro, nao a capacidade da sala.
-- ------------------------------------------------------------
create or replace function public.assentos_fixos_ocupados(p_turma uuid, p_data date)
returns integer
language sql stable security definer set search_path = ''
as $fn$
  select count(*)::integer
  from public.matricula_turmas mt
  join public.matriculas m on m.id = mt.matricula_id
  where mt.turma_id = p_turma
    and mt.inicio <= p_data
    and (mt.fim is null or mt.fim >= p_data)
    and m.status <> 'cancelada'
    and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em >= p_data);
$fn$;

comment on function public.assentos_fixos_ocupados(uuid, date) is
  'Vagas que ja pertencem a alunos de Mensalidade por Turma Fixa nesta turma, '
  'NESTA DATA. Avaliar na data da aula (e nao em current_date) e o que faz a '
  'troca agendada para a proxima renovacao funcionar: o assento velho conta ate '
  'a virada, o novo conta a partir dela.';

-- Quem tem assento fixo nesta turma nesta data (usado para nao cobrar
-- credito de quem ja pagou pelo lugar, e para montar a chamada).
create or replace function public.tem_assento_fixo(p_cliente uuid, p_turma uuid, p_data date)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select exists (
    select 1
    from public.matricula_turmas mt
    join public.matriculas m on m.id = mt.matricula_id
    where mt.turma_id = p_turma
      and m.cliente_id = p_cliente
      and mt.inicio <= p_data
      and (mt.fim is null or mt.fim >= p_data)
      and m.status <> 'cancelada'
      and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em >= p_data)
  );
$fn$;


-- ------------------------------------------------------------
-- 5. CAPACIDADE — o ponto que nao pode falhar
--
-- Regulamento 4.3/4.4: o assento fixo sai da capacidade antes de
-- qualquer reserva. Sem esta mudanca, uma turma de 10 com 4 assinaturas
-- fixas continuaria aceitando 10 reservas e a aula teria 14 pessoas.
--
-- Reescrita fiel de 20260721140000 com UM termo somado — a logica da
-- lista de espera fica exatamente como estava.
-- ------------------------------------------------------------
create or replace function public.validar_vaga_agendamento()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  t record;
  ocupadas integer;
  reservadas integer;
  fixas integer;
begin
  select * into t from public.turmas where id = new.turma_id for update;
  if not found then
    raise exception 'turma inexistente';
  end if;

  select count(*) into ocupadas
  from public.agendamentos
  where turma_id = new.turma_id and data = new.data and status = 'agendado';

  -- Vagas seguradas para OUTRAS alunas da fila, ainda dentro do prazo.
  select count(*) into reservadas
  from public.lista_espera le
  cross join public.config_agendamento cfg
  where le.turma_id = new.turma_id
    and le.data = new.data
    and le.status = 'notificada'
    and le.cliente_id <> new.cliente_id
    and le.notificada_em > now() - make_interval(mins => cfg.minutos_reserva_espera);

  -- Assentos de Mensalidade por Turma Fixa. O proprio aluno de assento
  -- fixo nao entra na conta dele mesmo: se por algum motivo a equipe
  -- registrar uma reserva para ele nesta turma, ele ocuparia duas vagas.
  fixas := public.assentos_fixos_ocupados(new.turma_id, new.data)
           - case when public.tem_assento_fixo(new.cliente_id, new.turma_id, new.data)
                  then 1 else 0 end;

  if ocupadas + reservadas + fixas >= t.capacidade then
    raise exception 'turma lotada (% vagas, % reservada(s) por mensalidade de turma fixa)',
      t.capacidade, public.assentos_fixos_ocupados(new.turma_id, new.data);
  end if;

  return new;
end;
$fn$;


-- ------------------------------------------------------------
-- 6. vw_vagas_turma — a ocupacao que o Portal do Aluno le
--
-- Contrato de colunas identico (turma_id, data, ocupadas): o portal e
-- os tipos gerados continuam funcionando sem tocar em nada.
--
-- A horizonte de 60 dias existe porque assento fixo nao tem data — ele
-- vale para TODA ocorrencia da turma. Sem um limite a view geraria
-- linhas ate o fim dos tempos. 60 cobre com folga a maior janela de
-- agendamento do regulamento (21 dias no semestral, 2.4).
-- ------------------------------------------------------------
drop view if exists public.vw_vagas_turma;
create view public.vw_vagas_turma as
with dias as (
  select generate_series(current_date, current_date + 60, interval '1 day')::date as dia
),
reservas as (
  select turma_id, data, count(*) as n
  from public.agendamentos
  where status = 'agendado'
  group by turma_id, data
),
fixas as (
  select t.id as turma_id, d.dia as data, count(*) as n
  from public.turmas t
  join dias d on extract(dow from d.dia)::int = t.dia_semana
  join public.matricula_turmas mt
    on mt.turma_id = t.id
   and mt.inicio <= d.dia
   and (mt.fim is null or mt.fim >= d.dia)
  join public.matriculas m
    on m.id = mt.matricula_id
   and m.status <> 'cancelada'
   and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em >= d.dia)
  where t.ativa
  group by t.id, d.dia
)
select
  coalesce(r.turma_id, f.turma_id) as turma_id,
  coalesce(r.data, f.data)         as data,
  coalesce(r.n, 0) + coalesce(f.n, 0) as ocupadas
from reservas r
full join fixas f on f.turma_id = r.turma_id and f.data = r.data;

grant select on public.vw_vagas_turma to authenticated;

comment on view public.vw_vagas_turma is
  'SECURITY DEFINER deliberado (Advisor: security_definer_view ACEITO, nao e bug) — '
  'agregado sem identidade de aluno, aberto a qualquer authenticated de proposito. '
  'Sob security_invoker=true a policy "cliente ve os proprios agendamentos" '
  'restringiria o count as linhas do proprio aluno e turma cheia apareceria como '
  'vaga livre. Desde 08/09/2026 soma os assentos de Mensalidade por Turma Fixa '
  '(regulamento 4.4): sem isso o portal ofereceria a vaga de quem ja pagou por ela. '
  'Assento fixo nao tem data propria, entao o ramo `fixas` projeta 60 dias a frente — '
  'folga sobre a maior janela de agendamento (21 dias).';


-- ------------------------------------------------------------
-- 7. fn_ocupacao_turma — a ocupacao que a Grade e as Analises leem
--
-- Mesma assinatura e mesmas colunas de saida: vw_ocupacao_turma,
-- vw_ocupacao_turma_tendencia e a grade semanal nao mudam.
-- `reservas` passa a incluir assento fixo porque a pergunta que a
-- coluna responde e "quantos lugares desta turma estao tomados" — uma
-- turma lotada por assinatura fixa aparecia como 0% de ocupacao.
-- ------------------------------------------------------------
create or replace function public.fn_ocupacao_turma(p_inicio date, p_fim date)
returns table (
  turma_id uuid,
  modalidade text,
  modalidade_id uuid,
  professora_id uuid,
  dia_semana integer,
  horario time,
  capacidade integer,
  ocorrencias int,
  reservas int,
  ocupacao_pct int
)
language sql
stable
set search_path = ''
as $fn$
  with janela as (
    select generate_series(p_inicio, p_fim - 1, interval '1 day')::date as dia
  ),
  ocorrencias as (
    select t.id as turma_id, count(*)::int as n_ocorrencias
    from public.turmas t
    join janela j on extract(dow from j.dia)::int = t.dia_semana
    where t.ativa
    group by t.id
  ),
  reservas as (
    select a.turma_id, count(*)::int as n_reservas
    from public.agendamentos a
    where a.status = 'agendado'
      and a.data >= p_inicio
      and a.data < p_fim
    group by a.turma_id
  ),
  -- Um assento fixo conta uma vez por ocorrencia da turma na janela:
  -- quem assina a segunda-feira ocupa aquele lugar em toda segunda do
  -- periodo, sem nunca aparecer em `agendamentos`.
  fixas as (
    select t.id as turma_id, count(*)::int as n_fixas
    from public.turmas t
    join janela j on extract(dow from j.dia)::int = t.dia_semana
    join public.matricula_turmas mt
      on mt.turma_id = t.id
     and mt.inicio <= j.dia
     and (mt.fim is null or mt.fim >= j.dia)
    join public.matriculas m
      on m.id = mt.matricula_id
     and m.status <> 'cancelada'
     and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em >= j.dia)
    where t.ativa
    group by t.id
  )
  select
    t.id,
    t.modalidade,
    t.modalidade_id,
    t.professora_id,
    t.dia_semana,
    t.horario,
    t.capacidade,
    coalesce(o.n_ocorrencias, 0),
    coalesce(r.n_reservas, 0) + coalesce(f.n_fixas, 0),
    case
      when coalesce(o.n_ocorrencias, 0) * t.capacidade > 0
      then round(100.0 * (coalesce(r.n_reservas, 0) + coalesce(f.n_fixas, 0))
                 / (o.n_ocorrencias * t.capacidade))::int
      else 0
    end
  from public.turmas t
  left join ocorrencias o on o.turma_id = t.id
  left join reservas r on r.turma_id = t.id
  left join fixas f on f.turma_id = t.id
  where t.ativa;
$fn$;

comment on function public.fn_ocupacao_turma(date, date) is
  'Ocupacao por turma num periodo [inicio, fim) qualquer. Base de vw_ocupacao_turma '
  'e das analises de tendencia. Desde 08/09/2026 `reservas` soma os assentos de '
  'Mensalidade por Turma Fixa, que ocupam lugar sem gerar linha em agendamentos.';

revoke execute on function public.fn_ocupacao_turma(date, date) from public, anon;
grant execute on function public.fn_ocupacao_turma(date, date) to authenticated;


-- ------------------------------------------------------------
-- 8. vw_alunas_da_aula — o aluno de turma fixa precisa estar na chamada
--
-- Sem este terceiro ramo, a professora abriria a aula de Calistenia de
-- segunda e nao veria as 4 pessoas que assinaram aquele horario: elas
-- nao tem agendamento e so viram `presenca` DEPOIS de marcadas. Ela
-- teria que incluir uma a uma, toda semana, pela busca.
--
-- E a mesma view SECURITY DEFINER de sempre — o recorte de quem-ve-
-- o-que continua no WHERE de cada ramo.
-- ------------------------------------------------------------
drop view if exists public.vw_alunas_da_aula;
create view public.vw_alunas_da_aula as
-- 1) quem reservou
select
  a.turma_id,
  a.data,
  c.id as cliente_id,
  c.nome as aluna,
  a.canal,
  a.id as agendamento_id,
  pr.presente,
  false as turma_fixa
from public.agendamentos a
join public.turmas t on t.id = a.turma_id
join public.clientes c on c.id = a.cliente_id
left join public.presencas pr
  on pr.turma_id = a.turma_id
 and pr.data_aula = a.data
 and pr.cliente_id = a.cliente_id
where a.status = 'agendado'
  and (public.is_socia() or t.professora_id = public.professora_atual())

union all

-- 2) quem chegou sem reservar e ja foi marcada (regra 9.6)
select
  pr.turma_id,
  pr.data_aula as data,
  c.id as cliente_id,
  c.nome as aluna,
  pr.canal,
  null::uuid as agendamento_id,
  pr.presente,
  public.tem_assento_fixo(pr.cliente_id, pr.turma_id, pr.data_aula) as turma_fixa
from public.presencas pr
join public.turmas t on t.id = pr.turma_id
join public.clientes c on c.id = pr.cliente_id
where pr.agendamento_id is null
  and not exists (
    select 1 from public.agendamentos a
    where a.turma_id = pr.turma_id and a.data = pr.data_aula
      and a.cliente_id = pr.cliente_id and a.status = 'agendado'
  )
  and (public.is_socia() or t.professora_id = public.professora_atual())

union all

-- 3) quem tem assento fixo e ainda nao foi marcada nesta data
select
  mt.turma_id,
  d.dia as data,
  c.id as cliente_id,
  c.nome as aluna,
  'mensalista'::public.canal_aula as canal,
  null::uuid as agendamento_id,
  null::boolean as presente,
  true as turma_fixa
from public.matricula_turmas mt
join public.matriculas m
  on m.id = mt.matricula_id
 and m.status <> 'cancelada'
join public.clientes c on c.id = m.cliente_id
join public.turmas t on t.id = mt.turma_id and t.ativa
-- A chamada e sempre de UM dia: a janela curta em volta de hoje cobre
-- a aula de hoje, a de ontem que a professora esqueceu de fechar e a
-- de amanha que ela quer conferir antes.
cross join lateral (
  select generate_series(current_date - 7, current_date + 7, interval '1 day')::date as dia
) d
where extract(dow from d.dia)::int = t.dia_semana
  and mt.inicio <= d.dia
  and (mt.fim is null or mt.fim >= d.dia)
  and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em >= d.dia)
  and not exists (
    select 1 from public.presencas pr
    where pr.turma_id = mt.turma_id and pr.data_aula = d.dia and pr.cliente_id = m.cliente_id
  )
  and not exists (
    select 1 from public.agendamentos a
    where a.turma_id = mt.turma_id and a.data = d.dia
      and a.cliente_id = m.cliente_id and a.status = 'agendado'
  )
  and (public.is_socia() or t.professora_id = public.professora_atual());

grant select on public.vw_alunas_da_aula to authenticated;

comment on view public.vw_alunas_da_aula is
  'SECURITY DEFINER deliberado (Advisor: security_definer_view ACEITO, nao e bug), '
  'documentado desde 20260721110000 (CLAUDE.md §9.6): por nao passar por RLS, o '
  'recorte de quem-ve-o-que esta no WHERE (is_socia() or professora_atual()), '
  'aplicado nos TRES ramos. clientes nao tem policy de select para is_professora(); '
  'sob security_invoker=true a chamada ficaria vazia. Terceiro ramo (08/09/2026): '
  'aluno de Mensalidade por Turma Fixa nao agenda, entao so apareceria na lista '
  'depois de marcado — a professora teria que inclui-lo na mao toda semana. '
  'Projetado em ±7 dias porque assento fixo nao tem data propria.';


-- ------------------------------------------------------------
-- 9. matricular() — recusa produto de turma fixa
--
-- Sem esta guarda, matricular() criaria a assinatura sem nenhum assento
-- e o aluno ficaria pagando por uma vaga que nao existe em lugar
-- nenhum. Produto de turma fixa entra por matricular_turma_fixa(), que
-- exige as turmas no mesmo ato.
-- ------------------------------------------------------------
create or replace function public.matricular(p_cliente uuid, p_plano uuid)
returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  pr record;
begin
  select turmas_fixas, nome into pr from public.produtos where id = p_plano;
  if found and coalesce(pr.turmas_fixas, 0) > 0 then
    raise exception
      '% é uma Mensalidade por Turma Fixa: a matrícula precisa escolher a(s) turma(s) da grade',
      pr.nome;
  end if;
  return public.matricular_produto(p_cliente, p_plano);
end; $fn$;

-- O corpo antigo de matricular() vira matricular_produto(): a mecanica
-- de assinatura e a mesma para os dois formatos e nao pode ser copiada.
create or replace function public.matricular_produto(p_cliente uuid, p_plano uuid)
returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  pr record;
  m_id uuid;
  lote uuid;
  autor uuid;
  eh_cliente boolean;
  fim date;
  validade date;
  ja_tem integer;
begin
  eh_cliente := public.is_cliente();

  if auth.uid() is not null then
    if eh_cliente then
      if p_cliente <> public.cliente_atual() then
        raise exception 'aluno só pode contratar para si mesmo';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito à equipe ou ao próprio aluno';
    end if;
  end if;

  autor := case when public.is_socia() then auth.uid() end;

  select * into pr from public.produtos where id = p_plano and ativo;
  if not found then
    raise exception 'produto inexistente ou inativo';
  end if;

  -- A trava que a RLS não consegue dar aqui (SECURITY DEFINER).
  -- Mensagem deliberadamente igual à de produto inexistente: dizer
  -- "este é oculto" confirmaria a existência dele para quem tentou.
  if eh_cliente and not pr.visivel_no_catalogo then
    raise exception 'produto inexistente ou inativo';
  end if;

  if pr.limite_por_cliente is not null then
    select count(*) into ja_tem from public.matriculas
    where cliente_id = p_cliente and plano_id = p_plano
      and status <> 'cancelada';
    if ja_tem >= pr.limite_por_cliente then
      raise exception 'limite de % contratação(ões) deste produto por cliente já atingido',
        pr.limite_por_cliente;
    end if;
  end if;

  fim := current_date + pr.periodicidade_dias;

  insert into public.matriculas
    (cliente_id, plano_id, data_inicio, data_fim, creditos_total,
     ciclos_compromisso, ciclo_atual,
     preco_contratado_centavos, renova_automaticamente)
  values
    (p_cliente, p_plano, current_date, fim,
     pr.creditos_por_ciclo, pr.ciclos_compromisso, 1,
     pr.preco_centavos, coalesce(pr.renova_automaticamente, false))
  returning id into m_id;

  if pr.gera_credito and pr.creditos_por_ciclo > 0 then
    validade := current_date + coalesce(pr.validade_creditos_dias, pr.periodicidade_dias);

    insert into public.creditos_lotes
      (matricula_id, ciclo, quantidade, validade, origem, detalhe)
    values (m_id, 1, pr.creditos_por_ciclo, validade, 'compra',
            pr.nome || ' — ciclo 1')
    returning id into lote;

    insert into public.creditos_eventos
      (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
    values (m_id, lote, pr.creditos_por_ciclo, 'compra',
            pr.nome || ' — ciclo 1', autor);
  end if;

  perform public.cobrar_ciclo(m_id, 1, current_date);

  return m_id;
end; $fn$;


-- ------------------------------------------------------------
-- 10. Validacao de um assento — usada na contratacao e na troca
-- ------------------------------------------------------------
create or replace function public.validar_assento_fixo(p_turma uuid, p_data date)
returns void
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  t record;
  mod record;
  ocupadas integer;
begin
  select * into t from public.turmas where id = p_turma;
  if not found or not t.ativa then
    raise exception 'turma inexistente ou inativa';
  end if;

  -- Elegibilidade (2.3.6). Turma sem modalidade_id e turma antiga do
  -- esboco da grade; recusar e melhor que deixar passar um Pole sem
  -- vinculo de modalidade.
  if t.modalidade_id is null then
    raise exception
      'a turma % não tem modalidade cadastrada — não dá para saber se aceita turma fixa',
      t.modalidade;
  end if;

  select * into mod from public.modalidades where id = t.modalidade_id;
  if not coalesce(mod.elegivel_turma_fixa, false) then
    raise exception
      '% não aceita Mensalidade por Turma Fixa (regulamento 2.3.6)', mod.nome;
  end if;

  -- Vaga (2.3.3 + 6.3/6.5 "sujeita a existencia de vaga"). Conta na
  -- proxima ocorrencia da turma, que e quando o assento comeca a valer.
  ocupadas := public.assentos_fixos_ocupados(p_turma, p_data)
            + (select count(*) from public.agendamentos a
               where a.turma_id = p_turma and a.status = 'agendado' and a.data >= p_data
                 and extract(dow from a.data)::int = t.dia_semana
                 and a.data < p_data + 7);

  if ocupadas >= t.capacidade then
    raise exception
      'a turma % (%h) está sem vaga: % de % lugares ocupados',
      t.modalidade, to_char(t.horario, 'HH24:MI'), ocupadas, t.capacidade;
  end if;
end; $fn$;

comment on function public.validar_assento_fixo(uuid, date) is
  'Recusa turma inexistente, modalidade nao elegivel (2.3.6) e turma sem vaga. '
  'A contagem soma assento fixo + reservas ja feitas para a proxima ocorrencia: '
  'assinar um assento tira a vaga de quem reservou por credito, entao a reserva '
  'existente e um impedimento real, nao um detalhe.';


-- ------------------------------------------------------------
-- 11. Contratar uma Mensalidade por Turma Fixa
--
-- Assinatura + assentos num ato so. Separar em "matricula agora,
-- turmas depois" deixaria a janela em que o aluno paga e nao tem lugar.
-- ------------------------------------------------------------
create or replace function public.matricular_turma_fixa(
  p_cliente uuid, p_produto uuid, p_turmas uuid[]
) returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare
  pr record;
  m_id uuid;
  t uuid;
  n integer;
  distintas uuid[];
begin
  if auth.uid() is not null and not public.is_socia() then
    -- Turma fixa nao e autocompra: o assento sai da capacidade da sala
    -- e a escolha da turma passa pela equipe (regulamento 2.3.1).
    raise exception 'acesso restrito à equipe';
  end if;

  select * into pr from public.produtos where id = p_produto and ativo;
  if not found then
    raise exception 'produto inexistente ou inativo';
  end if;
  if coalesce(pr.turmas_fixas, 0) = 0 then
    raise exception '% não é uma Mensalidade por Turma Fixa', pr.nome;
  end if;

  -- Distintas: array com a mesma turma duas vezes viraria uma linha so
  -- pelo indice unico e o aluno pagaria por 2 assentos tendo 1.
  select count(distinct x) into n from unnest(p_turmas) as x;
  if n <> pr.turmas_fixas then
    raise exception '% exige % turma(s) distinta(s); vieram %',
      pr.nome, pr.turmas_fixas, n;
  end if;

  foreach t in array p_turmas loop
    perform public.validar_assento_fixo(t, current_date);
  end loop;

  select array_agg(distinct x) into distintas from unnest(p_turmas) as x;

  m_id := public.matricular_produto(p_cliente, p_produto);

  foreach t in array distintas loop
    insert into public.matricula_turmas (matricula_id, turma_id, inicio, criada_por)
    values (m_id, t, current_date, auth.uid());
  end loop;

  return m_id;
end; $fn$;


-- ------------------------------------------------------------
-- 12. Incluir a segunda turma (regulamento 6.3 — vale na hora)
-- ------------------------------------------------------------
create or replace function public.adicionar_turma_fixa(p_matricula uuid, p_turma uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare
  m record;
  pr record;
  vigentes integer;
  novo uuid;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito à equipe';
  end if;

  select * into m from public.matriculas where id = p_matricula for update;
  if not found then raise exception 'matrícula inexistente'; end if;
  if m.status = 'cancelada' then raise exception 'matrícula cancelada'; end if;

  select * into pr from public.produtos where id = m.plano_id;
  if coalesce(pr.turmas_fixas, 0) = 0 then
    raise exception 'esta matrícula não é de Mensalidade por Turma Fixa';
  end if;

  select count(*) into vigentes from public.matricula_turmas
  where matricula_id = p_matricula and fim is null;

  if vigentes >= pr.turmas_fixas then
    raise exception
      '% permite % turma(s) fixa(s) e a matrícula já tem % — troque uma turma ou mude de plano',
      pr.nome, pr.turmas_fixas, vigentes;
  end if;

  perform public.validar_assento_fixo(p_turma, current_date);

  insert into public.matricula_turmas (matricula_id, turma_id, inicio, criada_por)
  values (p_matricula, p_turma, current_date, auth.uid())
  returning id into novo;

  return novo;
end; $fn$;

comment on function public.adicionar_turma_fixa(uuid, uuid) is
  'Regulamento 6.3: a inclusao da segunda turma vale imediatamente. A cobranca da '
  'diferenca proporcional e do plano — trocar o produto da matricula e operacao '
  'do Financeiro, nao desta funcao.';


-- ------------------------------------------------------------
-- 13. Encerrar um assento (6.4 — vale na proxima renovacao)
-- ------------------------------------------------------------
create or replace function public.encerrar_turma_fixa(
  p_vinculo uuid, p_imediato boolean default false, p_motivo text default null
) returns date
language plpgsql security definer set search_path = ''
as $fn$
declare
  v record;
  m record;
  data_fim date;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito à equipe';
  end if;

  select * into v from public.matricula_turmas where id = p_vinculo for update;
  if not found then raise exception 'vínculo inexistente'; end if;
  if v.fim is not null then raise exception 'este vínculo já foi encerrado em %', v.fim; end if;

  select * into m from public.matriculas where id = v.matricula_id;

  -- Padrao e o fim do ciclo pago: o aluno pagou por aquele assento ate
  -- la (6.4/7.2). `p_imediato` existe para o caso de a turma acabar ou
  -- de erro de cadastro, e e escolha consciente de quem clica.
  data_fim := case when p_imediato then current_date else greatest(m.data_fim, current_date) end;

  update public.matricula_turmas
  set fim = data_fim,
      motivo_saida = coalesce(p_motivo, motivo_saida)
  where id = p_vinculo;

  return data_fim;
end; $fn$;


-- ------------------------------------------------------------
-- 14. Trocar de turma (6.5/6.6 — vale na proxima renovacao)
--
-- Fecha o assento velho no fim do ciclo e abre o novo no dia seguinte.
-- Nao ha janela sem lugar e nao ha dia com dois lugares: a contagem de
-- vaga e por data, entao cada dia tem exatamente um assento valendo.
-- ------------------------------------------------------------
create or replace function public.trocar_turma_fixa(
  p_vinculo uuid, p_turma_nova uuid, p_imediato boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare
  v record;
  m record;
  fim_velho date;
  inicio_novo date;
  novo uuid;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito à equipe';
  end if;

  select * into v from public.matricula_turmas where id = p_vinculo for update;
  if not found then raise exception 'vínculo inexistente'; end if;
  if v.fim is not null then raise exception 'este vínculo já foi encerrado em %', v.fim; end if;
  if v.turma_id = p_turma_nova then raise exception 'a turma nova é a mesma da atual'; end if;

  select * into m from public.matriculas where id = v.matricula_id;
  if m.status = 'cancelada' then raise exception 'matrícula cancelada'; end if;

  fim_velho   := case when p_imediato then current_date else greatest(m.data_fim, current_date) end;
  inicio_novo := fim_velho + 1;

  -- Valida a vaga JA NA DATA em que o assento novo comeca — e nao hoje.
  -- Trocar para uma turma que hoje esta cheia mas vaga na virada e
  -- legitimo; o inverso, nao.
  perform public.validar_assento_fixo(p_turma_nova, inicio_novo);

  update public.matricula_turmas
  set fim = fim_velho,
      motivo_saida = coalesce(motivo_saida, 'troca de turma')
  where id = p_vinculo;

  insert into public.matricula_turmas (matricula_id, turma_id, inicio, criada_por)
  values (v.matricula_id, p_turma_nova, inicio_novo, auth.uid())
  returning id into novo;

  return novo;
end; $fn$;

comment on function public.trocar_turma_fixa(uuid, uuid, boolean) is
  'Regulamento 6.5/6.6: a troca vale a partir da proxima renovacao, e mudar dia ou '
  'horario JA E troca de turma mesmo na mesma modalidade — o que sai de graca por o '
  'vinculo apontar para turmas.id. O assento novo nasce com inicio no futuro; a '
  'contagem de vaga por data faz a virada acontecer sozinha, sem cron.';


-- ------------------------------------------------------------
-- 15. Cancelar a assinatura fecha os assentos
--
-- Sem isto, cancelar liberaria a assinatura mas deixaria o assento
-- ocupando a turma para sempre — a vaga nunca voltaria para a grade.
-- ------------------------------------------------------------
create or replace function public.cancelar_assinatura(
  p_matricula uuid, p_motivo text default null
) returns date language plpgsql security definer set search_path = '' as $fn$
declare m record;
begin
  select * into m from public.matriculas where id = p_matricula for update;
  if not found then raise exception 'matrícula inexistente'; end if;

  if auth.uid() is not null then
    if public.is_cliente() then
      if m.cliente_id <> public.cliente_atual() then
        raise exception 'aluna só pode cancelar a própria assinatura';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito à equipe ou à própria aluna';
    end if;
  end if;

  if m.status = 'cancelada' then
    raise exception 'assinatura já cancelada';
  end if;

  -- Não apaga crédito nem encerra na hora: o ciclo já pago vale até o
  -- fim. Só desliga a renovação (CLAUDE.md §9.4).
  update public.matriculas
  set cancelada_em = now(),
      cancelamento_efetivo_em = m.data_fim,
      renova_automaticamente = false,
      motivo_cancelamento = coalesce(p_motivo, motivo_cancelamento)
  where id = p_matricula;

  -- A cobrança do próximo ciclo, se já tiver sido gerada e não paga,
  -- deixa de fazer sentido.
  update public.entradas_financeiras
  set status = 'cancelada'
  where matricula_id = p_matricula and ciclo > m.ciclo_atual and status = 'prevista';

  -- O assento vale ate o fim do ciclo pago, igual ao credito (7.2).
  update public.matricula_turmas
  set fim = greatest(m.data_fim, current_date),
      motivo_saida = coalesce(motivo_saida, 'assinatura cancelada')
  where matricula_id = p_matricula
    and (fim is null or fim > m.data_fim);

  return m.data_fim;
end; $fn$;

comment on function public.cancelar_assinatura(uuid, text) is
  'Cancela no FIM do ciclo pago. Devolve a data em que deixa de valer, para a tela '
  'conseguir dizer "voce tem aula ate DD/MM". Fecha junto os assentos de turma fixa: '
  'sem isso a vaga nunca voltaria para a grade.';


-- ------------------------------------------------------------
-- 16. agendar_aula() — mensagens honestas para quem tem assento fixo
--
-- Antes desta mudanca, tentar agendar um aluno de turma fixa dava
-- "cliente sem créditos disponíveis" — verdade tecnica que manda a
-- equipe procurar o problema no lugar errado. Sao dois casos distintos:
-- a turma que ele ja assina (nao precisa agendar) e qualquer outra
-- (o plano dele nao cobre).
-- ------------------------------------------------------------
create or replace function public.agendar_aula(
  p_cliente uuid, p_turma uuid, p_data date, p_canal public.canal_aula
) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  a_id uuid;
  m_id uuid := null;
  lote uuid;
  pr record;
  cfg record;
  suspenso_ate date;
  abertos integer;
  limite_dias integer;
begin
  if auth.uid() is not null then
    if public.is_cliente() then
      if p_cliente <> public.cliente_atual() then
        raise exception 'aluna só pode agendar em nome de si mesma';
      end if;
      if p_canal <> 'mensalista' then
        raise exception 'aluna só agenda pelo canal mensalista';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito à equipe ou à própria cliente';
    end if;
  end if;

  select * into cfg from public.config_agendamento;

  if p_data < current_date then
    raise exception 'não dá para agendar aula em data que já passou';
  end if;

  -- A vaga ja e dele: reservar criaria uma segunda ocupacao da mesma
  -- pessoa na mesma aula e a turma "lotaria" com metade das cadeiras.
  if public.tem_assento_fixo(p_cliente, p_turma, p_data) then
    raise exception
      'este aluno tem vaga fixa nesta turma — a presença dele já está garantida, não precisa agendar';
  end if;

  if p_canal = 'mensalista' then
    select m.id into m_id
    from public.matriculas m
    where m.cliente_id = p_cliente
      and m.status = 'ativa'
      and public.saldo_disponivel(m.id, p_data) > 0
    order by (
      select min(l.validade) from public.creditos_lotes l
      where l.matricula_id = m.id and l.validade >= p_data
    ), m.data_fim
    limit 1;

    if m_id is null then
      if exists (
        select 1 from public.matriculas m
        where m.cliente_id = p_cliente and m.status = 'inadimplente'
      ) then
        raise exception 'plano com pagamento em aberto — regularize para voltar a agendar';
      end if;
      -- Turma fixa nao tem credito por definicao (2.3.7). Dizer "sem
      -- creditos" mandaria a equipe procurar saldo que nunca vai existir.
      if exists (
        select 1 from public.matriculas m
        join public.produtos p on p.id = m.plano_id
        where m.cliente_id = p_cliente and m.status <> 'cancelada'
          and coalesce(p.turmas_fixas, 0) > 0
      ) then
        raise exception
          'a Mensalidade por Turma Fixa dá acesso só à(s) turma(s) contratada(s) — para outra aula é preciso avulsa ou crédito extra';
      end if;
      raise exception 'cliente sem créditos disponíveis para esta data';
    end if;

    select p.* into pr
    from public.produtos p
    join public.matriculas m on m.plano_id = p.id
    where m.id = m_id;

    -- ---- Trava 1: suspensão por faltas (4.7) ----
    suspenso_ate := public.suspensao_vigente(p_cliente);
    if suspenso_ate is not null and p_data > current_date then
      raise exception
        'agendamento antecipado suspenso até % por faltas sem cancelamento — dá para reservar para hoje ou entrar na lista de espera',
        to_char(suspenso_ate, 'DD/MM');
    end if;

    -- ---- Trava 2: janela de antecedência ----
    limite_dias := coalesce(pr.dias_antecedencia_agendamento, 14);
    if p_data > current_date + limite_dias then
      raise exception 'este plano agenda com até % dias de antecedência (limite: %)',
        limite_dias, to_char(current_date + limite_dias, 'DD/MM');
    end if;

    -- ---- Trava 3: máximo de reservas em aberto (4.3) ----
    if pr.max_agendamentos_simultaneos is not null then
      select count(*) into abertos
      from public.agendamentos a
      where a.cliente_id = p_cliente
        and a.status = 'agendado'
        and a.data >= current_date;
      if abertos >= pr.max_agendamentos_simultaneos then
        raise exception
          'você já tem % aulas agendadas (limite do plano). Cancele ou faça uma delas para agendar outra',
          abertos;
      end if;
    end if;
  end if;

  insert into public.agendamentos (turma_id, data, cliente_id, canal, matricula_id)
  values (p_turma, p_data, p_cliente, p_canal, m_id)
  returning id into a_id;

  if m_id is not null then
    lote := public.consumir_credito(m_id, 'agendamento', a_id, p_data);
    if lote is null then
      raise exception 'cliente sem créditos disponíveis para esta data';
    end if;
  end if;

  insert into public.agendamentos_eventos (agendamento_id, evento, criado_por)
  values (a_id, 'agendado', auth.uid());

  return a_id;
end; $fn$;


-- ------------------------------------------------------------
-- 17. A view que a tela de Matriculas e a ficha do aluno leem
--
-- Uma consulta so devolve "quem assina o que, em qual turma, com qual
-- professora". Sem ela cada tela remontaria o join — e a professora
-- teria que vir de vw_professoras_nomes toda vez, que e o detalhe mais
-- facil de esquecer (a tabela professoras e gestao-only e a secretaria
-- receberia a linha sem nome, em silencio).
-- ------------------------------------------------------------
create or replace view public.vw_matricula_turmas as
select
  mt.id            as vinculo_id,
  mt.matricula_id,
  m.cliente_id,
  mt.turma_id,
  mt.inicio,
  mt.fim,
  (mt.inicio <= current_date and (mt.fim is null or mt.fim >= current_date)) as vigente,
  (mt.inicio > current_date) as futuro,
  mt.motivo_saida,
  t.modalidade,
  t.modalidade_id,
  t.dia_semana,
  t.horario,
  t.duracao_minutos,
  t.capacidade,
  t.professora_id,
  p.nome as professora,
  s.nome as sala
from public.matricula_turmas mt
join public.matriculas m on m.id = mt.matricula_id
join public.turmas t on t.id = mt.turma_id
left join public.professoras p on p.id = t.professora_id
left join public.salas s on s.id = t.sala_id
where public.is_socia()
   or m.cliente_id = public.cliente_atual()
   or t.professora_id = public.professora_atual();

grant select on public.vw_matricula_turmas to authenticated;

comment on view public.vw_matricula_turmas is
  'SECURITY DEFINER deliberado, mesmo padrao de vw_professoras_nomes: le '
  'public.professoras, que e gestao-only desde a M8 por causa de '
  'valor_por_aluna_centavos, e projeta APENAS o nome. Sob security_invoker=true a '
  'secretaria receberia a linha com professora nula e o aluno/professora nao veriam '
  'nada. O recorte de quem-ve-o-que esta no WHERE: equipe interna, o proprio aluno, '
  'ou a professora daquela turma.';


-- ------------------------------------------------------------
-- 18. Permissoes
-- ------------------------------------------------------------
revoke execute on function public.assentos_fixos_ocupados(uuid, date) from public, anon;
grant  execute on function public.assentos_fixos_ocupados(uuid, date) to authenticated;

revoke execute on function public.tem_assento_fixo(uuid, uuid, date) from public, anon;
grant  execute on function public.tem_assento_fixo(uuid, uuid, date) to authenticated;

revoke execute on function public.validar_assento_fixo(uuid, date) from public, anon;
grant  execute on function public.validar_assento_fixo(uuid, date) to authenticated;

-- matricular_produto e o motor compartilhado, nao um ponto de entrada:
-- quem chama de fora e matricular() ou matricular_turma_fixa(), que
-- carregam as guardas. Exposto pelo PostgREST seria um jeito de
-- contratar turma fixa sem assento nenhum.
revoke execute on function public.matricular_produto(uuid, uuid) from public, anon, authenticated;

revoke execute on function public.matricular_turma_fixa(uuid, uuid, uuid[]) from public, anon;
grant  execute on function public.matricular_turma_fixa(uuid, uuid, uuid[]) to authenticated;

revoke execute on function public.adicionar_turma_fixa(uuid, uuid) from public, anon;
grant  execute on function public.adicionar_turma_fixa(uuid, uuid) to authenticated;

revoke execute on function public.encerrar_turma_fixa(uuid, boolean, text) from public, anon;
grant  execute on function public.encerrar_turma_fixa(uuid, boolean, text) to authenticated;

revoke execute on function public.trocar_turma_fixa(uuid, uuid, boolean) from public, anon;
grant  execute on function public.trocar_turma_fixa(uuid, uuid, boolean) to authenticated;
