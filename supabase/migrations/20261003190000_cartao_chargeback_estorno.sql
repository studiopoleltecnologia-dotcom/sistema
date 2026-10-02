-- ============================================================
-- Cartão recorrente que matricula · chargeback · estorno que desfaz receita
-- 01/10/2026
-- ============================================================
-- Os três furos do bloco 2 do pedido de revisão, levantados na homologação
-- de 27/09 (backlog §11.4, itens 12 e 18) e confirmados linha por linha
-- agora.
--
-- ------------------------------------------------------------
-- 1) O cartão cobra e não matricula
-- ------------------------------------------------------------
-- A cadeia de falha, nos três eventos que o Asaas manda em sequência:
--
--   CHECKOUT_PAID   → `assinatura_ativada()` marca a assinatura 'ativa' e
--                     tenta puxar `matricula_id` da solicitação. Não há
--                     matrícula: ninguém chamou
--                     `confirmar_pagamento_contratacao()`. Fica NULL.
--   PAYMENT_CREATED → `registrar_cobranca_de_assinatura()` encontra
--                     `ag.matricula_id is null` e devolve 'sem_matricula'.
--                     Nenhuma cobrança nasce.
--   PAYMENT_RECEIVED→ `cobranca_paga()` não acha cobrança com aquele
--                     `provider_ref` e devolve 'desconhecida'.
--
-- Resultado: o aluno pagou, a assinatura está ativa no Asaas, e no ERP não
-- existe matrícula, crédito nem receita. O botão está escondido atrás de
-- `flags.cartaoRecorrente` desde então.
--
-- **A correção é reconhecer o que `CHECKOUT_PAID` significa:** a primeira
-- cobrança foi aprovada. É o equivalente exato do `PAYMENT_RECEIVED` do
-- Pix, e é o momento de concluir a contratação.
--
-- Por que não deixar o `PAYMENT_RECEIVED` concluir, como no Pix: ele não
-- consegue. A cobrança dele só é registrada se a matrícula já existir, e a
-- matrícula só existe depois da conclusão. É um ovo-e-galinha, e
-- `CHECKOUT_PAID` é o único evento que o rompe.
--
-- **Não duplica receita.** Depois da conclusão, o `PAYMENT_CREATED` do
-- ciclo 1 passa a registrar a cobrança (a matrícula existe), e o
-- `PAYMENT_RECEIVED` chama `cobranca_paga()` → que faz
-- `update entradas_financeiras ... where status = 'prevista'`. A entrada do
-- ciclo 1 já está 'recebida', o update pega zero linhas, e o retorno é
-- 'ciclo_quitado'. Conferido no corpo da função antes de escrever isto.
--
-- ------------------------------------------------------------
-- 2) Chargeback não existia
-- ------------------------------------------------------------
-- `PAYMENT_CHARGEBACK_REQUESTED` e companhia caíam em 'ignorado'. Efeito
-- concreto: o aluno contesta a mensalidade no cartão, o Asaas devolve o
-- dinheiro, e no ERP a matrícula segue ativa com crédito para agendar.
--
-- **Chargeback não é estorno, e o tratamento difere.** O estorno é decisão
-- do estúdio; o chargeback é imposto por fora. Por isso:
--
-- · a receita é desfeita (o dinheiro saiu de verdade);
-- · a matrícula vai para `inadimplente`, **não** para cancelada —
--   `marcar_inadimplente()` já é o mecanismo de "ciclo que não foi pago":
--   bloqueia agendamento novo e **preserva o crédito já concedido**, que é
--   o certo quando a aula pode já ter sido dada;
-- · a gestão é avisada, porque chargeback tem prazo de defesa.
--
-- ------------------------------------------------------------
-- 3) Estorno não desfazia a receita
-- ------------------------------------------------------------
-- `cobranca_cancelada(p_estorno => true)` mudava só a cobrança. A
-- `entradas_financeiras` continuava 'recebida' e **contando no limite do
-- MEI** — `vw_mei_acumulado` soma exatamente `status = 'recebida'`.
--
-- ## Por que cancelar a entrada, e não lançar contra-entrada negativa
--
-- `entradas_financeiras` tem `check (valor_centavos > 0)`, e todo o módulo
-- financeiro assume entrada positiva. Relaxar a constraint para caber um
-- lançamento negativo mexeria em relatório, DRE e fluxo de caixa — custo
-- desproporcional ao caso.
--
-- Cancelar a entrada é, além disso, **exatamente o que a equipe faz à mão
-- hoje** (backlog §11.4, item 18: "o acerto é manual no Financeiro"). Esta
-- migration automatiza o acerto que já existe, sem inventar conceito novo.
--
-- ⚠️ **O limite conhecido:** cancelar a entrada tira a receita do mês em
-- que ela entrou, não do mês do estorno. Num estorno que cruza o
-- ano-calendário (pago em dezembro, estornado em janeiro) isso reabre o
-- faturamento de um ano já fechado. Com o MEI em ~metade do teto não é
-- risco fiscal, e a alternativa custaria o módulo inteiro — mas é o tipo
-- de coisa que precisa estar escrita quando alguém for conferir.
-- ============================================================


-- ------------------------------------------------------------
-- 1. `chargeback` como estado de cobrança
-- ------------------------------------------------------------
-- `add value if not exists` para a migration poder ser reaplicada. O valor
-- novo só é USADO dentro de corpo de função, que o Postgres resolve em
-- tempo de execução — então não há o problema de usar na mesma transação
-- que o cria.
alter type public.status_cobranca add value if not exists 'chargeback';


-- ------------------------------------------------------------
-- 2. Qual entrada financeira pertence a uma cobrança
-- ------------------------------------------------------------
-- Uma definição só, porque três lugares precisam dela: desfazer receita
-- (estorno), desfazer receita (chargeback) e **refazer** (chargeback
-- revertido). Na primeira versão a conta estava escrita duas vezes, e a
-- segunda cópia tinha um furo: a PRIMEIRA cobrança de uma contratação vive
-- pela `solicitacao_id` e tem `matricula_id` NULO, então um `where
-- matricula_id = cb.matricula_id` não achava nada e o "revertido" não
-- devolvia a receita. Com a conta num lugar, o furo não tem onde existir.
create or replace function public.entradas_da_cobranca(p_cobranca uuid)
returns setof uuid
language sql
stable security definer
set search_path to ''
as $function$
  with cb as (
    select c.*,
           coalesce(
             c.matricula_id,
             (select s.matricula_id from public.solicitacoes_contratacao s
               where s.id = c.solicitacao_id)) as m_id,
           -- A cobrança de solicitação é sempre a do ciclo 1.
           coalesce(c.ciclo, 1) as ciclo_efetivo
      from public.cobrancas c where c.id = p_cobranca
  )
  select e.id
    from public.entradas_financeiras e, cb
   where e.matricula_id = cb.m_id
     and e.ciclo = cb.ciclo_efetivo
  union
  -- A multa e os juros daquele pagamento: lançamento próprio em "outros"
  -- (ver `20260929120000`), que precisa ser alcançado à parte.
  --
  -- Casado por CLIENTE + dia, e não por matrícula: na PRIMEIRA cobrança de
  -- uma contratação a multa nasce com `matricula_id` nulo, porque
  -- `cobranca_paga()` a insere com o `matricula_id` da cobrança — que ainda
  -- era nulo quando ela foi lida. O item 4 corrige a causa; isto alcança o
  -- que já está gravado assim em produção.
  select e.id
    from public.entradas_financeiras e, cb
   where e.cliente_id = cb.cliente_id
     and e.categoria = 'outros'
     and e.descricao like 'Multa e juros por atraso%'
     and e.data_caixa = (cb.pago_em at time zone 'America/Sao_Paulo')::date;
$function$;

revoke execute on function public.entradas_da_cobranca(uuid) from public, anon;
grant execute on function public.entradas_da_cobranca(uuid) to authenticated;


-- ------------------------------------------------------------
-- 2b. Desfazer e refazer a receita
-- ------------------------------------------------------------
-- `vw_mei_acumulado` soma exatamente `status = 'recebida'`, então cancelar
-- é o que tira do faturamento e voltar para recebida é o que devolve.
create or replace function public.desfazer_receita_da_cobranca(p_cobranca uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare n integer;
begin
  update public.entradas_financeiras
  set status = 'cancelada'
  where id in (select public.entradas_da_cobranca(p_cobranca))
    and status = 'recebida';
  get diagnostics n = row_count;
  return n;
end;
$function$;

comment on function public.desfazer_receita_da_cobranca(uuid) is
  'Cancela a entrada financeira do ciclo de uma cobrança (e a multa daquele pagamento). Usada por estorno e chargeback.';

revoke execute on function public.desfazer_receita_da_cobranca(uuid) from public, anon;
grant execute on function public.desfazer_receita_da_cobranca(uuid) to authenticated;

-- O inverso, para o chargeback que a gente ganha.
create or replace function public.refazer_receita_da_cobranca(p_cobranca uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare n integer;
begin
  update public.entradas_financeiras
  set status = 'recebida'
  where id in (select public.entradas_da_cobranca(p_cobranca))
    and status = 'cancelada'
    -- Só reabre o que de fato já havia entrado: entrada que nunca foi
    -- paga não tem `data_caixa`, e voltá-la para recebida inventaria
    -- dinheiro no faturamento.
    and data_caixa is not null;
  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke execute on function public.refazer_receita_da_cobranca(uuid) from public, anon;
grant execute on function public.refazer_receita_da_cobranca(uuid) to authenticated;


-- ------------------------------------------------------------
-- 3. `assinatura_ativada()` conclui a contratação
-- ------------------------------------------------------------
-- Reescrita de `20260927120000` com o passo que faltava. A ordem importa:
-- concluir PRIMEIRO (é a conclusão que cria a matrícula), e só então
-- gravar `matricula_id` na assinatura.
create or replace function public.assinatura_ativada(
  p_provider text,
  p_checkout_ref text,
  p_provider_ref text
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ag record;
  s record;
  m_id uuid;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  select * into ag from public.assinaturas_gateway
  where provider = p_provider and checkout_ref = p_checkout_ref for update;
  if not found then return 'desconhecida'; end if;

  update public.assinaturas_gateway
  set status = 'ativa',
      provider_ref = coalesce(p_provider_ref, provider_ref),
      atualizada_em = now()
  where id = ag.id;

  -- ---- o passo que faltava ----
  -- `CHECKOUT_PAID` significa que a primeira cobrança do cartão foi
  -- aprovada. É o equivalente do PAYMENT_RECEIVED do Pix, e é aqui que a
  -- matrícula nasce. Sem isto o aluno pagava e não virava aluno.
  m_id := ag.matricula_id;

  if m_id is null and ag.solicitacao_id is not null then
    select * into s from public.solicitacoes_contratacao where id = ag.solicitacao_id;

    if found and s.status = 'aguardando_pagamento' then
      -- Idempotente do outro lado: reentrega do webhook encontra a
      -- solicitação já 'concluida' e recebe de volta a matrícula que existe.
      m_id := public.confirmar_pagamento_contratacao(ag.solicitacao_id, 'cartao', now());
    elsif found then
      m_id := s.matricula_id;
    end if;
  end if;

  if m_id is not null and ag.matricula_id is null then
    update public.assinaturas_gateway
    set matricula_id = m_id, atualizada_em = now()
    where id = ag.id;
  end if;

  return case when m_id is null then 'ativa_sem_matricula' else 'ativa' end;
end;
$function$;

comment on function public.assinatura_ativada(text, text, text) is
  'CHECKOUT_PAID do cartão: ativa a assinatura E conclui a contratação (a matrícula nasce aqui). Antes só ativava, e o aluno pagava sem virar aluno — achado da homologação de 27/09/2026.';

revoke execute on function public.assinatura_ativada(text, text, text) from public, anon;
grant execute on function public.assinatura_ativada(text, text, text) to authenticated;


-- ------------------------------------------------------------
-- 4. `cobranca_cancelada()` passa a desfazer a receita no estorno
-- ------------------------------------------------------------
create or replace function public.cobranca_cancelada(
  p_provider text,
  p_provider_ref text,
  p_estorno boolean default false
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cb record;
  desfeitas integer := 0;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  select * into cb from public.cobrancas
  where provider = p_provider and provider_ref = p_provider_ref
  for update;

  if not found then return 'desconhecida'; end if;
  -- Reentrega de webhook não reprocessa.
  if cb.status in ('cancelada', 'estornada') then return 'ja_registrada'; end if;

  -- Cast explícito: `case` produz `text`, e o Postgres não converte para o
  -- enum sozinho (literal nu, sim). Mesma armadilha de `avaliar_atestado_parq`.
  update public.cobrancas
  set status = (case when p_estorno then 'estornada' else 'cancelada' end)::public.status_cobranca,
      atualizada_em = now()
  where id = cb.id;

  -- Estorno de cobrança que já estava paga = dinheiro que saiu. A receita
  -- precisa sair do faturamento, senão o MEI conta dinheiro que voltou.
  -- Cobrança cancelada antes de ser paga não tem receita a desfazer.
  if p_estorno and cb.status = 'paga' then
    desfeitas := public.desfazer_receita_da_cobranca(cb.id);
  end if;

  -- Estorno NÃO desfaz matrícula automaticamente. Devolver dinheiro e
  -- tirar o acesso são decisões diferentes, e a segunda pode envolver
  -- aula já usada — quem decide é a gestão, na tela. (Chargeback é outro
  -- caso: ver `cobranca_contestada`.)
  return case when desfeitas > 0 then 'estornada_receita_desfeita' else 'registrada' end;
end;
$function$;

comment on function public.cobranca_cancelada(text, text, boolean) is
  'Cancelamento ou estorno de cobrança. No estorno de cobrança PAGA, cancela também a entrada financeira do ciclo — antes a receita ficava recebida e contando no MEI.';

revoke execute on function public.cobranca_cancelada(text, text, boolean) from public, anon;
grant execute on function public.cobranca_cancelada(text, text, boolean) to authenticated;


-- ------------------------------------------------------------
-- 5. Voltar de inadimplente SEM avançar o ciclo
-- ------------------------------------------------------------
-- O gatilho `entradas_regulariza_matricula` (`20260928120000`) já desbloqueia
-- quem paga atrasado — mas **só quando o pagamento é do ciclo SEGUINTE**, e
-- ele faz isso chamando `renovar_ciclo()`. O comentário de lá nomeia
-- exatamente o caso desta migration: "pagamento de outro ciclo (acerto
-- retroativo, estorno revertido) não deve fazer a matrícula pular adiante".
--
-- Está certo. O chargeback revertido é outro caso: o ciclo CORRENTE voltou a
-- estar pago, e a matrícula precisa voltar a 'ativa' sem ganhar ciclo nem
-- crédito novo. Daí uma função separada, e não um `if` dentro do gatilho.
--
-- ## A guarda, e o furo que ela quase teve
--
-- A primeira versão checava "a entrada do ciclo CORRENTE está recebida".
-- Está errado, e o teste pegou: num inadimplente comum o ciclo corrente
-- **está pago** — quem não foi pago é o SEGUINTE (é o que
-- `regularizar_ao_receber` assume ao comparar com `ciclo_atual + 1`). A
-- função teria destravado exatamente quem devia continuar travado.
--
-- O invariante certo é outro: a matrícula só fica inadimplente **enquanto
-- alguma cobrança dela não está liquidada**. Se não sobrou nenhuma pendente,
-- vencida, estornada ou contestada, não há motivo para o bloqueio.
create or replace function public.reverter_inadimplencia(p_matricula uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  m record;
  pendura boolean;
begin
  select * into m from public.matriculas where id = p_matricula for update;
  if not found or m.status <> 'inadimplente' then return false; end if;

  select exists (
    select 1 from public.cobrancas
    where matricula_id = p_matricula
      and status in ('pendente', 'vencida', 'estornada', 'chargeback')
  ) into pendura;

  if pendura then return false; end if;

  update public.matriculas set status = 'ativa', atualizada_em = now()
  where id = p_matricula;

  insert into public.auditoria (tabela, registro_id, acao, depois, motivo)
  values ('matriculas', p_matricula, 'inadimplencia_revertida',
          jsonb_build_object('ciclo', m.ciclo_atual),
          'nenhuma cobrança pendente — contestação revertida');

  return true;
end;
$function$;

comment on function public.reverter_inadimplencia(uuid) is
  'Devolve a matrícula de inadimplente para ativa SEM avançar o ciclo — o caso do chargeback revertido. Só age quando NENHUMA cobrança da matrícula está pendente, vencida, estornada ou contestada; quem não pagou continua bloqueado.';

revoke execute on function public.reverter_inadimplencia(uuid) from public, anon;
grant execute on function public.reverter_inadimplencia(uuid) to authenticated;


-- ------------------------------------------------------------
-- 6. Chargeback
-- ------------------------------------------------------------
create or replace function public.cobranca_contestada(
  p_provider text,
  p_provider_ref text,
  /** 'aberto' | 'em_disputa' | 'perdido' | 'revertido' — o que o gateway disse. */
  p_fase text default 'aberto'
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cb record;
  cl record;
  m_id uuid;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  select * into cb from public.cobrancas
  where provider = p_provider and provider_ref = p_provider_ref
  for update;
  if not found then return 'desconhecida'; end if;

  -- Revertido = ganhamos a disputa, o dinheiro fica. Volta a 'paga' e a
  -- entrada cancelada é reaberta — o inverso exato do que o chargeback fez.
  if p_fase = 'revertido' then
    update public.cobrancas set status = 'paga', atualizada_em = now() where id = cb.id;
    perform public.refazer_receita_da_cobranca(cb.id);
    perform public.reverter_inadimplencia(coalesce(cb.matricula_id,
      (select s.matricula_id from public.solicitacoes_contratacao s where s.id = cb.solicitacao_id)));
    return 'revertido';
  end if;

  if cb.status = 'chargeback' then return 'ja_registrada'; end if;

  update public.cobrancas
  set status = 'chargeback', atualizada_em = now()
  where id = cb.id;

  -- O dinheiro saiu. Mesma conta do estorno.
  if cb.status = 'paga' then
    perform public.desfazer_receita_da_cobranca(cb.id);
  end if;

  -- A matrícula vai para inadimplente, não para cancelada:
  -- `marcar_inadimplente()` bloqueia agendamento novo e PRESERVA o crédito
  -- já concedido, que é o certo quando a aula pode já ter sido dada.
  m_id := coalesce(
    cb.matricula_id,
    (select s.matricula_id from public.solicitacoes_contratacao s where s.id = cb.solicitacao_id));
  if m_id is not null then
    perform public.marcar_inadimplente(m_id);
  end if;

  -- Chargeback tem prazo de defesa, e ninguém vai descobrir abrindo a
  -- ficha do aluno por acaso.
  select * into cl from public.clientes where id = cb.cliente_id;
  insert into public.auditoria (tabela, registro_id, acao, depois, motivo)
  values ('cobrancas', cb.id, 'chargeback',
          jsonb_build_object('cliente', cl.nome, 'valor_centavos', cb.valor_centavos,
                             'fase', p_fase, 'provider_ref', p_provider_ref),
          'contestação recebida do gateway');

  return 'chargeback_registrado';
end;
$function$;

comment on function public.cobranca_contestada(text, text, text) is
  'Chargeback: marca a cobrança, desfaz a receita e manda a matrícula para inadimplente (preservando o crédito já dado). Fase "revertido" desfaz tudo isso — ganhamos a disputa.';

revoke execute on function public.cobranca_contestada(text, text, text) from public, anon;
grant execute on function public.cobranca_contestada(text, text, text) to authenticated;


-- ------------------------------------------------------------
-- 7. A multa da PRIMEIRA cobrança ganha a matrícula
-- ------------------------------------------------------------
-- Reescrita fiel de `20260929120000`, com uma diferença: o lançamento de
-- multa passa a receber a matrícula **resolvida depois** da conclusão.
--
-- Na primeira cobrança de uma contratação, `cobrancas.matricula_id` é nulo
-- (quem manda é a `solicitacao_id` — a matrícula ainda não existe). A multa
-- era inserida com esse nulo e ficava órfã: aparecia no faturamento e não
-- era alcançada por nada que olhasse a matrícula — nem pelo extrato do
-- aluno, nem pelo desfazer do estorno.
--
-- Descoberto testando o estorno: a mensalidade voltava e os R$10 de multa
-- continuavam contando no MEI.
create or replace function public.cobranca_paga(
  p_provider text,
  p_provider_ref text,
  p_forma text,
  p_pago_em timestamptz,
  p_valor_pago_centavos bigint default null
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cb record;
  encargo bigint;
  dia date;
  m_id uuid;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  select * into cb from public.cobrancas
  where provider = p_provider and provider_ref = p_provider_ref
  for update;

  if not found then return 'desconhecida'; end if;
  if cb.status = 'paga' then return 'ja_paga'; end if;

  dia := (p_pago_em at time zone 'America/Sao_Paulo')::date;

  update public.cobrancas
  set status = 'paga',
      pago_em = p_pago_em,
      valor_pago_centavos = coalesce(p_valor_pago_centavos, cb.valor_centavos),
      forma_pagamento = nullif(btrim(coalesce(p_forma, '')), '')
  where id = cb.id;

  -- Pagamento que VOLTA depois de um chargeback. O Asaas reenvia o
  -- PAYMENT_RECEIVED quando a contestação é revertida, e aí não há
  -- contratação para concluir nem multa para lançar de novo: o que falta é
  -- devolver a receita. O gatilho `entradas_regulariza_matricula`
  -- desbloqueia a matrícula sozinho ao ver a entrada voltar para 'recebida'
  -- — não precisa de um segundo caminho para isso.
  if cb.status = 'chargeback' then
    perform public.refazer_receita_da_cobranca(cb.id);
    perform public.reverter_inadimplencia(coalesce(cb.matricula_id,
      (select s.matricula_id from public.solicitacoes_contratacao s where s.id = cb.solicitacao_id)));
    return 'chargeback_revertido';
  end if;

  m_id := cb.matricula_id;

  if cb.solicitacao_id is not null then
    -- A conclusão é que cria a matrícula; é dela que sai o `m_id` para o
    -- lançamento de multa abaixo.
    m_id := public.confirmar_pagamento_contratacao(cb.solicitacao_id, p_forma, p_pago_em);
  else
    update public.entradas_financeiras
    set status = 'recebida', data_caixa = dia
    where matricula_id = cb.matricula_id
      and ciclo = cb.ciclo
      and status = 'prevista';
  end if;

  -- O que veio além do combinado é multa e juros. Lançamento próprio,
  -- com a descrição dizendo de onde veio — senão daqui a três meses
  -- ninguém sabe explicar o valor quebrado no extrato.
  encargo := coalesce(p_valor_pago_centavos, cb.valor_centavos) - cb.valor_centavos;
  if encargo > 0 then
    insert into public.entradas_financeiras
      (descricao, valor_centavos, categoria, status,
       data_competencia, data_caixa, cliente_id, matricula_id)
    values
      ('Multa e juros por atraso — ' || coalesce(cb.descricao, 'mensalidade'),
       encargo, 'outros', 'recebida', dia, dia, cb.cliente_id, m_id);
  end if;

  return case when cb.solicitacao_id is not null
              then 'contratacao_concluida' else 'ciclo_quitado' end;
end;
$function$;

comment on function public.cobranca_paga(text, text, text, timestamptz, bigint) is
  'Baixa de pagamento. A multa por atraso recebe a matrícula resolvida DEPOIS da conclusão — na primeira cobrança ela nascia órfã e escapava do estorno.';

revoke execute on function public.cobranca_paga(text, text, text, timestamptz, bigint)
  from public, anon;
grant execute on function public.cobranca_paga(text, text, text, timestamptz, bigint)
  to authenticated;
