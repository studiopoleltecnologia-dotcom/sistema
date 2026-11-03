-- ============================================================
-- Contratação automática, contrato antes do pagamento, PAR-Q no agendamento
-- 30/09/2026
-- ============================================================
-- A `20260924120000` colocou uma aprovação humana entre o pedido e o
-- pagamento ("sempre passa por alguém", D14). A gestão reverteu a decisão
-- em 30/09: para contratação normal o aluno tem que conseguir ir do
-- cadastro ao agendamento sozinho.
--
--   cadastro → escolher plano → aceitar o contrato → pagar → plano ativo
--   → agendar
--
-- ## O que NÃO muda: turma fixa continua passando pela equipe
--
-- Não é contradição com o de cima. A turma fixa consome um **assento na
-- sala** durante toda a vigência (regulamento 2.3.1–2.3.3), e a decisão
-- anterior da gestão é que ninguém seja cobrado antes de a vaga estar
-- confirmada. Por isso a política vira **coluna do produto**, não `if`:
--
--   `automatica`        crédito, avulsos, experimental, Studio+
--   `aprovacao_previa`  mensalidade por turma fixa, produto interno
--
-- Trocar a política de um produto é editar dado, não migration.
--
-- ## O contrato entra imediatamente antes do pagamento
--
-- Uma regra só, para os dois caminhos: **não se emite cobrança sem
-- contrato aceito**. No caminho automático o aluno aceita e o link sai na
-- hora; na turma fixa ele aceita depois de a vaga ser aprovada. Assim o
-- contrato nunca documenta uma contratação que vai ser recusada, e o
-- aceite nunca acontece depois de o dinheiro sair.
--
-- A trava fica em `registrar_cobranca()`, que é por onde **toda** cobrança
-- passa (Edge Function `asaas-cobranca`, primeira e recorrentes). Não em
-- `confirmar_pagamento_contratacao()`: ali um `raise` viraria 500 no
-- webhook do Asaas, e 15 falhas pausam a fila da conta inteira.
--
-- ## PAR-Q bloqueia o AGENDAMENTO, não a compra
--
-- Decisão da gestão, e é o que o documento oficial pede: quem responde
-- "Sim" a qualquer pergunta precisa de atestado **antes da prática**. Ele
-- compra o plano normalmente, recebe os créditos, e a primeira reserva
-- espera o aval. Recusar a compra empurraria a pessoa para fora do
-- sistema; recusar a reserva a mantém dentro, com o caminho à vista.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A política de contratação do produto
-- ------------------------------------------------------------
alter table public.produtos
  add column if not exists politica_contratacao text not null default 'automatica';

do $$
begin
  alter table public.produtos
    add constraint politica_contratacao_conhecida
    check (politica_contratacao in ('automatica', 'aprovacao_previa'));
exception when duplicate_object then null;
end $$;

comment on column public.produtos.politica_contratacao is
  'automatica = o aluno aceita o contrato, paga e ativa sozinho. aprovacao_previa = a equipe valida antes de existir cobrança (turma fixa, por causa do assento na sala). Editável pela gestão.';

-- Turma fixa e produto interno nascem com aprovação prévia; o resto é
-- automático. Feito por regra (colunas), não por nome de produto.
update public.produtos
set politica_contratacao = 'aprovacao_previa'
where turmas_fixas > 0 or status = 'interno';


-- ------------------------------------------------------------
-- 2. Existe contrato aceito para esta contratação?
-- ------------------------------------------------------------
create or replace function public.contrato_aceito(p_solicitacao uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select exists (select 1 from public.contratos where solicitacao_id = p_solicitacao);
$function$;

revoke execute on function public.contrato_aceito(uuid) from public, anon;
grant execute on function public.contrato_aceito(uuid) to authenticated;


-- ------------------------------------------------------------
-- 3. Nenhuma cobrança sem contrato aceito
-- ------------------------------------------------------------
-- Reescrita fiel de `20260926120000`, com a guarda no começo. O corpo
-- original é preservado — só entra a checagem.
create or replace function public.registrar_cobranca(
  p_solicitacao uuid,
  p_matricula uuid,
  p_ciclo integer,
  p_cliente uuid,
  p_valor_centavos bigint,
  p_vencimento date,
  p_descricao text,
  p_provider text,
  p_provider_ref text,
  p_url text
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c_id uuid;
  exige boolean;
begin
  -- Só contexto de serviço (Edge Function) ou gestão. O aluno não
  -- inventa cobrança para si.
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  -- ---- a guarda nova ----
  -- Vale só para a PRIMEIRA cobrança (a que nasce de uma solicitação).
  -- Nos ciclos seguintes o contrato já foi aceito, e exigir de novo
  -- travaria a renovação de quem está em dia.
  --
  -- Fica ANTES da busca por provider_ref de propósito: a reentrada
  -- idempotente também não deve criar cobrança sem contrato.
  if p_solicitacao is not null then
    select coalesce(exigir_contrato, false) into exige
    from public.config_cadastro where id;

    if coalesce(exige, false) and not public.contrato_aceito(p_solicitacao) then
      raise exception
        'esta contratação ainda não tem Contrato de Adesão aceito — o aluno precisa aceitar antes de a cobrança ser emitida';
    end if;
  end if;

  select id into c_id from public.cobrancas
  where provider = p_provider and provider_ref = p_provider_ref;
  if c_id is not null then
    return c_id;
  end if;

  insert into public.cobrancas
    (solicitacao_id, matricula_id, ciclo, cliente_id, valor_centavos,
     vencimento, descricao, provider, provider_ref, url_pagamento)
  values
    (p_solicitacao, p_matricula, p_ciclo, p_cliente, p_valor_centavos,
     p_vencimento, p_descricao, p_provider, p_provider_ref, p_url)
  returning id into c_id;

  return c_id;
end;
$function$;

revoke execute on function public.registrar_cobranca(uuid, uuid, integer, uuid, bigint, date, text, text, text, text)
  from public, anon;
grant execute on function public.registrar_cobranca(uuid, uuid, integer, uuid, bigint, date, text, text, text, text)
  to authenticated;


-- ------------------------------------------------------------
-- 4. Solicitar: automático não espera ninguém
-- ------------------------------------------------------------
-- Reescrita fiel de `20260924120000` (§4) e `20260930120000`: muda só o
-- desfecho no fim. O que antes dependia de `is_gestao()` agora depende da
-- POLÍTICA DO PRODUTO.
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
  n integer;
  distintas uuid[];
  t uuid;
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
    if eh_cliente then
      -- O assento sai da capacidade da sala (regulamento 2.3.1).
      raise exception 'mensalidade por turma fixa é contratada com a equipe';
    end if;
    select count(distinct x) into n from unnest(p_turmas) as x;
    if n <> pr.turmas_fixas then
      raise exception '% exige % turma(s) distinta(s); vieram %',
        pr.nome, pr.turmas_fixas, n;
    end if;
    select array_agg(distinct x) into distintas from unnest(p_turmas) as x;
    foreach t in array distintas loop
      perform public.validar_assento_fixo(t, current_date);
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

  insert into public.solicitacoes_contratacao
    (cliente_id, produto_id, turmas, origem, preco_centavos,
     justificativa, solicitada_por)
  values
    (p_cliente, p_produto, coalesce(distintas, '{}'),
     case when eh_cliente then 'portal' else 'equipe' end,
     pr.preco_centavos, just, auth.uid())
  returning id into s_id;

  -- ---- o desfecho ----
  -- Produto de política automática não espera aprovação de ninguém: vai
  -- direto para "aguardando pagamento", e o próximo passo do aluno é
  -- aceitar o contrato e pagar. A decisão fica registrada como
  -- `decidida_em` do sistema (sem `decidida_por`), para o histórico
  -- continuar dizendo quando o pedido foi liberado.
  if pr.politica_contratacao = 'automatica' then
    update public.solicitacoes_contratacao
    set status = 'aguardando_pagamento',
        decidida_em = now(),
        motivo_decisao = 'liberado automaticamente pela política do produto'
    where id = s_id;

    -- Cortesia (preço zero) não tem o que cobrar nem o que aceitar.
    if pr.preco_centavos <= 0 then
      perform public.confirmar_pagamento_contratacao(s_id, 'cortesia', now());
    end if;

  elsif eh_gestao then
    -- Quem já é gestão aprova no mesmo passo, com nome e data gravados.
    perform public.aprovar_contratacao(s_id, null);
  else
    perform public.avisar_aluno_contratacao(
      p_cliente, 'contratacao_aguardando_aprovacao',
      jsonb_build_object('produto', pr.nome), s_id);
  end if;

  return s_id;
end;
$function$;

revoke execute on function public.solicitar_contratacao(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.solicitar_contratacao(uuid, uuid, uuid[], text) to authenticated;


-- ------------------------------------------------------------
-- 5. O contrato acompanha o pagamento e a matrícula
-- ------------------------------------------------------------
-- Gatilho em vez de alteração de `confirmar_pagamento_contratacao()`: a
-- função é longa, roda dentro do webhook, e reescrevê-la inteira para
-- acrescentar duas colunas é risco desproporcional. O gatilho amarra o
-- contrato à matrícula no instante em que a solicitação conclui.
create or replace function public.contrato_segue_a_contratacao()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status = 'concluida' and coalesce(old.status::text, '') <> 'concluida' then
    update public.contratos
    set matricula_id = coalesce(new.matricula_id, matricula_id),
        forma_pagamento = coalesce(new.forma_pagamento, forma_pagamento),
        cobranca_id = coalesce(
          cobranca_id,
          (select c.id from public.cobrancas c
           where c.solicitacao_id = new.id and c.status = 'paga'
           order by c.pago_em desc limit 1)),
        provider_ref = coalesce(
          provider_ref,
          (select c.provider_ref from public.cobrancas c
           where c.solicitacao_id = new.id and c.status = 'paga'
           order by c.pago_em desc limit 1))
    where solicitacao_id = new.id;
  end if;
  return new;
end;
$function$;

revoke execute on function public.contrato_segue_a_contratacao() from public, anon;

drop trigger if exists contrato_segue_a_contratacao on public.solicitacoes_contratacao;
create trigger contrato_segue_a_contratacao
  after update of status on public.solicitacoes_contratacao
  for each row execute function public.contrato_segue_a_contratacao();


-- ------------------------------------------------------------
-- 6. PAR-Q no agendamento
-- ------------------------------------------------------------
-- Uma função de guarda, chamada pelo gatilho de validação de agendamento.
-- Separada para a mensagem ser a do documento oficial e para a tela poder
-- fazer a MESMA pergunta antes de deixar o aluno tentar.
create or replace function public.parq_impede_agendamento(p_cliente uuid)
returns text
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  exige boolean;
  sit record;
begin
  select coalesce(exigir_parq, false) into exige from public.config_cadastro where id;
  if not coalesce(exige, false) then
    return null;
  end if;

  select * into sit from public.parq_situacao(p_cliente);

  if not found or sit.situacao = 'nao_preenchido' then
    return 'Antes da primeira aula é preciso preencher o PAR-Q e o Termo de Responsabilidade. Você faz isso em Perfil → Saúde.';
  end if;

  if sit.liberado then
    return null;
  end if;

  -- A mensagem própria de cada desfecho vem de `parq_situacao`, que a lê
  -- da versão do questionário — o texto é o do documento oficial.
  return sit.mensagem;
end;
$function$;

comment on function public.parq_impede_agendamento(uuid) is
  'Devolve o motivo pelo qual o PAR-Q impede agendar, ou null quando libera. Inerte enquanto config_cadastro.exigir_parq for false.';

revoke execute on function public.parq_impede_agendamento(uuid) from public, anon;
grant execute on function public.parq_impede_agendamento(uuid) to authenticated;


-- ------------------------------------------------------------
-- 7. O bloqueio, como gatilho
-- ------------------------------------------------------------
-- Gatilho, e não uma trava dentro de `agendar_aula()`: assim vale para
-- TODO caminho que cria reserva — o portal, a equipe pela Agenda, e
-- qualquer RPC futura. Reescrever `agendar_aula()` (uma função de 120
-- linhas, com seis travas) para acrescentar uma sétima é risco maior que
-- o ganho, e uma reserva criada por fora dela escaparia da regra.
--
-- **Canais de parceiro ficam de fora.** A reserva do Wellhub/TotalPass
-- nasce no aplicativo deles: recusar aqui deixaria o app achando que
-- reservou, o `total_booked` divergiria (§9.1) e o check-in cairia na fila
-- de pendências sem ninguém entender por quê. Para esses canais o
-- bloqueio é físico, na recepção — e é a marcação de presença que a
-- equipe usa para perceber.
create or replace function public.exigir_parq_para_agendar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  motivo text;
begin
  if new.canal in ('wellhub', 'classpass') then
    return new;
  end if;

  motivo := public.parq_impede_agendamento(new.cliente_id);
  if motivo is not null then
    raise exception '%', motivo;
  end if;

  return new;
end;
$function$;

revoke execute on function public.exigir_parq_para_agendar() from public, anon;

drop trigger if exists exigir_parq_para_agendar on public.agendamentos;
create trigger exigir_parq_para_agendar
  before insert on public.agendamentos
  for each row execute function public.exigir_parq_para_agendar();
