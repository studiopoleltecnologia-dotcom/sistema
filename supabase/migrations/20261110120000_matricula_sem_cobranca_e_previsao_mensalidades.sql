-- ============================================================
-- Matrícula sem cobrança pelo sistema, e a previsão de mensalidades
-- ============================================================
-- A gestão precisa cadastrar os alunos que já pagam hoje — para ter a
-- previsão de receita e a data em que ela entra — SEM que o sistema
-- emita cobrança para eles. Hoje isso não é possível, e o motivo é
-- concreto, não teórico:
--
--   · `matricular_produto()` termina chamando `cobrar_ciclo()`, que cria
--     a entrada `prevista` do ciclo 1 (isto é bom: é a previsão);
--   · `vw_cobrancas_a_emitir` lista toda entrada prevista sem cobrança;
--   · o cron `emitir-cobrancas` roda todo dia às 9h, ATIVO, e manda a
--     Edge Function emitir no gateway e mandar o link por e-mail.
--
-- Ou seja: cadastrar hoje significa, na manhã seguinte, uma cobrança
-- real e um e-mail de pagamento para cada aluno — justamente o que não
-- se quer. A trava não pode ser "não cadastra": tem de ser uma matrícula
-- que o emissor sabe que não é dele.
--
-- ------------------------------------------------------------
-- A segunda armadilha: inadimplência automática
-- ------------------------------------------------------------
-- `processar_assinaturas()` decide renovar ou marcar inadimplente pela
-- existência de uma entrada `recebida` do próximo ciclo. Para quem é
-- cobrado por fora, essa entrada não aparece — e no fim do ciclo o
-- aluno em dia seria marcado inadimplente e perderia o agendamento.
--
-- O sistema não emitiu nada, logo não tem como julgar o pagamento.
-- Então renova e deixa a previsão aberta: quem não pagou aparece na
-- lista de atrasados de Entradas, que é informação para a equipe, sem
-- virar bloqueio para o aluno.
--
-- ------------------------------------------------------------
-- A terceira: a previsão só existe três dias à frente
-- ------------------------------------------------------------
-- `cobrar_ciclo()` do próximo ciclo só roda em D-3
-- (`dias_antecedencia_cobranca`). Então "a receber" nunca mostra o mês
-- que vem — nem com os alunos cadastrados. Daí a view de previsão no
-- fim deste arquivo: ela PROJETA os ciclos futuros sem criar linha
-- nenhuma, o que mantém o emissor intocado (linha criada cedo seria
-- cobrança emitida cedo) e evita contar duas vezes o ciclo que já tem
-- entrada.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A coluna
-- ------------------------------------------------------------
alter table public.matriculas
  add column if not exists cobranca_externa boolean not null default false;

comment on column public.matriculas.cobranca_externa is
  'A cobranca desta matricula acontece FORA do sistema (link gerado a mao no gateway, transferencia, dinheiro). '
  'O ERP continua prevendo a receita, liberando credito e renovando o ciclo, mas nao emite cobranca '
  'e nao marca inadimplencia automatica — ele nao tem como saber se o dinheiro entrou. '
  'Desligar a coluna devolve a matricula ao emissor no proximo ciclo.';


-- ------------------------------------------------------------
-- 2. O emissor passa a ignorar essas matrículas
-- ------------------------------------------------------------
-- Reescrita de 20260927120000 com uma exclusão a mais. As três que já
-- existiam continuam: ciclo já cobrado, assinatura ativa no gateway e
-- matrícula cancelada.
create or replace view public.vw_cobrancas_a_emitir
with (security_invoker = true) as
select
  ef.id as entrada_id,
  ef.matricula_id,
  ef.ciclo,
  ef.valor_centavos,
  coalesce(ef.data_prevista, ef.data_competencia) as vencimento,
  ef.descricao,
  m.cliente_id,
  c.nome as cliente_nome,
  c.email as cliente_email,
  c.cpf as cliente_cpf,
  c.asaas_customer_id
from public.entradas_financeiras ef
join public.matriculas m on m.id = ef.matricula_id
join public.clientes c on c.id = m.cliente_id
where ef.status = 'prevista'
  and ef.matricula_id is not null
  and m.status <> 'cancelada'
  -- A trava nova. Fica aqui, e não no emissor, porque é o banco que
  -- tem de recusar: a Edge Function consome esta view sem perguntar.
  and not m.cobranca_externa
  and not exists (
    select 1 from public.cobrancas cb
    where cb.matricula_id = ef.matricula_id
      and cb.ciclo = ef.ciclo
      and cb.status <> 'cancelada'
  )
  and not exists (
    select 1 from public.assinaturas_gateway ag
    where ag.matricula_id = ef.matricula_id and ag.status = 'ativa'
  );

grant select on public.vw_cobrancas_a_emitir to authenticated;

comment on view public.vw_cobrancas_a_emitir is
  'Ciclos com entrada prevista e sem cobranca emitida. Exclui quem tem assinatura ativa no gateway '
  '(la quem emite e o proprio gateway) e quem e cobrado fora do sistema (matriculas.cobranca_externa).';


-- ------------------------------------------------------------
-- 3. Cadastrar quem já era aluno antes do sistema
-- ------------------------------------------------------------
-- `matricular()` e `matricular_turma_fixa()` começam a assinatura HOJE:
-- `data_inicio = current_date` e `dia_renovacao = dia de hoje`. Para
-- quem já paga há meses isso erra justamente o que a gestão quer saber
-- — a DATA em que o dinheiro entra. Quem renova dia 10 passaria a
-- renovar dia 4 só porque foi cadastrada num dia 4.
--
-- Esta função delega a criação para as RPCs que já existem (nada de
-- segunda implementação da matrícula) e depois reancora as três coisas
-- que a data de início determina: o ciclo, a validade do crédito e o
-- vencimento da previsão do ciclo 1.
--
-- É gestão, não equipe: "este aluno não é cobrado pelo sistema" é
-- decisão de dinheiro, da mesma família do Financeiro (§5.2).
--
-- O que NÃO é reancorado, de propósito: `matricula_turmas.inicio`
-- (o assento da turma fixa) continua sendo hoje. O ciclo de dinheiro é
-- retroativo; a ocupação da sala, não — recuar o assento tornaria as
-- aulas já passadas retroativamente mais cheias, mexendo em número que
-- já foi publicado para a Wellhub.
create or replace function public.matricular_aluno_de_fora(
  p_cliente uuid,
  p_plano uuid,
  p_data_inicio date,
  p_turmas uuid[] default null,
  p_cobranca_externa boolean default true,
  p_justificativa text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  pr record;
  m_id uuid;
  dia smallint;
  fim date;
  v_validade date;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'apenas a gestão pode cadastrar matrícula com cobrança fora do sistema';
  end if;

  if p_data_inicio is null then
    raise exception 'informe a data de início do ciclo atual do aluno';
  end if;

  select * into pr from public.produtos where id = p_plano and ativo;
  if not found then
    raise exception 'produto inexistente ou inativo';
  end if;

  dia := extract(day from p_data_inicio)::smallint;
  fim := public.data_renovacao(p_data_inicio, 1, dia,
                               pr.periodicidade_meses, pr.periodicidade_dias) - 1;

  -- A data tem de ser a do ciclo VIGENTE. Uma data mais antiga criaria
  -- uma matrícula já vencida, e `processar_assinaturas()` renovaria um
  -- ciclo por dia até alcançar o presente — cobrando e creditando ciclos
  -- que nunca existiram. Barrar aqui é mais honesto que limpar depois.
  if fim < current_date then
    raise exception
      'a data de início precisa ser a do ciclo que está correndo agora: com % o ciclo terminaria em %, que já passou',
      to_char(p_data_inicio, 'DD/MM/YYYY'), to_char(fim, 'DD/MM/YYYY');
  end if;

  -- Uma porta por tipo de produto, as mesmas do resto do sistema: a
  -- trava de "turma fixa exige assento" continua sendo delas.
  if coalesce(pr.turmas_fixas, 0) > 0 then
    if p_turmas is null or array_length(p_turmas, 1) is null then
      raise exception '% é uma Mensalidade por Turma Fixa: escolha a(s) turma(s) da grade', pr.nome;
    end if;
    m_id := public.matricular_turma_fixa(p_cliente, p_plano, p_turmas, p_justificativa);
  else
    if p_turmas is not null and array_length(p_turmas, 1) is not null then
      raise exception '% não é uma Mensalidade por Turma Fixa', pr.nome;
    end if;
    m_id := public.matricular(p_cliente, p_plano, p_justificativa);
  end if;

  update public.matriculas
  set data_inicio = p_data_inicio,
      data_fim = fim,
      dia_renovacao = dia,
      cobranca_externa = coalesce(p_cobranca_externa, true)
  where id = m_id;

  -- O crédito do ciclo 1 vale até o fim do ciclo reancorado (ou os dias
  -- próprios do produto contados da data real, não da de cadastro).
  if pr.gera_credito and coalesce(pr.creditos_por_ciclo, 0) > 0 then
    v_validade := case
      when pr.validade_creditos_dias is not null then p_data_inicio + pr.validade_creditos_dias
      else fim
    end;
    update public.creditos_lotes
    set validade = v_validade
    where matricula_id = m_id and ciclo = 1 and origem = 'compra';
  end if;

  -- A previsão do ciclo 1 vence no dia em que o aluno paga de fato. É
  -- esta linha que a gestão dá baixa quando o dinheiro entra.
  update public.entradas_financeiras
  set data_competencia = p_data_inicio,
      data_prevista = p_data_inicio
  where matricula_id = m_id and ciclo = 1 and status = 'prevista';

  insert into public.auditoria (tabela, registro_id, acao, depois, motivo)
  values ('matriculas', m_id, 'matricula_de_aluno_anterior_ao_sistema',
          jsonb_build_object('produto', pr.nome,
                             'cliente_id', p_cliente,
                             'data_inicio', p_data_inicio,
                             'cobranca_externa', coalesce(p_cobranca_externa, true)),
          nullif(btrim(coalesce(p_justificativa, '')), ''));

  return m_id;
end;
$fn$;

comment on function public.matricular_aluno_de_fora(uuid, uuid, date, uuid[], boolean, text) is
  'Matricula aluno que ja pagava antes do sistema: delega para matricular()/matricular_turma_fixa() '
  'e reancora o ciclo na data real, para a previsao cair no dia certo. Com cobranca_externa, o emissor '
  'nao cobra e processar_assinaturas() nao marca inadimplencia. Gestao apenas.';

revoke execute on function public.matricular_aluno_de_fora(uuid, uuid, date, uuid[], boolean, text)
  from public, anon;
grant execute on function public.matricular_aluno_de_fora(uuid, uuid, date, uuid[], boolean, text)
  to authenticated;


-- ------------------------------------------------------------
-- 4. Ligar/desligar depois, sem recadastrar
-- ------------------------------------------------------------
create or replace function public.definir_cobranca_externa(
  p_matricula uuid,
  p_externa boolean
) returns void
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'apenas a gestão pode mudar quem o sistema cobra';
  end if;

  update public.matriculas
  set cobranca_externa = coalesce(p_externa, false)
  where id = p_matricula;

  if not found then
    raise exception 'matrícula inexistente';
  end if;

  insert into public.auditoria (tabela, registro_id, acao, depois)
  values ('matriculas', p_matricula, 'cobranca_externa',
          jsonb_build_object('cobranca_externa', coalesce(p_externa, false)));
end;
$fn$;

comment on function public.definir_cobranca_externa(uuid, boolean) is
  'Liga/desliga a cobranca pelo sistema de uma matricula ja existente. Desligar o externo devolve '
  'a matricula ao emissor: o proximo ciclo previsto volta a virar cobranca no gateway.';

revoke execute on function public.definir_cobranca_externa(uuid, boolean) from public, anon;
grant execute on function public.definir_cobranca_externa(uuid, boolean) to authenticated;


-- ------------------------------------------------------------
-- 5. A previsão de mensalidades — 12 meses, sem criar linha nenhuma
-- ------------------------------------------------------------
-- O que a gestão pediu: "quanto entra de mensalista, e quando".
--
-- Por que uma VIEW e não entradas previstas gravadas à frente:
--
--  · linha prevista é cobrança a emitir (`vw_cobrancas_a_emitir`).
--    Gravar dezembro em novembro faria o emissor cobrar dezembro em
--    novembro — o oposto do que a previsão quer;
--  · `cobrar_ciclo()` é idempotente pelo índice único (matrícula,
--    ciclo). Pré-criar o ciclo faria a cobrança de verdade, em D-3,
--    virar no-op silencioso — e ninguém saberia que não foi emitida;
--  · previsão não é "a receber". Somar as duas no Resumo inflaria o
--    saldo do fim do mês, que é exatamente o erro que a #129 corrigiu.
--
-- O ciclo que JÁ tem entrada sai da projeção: ele é receita a receber
-- de verdade e aparece em Entradas. Sem isso, o ciclo corrente seria
-- contado duas vezes.
--
-- A conta de data é uma só, `data_renovacao()` (A17): o ciclo
-- `ciclo_atual + k` começa k renovações depois de `data_inicio`, que
-- `renovar_ciclo()` mantém sempre no início do ciclo corrente. Mês sem
-- o dia (29–31) cai no último dia e volta no seguinte.
create or replace view public.vw_previsao_mensalidades
with (security_invoker = true) as
with assinaturas as (
  select
    m.id as matricula_id,
    m.cliente_id,
    m.ciclo_atual,
    m.ciclo_inicio_contrato,
    m.ciclos_compromisso,
    m.data_inicio,
    m.dia_renovacao,
    m.preco_contratado_centavos,
    m.cobranca_externa,
    m.status::text as status_matricula,
    c.nome as cliente,
    pr.nome as plano,
    pr.periodicidade_meses,
    pr.periodicidade_dias,
    suc.nome as plano_sucessor,
    suc.preco_centavos as preco_sucessor_centavos
  from public.matriculas m
  join public.clientes c on c.id = m.cliente_id
  join public.produtos pr on pr.id = m.plano_id
  left join public.produtos suc
    on suc.id = pr.produto_sucessor_id and suc.ativo
  where m.status in ('ativa', 'inadimplente')
    and m.renova_automaticamente
    and m.cancelada_em is null
    -- Cortesia e Plano Equipe não entram: não há receita a prever.
    and m.preco_contratado_centavos > 0
    -- O número é financeiro, e `matriculas` não é gestão-only (as
    -- policies operacionais ainda são `is_socia()`). A trava fica aqui
    -- até a migração para `is_operacional()`; sem ela, a secretária
    -- veria a receita prevista aluno por aluno.
    and public.is_gestao()
),
projetados as (
  select
    a.*,
    a.ciclo_atual + k as ciclo,
    public.data_renovacao(a.data_inicio, k, a.dia_renovacao,
                          a.periodicidade_meses, a.periodicidade_dias) as vencimento,
    -- Mesma conta de `cobrar_ciclo()` (A16): o ciclo que abre o contrato
    -- sucessor já sai pelo preço do sucessor, e os seguintes também.
    ((a.ciclo_atual + k - a.ciclo_inicio_contrato) >= a.ciclos_compromisso
      and a.plano_sucessor is not null) as pelo_sucessor
  from assinaturas a
  cross join generate_series(1, 12) as k
)
select
  p.matricula_id,
  p.cliente_id,
  p.cliente,
  p.ciclo,
  p.vencimento,
  date_trunc('month', p.vencimento::timestamp)::date as mes,
  case when p.pelo_sucessor then p.plano_sucessor else p.plano end as plano,
  case when p.pelo_sucessor then p.preco_sucessor_centavos
       else p.preco_contratado_centavos end as valor_centavos,
  p.cobranca_externa,
  p.status_matricula
from projetados p
where not exists (
  select 1 from public.entradas_financeiras e
  where e.matricula_id = p.matricula_id
    and e.ciclo = p.ciclo
);

comment on view public.vw_previsao_mensalidades is
  'Previsao de receita de mensalidade por ciclo, 12 meses a frente. Nao grava nada: linha prevista '
  'gravada cedo seria cobranca emitida cedo. Exclui o ciclo que ja tem entrada (seria contado duas '
  'vezes) e aplica o preco do produto sucessor a partir do ciclo que abre o contrato sucessor (7.7).';

revoke all on public.vw_previsao_mensalidades from public, anon;
grant select on public.vw_previsao_mensalidades to authenticated;


-- ------------------------------------------------------------
-- 6. processar_assinaturas() — não marca inadimplente quem não cobramos
-- ------------------------------------------------------------
-- Reescrita FIEL de 20260922120000 (extraída do arquivo, não redigitada).
-- Mudam duas coisas, nada mais: o loop do passo 2 passa a trazer
-- `cobranca_externa`, e o teste de `pago` aceita essa matrícula.
--
-- O resto — aviso de fim de semestral, cobrança em D-3, renovação,
-- cancelamento programado, expiração de crédito — continua igual.
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
    select m.id, m.ciclo_atual, m.data_fim, m.preco_contratado_centavos,
           m.cobranca_externa
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

    -- Cobrança fora do sistema: o ERP não emitiu nada, logo não tem
    -- como saber se entrou. Marcar inadimplente aqui bloquearia o
    -- agendamento de quem pagou em dia por fora — é o sistema punindo
    -- o aluno pela própria cegueira. Então renova, e a entrada prevista
    -- do ciclo continua aberta em "a receber" até alguém dar baixa:
    -- quem não pagou aparece na lista de atrasados, sem perder a aula.
    pago := r.preco_contratado_centavos <= 0
      or r.cobranca_externa
      or exists (
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


-- ------------------------------------------------------------
-- 7. A guarda
-- ------------------------------------------------------------
-- Produção ainda não tem nenhuma matrícula, então guarda por contagem
-- de linha seria vazia e passaria por acidente. Estas provam a
-- ESTRUTURA (as travas estão no lugar) e a CONTA DE DATA, que é o que
-- decide se a previsão cai no dia certo.
do $$
declare
  v_def text;
  v_opts text;
begin
  -- 1. a coluna existe e nasce desligada
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matriculas'
      and column_name = 'cobranca_externa'
  ) then
    raise exception 'matriculas.cobranca_externa nao foi criada';
  end if;

  -- 2. o emissor exclui a cobranca externa
  v_def := pg_get_viewdef('public.vw_cobrancas_a_emitir'::regclass, true);
  if position('cobranca_externa' in v_def) = 0 then
    raise exception 'vw_cobrancas_a_emitir nao exclui cobranca_externa — o cron cobraria esses alunos';
  end if;

  -- 3. as duas views continuam security_invoker (sem isso viram furo de RLS)
  select array_to_string(reloptions, ',') into v_opts
    from pg_class where oid = 'public.vw_cobrancas_a_emitir'::regclass;
  if coalesce(v_opts, '') not like '%security_invoker=true%' then
    raise exception 'vw_cobrancas_a_emitir perdeu security_invoker';
  end if;

  select array_to_string(reloptions, ',') into v_opts
    from pg_class where oid = 'public.vw_previsao_mensalidades'::regclass;
  if coalesce(v_opts, '') not like '%security_invoker=true%' then
    raise exception 'vw_previsao_mensalidades nasceu sem security_invoker';
  end if;

  -- 4. a inadimplencia automatica passou a considerar a coluna
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'processar_assinaturas';
  if position('cobranca_externa' in v_def) = 0 then
    raise exception 'processar_assinaturas() ainda marcaria inadimplente quem o sistema nao cobra';
  end if;

  -- 5. a conta de data da projecao, nos meses que nao tem o dia
  --    (e o caso que mais erra: assinatura contratada em 31)
  if public.data_renovacao(date '2026-01-31', 1, 31, 1, null) <> date '2026-02-28' then
    raise exception 'projecao de 31/01 + 1 ciclo deveria cair em 28/02';
  end if;
  if public.data_renovacao(date '2026-01-31', 2, 31, 1, null) <> date '2026-03-31' then
    raise exception 'projecao de 31/01 + 2 ciclos deveria voltar para 31/03';
  end if;
  if public.data_renovacao(date '2026-11-10', 3, 10, 1, null) <> date '2027-02-10' then
    raise exception 'projecao de 10/11 + 3 ciclos deveria cair em 10/02';
  end if;
end $$;
