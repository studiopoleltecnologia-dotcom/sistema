-- ============================================================
-- Portal do Aluno — "Meu plano" e solicitação de cancelamento
-- (regulamento v3, itens 1.5, 3.1, 7.1–7.7)
--
-- O portal não tinha onde o aluno responder "qual é o meu plano, até
-- quando vale, quando renova, quanto custa". E o cancelamento tinha dois
-- defeitos opostos:
--
--   C1  O aluno podia chamar `cancelar_assinatura()` direto e cancelar na
--       hora, sem a equipe ver. O regulamento (7.1) diz que o pedido "é
--       confirmado por escrito por nós" — clicar não pode encerrar nada.
--   C2  E a tela dizia "para parar, fale com o estúdio", ou seja, o aluno
--       só descobria a regra dos 5 dias quando já tinha perdido o prazo.
--
-- O que o regulamento manda, literal:
--
--   7.1 "O pedido de cancelamento é feito pelo sistema ou pelo WhatsApp
--       oficial do Studio, com pelo menos 5 dias de antecedência da data
--       de renovação, e é confirmado por escrito por nós. Pedidos feitos
--       com menos de 5 dias valem para a renovação seguinte."
--   7.2 O ciclo já pago continua válido até o fim.
--   7.4 Semestral antes do fim dos 6 ciclos: devolve a diferença entre o
--       valor Mensal e o Semestral do plano × ciclos já utilizados.
--   7.7 Ao fim dos 6 ciclos o Semestral passa a Mensal (não renova por
--       mais seis).
--
-- Desenho:
--
--   · `regras_cancelamento_plano()` é a ÚNICA conta de prazo. A tela lê o
--     resultado (via `meus_planos()`) e a solicitação grava o mesmo
--     resultado como retrato. Se a conta morasse no front, a data que o
--     aluno leu e a data que o banco registrou poderiam divergir.
--   · O "5" é `config_agendamento.dias_antecedencia_cancelamento_plano`,
--     não constante: é regra comercial (CLAUDE.md §9.4).
--   · A data de referência é a de São Paulo, não `current_date` (UTC):
--     um pedido às 22h do último dia do prazo seria lido como do dia
--     seguinte e cairia fora do prazo por causa do fuso.
--   · A solicitação guarda um RETRATO (prazo, renovação, vigência). A
--     regra é avaliada no momento do pedido; recalcular depois mudaria
--     "dentro do prazo" para "fora" só porque a equipe demorou a ver.
--
-- E a virada do semestral para mensal (7.7), que cobrava errado (A16):
--
--   S1  `renovar_ciclo()` reiniciava `ciclo_atual` em 1 na sucessão, mas a
--       cobrança é única por (matrícula, ciclo). O "ciclo 2" do mensal
--       colidia com o ciclo 2 do semestral, já pago: nada era cobrado e a
--       rotina lia a cobrança antiga como paga — renovação de graça do 2º
--       ao 6º mês do mensal.
--   S2  A cobrança antecipada (D-3) da virada saía com o preço do
--       SEMESTRAL: ela era gerada antes de a sucessão trocar o produto.
--
--   Correção: o ciclo só cresce (o 1º mês do mensal é o ciclo 7) e
--   `ciclo_inicio_contrato` marca onde o contrato vigente começou — é o
--   ciclo relativo a ele que conta para o compromisso. `cobrar_ciclo()`
--   cobra o ciclo da virada pelo preço do sucessor. Nenhuma matrícula
--   semestral existia em 21/09/2026 (DEV e produção), então não há dado
--   a corrigir.
--
--   E o aluno é avisado por e-mail: antes da virada, com tempo de pedir o
--   cancelamento (`dias_aviso_fim_compromisso`), e quando ela acontece.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Antecedência do pedido (regulamento 7.1)
-- ------------------------------------------------------------
alter table public.config_agendamento
  add column if not exists dias_antecedencia_cancelamento_plano integer not null default 5;

alter table public.config_agendamento
  drop constraint if exists config_dias_cancelamento_plano_check;
alter table public.config_agendamento
  add constraint config_dias_cancelamento_plano_check
  check (dias_antecedencia_cancelamento_plano between 0 and 60);

comment on column public.config_agendamento.dias_antecedencia_cancelamento_plano is
  'Regulamento 7.1: quantos dias antes da renovacao o pedido de cancelamento precisa '
  'chegar para impedir aquela renovacao. Pedido depois disso vale para a seguinte.';

-- Aviso do fim do compromisso (7.7). O padrão (10) fica acima do prazo de
-- cancelamento (5) de propósito: o aviso só serve se chegar a tempo de o
-- aluno decidir.
alter table public.config_agendamento
  add column if not exists dias_aviso_fim_compromisso integer not null default 10;

alter table public.config_agendamento
  drop constraint if exists config_dias_aviso_fim_compromisso_check;
alter table public.config_agendamento
  add constraint config_dias_aviso_fim_compromisso_check
  check (dias_aviso_fim_compromisso between 1 and 60);

comment on column public.config_agendamento.dias_aviso_fim_compromisso is
  'Regulamento 7.7: quantos dias antes do fim do semestral o aluno recebe o e-mail de '
  'que o plano vai passar a Mensal. Deve ser maior que dias_antecedencia_cancelamento_plano, '
  'senao o aviso chega depois do prazo de cancelar.';


-- ------------------------------------------------------------
-- 1b. Onde começou o contrato vigente (A16)
-- ------------------------------------------------------------
-- `ciclo_atual` passa a só crescer; o ciclo DENTRO do contrato vigente é
-- `ciclo_atual - ciclo_inicio_contrato + 1`. É esse que se compara com
-- `ciclos_compromisso`. Default 1 = todo contrato atual começou no ciclo 1
-- (verdade hoje: nenhuma sucessão aconteceu ainda).
alter table public.matriculas
  add column if not exists ciclo_inicio_contrato integer not null default 1;

alter table public.matriculas
  drop constraint if exists matriculas_ciclo_inicio_contrato_check;
alter table public.matriculas
  add constraint matriculas_ciclo_inicio_contrato_check
  check (ciclo_inicio_contrato >= 1 and ciclo_inicio_contrato <= ciclo_atual);

comment on column public.matriculas.ciclo_inicio_contrato is
  'Ciclo em que o contrato vigente comecou. Muda na sucessao (7.7: o semestral vira '
  'mensal no ciclo 7). O ciclo do compromisso e ciclo_atual - ciclo_inicio_contrato + 1. '
  'ciclo_atual nunca volta: a cobranca e unica por (matricula, ciclo).';


-- ------------------------------------------------------------
-- 2. A solicitação
-- ------------------------------------------------------------
do $mig$
begin
  create type public.status_solicitacao_cancelamento as enum ('pendente', 'confirmada', 'retirada');
exception when duplicate_object then null;
end $mig$;

create table if not exists public.solicitacoes_cancelamento (
  id                          uuid primary key default gen_random_uuid(),
  matricula_id                uuid not null references public.matriculas (id) on delete cascade,
  cliente_id                  uuid not null references public.clientes (id) on delete cascade,
  produto_id                  uuid not null references public.produtos (id),
  -- Retrato do momento do pedido. Não é redundância: o produto pode ser
  -- renomeado e a matrícula avança de ciclo — o que vale é o que o aluno
  -- leu na tela quando pediu.
  plano_nome                  text not null,
  ciclo_atual                 integer not null,
  ciclos_compromisso          integer not null,
  data_contratacao            date not null,
  proxima_renovacao           date not null,
  prazo_limite                date not null,
  dias_antecedencia           integer not null,
  dentro_prazo                boolean not null,
  vigente_ate                 date not null,
  devolucao_desconto_centavos bigint check (devolucao_desconto_centavos is null or devolucao_desconto_centavos >= 0),
  motivo                      text check (motivo is null or length(motivo) <= 1000),
  solicitada_em               timestamptz not null default now(),
  solicitada_por              uuid,
  status                      public.status_solicitacao_cancelamento not null default 'pendente',
  resolvida_em                timestamptz,
  resolvida_por               uuid,
  observacao_equipe           text,
  check ((status = 'pendente') = (resolvida_em is null))
);

comment on table public.solicitacoes_cancelamento is
  'Pedido de cancelamento feito pelo aluno no portal (regulamento 7.1). NAO cancela nada: '
  'a equipe confirma com confirmar_cancelamento_plano(). As datas sao retrato do momento '
  'do pedido — dentro_prazo nao muda porque a equipe demorou a ver.';
comment on column public.solicitacoes_cancelamento.vigente_ate is
  'Ultimo dia de acesso pelas regras: fim do ciclo atual se dentro do prazo; fim do '
  'ciclo seguinte se fora (7.1 "valem para a renovacao seguinte").';
comment on column public.solicitacoes_cancelamento.devolucao_desconto_centavos is
  'Regulamento 7.4 — semestral encerrado antes do fim do compromisso. Estimativa pela '
  'formula do regulamento; null = nao se aplica ou nao da para calcular (sem plano '
  'mensal equivalente). Nao ha cobranca em caso de atestado ou mudanca de cidade (7.5).';

-- Um pedido em aberto por plano. Depois de resolvido, pode haver outro.
create unique index if not exists solicitacoes_cancelamento_pendente_unica
  on public.solicitacoes_cancelamento (matricula_id)
  where status = 'pendente';

create index if not exists solicitacoes_cancelamento_status_idx
  on public.solicitacoes_cancelamento (status, solicitada_em);

alter table public.solicitacoes_cancelamento enable row level security;

drop policy if exists "cliente ve as proprias solicitacoes" on public.solicitacoes_cancelamento;
create policy "cliente ve as proprias solicitacoes" on public.solicitacoes_cancelamento
  for select to authenticated using (cliente_id = public.cliente_atual());

-- Mesmo recorte de `matriculas`: a equipe interna vê a operação. Quem
-- confirma é só a gestão, e isso está na RPC.
drop policy if exists "equipe ve solicitacoes de cancelamento" on public.solicitacoes_cancelamento;
create policy "equipe ve solicitacoes de cancelamento" on public.solicitacoes_cancelamento
  for select to authenticated using (public.is_socia());

-- Sem policy de escrita: tudo passa pelas RPCs abaixo, que são as que
-- sabem calcular o prazo. Insert direto gravaria a data que o cliente
-- quisesse.


-- ------------------------------------------------------------
-- 3. A conta do prazo — uma função só
-- ------------------------------------------------------------
create or replace function public.regras_cancelamento_plano(
  p_matricula uuid,
  p_em date default (now() at time zone 'America/Sao_Paulo')::date
) returns table (
  renova boolean,
  proxima_renovacao date,
  prazo_limite date,
  dias_antecedencia integer,
  dentro_prazo boolean,
  vigente_ate date,
  ciclos_utilizados integer,
  saida_antecipada boolean,
  devolucao_desconto_centavos bigint,
  fim_compromisso date,
  proximo_plano_nome text,
  proximo_plano_preco_centavos bigint
)
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  m record;
  pr record;
  prox record;
  sucede boolean := false;
  periodicidade_seguinte integer;
  dias integer;
  preco_mensal bigint;
  ciclo_contrato integer;
begin
  select * into m from public.matriculas where id = p_matricula;
  if not found then return; end if;
  select * into pr from public.produtos where id = m.plano_id;
  -- O ciclo DENTRO do contrato vigente (A16): depois da sucessão o mensal
  -- começa no ciclo 7, e é o 1º dele que conta.
  ciclo_contrato := m.ciclo_atual - m.ciclo_inicio_contrato + 1;
  select coalesce(c.dias_antecedencia_cancelamento_plano, 5) into dias
  from public.config_agendamento c;
  dias := coalesce(dias, 5);

  -- Fim do compromisso do semestral. Cada renovação começa em data_fim+1
  -- e dura `periodicidade_dias` a partir dali (renovar_ciclo), daí o +1.
  if m.ciclos_compromisso > 1 and ciclo_contrato <= m.ciclos_compromisso then
    fim_compromisso := m.data_fim + (m.ciclos_compromisso - ciclo_contrato) * (pr.periodicidade_dias + 1);
  end if;

  -- Não renova (pacote, cortesia, plano legado sem recorrência) ou já
  -- tem cancelamento confirmado: não há renovação para impedir.
  if not m.renova_automaticamente or m.cancelada_em is not null or m.status = 'cancelada' then
    renova := false;
    vigente_ate := coalesce(m.cancelamento_efetivo_em, m.data_fim);
    dias_antecedencia := dias;
    return next;
    return;
  end if;

  renova := true;
  dias_antecedencia := dias;
  proxima_renovacao := m.data_fim + 1;
  prazo_limite := proxima_renovacao - dias;
  dentro_prazo := p_em <= prazo_limite;

  -- 7.7: no último ciclo do compromisso, o próximo ciclo já é o plano
  -- sucessor (o semestral vira mensal). É o que renovar_ciclo() faz.
  if ciclo_contrato >= m.ciclos_compromisso and pr.produto_sucessor_id is not null then
    select * into prox from public.produtos where id = pr.produto_sucessor_id and ativo;
    sucede := found;
  end if;

  if sucede then
    proximo_plano_nome := prox.nome;
    proximo_plano_preco_centavos := prox.preco_centavos;
    periodicidade_seguinte := prox.periodicidade_dias;
  else
    proximo_plano_preco_centavos := m.preco_contratado_centavos;
    periodicidade_seguinte := pr.periodicidade_dias;
  end if;

  -- 7.1 + 7.2: dentro do prazo, vale até o fim do ciclo pago. Fora, a
  -- próxima renovação acontece e o acesso vai até o fim DELA.
  vigente_ate := case
    when dentro_prazo then m.data_fim
    else proxima_renovacao + periodicidade_seguinte
  end;

  -- 7.4: ciclos utilizados = os que terão sido pagos até o encerramento.
  ciclos_utilizados := case when dentro_prazo then ciclo_contrato else ciclo_contrato + 1 end;
  saida_antecipada := m.ciclos_compromisso > 1 and ciclos_utilizados < m.ciclos_compromisso;

  if saida_antecipada and pr.produto_sucessor_id is not null then
    select p.preco_centavos into preco_mensal from public.produtos p where p.id = pr.produto_sucessor_id;
    if preco_mensal is not null then
      devolucao_desconto_centavos :=
        greatest(preco_mensal - m.preco_contratado_centavos, 0) * ciclos_utilizados;
    end if;
  end if;

  return next;
end;
$fn$;

comment on function public.regras_cancelamento_plano(uuid, date) is
  'Regulamento 7.1/7.2/7.4/7.7 numa conta so: proxima renovacao, prazo para impedi-la, '
  'se o pedido feito em p_em esta dentro do prazo, ate quando o plano vale e a devolucao '
  'do desconto do semestral. Lida pela tela (meus_planos) e gravada pela solicitacao — '
  'a data que o aluno leu e a registrada sao a mesma por construcao.';


-- ------------------------------------------------------------
-- 4. "Meu plano" — tudo que a tela precisa, já recortado
--
-- Função e não view: a view seria SECURITY DEFINER (precisa ler
-- `entradas_financeiras` e `produtos` sem policy para aluno) e somaria
-- mais um achado ao Advisor (backlog S9). Aqui o recorte é
-- `cliente_atual()` e nenhum valor de outra pessoa sai.
-- ------------------------------------------------------------
create or replace function public.meus_planos()
returns table (
  matricula_id uuid,
  produto_id uuid,
  plano_nome text,
  tipo_produto public.tipo_produto,
  turmas_fixas integer,
  gera_credito boolean,
  creditos_por_ciclo integer,
  acumula_creditos boolean,
  teto_acumulo_ciclos integer,
  periodicidade_dias integer,
  ciclos_compromisso integer,
  ciclo_atual integer,
  status public.status_matricula,
  renova_automaticamente boolean,
  preco_centavos bigint,
  data_contratacao date,
  data_inicio date,
  data_fim date,
  cancelada_em timestamptz,
  cancelamento_efetivo_em date,
  saldo integer,
  creditos_usados_ciclo integer,
  proxima_validade date,
  pagamento_pendente_desde date,
  dias_antecedencia_agendamento integer,
  max_agendamentos_simultaneos integer,
  horas_cancelamento integer,
  convidados_por_ciclo integer,
  desconto_eventos_pct numeric,
  modalidades text[],
  proxima_renovacao date,
  prazo_cancelamento date,
  dias_antecedencia_cancelamento integer,
  dentro_prazo_cancelamento boolean,
  vigente_ate_se_cancelar date,
  devolucao_desconto_centavos bigint,
  ciclos_utilizados_se_cancelar integer,
  saida_antecipada boolean,
  fim_compromisso date,
  proximo_plano_nome text,
  proximo_plano_preco_centavos bigint,
  solicitacao_id uuid,
  solicitacao_status public.status_solicitacao_cancelamento,
  solicitacao_em timestamptz,
  solicitacao_dentro_prazo boolean,
  solicitacao_vigente_ate date,
  solicitacao_proxima_renovacao date,
  solicitacao_prazo_limite date,
  solicitacao_devolucao_centavos bigint,
  solicitacao_motivo text
)
language sql stable security definer set search_path = ''
as $fn$
  select
    m.id,
    pr.id,
    pr.nome,
    pr.tipo_produto,
    pr.turmas_fixas,
    pr.gera_credito,
    pr.creditos_por_ciclo,
    pr.acumula_creditos,
    pr.teto_acumulo_ciclos,
    pr.periodicidade_dias,
    m.ciclos_compromisso,
    -- Ciclo DENTRO do contrato vigente ("4º de 6"), não o contador absoluto.
    m.ciclo_atual - m.ciclo_inicio_contrato + 1,
    m.status,
    m.renova_automaticamente,
    m.preco_contratado_centavos,
    (m.criada_em at time zone 'America/Sao_Paulo')::date,
    m.data_inicio,
    m.data_fim,
    m.cancelada_em,
    m.cancelamento_efetivo_em,
    coalesce(sc.saldo, 0),
    -- Aulas DESTE ciclo que gastaram crédito (inclui cancelamento fora do
    -- prazo, que não devolve). Pelo razão, não pela contagem de reservas:
    -- é o razão que diz se o crédito voltou.
    coalesce((
      select -sum(ce.delta)
      from public.creditos_eventos ce
      join public.agendamentos a on a.id = ce.agendamento_id
      where ce.matricula_id = m.id
        and ce.motivo in ('agendamento', 'cancelamento')
        and a.data between m.data_inicio and m.data_fim
    ), 0)::integer,
    sc.proxima_validade,
    (
      select min(e.data_prevista)
      from public.entradas_financeiras e
      where e.matricula_id = m.id
        and e.status = 'prevista'
        and e.data_prevista <= (now() at time zone 'America/Sao_Paulo')::date
    ),
    pr.dias_antecedencia_agendamento,
    pr.max_agendamentos_simultaneos,
    coalesce(pr.horas_cancelamento, cfg.horas_cancelamento),
    pr.convidados_por_ciclo,
    pr.desconto_eventos_pct,
    -- Sem linha em produto_modalidades = cobre todas (catálogo, etapa 3).
    (
      select array_agg(mo.nome order by mo.nome)
      from public.produto_modalidades pm
      join public.modalidades mo on mo.id = pm.modalidade_id
      where pm.produto_id = pr.id
    ),
    r.proxima_renovacao,
    r.prazo_limite,
    r.dias_antecedencia,
    r.dentro_prazo,
    r.vigente_ate,
    r.devolucao_desconto_centavos,
    r.ciclos_utilizados,
    r.saida_antecipada,
    r.fim_compromisso,
    r.proximo_plano_nome,
    r.proximo_plano_preco_centavos,
    s.id,
    s.status,
    s.solicitada_em,
    s.dentro_prazo,
    s.vigente_ate,
    s.proxima_renovacao,
    s.prazo_limite,
    s.devolucao_desconto_centavos,
    s.motivo
  from public.matriculas m
  join public.produtos pr on pr.id = m.plano_id
  cross join public.config_agendamento cfg
  left join public.vw_saldo_creditos sc on sc.matricula_id = m.id
  left join lateral public.regras_cancelamento_plano(m.id) r on true
  left join lateral (
    select * from public.solicitacoes_cancelamento sol
    where sol.matricula_id = m.id
    order by (sol.status = 'pendente') desc, sol.solicitada_em desc
    limit 1
  ) s on true
  where m.cliente_id = public.cliente_atual()
    -- O que terminou há pouco continua visível: é o que responde "meu
    -- plano expirou?" em vez de a tela simplesmente ficar vazia.
    and coalesce(m.cancelamento_efetivo_em, m.data_fim)
        >= (now() at time zone 'America/Sao_Paulo')::date - 45
  order by
    (m.status = 'cancelada'),
    (pr.turmas_fixas = 0 and not m.renova_automaticamente),
    m.criada_em;
$fn$;

comment on function public.meus_planos() is
  'Tela Meu Plano do portal: as matriculas do aluno logado (inclusive as encerradas ha '
  'ate 45 dias), com saldo, pagamento pendente, regras de renovacao/cancelamento '
  '(regras_cancelamento_plano) e a solicitacao de cancelamento mais relevante.';


-- ------------------------------------------------------------
-- 5. Destinatários da gestão
-- ------------------------------------------------------------
-- O e-mail de login de quem é gestão. Não é configuração à parte porque
-- quem decide o cancelamento é exatamente quem tem acesso ao Financeiro.
create or replace function public.emails_gestao()
returns setof text
language sql stable security definer set search_path = ''
as $fn$
  select distinct u.email::text
  from public.socias s
  join auth.users u on u.id = s.id
  where s.funcao = 'gestao' and u.email is not null;
$fn$;


-- ------------------------------------------------------------
-- 6. O aluno pede
-- ------------------------------------------------------------
create or replace function public.solicitar_cancelamento_plano(
  p_matricula uuid, p_motivo text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare
  m record;
  pr record;
  c record;
  r record;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  s_id uuid;
  v_motivo text := nullif(left(trim(coalesce(p_motivo, '')), 1000), '');
  dados jsonb;
  destino text;
begin
  -- Pelo portal, só o próprio aluno. A equipe já tem o cancelamento
  -- direto na tela de Matrículas.
  if auth.uid() is null or not public.is_cliente() then
    raise exception 'a solicitação de cancelamento é feita pelo próprio aluno';
  end if;

  select * into m from public.matriculas where id = p_matricula for update;
  if not found or m.cliente_id <> public.cliente_atual() then
    raise exception 'plano não encontrado';
  end if;

  if m.status = 'cancelada' or m.cancelada_em is not null then
    raise exception 'este plano já está cancelado';
  end if;
  if not m.renova_automaticamente then
    raise exception 'este plano não renova automaticamente — ele termina sozinho em %',
      to_char(m.data_fim, 'DD/MM/YYYY');
  end if;
  if exists (
    select 1 from public.solicitacoes_cancelamento
    where matricula_id = p_matricula and status = 'pendente'
  ) then
    raise exception 'já existe uma solicitação de cancelamento em análise para este plano';
  end if;

  select * into pr from public.produtos where id = m.plano_id;
  select * into c from public.clientes where id = m.cliente_id;
  select * into r from public.regras_cancelamento_plano(p_matricula, hoje);

  insert into public.solicitacoes_cancelamento (
    matricula_id, cliente_id, produto_id, plano_nome, ciclo_atual, ciclos_compromisso,
    data_contratacao, proxima_renovacao, prazo_limite, dias_antecedencia, dentro_prazo,
    vigente_ate, devolucao_desconto_centavos, motivo, solicitada_por
  ) values (
    m.id, m.cliente_id, pr.id, pr.nome, m.ciclo_atual - m.ciclo_inicio_contrato + 1, m.ciclos_compromisso,
    (m.criada_em at time zone 'America/Sao_Paulo')::date, r.proxima_renovacao,
    r.prazo_limite, r.dias_antecedencia, r.dentro_prazo, r.vigente_ate,
    r.devolucao_desconto_centavos, v_motivo, auth.uid()
  ) returning id into s_id;

  dados := jsonb_build_object(
    'nome', c.nome,
    'telefone', c.telefone,
    'email', c.email,
    'plano', pr.nome,
    'formato', case when pr.turmas_fixas > 0 then 'Turma fixa' else 'Por créditos' end,
    'contrato', case when m.ciclos_compromisso > 1
                     then 'Semestral (ciclo ' || (m.ciclo_atual - m.ciclo_inicio_contrato + 1) || ' de ' || m.ciclos_compromisso || ')'
                     else 'Mensal' end,
    'data_contratacao', (m.criada_em at time zone 'America/Sao_Paulo')::date,
    'proxima_renovacao', r.proxima_renovacao,
    'prazo_limite', r.prazo_limite,
    'dias_antecedencia', r.dias_antecedencia,
    'dentro_prazo', r.dentro_prazo,
    'vigente_ate', r.vigente_ate,
    'devolucao_centavos', r.devolucao_desconto_centavos,
    'saida_antecipada', r.saida_antecipada,
    'solicitada_em', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI'),
    'motivo', v_motivo
  );

  for destino in select public.emails_gestao() loop
    perform public.enfileirar_email(
      'cancelamento_solicitado', destino, dados, 'cancelamento:' || s_id || ':' || destino
    );
  end loop;

  -- Comprovante para o aluno: a data e a hora do pedido são o que decide
  -- o prazo, então ela precisa ter isso por escrito também.
  perform public.enfileirar_email(
    'cancelamento_recebido', c.email, dados, 'cancelamento-recebido:' || s_id
  );

  return s_id;
end;
$fn$;

comment on function public.solicitar_cancelamento_plano(uuid, text) is
  'Regulamento 7.1. Registra o PEDIDO (nao cancela nada): grava o retrato das regras no '
  'momento, avisa a gestao por e-mail e manda o comprovante ao aluno. Quem encerra e '
  'confirmar_cancelamento_plano().';


-- ------------------------------------------------------------
-- 7. O aluno desiste (ou a gestão arquiva)
-- ------------------------------------------------------------
create or replace function public.retirar_solicitacao_cancelamento(
  p_solicitacao uuid, p_observacao text default null
) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  s record;
begin
  select * into s from public.solicitacoes_cancelamento where id = p_solicitacao for update;
  if not found then raise exception 'solicitação inexistente'; end if;

  if public.is_cliente() then
    if s.cliente_id <> public.cliente_atual() then
      raise exception 'solicitação inexistente';
    end if;
  elsif not public.is_gestao() then
    raise exception 'acesso restrito à gestão ou ao próprio aluno';
  end if;

  if s.status <> 'pendente' then
    raise exception 'esta solicitação já foi resolvida';
  end if;

  update public.solicitacoes_cancelamento
  set status = 'retirada',
      resolvida_em = now(),
      resolvida_por = auth.uid(),
      observacao_equipe = case when public.is_cliente() then observacao_equipe
                               else nullif(trim(coalesce(p_observacao, '')), '') end
  where id = p_solicitacao;
end;
$fn$;


-- ------------------------------------------------------------
-- 8. A gestão confirma — é aqui que o cancelamento acontece
-- ------------------------------------------------------------
create or replace function public.confirmar_cancelamento_plano(
  p_solicitacao uuid, p_observacao text default null
) returns date
language plpgsql security definer set search_path = ''
as $fn$
declare
  s record;
  m record;
  c record;
  efetivo date;
begin
  if auth.uid() is null or not public.is_gestao() then
    raise exception 'acesso restrito à gestão';
  end if;

  select * into s from public.solicitacoes_cancelamento where id = p_solicitacao for update;
  if not found then raise exception 'solicitação inexistente'; end if;
  if s.status <> 'pendente' then raise exception 'esta solicitação já foi resolvida'; end if;

  select * into m from public.matriculas where id = s.matricula_id for update;

  -- Já cancelada por outro caminho (botão direto da equipe): só fecha o
  -- pedido, sem mexer de novo nas datas.
  if m.cancelada_em is not null or m.status = 'cancelada' then
    efetivo := coalesce(m.cancelamento_efetivo_em, m.data_fim);
  else
    -- A data é a do RETRATO, não recalculada: o pedido dentro do prazo
    -- continua dentro mesmo que a equipe confirme depois do prazo.
    efetivo := s.vigente_ate;

    update public.matriculas
    set cancelada_em = now(),
        cancelamento_efetivo_em = efetivo,
        -- Fora do prazo ainda há UMA renovação a fazer (7.1). Ela
        -- acontece normalmente; o `cancelamento_efetivo_em` é que impede
        -- a seguinte (ver renovar_ciclo/processar_assinaturas abaixo).
        renova_automaticamente = efetivo > m.data_fim,
        motivo_cancelamento = coalesce(s.motivo, motivo_cancelamento)
    where id = m.id;

    -- Cobrança de ciclo que começa depois do último dia de acesso deixa
    -- de fazer sentido. Pela data, não pelo número do ciclo: a sucessão
    -- do semestral (7.7) recomeça a contagem de ciclos.
    update public.entradas_financeiras
    set status = 'cancelada'
    where matricula_id = m.id and status = 'prevista' and data_prevista > efetivo;

    -- O assento de turma fixa vale até o último dia, igual ao crédito.
    -- `greatest(..., inicio)`: um assento trocado para o futuro não pode
    -- terminar antes de começar (check da tabela).
    update public.matricula_turmas
    set fim = greatest(efetivo, inicio),
        motivo_saida = coalesce(motivo_saida, 'assinatura cancelada')
    where matricula_id = m.id and (fim is null or fim > efetivo);
  end if;

  update public.solicitacoes_cancelamento
  set status = 'confirmada',
      resolvida_em = now(),
      resolvida_por = auth.uid(),
      observacao_equipe = nullif(trim(coalesce(p_observacao, '')), '')
  where id = p_solicitacao;

  -- 7.1 "confirmado por escrito por nós": é este e-mail.
  select * into c from public.clientes where id = s.cliente_id;
  perform public.enfileirar_email(
    'cancelamento_confirmado', c.email,
    jsonb_build_object(
      'nome', c.nome,
      'plano', s.plano_nome,
      'vigente_ate', efetivo,
      'dentro_prazo', s.dentro_prazo,
      'proxima_renovacao', s.proxima_renovacao,
      'devolucao_centavos', s.devolucao_desconto_centavos,
      'observacao', nullif(trim(coalesce(p_observacao, '')), '')
    ),
    'cancelamento-confirmado:' || s.id
  );

  return efetivo;
end;
$fn$;

comment on function public.confirmar_cancelamento_plano(uuid, text) is
  'Gestao confirma o pedido (7.1). Encerra a assinatura na data do retrato: fim do ciclo '
  'pago (dentro do prazo) ou fim do ciclo seguinte (fora), cancela cobrancas posteriores, '
  'fecha assentos de turma fixa e envia a confirmacao por escrito ao aluno.';


-- ------------------------------------------------------------
-- 9. cancelar_assinatura() deixa de ser do aluno (C1)
--
-- Reescrita fiel de 20260908120000 com três mudanças: sem o ramo do
-- aluno; fecha um pedido pendente, se houver (a equipe resolveu por
-- fora); e o assento futuro não termina antes de começar.
-- ------------------------------------------------------------
create or replace function public.cancelar_assinatura(
  p_matricula uuid, p_motivo text default null
) returns date language plpgsql security definer set search_path = '' as $fn$
declare m record;
begin
  -- Aluno pede por solicitar_cancelamento_plano(); encerrar é da equipe.
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito à equipe — o aluno solicita o cancelamento pelo portal';
  end if;

  select * into m from public.matriculas where id = p_matricula for update;
  if not found then raise exception 'matrícula inexistente'; end if;

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

  update public.entradas_financeiras
  set status = 'cancelada'
  where matricula_id = p_matricula and ciclo > m.ciclo_atual and status = 'prevista';

  update public.matricula_turmas
  set fim = greatest(m.data_fim, current_date, inicio),
      motivo_saida = coalesce(motivo_saida, 'assinatura cancelada')
  where matricula_id = p_matricula
    and (fim is null or fim > m.data_fim);

  update public.solicitacoes_cancelamento
  set status = 'confirmada',
      resolvida_em = now(),
      resolvida_por = auth.uid(),
      observacao_equipe = coalesce(observacao_equipe, 'cancelada direto pela equipe')
  where matricula_id = p_matricula and status = 'pendente';

  return m.data_fim;
end; $fn$;


-- ------------------------------------------------------------
-- 10a. cobrar_ciclo() — a cobrança da virada sai pelo preço do mensal (A16)
--
-- Reescrita de 20260821120000. A cobrança do próximo ciclo nasce em D-3,
-- ANTES de renovar_ciclo() trocar o produto na sucessão; lendo só
-- `preco_contratado_centavos`, o 1º mês do mensal saía com o preço do
-- semestral. Agora, se o ciclo cobrado é o que abre o contrato sucessor
-- (7.7), valem o preço e o nome do sucessor.
-- ------------------------------------------------------------
create or replace function public.cobrar_ciclo(
  p_matricula uuid,
  p_ciclo integer,
  p_vencimento date
) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  m record;
  pr record;
  suc record;
  valor bigint;
  nome text;
  e_id uuid;
begin
  select * into m from public.matriculas where id = p_matricula;
  if not found then return null; end if;
  select * into pr from public.produtos where id = m.plano_id;

  valor := m.preco_contratado_centavos;
  nome  := pr.nome;

  if p_ciclo > m.ciclo_atual
     and (m.ciclo_atual - m.ciclo_inicio_contrato + 1) >= m.ciclos_compromisso
     and pr.produto_sucessor_id is not null then
    select * into suc from public.produtos where id = pr.produto_sucessor_id and ativo;
    if found then
      valor := suc.preco_centavos;
      nome  := suc.nome;
    end if;
  end if;

  -- Cortesia e plano gratuito não geram cobrança: uma entrada de R$ 0,00
  -- só sujaria o financeiro como "a receber" que ninguém vai receber.
  if valor <= 0 then return null; end if;

  insert into public.entradas_financeiras
    (descricao, valor_centavos, categoria, status,
     data_competencia, data_prevista, cliente_id, matricula_id, ciclo)
  values
    (coalesce(nome, 'Plano') || ' — ciclo ' || p_ciclo,
     valor, 'mensalista', 'prevista',
     p_vencimento, p_vencimento, m.cliente_id, p_matricula, p_ciclo)
  on conflict do nothing
  returning id into e_id;

  return e_id;
end; $fn$;

comment on function public.cobrar_ciclo(uuid, integer, date) is
  'Idempotente pelo indice unico (matricula, ciclo). O ciclo que abre o contrato sucessor '
  '(7.7) e cobrado pelo preco do sucessor — a cobranca nasce antes de a sucessao trocar o produto.';


-- ------------------------------------------------------------
-- 10b. renovar_ciclo()
--
-- Reescrita de 20260821120000 com duas mudanças:
--
--   · A trava de "assinatura cancelada" olha a DATA efetiva. Antes,
--     qualquer `cancelada_em` recusava — o que tornava impossível cumprir
--     o 7.1 ("pedido com menos de 5 dias vale para a renovação seguinte").
--   · A16: na sucessão o ciclo NÃO volta a 1. `ciclo_inicio_contrato`
--     marca o começo do contrato novo, e o compromisso é contado a partir
--     dele. E o aluno recebe o e-mail de que o plano virou mensal.
-- ------------------------------------------------------------
create or replace function public.renovar_ciclo(p_matricula uuid)
returns integer language plpgsql security definer set search_path = '' as $fn$
declare
  m record;
  pr record;
  suc record;
  novo_ciclo integer;
  novo_inicio date;
  novo_fim date;
  validade date;
  lote uuid;
  excedente integer;
  teto integer;
  sucedeu boolean := false;
  r record;
  plano_antigo text;
  c record;
  cfg record;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito à equipe';
  end if;

  select * into m from public.matriculas where id = p_matricula for update;
  if not found then
    raise exception 'matrícula inexistente';
  end if;
  if m.status = 'cancelada' then
    raise exception 'matrícula cancelada não renova';
  end if;
  -- Cancelada renova só se o último dia de acesso fica DEPOIS do ciclo
  -- atual — é o pedido fora do prazo, que ainda tem uma renovação (7.1).
  if m.cancelada_em is not null
     and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em <= m.data_fim) then
    raise exception 'assinatura cancelada — não renova (créditos valem até %)',
      m.cancelamento_efetivo_em;
  end if;

  select * into pr from public.produtos where id = m.plano_id;

  -- ---- Fim do compromisso: sucessão, continuação ou parada ----
  -- O ciclo que conta é o do contrato vigente, não o contador absoluto.
  if (m.ciclo_atual - m.ciclo_inicio_contrato + 1) >= m.ciclos_compromisso then
    if pr.produto_sucessor_id is not null then
      select * into suc from public.produtos where id = pr.produto_sucessor_id and ativo;
      if found then
        plano_antigo := pr.nome;
        update public.matriculas
        set plano_id = suc.id,
            preco_contratado_centavos = suc.preco_centavos,
            ciclos_compromisso = suc.ciclos_compromisso,
            creditos_total = suc.creditos_por_ciclo,
            renova_automaticamente = coalesce(suc.renova_automaticamente, false)
        where id = p_matricula;
        -- `ciclo_inicio_contrato` só muda junto com o avanço do ciclo, lá
        -- embaixo: gravar 7 agora, com o ciclo ainda em 6, fura o check.

        select * into m from public.matriculas where id = p_matricula;
        pr := suc;
        sucedeu := true;
      end if;
    end if;

    if not sucedeu and not m.renova_automaticamente then
      raise exception 'compromisso encerrado (ciclo % de %) — contrate um plano novo',
        m.ciclo_atual, m.ciclos_compromisso;
    end if;
  end if;

  -- A16: o ciclo só cresce. Voltar a 1 colidia com as cobranças do
  -- semestral no índice único (matrícula, ciclo).
  novo_ciclo  := m.ciclo_atual + 1;
  novo_inicio := m.data_fim + 1;
  novo_fim    := novo_inicio + pr.periodicidade_dias;

  if not coalesce(pr.acumula_creditos, false) then
    for r in
      select l.id, coalesce(sum(ce.delta), 0) as saldo
      from public.creditos_lotes l
      left join public.creditos_eventos ce on ce.lote_id = l.id
      where l.matricula_id = p_matricula and l.ciclo <= m.ciclo_atual
      group by l.id
      having coalesce(sum(ce.delta), 0) > 0
    loop
      insert into public.creditos_eventos
        (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
      values (p_matricula, r.id, -r.saldo, 'expiracao',
              'fim do ciclo ' || m.ciclo_atual, auth.uid());
    end loop;
  end if;

  update public.matriculas
  set ciclo_atual = novo_ciclo,
      -- Sucessão: o contrato novo começa neste ciclo (A16).
      ciclo_inicio_contrato = case when sucedeu then novo_ciclo else ciclo_inicio_contrato end,
      data_inicio = novo_inicio,
      data_fim    = novo_fim,
      creditos_total = pr.creditos_por_ciclo,
      status = case when status = 'inadimplente' then 'ativa'::public.status_matricula
                    else status end
  where id = p_matricula;

  if pr.gera_credito and pr.creditos_por_ciclo > 0 then
    validade := novo_inicio + coalesce(pr.validade_creditos_dias, pr.periodicidade_dias);

    insert into public.creditos_lotes
      (matricula_id, ciclo, quantidade, validade, origem, detalhe)
    values (p_matricula, novo_ciclo, pr.creditos_por_ciclo, validade, 'compra',
            pr.nome || ' — ciclo ' || novo_ciclo)
    returning id into lote;

    insert into public.creditos_eventos
      (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
    values (p_matricula, lote, pr.creditos_por_ciclo, 'compra',
            pr.nome || ' — ciclo ' || novo_ciclo, auth.uid());
  end if;

  teto := pr.teto_acumulo_ciclos;
  if coalesce(pr.acumula_creditos, false) and teto is not null and pr.creditos_por_ciclo > 0 then
    excedente := public.saldo_disponivel(p_matricula) - (teto * pr.creditos_por_ciclo);
    if excedente > 0 then
      for r in
        select l.id, coalesce(sum(ce.delta), 0) as saldo
        from public.creditos_lotes l
        left join public.creditos_eventos ce on ce.lote_id = l.id
        where l.matricula_id = p_matricula and l.validade >= current_date
        group by l.id
        having coalesce(sum(ce.delta), 0) > 0
        order by min(l.validade), min(l.criado_em)
      loop
        exit when excedente <= 0;
        insert into public.creditos_eventos
          (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
        values (p_matricula, r.id, -least(r.saldo, excedente), 'expiracao',
                'teto de acúmulo (' || teto || ' ciclos)', auth.uid());
        excedente := excedente - least(r.saldo, excedente);
      end loop;
    end if;
  end if;

  perform public.cobrar_ciclo(p_matricula, novo_ciclo, novo_inicio);

  -- 7.7: o semestral virou mensal. O aluno já foi avisado antes (ver
  -- processar_assinaturas); este é o "aconteceu", com o valor novo e a
  -- data da próxima renovação. Quem já tem cancelamento confirmado não
  -- recebe: a mensagem que vale para ele é a da confirmação.
  if sucedeu and m.cancelada_em is null then
    select * into cfg from public.config_agendamento;
    select nome, email into c from public.clientes where id = m.cliente_id;
    perform public.enfileirar_email(
      'plano_virou_mensal', c.email,
      jsonb_build_object(
        'nome', c.nome,
        'plano_antigo', plano_antigo,
        'plano_novo', pr.nome,
        'valor_centavos', pr.preco_centavos,
        'inicio', novo_inicio,
        'proxima_renovacao', novo_fim + 1,
        'prazo_cancelamento', novo_fim + 1 - coalesce(cfg.dias_antecedencia_cancelamento_plano, 5)
      ),
      'sucessao:' || p_matricula || ':' || novo_ciclo
    );
  end if;

  return novo_ciclo;
end; $fn$;


-- ------------------------------------------------------------
-- 11. processar_assinaturas() — respeita o pedido dentro do prazo
--
-- Reescrita fiel de 20260821120000 com duas mudanças:
--
--   a) Pedido de cancelamento DENTRO do prazo e ainda não confirmado
--      segura a cobrança e a renovação daquele ciclo. O prazo (D-5) vem
--      antes da cobrança (D-3 do fim do ciclo = D-4 da renovação), então
--      sem isto a rotina geraria a cobrança de um ciclo que o aluno tem o
--      direito de não pagar — e com cartão recorrente ela seria real.
--   b) Cancelamento confirmado FORA do prazo ainda cobra e renova uma
--      vez: o `cancelamento_efetivo_em` além do ciclo atual é o sinal.
-- ------------------------------------------------------------
create or replace function public.processar_assinaturas()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  cfg record;
  r record;
  n_cobrancas integer := 0;
  n_renovadas integer := 0;
  n_inadimplentes integer := 0;
  n_encerradas integer := 0;
  n_expiracoes integer := 0;
  n_seguradas integer := 0;
  n_avisos_fim integer := 0;
  pago boolean;
  c record;
begin
  select * into cfg from public.config_agendamento;

  -- 0) 7.7: aviso de que o semestral vai virar mensal, com antecedência
  --    para o aluno decidir (pedir o cancelamento, ou contratar um novo
  --    semestral). Janela em vez de dia exato: se o cron falhar um dia, o
  --    aviso sai no seguinte; o `ref` do e-mail impede o repetido.
  for r in
    select m.id, m.cliente_id, m.data_fim, m.ciclo_atual, m.preco_contratado_centavos,
           pr.nome as plano, suc.nome as sucessor, suc.preco_centavos as preco_sucessor
    from public.matriculas m
    join public.produtos pr on pr.id = m.plano_id
    join public.produtos suc on suc.id = pr.produto_sucessor_id and suc.ativo
    where m.status in ('ativa', 'inadimplente')
      and m.renova_automaticamente
      and m.cancelada_em is null
      and m.ciclos_compromisso > 1
      and (m.ciclo_atual - m.ciclo_inicio_contrato + 1) >= m.ciclos_compromisso
      and (m.data_fim + 1) - current_date between 1 and cfg.dias_aviso_fim_compromisso
      and not exists (
        select 1 from public.solicitacoes_cancelamento s
        where s.matricula_id = m.id and s.status = 'pendente'
      )
  loop
    select nome, email into c from public.clientes where id = r.cliente_id;
    perform public.enfileirar_email(
      'fim_semestral', c.email,
      jsonb_build_object(
        'nome', c.nome,
        'plano', r.plano,
        'sucessor', r.sucessor,
        'preco_atual_centavos', r.preco_contratado_centavos,
        'preco_sucessor_centavos', r.preco_sucessor,
        'fim_semestral', r.data_fim,
        'inicio_mensal', r.data_fim + 1,
        'prazo_cancelamento', r.data_fim + 1 - cfg.dias_antecedencia_cancelamento_plano,
        'ainda_no_prazo', current_date <= r.data_fim + 1 - cfg.dias_antecedencia_cancelamento_plano
      ),
      'fim-semestral:' || r.id || ':' || r.ciclo_atual
    );
    n_avisos_fim := n_avisos_fim + 1;
  end loop;

  -- 1) Cobrança do próximo ciclo, em D-<antecedência>.
  for r in
    select m.id, m.ciclo_atual, m.data_fim
    from public.matriculas m
    where m.status in ('ativa', 'inadimplente')
      and m.renova_automaticamente
      and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em > m.data_fim)
      and m.data_fim = current_date + cfg.dias_antecedencia_cobranca
      and not exists (
        select 1 from public.solicitacoes_cancelamento s
        where s.matricula_id = m.id and s.status = 'pendente'
          and s.dentro_prazo and s.proxima_renovacao = m.data_fim + 1
      )
  loop
    if public.cobrar_ciclo(r.id, r.ciclo_atual + 1, r.data_fim + 1) is not null then
      n_cobrancas := n_cobrancas + 1;
    end if;
  end loop;

  -- 2) Ciclo terminou: renova quem pagou, marca inadimplente quem não.
  for r in
    select m.id, m.ciclo_atual, m.data_fim, m.preco_contratado_centavos
    from public.matriculas m
    where m.status = 'ativa'
      and m.data_fim < current_date
      and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em > current_date)
  loop
    if not exists (
      select 1 from public.matriculas mm
      where mm.id = r.id and mm.renova_automaticamente
    ) then
      continue;
    end if;

    -- Pedido dentro do prazo esperando a gestão: não renova nem marca
    -- inadimplência. A matrícula aguarda a confirmação (ou a desistência).
    if exists (
      select 1 from public.solicitacoes_cancelamento s
      where s.matricula_id = r.id and s.status = 'pendente'
        and s.dentro_prazo and s.proxima_renovacao = r.data_fim + 1
    ) then
      n_seguradas := n_seguradas + 1;
      continue;
    end if;

    pago := r.preco_contratado_centavos <= 0 or exists (
      select 1 from public.entradas_financeiras e
      where e.matricula_id = r.id and e.ciclo = r.ciclo_atual + 1
        and e.status = 'recebida'
    );

    if pago then
      begin
        perform public.renovar_ciclo(r.id);
        n_renovadas := n_renovadas + 1;
      exception when others then
        raise warning 'renovacao falhou para %: %', r.id, sqlerrm;
      end;
    else
      perform public.marcar_inadimplente(r.id);
      n_inadimplentes := n_inadimplentes + 1;
    end if;
  end loop;

  -- 3) Cancelamento programado que chegou a hora.
  update public.matriculas
  set status = 'cancelada'
  where cancelamento_efetivo_em is not null
    and cancelamento_efetivo_em < current_date
    and status <> 'cancelada';
  get diagnostics n_encerradas = row_count;

  -- 4) Expiração VISÍVEL (o saldo já ignora lote vencido).
  for r in
    select l.id as lote_id, l.matricula_id, l.validade,
           coalesce(sum(ce.delta), 0) as saldo
    from public.creditos_lotes l
    left join public.creditos_eventos ce on ce.lote_id = l.id
    where l.validade < current_date
    group by l.id
    having coalesce(sum(ce.delta), 0) > 0
  loop
    insert into public.creditos_eventos
      (matricula_id, lote_id, delta, motivo, detalhe)
    values (r.matricula_id, r.lote_id, -r.saldo, 'expiracao',
            'validade em ' || r.validade);
    n_expiracoes := n_expiracoes + 1;
  end loop;

  return jsonb_build_object(
    'cobrancas', n_cobrancas,
    'renovadas', n_renovadas,
    'inadimplentes', n_inadimplentes,
    'encerradas', n_encerradas,
    'expiracoes', n_expiracoes,
    'seguradas_por_pedido', n_seguradas,
    'avisos_fim_semestral', n_avisos_fim
  );
end; $fn$;


-- ------------------------------------------------------------
-- 12. Grade pública: sala e modalidade
--
-- O estúdio tem duas salas (20260921140000) e duas turmas podem
-- acontecer no mesmo horário: sem a sala, o card da agenda não diz para
-- onde ir. `modalidade_id` alimenta o filtro por modalidade sem
-- depender do texto. Colunas novas no FIM — `create or replace` não
-- aceita no meio, e assim a view mantém o comentário e o grant.
-- ------------------------------------------------------------
create or replace view public.vw_grade_publica as
select
  t.id as turma_id,
  t.modalidade,
  t.dia_semana,
  t.horario,
  t.duracao_minutos,
  t.capacidade,
  p.nome as professora_nome,
  c.nome as categoria_nome,
  c.cor as categoria_cor,
  c.cor_fundo as categoria_cor_fundo,
  c.cor_texto as categoria_cor_texto,
  s.nome as sala_nome,
  t.modalidade_id
from public.turmas t
  join public.professoras p on p.id = t.professora_id
  left join public.modalidades m on m.id = t.modalidade_id
  left join public.categorias_modalidade c on c.id = m.categoria_id
  left join public.salas s on s.id = t.sala_id
where t.ativa;


-- ------------------------------------------------------------
-- 13. Permissões
-- ------------------------------------------------------------
-- Motores internos: só as funções definer acima os chamam.
revoke execute on function public.regras_cancelamento_plano(uuid, date) from public, anon, authenticated;
revoke execute on function public.emails_gestao() from public, anon, authenticated;

revoke execute on function public.meus_planos() from public, anon;
grant  execute on function public.meus_planos() to authenticated;

revoke execute on function public.solicitar_cancelamento_plano(uuid, text) from public, anon;
grant  execute on function public.solicitar_cancelamento_plano(uuid, text) to authenticated;

revoke execute on function public.retirar_solicitacao_cancelamento(uuid, text) from public, anon;
grant  execute on function public.retirar_solicitacao_cancelamento(uuid, text) to authenticated;

revoke execute on function public.confirmar_cancelamento_plano(uuid, text) from public, anon;
grant  execute on function public.confirmar_cancelamento_plano(uuid, text) to authenticated;
