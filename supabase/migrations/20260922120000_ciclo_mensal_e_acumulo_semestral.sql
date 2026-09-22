-- ============================================================
-- Ciclo mensal no mesmo dia (A17) e acúmulo do semestral (A15)
-- 22/09/2026
--
-- A17 — decisão da gestão em 22/09: o ciclo da assinatura é o MÊS, e a
-- renovação cai sempre no mesmo dia do mês da contratação. Antes era
-- `data_inicio + periodicidade_dias`: 31 dias corridos, com a data
-- andando no calendário (e 13 cobranças em alguns anos).
-- O motivo é o Asaas. A assinatura dele só tem ciclos de calendário
-- (MONTHLY vence no mesmo dia; não existe "a cada 30 dias"), e vencimento
-- em 29/30/31 num mês que não tem o dia cai no último dia daquele mês e
-- volta ao dia original no seguinte. A conta daqui é a mesma, para as
-- datas do sistema e as da cobrança nunca divergirem.
-- O regulamento 3.1 ("30 dias corridos") muda junto — é texto da gestão.
--
-- A15 — regulamento 3.4 e 3.6, com a decisão de 22/09 sobre cortesia:
--   · semestral: o saldo do plano que sobra passa para o ciclo seguinte,
--     até um ciclo do plano (`teto_acumulo_ciclos` = 1): o saldo nunca
--     passa do dobro. Antes o lote morria no fim do próprio ciclo, e o
--     teto cortava o saldo TOTAL em 1× — na prática, acúmulo nenhum;
--   · ao fim do compromisso (6 ciclos) o que sobrou expira (3.6);
--   · cortesia e reposição (`ajuste`, `reposicao`) não contam no limite e
--     não morrem na renovação: valem até a data que tiverem. Antes, a
--     renovação do mensal as expirava junto com o ciclo.
--
-- Produção sem nenhuma matrícula em 22/09: não há dado a converter.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Produto: ciclo em meses
-- ------------------------------------------------------------
alter table public.produtos
  add column if not exists periodicidade_meses integer
    check (periodicidade_meses is null or periodicidade_meses between 1 and 12);

comment on column public.produtos.periodicidade_meses is
  'Ciclo da assinatura em meses civis: renova no mesmo dia do mes da contratacao (dia 29-31 '
  'cai no ultimo dia de mes curto e volta no seguinte — igual ao Asaas). Null = ciclo em dias '
  '(periodicidade_dias), que so a compra unica usa.';

-- Todo plano do catálogo é de 30 dias hoje; vira 1 mês. O que ainda não
-- renova (legado do Wix) também, para não mudar de regra se for ligado.
update public.produtos
set periodicidade_meses = greatest(1, least(12, round(periodicidade_dias / 30.0)::integer))
where periodicidade_meses is null
  and (tipo_produto = 'plano' or renova_automaticamente);

-- Assinatura em dias não tem como ser cobrada pelo Asaas: a trava é aqui.
alter table public.produtos drop constraint if exists produtos_assinatura_em_meses;
alter table public.produtos
  add constraint produtos_assinatura_em_meses
  check (not renova_automaticamente or periodicidade_meses is not null);

comment on column public.produtos.teto_acumulo_ciclos is
  'Quantos ciclos de credito DO PLANO podem passar para o ciclo seguinte (regulamento 3.4). '
  '1 = ate um ciclo: o saldo do plano nunca passa do dobro. So vale com acumula_creditos. '
  'Cortesia e reposicao ficam fora da conta (decisao de 22/09/2026).';


-- ------------------------------------------------------------
-- 2. Matrícula: o dia da renovação
--
-- Guardado porque não dá para deduzir de `data_fim`: quem contratou no
-- dia 31 renova em 28/02 e volta a 31/03. Encadear pela data anterior
-- prenderia a renovação no dia 28 para sempre.
-- ------------------------------------------------------------
alter table public.matriculas
  add column if not exists dia_renovacao smallint
    check (dia_renovacao between 1 and 31);

comment on column public.matriculas.dia_renovacao is
  'Dia do mes em que a assinatura renova — o dia da contratacao. Mes que nao tem o dia '
  'renova no ultimo dia dele (A17).';

-- Matrícula existente mantém a próxima renovação que já tem.
update public.matriculas
set dia_renovacao = extract(day from coalesce(data_fim + 1, data_inicio))::smallint
where dia_renovacao is null;

-- Quem inserir sem informar herda o dia do início. Hoje só
-- matricular_produto() insere, e ela informa; o gatilho é a rede.
create or replace function public.matriculas_dia_renovacao()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if new.dia_renovacao is null then
    new.dia_renovacao := extract(day from coalesce(new.data_inicio, current_date))::smallint;
  end if;
  return new;
end; $fn$;

drop trigger if exists matriculas_dia_renovacao on public.matriculas;
create trigger matriculas_dia_renovacao
  before insert on public.matriculas
  for each row execute function public.matriculas_dia_renovacao();

alter table public.matriculas alter column dia_renovacao set not null;


-- ------------------------------------------------------------
-- 3. A conta da data — uma função só
-- ------------------------------------------------------------
create or replace function public.data_renovacao(
  p_base date,
  p_ciclos integer,
  p_dia integer,
  p_meses integer,
  p_dias integer
) returns date
language sql immutable set search_path = ''
as $fn$
  select case
    -- Em dias: o ciclo vai de `base` a `base + dias`, e o seguinte começa no dia depois.
    when p_meses is null then p_base + p_ciclos * (p_dias + 1)
    else (
      select make_date(
        extract(year from alvo)::integer,
        extract(month from alvo)::integer,
        least(
          coalesce(p_dia, extract(day from p_base)::integer),
          extract(day from alvo + interval '1 month' - interval '1 day')::integer
        )
      )
      from (
        select date_trunc('month', p_base::timestamp) + make_interval(months => p_ciclos * p_meses) as alvo
      ) x
    )
  end;
$fn$;

comment on function public.data_renovacao(date, integer, integer, integer, integer) is
  'Data da renovacao que acontece p_ciclos ciclos depois de p_base (inicio de um ciclo). '
  'Em meses: no dia p_dia, ou no ultimo dia do mes que nao o tem. O fim do ciclo e essa data '
  'menos um. Unica conta de data de ciclo do banco (A17).';


-- ------------------------------------------------------------
-- 4. matricular_produto() — o 1º ciclo já nasce no mês
--
-- Reescrita fiel de 20260908120000; muda só o fim do ciclo e o dia.
-- ------------------------------------------------------------
create or replace function public.matricular_produto(p_cliente uuid, p_plano uuid)
returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  pr record;
  m_id uuid;
  lote uuid;
  autor uuid;
  eh_cliente boolean;
  dia smallint;
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

  -- A17: assinatura vai até a véspera do mesmo dia no mês seguinte.
  dia := extract(day from current_date)::smallint;
  fim := public.data_renovacao(current_date, 1, dia, pr.periodicidade_meses, pr.periodicidade_dias) - 1;

  insert into public.matriculas
    (cliente_id, plano_id, data_inicio, data_fim, creditos_total,
     ciclos_compromisso, ciclo_atual,
     preco_contratado_centavos, renova_automaticamente, dia_renovacao)
  values
    (p_cliente, p_plano, current_date, fim,
     pr.creditos_por_ciclo, pr.ciclos_compromisso, 1,
     pr.preco_centavos, coalesce(pr.renova_automaticamente, false), dia)
  returning id into m_id;

  if pr.gera_credito and pr.creditos_por_ciclo > 0 then
    -- Sem validade própria, o crédito vale até o fim do ciclo.
    validade := case
      when pr.validade_creditos_dias is not null then current_date + pr.validade_creditos_dias
      else fim
    end;

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
-- 5. renovar_ciclo() — data do mês e saldo que passa adiante
--
-- Reescrita de 20260921200000. Mudam duas coisas:
--   · o fim do novo ciclo vem de data_renovacao() (A17);
--   · o saldo do plano do ciclo que termina (A15). Cortesia e reposição
--     não entram: nem expiram aqui, nem ocupam o limite. O excedente sai
--     dos lotes mais antigos — os mais novos ficam, e é deles que o
--     consumo tira depois (3.5), porque o lote que passa adiante e o lote
--     novo vencem no mesmo dia e o mais antigo é usado primeiro.
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
  sucedeu boolean := false;
  r record;
  plano_antigo text;
  c record;
  cfg record;
  acumula_plano boolean;
  fim_contrato boolean;
  passa boolean;
  cabe integer;
  fica integer;
  motivo_saida text;
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

  -- A15: o destino do saldo é regra do plano que TERMINA, não do sucessor.
  fim_contrato := m.ciclos_compromisso > 1
    and (m.ciclo_atual - m.ciclo_inicio_contrato + 1) >= m.ciclos_compromisso;
  acumula_plano := coalesce(pr.acumula_creditos, false);
  passa := acumula_plano and not fim_contrato;
  cabe := case
    when passa then greatest(coalesce(pr.teto_acumulo_ciclos, 1), 0) * pr.creditos_por_ciclo
    else 0
  end;
  motivo_saida := case
    when passa then 'limite de acúmulo — regulamento 3.4'
    when acumula_plano and fim_contrato then 'fim do compromisso — regulamento 3.6'
    else 'fim do ciclo ' || m.ciclo_atual
  end;

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
  -- A17: até a véspera do dia da renovação no mês seguinte.
  novo_fim    := public.data_renovacao(novo_inicio, 1, m.dia_renovacao,
                                       pr.periodicidade_meses, pr.periodicidade_dias) - 1;

  -- A15: saldo DO PLANO do ciclo que termina. Lote que ainda vale no
  -- último dia do ciclo; os mais novos primeiro, porque são os que ficam.
  for r in
    select l.id, coalesce(sum(ce.delta), 0)::integer as saldo
    from public.creditos_lotes l
    left join public.creditos_eventos ce on ce.lote_id = l.id
    where l.matricula_id = p_matricula
      and l.ciclo <= m.ciclo_atual
      and l.origem not in ('ajuste', 'reposicao')
      and l.validade >= m.data_fim
    group by l.id
    having coalesce(sum(ce.delta), 0) > 0
    order by l.validade desc, l.ciclo desc, l.criado_em desc
  loop
    fica := least(r.saldo, cabe);

    if r.saldo > fica then
      insert into public.creditos_eventos
        (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
      values (p_matricula, r.id, -(r.saldo - fica), 'expiracao', motivo_saida, auth.uid());
    end if;

    -- O que passa adiante continua no mesmo lote, só com a validade do
    -- ciclo novo: o aluno vê os mesmos créditos, com data nova.
    if fica > 0 then
      update public.creditos_lotes l
      set validade = greatest(l.validade, novo_fim)
      where l.id = r.id;
      cabe := cabe - fica;
    end if;
  end loop;

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
    validade := case
      when pr.validade_creditos_dias is not null then novo_inicio + pr.validade_creditos_dias
      else novo_fim
    end;

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
-- 6. regras_cancelamento_plano() — as datas pelo mês
--
-- Reescrita de 20260921200000; mudam só as duas contas de data que
-- somavam `periodicidade_dias`: o fim do compromisso e o "vale até" do
-- pedido fora do prazo.
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
  meses_seguinte integer;
  dias_seguinte integer;
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

  -- Fim do compromisso do semestral: a véspera da renovação que o fecha.
  if m.ciclos_compromisso > 1 and ciclo_contrato <= m.ciclos_compromisso then
    fim_compromisso := public.data_renovacao(
      m.data_fim + 1, m.ciclos_compromisso - ciclo_contrato,
      m.dia_renovacao, pr.periodicidade_meses, pr.periodicidade_dias) - 1;
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
    meses_seguinte := prox.periodicidade_meses;
    dias_seguinte := prox.periodicidade_dias;
  else
    proximo_plano_preco_centavos := m.preco_contratado_centavos;
    meses_seguinte := pr.periodicidade_meses;
    dias_seguinte := pr.periodicidade_dias;
  end if;

  -- 7.1 + 7.2: dentro do prazo, vale até o fim do ciclo pago. Fora, a
  -- próxima renovação acontece e o acesso vai até o fim DELA.
  vigente_ate := case
    when dentro_prazo then m.data_fim
    else public.data_renovacao(proxima_renovacao, 1, m.dia_renovacao,
                               meses_seguinte, dias_seguinte) - 1
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


-- ------------------------------------------------------------
-- 7. processar_assinaturas() — o saldo espera a renovação
--
-- Reescrita de 20260921200000; muda só o passo 4. Quem paga no dia do
-- vencimento (Pix, boleto) já foi marcado inadimplente de madrugada, e
-- o passo 4 expirava o saldo do semestral naquela mesma rodada: o
-- acúmulo (3.4) só valeria para quem pagou adiantado. Agora o lote do
-- plano de um semestral com a renovação pendente não expira aqui —
-- renovar_ciclo() decide o que passa. Se a matrícula encerrar sem
-- renovar, ele expira na rodada seguinte. Fora da validade, ele já não
-- conta no saldo (`saldo_disponivel` filtra por data): não dá para usar.
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
      -- A15: saldo do semestral com a renovação pendente espera por ela.
      and not exists (
        select 1
        from public.matriculas m
        join public.produtos pr on pr.id = m.plano_id
        where m.id = l.matricula_id
          and pr.acumula_creditos
          and m.renova_automaticamente
          and m.status in ('ativa', 'inadimplente')
          and l.origem not in ('ajuste', 'reposicao')
          and l.validade >= m.data_fim
      )
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
-- 8. meus_planos() — o portal diz "renova todo dia 17"
--
-- Duas colunas no fim (periodicidade_meses, dia_renovacao). Mudar o
-- retorno de uma função exige recriá-la; o corpo é o de 20260921200000.
-- ------------------------------------------------------------
drop function if exists public.meus_planos();

create function public.meus_planos()
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
  solicitacao_motivo text,
  periodicidade_meses integer,
  dia_renovacao integer
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
    s.motivo,
    pr.periodicidade_meses,
    m.dia_renovacao::integer
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
  '(regras_cancelamento_plano), a solicitacao de cancelamento mais relevante e o dia '
  'do mes em que o plano renova.';


-- ------------------------------------------------------------
-- 9. MRR mensalizado pelo mês
--
-- Mesmo resultado para os planos de hoje (1 mês = o preço); só deixa de
-- depender de `periodicidade_dias` para a assinatura.
-- ------------------------------------------------------------
create or replace view public.vw_mrr with (security_invoker = true) as
with cfg as (
  select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as ini_mes,
         (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date as prox_mes
), base as (
  select m.cliente_id,
         m.status,
         m.data_fim,
         m.criada_em,
         (case
            when p.periodicidade_meses is not null
              then round(p.preco_centavos::numeric / p.periodicidade_meses)
            else round(p.preco_centavos::numeric * 30 / greatest(p.periodicidade_dias, 1))
          end)::bigint as mensal_centavos
  from public.matriculas m
  join public.produtos p on p.id = m.plano_id
  where public.is_gestao()
)
select
  coalesce(sum(mensal_centavos) filter (where status = 'ativa'), 0)::bigint as mrr_centavos,
  count(distinct cliente_id) filter (where status = 'ativa')::integer as clientes_ativos,
  case
    when count(distinct cliente_id) filter (where status = 'ativa') > 0
      then round(coalesce(sum(mensal_centavos) filter (where status = 'ativa'), 0)
                 / count(distinct cliente_id) filter (where status = 'ativa'))::bigint
    else 0::bigint
  end as ticket_medio_centavos,
  count(*) filter (where status = 'ativa' and criada_em >= (select ini_mes from cfg))::integer as novos_mes,
  coalesce(sum(mensal_centavos) filter (where status = 'ativa' and criada_em >= (select ini_mes from cfg)), 0)::bigint
    as mrr_novos_centavos,
  count(*) filter (where status = 'inadimplente')::integer as inadimplentes,
  coalesce(sum(mensal_centavos) filter (where status = 'inadimplente'), 0)::bigint as mrr_em_risco_centavos,
  count(*) filter (where status = 'ativa' and data_fim >= (select ini_mes from cfg)
                     and data_fim < (select prox_mes from cfg))::integer as renovacoes_mes,
  coalesce(sum(mensal_centavos) filter (where status = 'ativa' and data_fim >= (select ini_mes from cfg)
                                          and data_fim < (select prox_mes from cfg)), 0)::bigint
    as mrr_renovacoes_centavos
from base;


-- ------------------------------------------------------------
-- 10. Permissões
-- ------------------------------------------------------------
-- Motores internos: só as funções definer acima os chamam.
revoke execute on function public.data_renovacao(date, integer, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.matriculas_dia_renovacao() from public, anon, authenticated;

-- meus_planos() foi recriada: volta ao recorte de antes.
revoke execute on function public.meus_planos() from public, anon;
grant  execute on function public.meus_planos() to authenticated;
