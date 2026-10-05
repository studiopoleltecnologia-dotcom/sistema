-- ============================================================
-- O abatimento da aula experimental
-- 05/10/2026
-- ============================================================
-- Regulamento 10.1, nas duas cláusulas de produto experimental:
--
--   "Se o aluno contratar qualquer plano em até 7 dias após a
--    experiência, o valor pago é abatido da contratação. O abatimento
--    não se soma a outros."
--
-- Hoje o documento promete isso e **nada no sistema faz**. Na prática o
-- abatimento acontece na conversa, por fora: a equipe combina um valor
-- e cobra menos. Era exatamente essa a preocupação da gestão —
-- *"precisa estruturar pra isso não se perder no faturamento"*.
--
-- ## O que "não se perder no faturamento" exige
--
-- Três coisas, e cada uma é uma decisão de modelagem:
--
-- 1. **O preço da matrícula NÃO muda.** O abatimento é do primeiro
--    ciclo. Baixar `matriculas.preco_contratado_centavos` daria desconto
--    em todos os ciclos seguintes, para sempre — o erro mais caro
--    possível aqui, e silencioso.
-- 2. **O valor bruto continua visível.** O abatimento é uma linha, não
--    um preço menor: a solicitação guarda `preco_centavos` (o bruto) e
--    `abatimento_centavos` ao lado. Quem olhar depois vê "plano de R$
--    170 com R$ 40 abatidos", não "plano de R$ 130".
-- 3. **A receita conta o LÍQUIDO, uma vez só.** O faturamento MEI é por
--    regime de caixa (CLAUDE.md §8), e os R$ 40 da experimental já foram
--    contados quando ela foi paga. Lançar o bruto no plano contaria o
--    mesmo dinheiro duas vezes e inflaria o teto do MEI com dinheiro que
--    não existe.
--
-- ## De onde sai o valor, e de onde sai o prazo
--
-- Nenhum dos dois é constante no código:
--
-- * **o valor** é o que a pessoa **efetivamente pagou** — a soma das
--   entradas `recebidas` daquela matrícula experimental. Não é R$ 40 nem
--   R$ 70 escritos aqui: é o dinheiro que entrou. Se a experimental foi
--   cortesia, não há o que abater.
-- * **o prazo** é `config_agendamento.dias_abatimento_experimental` (7),
--   contado a partir da **experiência** — a última presença da pessoa a
--   partir da compra. Quem comprou e nunca veio não teve experiência, e
--   aí o prazo conta da compra, senão o direito ficaria aberto para
--   sempre.
--
-- E "experimental" também não é o nome do produto: é o produto que tem o
-- requisito `nunca_treinou` (`produto_requisitos`). Mesma disciplina do
-- resto do catálogo.
--
-- ## O retrato é tirado no PEDIDO
--
-- `solicitar_contratacao` grava o abatimento junto do preço. É o pedido
-- que o 10.1 chama de "contratar", então é nele que o prazo se mede —
-- quem pede no 7º dia e paga no 9º não perde o direito porque a fila da
-- gestão demorou. E, como retrato, ele não muda depois: o aluno paga o
-- que o link dele diz.
--
-- Um índice único parcial garante o "não se soma a outros" no banco e
-- não na tela: a mesma experimental não pode abater dois pedidos vivos.
-- Pedido recusado ou cancelado devolve o direito, de propósito.
--
-- ⚠️ **Cartão recorrente não carrega abatimento.** No checkout de
-- assinatura o Asaas tem UM valor por ciclo: abater ali daria desconto
-- todos os meses. A Edge Function recusa esse caminho quando há
-- abatimento, com a mensagem dizendo para emitir o link de pagamento
-- (Pix/cartão à vista) na primeira cobrança. Recusar é melhor que
-- aplicar errado em silêncio — e, de passagem, Pix é o meio sem taxa.
-- ============================================================


-- ------------------------------------------------------------
-- 1. As colunas do abatimento, ao lado do preço
-- ------------------------------------------------------------
alter table public.solicitacoes_contratacao
  add column if not exists abatimento_centavos bigint not null default 0
    check (abatimento_centavos >= 0),
  add column if not exists abatimento_origem_id uuid
    references public.matriculas(id) on delete set null;

comment on column public.solicitacoes_contratacao.abatimento_centavos is
  'Abatimento da aula experimental (regulamento 10.1), em centavos. Retrato do momento do pedido. O bruto fica em preco_centavos: o que se cobra é a diferença, e os dois juntos é o que faz o desconto não se perder no faturamento.';

comment on column public.solicitacoes_contratacao.abatimento_origem_id is
  'A matrícula da experimental que gerou o abatimento. É o que impede usar a mesma experimental duas vezes.';

-- "O abatimento não se soma a outros", no banco: uma experimental abate
-- um pedido vivo, e só um. Recusado e cancelado ficam fora — eles
-- devolvem o direito, que é o comportamento certo para quem desistiu.
create unique index if not exists abatimento_usado_uma_vez
  on public.solicitacoes_contratacao (abatimento_origem_id)
  where abatimento_origem_id is not null
    and status in ('aguardando_aprovacao', 'aguardando_pagamento', 'concluida');


-- ------------------------------------------------------------
-- 2. A conta, num lugar só
-- ------------------------------------------------------------
-- Devolve sempre uma linha, com `motivo` dizendo por que não tem quando
-- não tem — é esse texto que a tela do aluno e a da equipe mostram. Sem
-- ele, a ausência do abatimento pareceria um bug do sistema.
create or replace function public.abatimento_disponivel(p_cliente uuid)
returns table (
  tem boolean,
  valor_centavos bigint,
  origem_matricula_id uuid,
  produto_nome text,
  experiencia_em date,
  prazo_ate date,
  motivo text
)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  cfg record;
  o record;
  dias integer;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into cfg from public.config_agendamento where id;
  dias := coalesce(cfg.dias_abatimento_experimental, 0);

  if dias <= 0 then
    return query select false, 0::bigint, null::uuid, null::text, null::date, null::date,
      'o abatimento da experimental está desligado na configuração'::text;
    return;
  end if;

  -- A experimental desta pessoa: produto com o requisito
  -- `nunca_treinou` (COLUNA, não nome), a mais recente.
  --
  -- `pago` é dinheiro que ENTROU (entrada recebida), não o preço de
  -- tabela: experimental de cortesia não gera abatimento, e
  -- experimental ainda não paga também não.
  --
  -- `experiencia` é a última presença da pessoa a partir da compra.
  -- Por `presencas.cliente_id` e não pelo agendamento, porque a
  -- professora pode ter incluído a pessoa na chamada sem reserva
  -- (regra 9.6) — e isso é tão experiência quanto a outra.
  select
    m.id as matricula_id,
    pr.nome as nome,
    coalesce((
      select sum(e.valor_centavos) from public.entradas_financeiras e
       where e.matricula_id = m.id and e.status = 'recebida'
    ), 0)::bigint as pago,
    coalesce((
      select max(p.data_aula) from public.presencas p
       where p.cliente_id = p_cliente and p.presente
         and p.data_aula >= m.data_inicio
    ), m.data_inicio) as experiencia
  into o
  from public.matriculas m
  join public.produtos pr on pr.id = m.plano_id
  where m.cliente_id = p_cliente
    and exists (
      select 1 from public.produto_requisitos r
       where r.produto_id = pr.id and r.tipo = 'nunca_treinou'
    )
  order by m.criada_em desc
  limit 1;

  if not found then
    return query select false, 0::bigint, null::uuid, null::text, null::date, null::date,
      'esta pessoa não comprou aula experimental'::text;
    return;
  end if;

  if o.pago <= 0 then
    return query select false, 0::bigint, o.matricula_id, o.nome, o.experiencia, null::date,
      'a aula experimental não teve pagamento registrado — não há valor a abater'::text;
    return;
  end if;

  if hoje > o.experiencia + dias then
    return query select false, 0::bigint, o.matricula_id, o.nome, o.experiencia,
      (o.experiencia + dias)::date,
      format('o prazo de %s dias após a experiência terminou em %s',
             dias, to_char(o.experiencia + dias, 'DD/MM/YYYY'))::text;
    return;
  end if;

  if exists (
    select 1 from public.solicitacoes_contratacao s
     where s.abatimento_origem_id = o.matricula_id
       and s.status in ('aguardando_aprovacao', 'aguardando_pagamento', 'concluida')
  ) then
    return query select false, 0::bigint, o.matricula_id, o.nome, o.experiencia,
      (o.experiencia + dias)::date,
      'o abatimento desta experimental já foi usado em outra contratação'::text;
    return;
  end if;

  return query select true, o.pago, o.matricula_id, o.nome, o.experiencia,
    (o.experiencia + dias)::date, null::text;
end;
$function$;

comment on function public.abatimento_disponivel(uuid) is
  'O abatimento da experimental a que esta pessoa tem direito (regulamento 10.1): o valor EFETIVAMENTE PAGO pela experimental, se a contratação cabe no prazo de config_agendamento.dias_abatimento_experimental contado da experiência. Uma conta só, lida pela tela antes do pedido e gravada como retrato por solicitar_contratacao().';

revoke execute on function public.abatimento_disponivel(uuid) from public, anon;
grant execute on function public.abatimento_disponivel(uuid) to authenticated;


-- ------------------------------------------------------------
-- 3. O que se cobra, num lugar só
-- ------------------------------------------------------------
-- O gateway, o e-mail do link e as duas telas precisam do mesmo número.
-- Em função, e não repetido em cada um: subtração espalhada é como
-- aparece a cobrança que não bate com o que a tela prometeu.
create or replace function public.valor_a_cobrar(p_solicitacao uuid)
returns bigint
language sql
stable security definer
set search_path to ''
as $function$
  select greatest(s.preco_centavos - coalesce(s.abatimento_centavos, 0), 0)::bigint
  from public.solicitacoes_contratacao s
  where s.id = p_solicitacao;
$function$;

comment on function public.valor_a_cobrar(uuid) is
  'Preço menos abatimento: o valor que vai ao gateway e ao e-mail. Uma conta só, para a cobrança nunca divergir do que a tela prometeu.';

revoke execute on function public.valor_a_cobrar(uuid) from public, anon;
grant execute on function public.valor_a_cobrar(uuid) to authenticated;


-- ------------------------------------------------------------
-- 4. O pedido grava o retrato
-- ------------------------------------------------------------
-- Gerada do arquivo de `20261004120000` (§8). Diferenças, e só elas:
-- a conta do abatimento antes do insert, as duas colunas novas no
-- insert, a cortesia passando a olhar o valor LÍQUIDO e o aviso da
-- gestão levando o abatimento.
create or replace function public.solicitar_contratacao(
  p_cliente uuid,
  p_produto uuid,
  p_turmas uuid[] default '{}',
  p_justificativa text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  pr record;
  imp record;
  eh_cliente boolean;
  eh_gestao boolean;
  just text := nullif(btrim(coalesce(p_justificativa, '')), '');
  s_id uuid;
  abat record;
  abatimento bigint := 0;
  origem_abatimento uuid;
  liquido bigint;
  n integer;
  distintas uuid[];
  t uuid;
  dados jsonb;
begin
  if auth.uid() is null then
    raise exception 'requer sessão autenticada';
  end if;

  eh_cliente := public.is_cliente();
  eh_gestao := public.is_gestao();

  if eh_cliente then
    if p_cliente <> public.cliente_atual() then
      raise exception 'aluno só pode contratar para si mesmo';
    end if;
  elsif not public.is_socia() then
    raise exception 'acesso restrito à equipe ou ao próprio aluno';
  end if;

  select * into pr from public.produtos where id = p_produto and ativo;
  if not found then
    raise exception 'produto inexistente ou inativo';
  end if;
  if eh_cliente and not pr.visivel_no_catalogo then
    raise exception 'produto inexistente ou inativo';
  end if;
  if pr.status = 'interno' and not eh_gestao then
    raise exception
      '“%” é um plano interno da equipe — só a gestão pode conceder', pr.nome;
  end if;

  if coalesce(pr.turmas_fixas, 0) > 0 then
    -- A vaga sai da capacidade da sala (regulamento 2.3.1), então este
    -- pedido não pode virar cobrança sozinho. A constraint
    -- `turma_fixa_exige_aprovacao` garante o dado; isto garante o fluxo.
    if pr.politica_contratacao <> 'aprovacao_previa' then
      raise exception
        '% é turma fixa e está configurado como contratação automática — a vaga tem de ser confirmada antes de qualquer cobrança',
        pr.nome;
    end if;

    select count(distinct x) into n from unnest(p_turmas) as x;
    if n <> pr.turmas_fixas then
      raise exception '% exige % turma(s) distinta(s); vieram %',
        pr.nome, pr.turmas_fixas, n;
    end if;
    select array_agg(distinct x) into distintas from unnest(p_turmas) as x;
    foreach t in array distintas loop
      perform public.validar_assento_fixo(t, null);
    end loop;
  elsif array_length(p_turmas, 1) > 0 then
    raise exception '% não é uma Mensalidade por Turma Fixa', pr.nome;
  end if;

  select * into imp from public.impedimento_para_contratar(p_cliente, p_produto);
  if imp.motivo is not null then
    if not imp.excepcionavel or eh_cliente or not eh_gestao then
      raise exception '%', imp.motivo;
    end if;
    if just is null then
      raise exception
        '% — para vender assim mesmo, informe a justificativa (ela fica registrada)',
        imp.motivo;
    end if;
  end if;

  if exists (
    select 1 from public.solicitacoes_contratacao
    where cliente_id = p_cliente and produto_id = p_produto
      and status in ('aguardando_aprovacao', 'aguardando_pagamento')
  ) then
    raise exception
      'já existe um pedido em aberto deste produto para este aluno — conclua ou cancele o anterior';
  end if;

  -- ---- o abatimento da experimental (regulamento 10.1) ----
  -- Retrato no momento do PEDIDO, igual ao preço: é o pedido que o
  -- 10.1 chama de "contratar", e o prazo se conta até ele. Quem pede
  -- no 7º dia e paga no 9º não perde o abatimento por causa da fila.
  --
  -- Só plano que renova: o 10.1 diz "contratar qualquer plano", e o
  -- que o regulamento chama de plano é o recorrente (§3). Avulsa e
  -- pacote são compra pontual. A condição sai da COLUNA, não do nome.
  if coalesce(pr.renova_automaticamente, false) and pr.preco_centavos > 0 then
    select * into abat from public.abatimento_disponivel(p_cliente);
    if abat.tem then
      -- Nunca passa do preço: o excedente não vira crédito nem troco
      -- ("o abatimento não se soma a outros").
      abatimento := least(abat.valor_centavos, pr.preco_centavos);
      origem_abatimento := abat.origem_matricula_id;
    end if;
  end if;
  liquido := pr.preco_centavos - abatimento;

  insert into public.solicitacoes_contratacao
    (cliente_id, produto_id, turmas, origem, preco_centavos,
     justificativa, solicitada_por, abatimento_centavos, abatimento_origem_id)
  values
    (p_cliente, p_produto, coalesce(distintas, '{}'),
     case when eh_cliente then 'portal' else 'equipe' end,
     pr.preco_centavos, just, auth.uid(),
     abatimento, origem_abatimento)
  returning id into s_id;

  -- ---- o desfecho ----
  -- Produto de política automática não espera aprovação de ninguém: vai
  -- direto para "aguardando pagamento", e o próximo passo do aluno é
  -- aceitar o contrato e pagar.
  if pr.politica_contratacao = 'automatica' then
    update public.solicitacoes_contratacao
    set status = 'aguardando_pagamento',
        decidida_em = now(),
        motivo_decisao = 'liberado automaticamente pela política do produto'
    where id = s_id;

    -- Cortesia não tem o que cobrar nem o que aceitar. Olha o valor
    -- LÍQUIDO: abatimento que cobre o preço inteiro deixa a
    -- contratação sem nada a pagar, e emitir cobrança de R$ 0,00 o
    -- gateway recusa (e a constraint da entrada também).
    if liquido <= 0 then
      perform public.confirmar_pagamento_contratacao(s_id, 'cortesia', now());
    end if;

  elsif eh_gestao then
    -- Quem já é gestão aprova no mesmo passo, com nome e data gravados.
    -- A vaga foi conferida no `validar_assento_fixo` acima.
    perform public.aprovar_contratacao(s_id, null);
  else
    -- Fica esperando decisão: o aluno recebe o comprovante do pedido e a
    -- gestão recebe o aviso. Sem o segundo, o pedido dorme na fila.
    dados := jsonb_build_object(
      'produto', pr.nome,
      'valor_centavos', pr.preco_centavos,
      'abatimento_centavos', abatimento,
      'turmas', (select coalesce(jsonb_agg(public.rotulo_turma(x) order by x), '[]'::jsonb)
                   from unnest(coalesce(distintas, '{}'::uuid[])) as x),
      'solicitada_em', to_char(now() at time zone 'America/Sao_Paulo',
                               'DD/MM/YYYY "às" HH24:MI'));

    perform public.avisar_aluno_contratacao(
      p_cliente, 'contratacao_aguardando_aprovacao', dados, s_id);
    perform public.avisar_gestao_contratacao(s_id);
  end if;

  return s_id;
end;
$function$;

comment on function public.solicitar_contratacao(uuid, uuid, uuid[], text) is
  'O pedido de contratação. Grava o preço E o abatimento da experimental (10.1) como retrato do momento do pedido — é o pedido que o regulamento chama de "contratar", então é nele que o prazo se mede.';

revoke execute on function public.solicitar_contratacao(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.solicitar_contratacao(uuid, uuid, uuid[], text) to authenticated;


-- ------------------------------------------------------------
-- 5. O pagamento lança o LÍQUIDO no faturamento
-- ------------------------------------------------------------
-- Gerada do arquivo de `20260924120000` (§6). A única diferença é o
-- bloco da entrada do ciclo 1, que agora olha o abatimento.
create or replace function public.confirmar_pagamento_contratacao(
  p_solicitacao uuid,
  p_forma text default 'pix',
  p_pago_em timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
  m_id uuid;
  t uuid;
  liquido bigint;
begin
  -- Contexto de serviço (webhook) passa; pela tela, só a gestão.
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'só a gestão confirma pagamento';
  end if;

  select * into s from public.solicitacoes_contratacao
  where id = p_solicitacao for update;
  if not found then
    raise exception 'solicitação não encontrada';
  end if;
  if s.status = 'concluida' then
    -- Reentrega de webhook é normal: não cria matrícula duplicada.
    return s.matricula_id;
  end if;
  if s.status <> 'aguardando_pagamento' then
    raise exception 'esta solicitação não está aguardando pagamento (%)', s.status;
  end if;

  -- Turma fixa: revalidar o assento ANTES de criar a matrícula. Entre
  -- o pedido e o pagamento outra pessoa pode ter ocupado a vaga, e
  -- descobrir isso depois significaria duas alunas com assento fixo no
  -- mesmo lugar. Falhar aqui é ruim (o dinheiro já entrou), mas é um
  -- problema que a gestão resolve; overbooking silencioso não é.
  if array_length(s.turmas, 1) > 0 then
    foreach t in array s.turmas loop
      perform public.validar_assento_fixo(t, current_date);
    end loop;
  end if;

  m_id := public.matricular_produto(s.cliente_id, s.produto_id, s.justificativa);

  if array_length(s.turmas, 1) > 0 then
    foreach t in array s.turmas loop
      insert into public.matricula_turmas (matricula_id, turma_id, inicio, criada_por)
      values (m_id, t, current_date, s.solicitada_por);
    end loop;
  end if;

  -- Quita a cobrança do ciclo 1 que `cobrar_ciclo()` acabou de gerar.
  --
  -- Com abatimento da experimental (10.1), o que entrou no caixa é o
  -- LÍQUIDO, e é ele que vale para o faturamento MEI, que é por
  -- regime de caixa (§8): o valor da experimental já foi contado
  -- quando ela foi paga, então manter o bruto aqui contaria o mesmo
  -- dinheiro duas vezes.
  --
  -- `preco_contratado_centavos` da matrícula NÃO muda: o abatimento é
  -- do primeiro ciclo, e baixar o preço da matrícula daria desconto
  -- em todos os ciclos seguintes — para sempre.
  liquido := greatest(s.preco_centavos - coalesce(s.abatimento_centavos, 0), 0);

  if coalesce(s.abatimento_centavos, 0) > 0 then
    if liquido > 0 then
      update public.entradas_financeiras
      set status = 'recebida',
          data_caixa = (p_pago_em at time zone 'America/Sao_Paulo')::date,
          valor_centavos = liquido,
          descricao = descricao || ' (abatimento da experimental: -R$ '
                      || to_char(s.abatimento_centavos / 100.0, 'FM999G990D00') || ')'
      where matricula_id = m_id and ciclo = 1 and status = 'prevista';
    else
      -- Nada entrou: a entrada não pode ir a zero (check > 0), então
      -- ela é cancelada com o motivo no texto em vez de virar receita
      -- fantasma.
      update public.entradas_financeiras
      set status = 'cancelada',
          descricao = descricao || ' (coberto pelo abatimento da experimental)'
      where matricula_id = m_id and ciclo = 1 and status = 'prevista';
    end if;
  else
    update public.entradas_financeiras
    set status = 'recebida', data_caixa = (p_pago_em at time zone 'America/Sao_Paulo')::date
    where matricula_id = m_id and ciclo = 1 and status = 'prevista';
  end if;

  update public.solicitacoes_contratacao
  set status = 'concluida',
      matricula_id = m_id,
      pago_em = p_pago_em,
      forma_pagamento = nullif(btrim(coalesce(p_forma, '')), '')
  where id = p_solicitacao;

  perform public.avisar_aluno_contratacao(
    s.cliente_id, 'contratacao_concluida',
    jsonb_build_object(
      'produto', (select nome from public.produtos where id = s.produto_id)),
    p_solicitacao);

  return m_id;
end;
$function$;

comment on function public.confirmar_pagamento_contratacao(uuid, text, timestamptz) is
  'Confirma o pagamento e cria a matrícula. Com abatimento da experimental, a entrada do ciclo 1 fica no valor LÍQUIDO (regime de caixa, §8) — o valor da experimental já foi contado quando ela foi paga. O preço da matrícula não muda: o abatimento é só do primeiro ciclo.';

revoke execute on function public.confirmar_pagamento_contratacao(uuid, text, timestamptz)
  from public, anon;
grant execute on function public.confirmar_pagamento_contratacao(uuid, text, timestamptz)
  to authenticated;


-- ------------------------------------------------------------
-- 6. As telas e o gateway leem pela view
-- ------------------------------------------------------------
-- Colunas novas no FIM, pela mesma razão de sempre: `create or replace
-- view` recusa inserir coluna no meio, e derrubar esta view obrigaria a
-- recriar tudo que depende dela.
--
-- `valor_a_cobrar_centavos` vem da função, não de uma subtração escrita
-- aqui — é o mesmo número que a Edge Function manda ao Asaas.
create or replace view public.vw_solicitacoes
with (security_invoker = true) as
select
  s.id,
  s.cliente_id,
  c.nome as cliente_nome,
  c.email as cliente_email,
  s.produto_id,
  p.nome as produto_nome,
  p.tipo_produto,
  p.status as produto_status,
  s.turmas,
  s.status,
  s.origem,
  s.preco_centavos,
  s.justificativa,
  s.solicitada_em,
  s.decidida_em,
  s.motivo_decisao,
  s.matricula_id,
  s.pago_em,
  s.forma_pagamento,
  sol.nome as solicitante_nome,
  dec.nome as decisor_nome,
  cb.id as cobranca_id,
  cb.status as cobranca_status,
  cb.url_pagamento,
  cb.vencimento as cobranca_vencimento,
  p.turmas_fixas,
  p.politica_contratacao,
  (select coalesce(array_agg(public.rotulo_turma(x) order by x), '{}')
     from unnest(s.turmas) as x) as turmas_rotulo,
  exists (select 1 from public.contratos ct where ct.solicitacao_id = s.id) as contrato_aceito,
  -- Novas (05/10):
  s.abatimento_centavos,
  public.valor_a_cobrar(s.id) as valor_a_cobrar_centavos
from public.solicitacoes_contratacao s
join public.clientes c on c.id = s.cliente_id
join public.produtos p on p.id = s.produto_id
left join public.socias sol on sol.id = s.solicitada_por
left join public.socias dec on dec.id = s.decidida_por
left join lateral (
  select * from public.cobrancas x
  where x.solicitacao_id = s.id
  order by x.criada_em desc
  limit 1
) cb on true;

comment on view public.vw_solicitacoes is
  'A fila de contratações, para as telas e para a Edge Function de cobrança. Traz o bruto (preco_centavos), o abatimento da experimental e o valor a cobrar — os três juntos, porque é isso que faz o desconto não se perder no faturamento.';


-- ------------------------------------------------------------
-- 7. O parâmetro deixa de ser só texto
-- ------------------------------------------------------------
-- O comentário avisava "só no texto (backlog A25)". Agora ele tem
-- mecanismo, e quem ler a coluna precisa saber que mexer nela muda o
-- comportamento — não só o documento.
comment on column public.config_agendamento.dias_abatimento_experimental is
  'Regulamento 10.1: prazo, contado da EXPERIÊNCIA (última presença), para o valor pago na experimental ser abatido da contratação de um plano. Lido por abatimento_disponivel(). Mudar aqui muda o comportamento, não só o texto do contrato.';

-- E o do convidado também: ele ganhou mecanismo em 20261008120000 e o
-- comentário ficou para trás.
comment on column public.config_agendamento.meses_sem_treinar_convidado is
  'Regulamento 11.1: o convidado não pode ter treinado no estúdio nos últimos N meses. Lido por elegibilidade_convidado().';
