-- ============================================================
-- Item 08 — contratar deixa de ser um clique que já matricula
-- ============================================================
-- Hoje `matricular_produto()` faz tudo numa transação só: cria a
-- matrícula ATIVA, libera os créditos e gera a cobrança "prevista". O
-- aluno sai da tela podendo agendar, e ninguém pagou nada. A "cobrança
-- prevista" é uma linha no financeiro esperando alguém marcar como
-- recebida à mão.
--
-- Foi o que a gestão notou: "depois que alguém aperta vender plano, o
-- aluno já aparece como matriculado — mas e o pagamento?".
--
-- O fluxo combinado (D10, D14, D18) é:
--
--   solicitação → aprovação → cobrança → pagamento → ativação
--
-- e o ponto técnico é um só: **o crédito é liberado no pagamento, não
-- no clique**. É o item 8 do backlog §11.3, "matricular() passa a rodar
-- DEPOIS da confirmação".
--
-- ## A decisão de modelagem: a matrícula não nasce cedo
--
-- A alternativa óbvia seria criar a matrícula já com um status novo
-- ('aguardando_pagamento'). Recusada: `status_matricula` é lido em
-- dezenas de lugares — agendamento, créditos, folha, inadimplência,
-- renovação — e cada um teria que aprender que existe um estado em que
-- a matrícula existe mas não vale. Um esquecido vira aluno agendando
-- sem ter pago.
--
-- Aqui a solicitação **é** o estado anterior à matrícula. Enquanto ela
-- não conclui, não existe matrícula nenhuma, e todo o resto do sistema
-- continua podendo confiar que matrícula ativa = contrato válido.
--
-- ## Quem aprova
--
-- "Sempre passa por alguém" (D14). Gestão aprova; secretária e aluno
-- solicitam. Quando quem solicita já é gestão, a aprovação acontece no
-- mesmo passo — mas **acontece**, com nome e data gravados: é um clique
-- só na recepção e mesmo assim existe registro de quem autorizou.

-- ------------------------------------------------------------
-- 1. Os estados de uma contratação
-- ------------------------------------------------------------
do $$
begin
  create type public.status_solicitacao as enum (
    'aguardando_aprovacao',
    'aguardando_pagamento',
    'concluida',
    'recusada',
    'cancelada'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.solicitacoes_contratacao (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  -- Turma fixa: as turmas escolhidas ficam guardadas aqui até a
  -- matrícula existir. Sem isto, aprovar um pedido de turma fixa
  -- obrigaria a gestão a escolher a turma de novo.
  turmas uuid[] not null default '{}',

  status public.status_solicitacao not null default 'aguardando_aprovacao',
  origem text not null check (origem in ('portal', 'equipe')),

  -- Retrato do preço no momento do pedido: a tabela pode mudar entre
  -- solicitar e aprovar, e o aluno contratou o que viu.
  preco_centavos bigint not null,

  -- Exceção autorizada (produto legado ou requisito não atendido).
  justificativa text,

  solicitada_por uuid references auth.users(id),
  solicitada_em timestamptz not null default now(),

  decidida_por uuid references auth.users(id),
  decidida_em timestamptz,
  motivo_decisao text,

  -- Preenchidos quando o pagamento confirma e a matrícula nasce.
  matricula_id uuid references public.matriculas(id) on delete set null,
  pago_em timestamptz,
  forma_pagamento text,

  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),

  -- Recusar sem dizer por quê deixa a próxima pessoa sem saber se pode
  -- refazer o pedido. O motivo é o que a recusa comunica.
  constraint recusa_tem_motivo check (
    status <> 'recusada' or nullif(btrim(coalesce(motivo_decisao, '')), '') is not null
  )
);

comment on table public.solicitacoes_contratacao is
  'O estado da contratação antes de virar matrícula. Enquanto não conclui, não existe matrícula — é o que mantém "matrícula ativa = contrato válido" verdadeiro no resto do sistema.';

-- Um pedido em aberto por cliente+produto. Sem isto, dois cliques no
-- botão viram duas solicitações e, depois, duas cobranças.
create unique index if not exists solicitacao_aberta_unica
  on public.solicitacoes_contratacao (cliente_id, produto_id)
  where status in ('aguardando_aprovacao', 'aguardando_pagamento');

create index if not exists solicitacoes_por_status
  on public.solicitacoes_contratacao (status, solicitada_em desc);

drop trigger if exists solicitacoes_atualizada_em on public.solicitacoes_contratacao;
create trigger solicitacoes_atualizada_em
  before update on public.solicitacoes_contratacao
  for each row execute function public.set_atualizada_em();

alter table public.solicitacoes_contratacao enable row level security;

-- Leitura: a equipe operacional acompanha a fila (a secretária precisa
-- saber se o pedido dela saiu), o aluno vê os próprios pedidos.
drop policy if exists "equipe ve solicitacoes" on public.solicitacoes_contratacao;
create policy "equipe ve solicitacoes" on public.solicitacoes_contratacao
  for select to authenticated using (public.is_operacional());

drop policy if exists "cliente ve as proprias solicitacoes" on public.solicitacoes_contratacao;
create policy "cliente ve as proprias solicitacoes" on public.solicitacoes_contratacao
  for select to authenticated using (cliente_id = public.cliente_atual());

-- Escrita só pelas RPCs `security definer`. Sem policy de insert/update:
-- uma solicitação gravada direto pela tela poderia nascer já aprovada.

-- ------------------------------------------------------------
-- 2. A validação sai de dentro de matricular_produto()
-- ------------------------------------------------------------
-- Solicitar precisa recusar exatamente o que matricular recusa — senão
-- o pedido entra na fila, a gestão aprova, e só aí o banco descobre que
-- o aluno não era elegível. Uma função só, chamada pelos dois.
--
-- `excepcionavel` separa o que a gestão pode autorizar (produto legado,
-- requisito do regulamento) do que ninguém pode (sem e-mail, limite de
-- contratações atingido) — não é severidade, é se existe o que decidir.
create or replace function public.impedimento_para_contratar(
  p_cliente uuid,
  p_produto uuid
)
returns table (motivo text, excepcionavel boolean)
language plpgsql
security definer
stable
set search_path to ''
as $function$
declare
  pr record;
  eleg record;
  email_cliente text;
  ja_tem integer;
begin
  select * into pr from public.produtos where id = p_produto and ativo;
  if not found then
    return query select 'produto inexistente ou inativo'::text, false;
    return;
  end if;

  -- E-mail antes de tudo: sem ele o aluno não recebe confirmação de
  -- contratação, aviso de aula cancelada nem cobrança (4.18, 7.1), e
  -- não há justificativa que resolva — é dado que falta, não regra.
  if pr.tipo_produto = 'plano' then
    select nullif(btrim(coalesce(email, '')), '') into email_cliente
    from public.clientes where id = p_cliente;
    if email_cliente is null then
      return query select
        'este aluno está sem e-mail. Plano manda confirmação de contratação, aviso de aula cancelada e cobrança por e-mail — cadastre antes de matricular'::text,
        false;
      return;
    end if;
  end if;

  if pr.limite_por_cliente is not null then
    select count(*) into ja_tem from public.matriculas
    where cliente_id = p_cliente and plano_id = p_produto
      and status <> 'cancelada';
    if ja_tem >= pr.limite_por_cliente then
      return query select
        format('limite de %s contratação(ões) deste produto por cliente já atingido',
               pr.limite_por_cliente)::text,
        false;
      return;
    end if;
  end if;

  if pr.status = 'legado' then
    return query select format(
      '“%s” é um plano antigo, fora de venda — quem já tem continua nele até o fim do contrato, mas ele não se contrata mais',
      pr.nome)::text, true;
    return;
  end if;

  select * into eleg from public.elegivel_para_produto(p_cliente, p_produto);
  if not eleg.ok then
    return query select eleg.motivo::text, true;
    return;
  end if;

  return;  -- nenhuma linha = pode contratar
end;
$function$;

revoke execute on function public.impedimento_para_contratar(uuid, uuid) from public, anon;
grant execute on function public.impedimento_para_contratar(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. matricular_produto() passa a delegar a validação
-- ------------------------------------------------------------
-- Continua existindo e continua completa: é ela que o import do Wix, o
-- cron e a conclusão de pagamento chamam. O que muda é que a regra vive
-- num lugar só.
create or replace function public.matricular_produto(
  p_cliente uuid,
  p_plano uuid,
  p_justificativa text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  pr record;
  m_id uuid;
  lote uuid;
  autor uuid;
  eh_cliente boolean;
  dia smallint;
  fim date;
  validade date;
  imp record;
  just text := nullif(btrim(coalesce(p_justificativa, '')), '');
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

  if pr.status = 'interno' and auth.uid() is not null and not public.is_gestao() then
    raise exception
      '“%” é um plano interno da equipe — só a gestão pode conceder', pr.nome;
  end if;

  select * into imp from public.impedimento_para_contratar(p_cliente, p_plano);

  -- `auth.uid() is null` é contexto de serviço (import, cron, migration,
  -- webhook de pagamento), e o resto desta função já o trata como
  -- confiável — a checagem de papel acima também é pulada nele.
  if imp.motivo is not null and auth.uid() is not null then
    if not imp.excepcionavel or eh_cliente or not public.is_gestao() then
      raise exception '%', imp.motivo;
    end if;
    if just is null then
      raise exception
        '% — para vender assim mesmo, informe a justificativa (ela fica registrada)',
        imp.motivo;
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

  -- A autorização de exceção fica junto da matrícula que ela liberou:
  -- é assim que alguém entende, meses depois, por que aquela venda
  -- passou por cima da regra.
  if imp.motivo is not null then
    insert into public.auditoria (tabela, registro_id, acao, depois, motivo)
    values ('matriculas', m_id,
            case when pr.status = 'legado' then 'venda_de_produto_legado'
                 else 'excecao_elegibilidade' end,
            jsonb_build_object('produto', pr.nome, 'cliente_id', p_cliente,
                               'status_produto', pr.status,
                               'requisito_nao_atendido', imp.motivo),
            just);
  end if;

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
end;
$function$;

revoke execute on function public.matricular_produto(uuid, uuid, text) from public, anon;
grant execute on function public.matricular_produto(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3b. Avisar o aluno, quando dá para avisar
-- ------------------------------------------------------------
-- Pacote e serviço avulso não exigem e-mail (só plano exige), então o
-- destinatário pode legitimamente não existir. `enfileirar_email` com
-- destinatário nulo viraria linha morta na fila ou erro no meio de uma
-- contratação válida — nenhum dos dois é o que queremos.
--
-- ⚠️ E o `ref` leva o TIPO junto. `emails_fila.ref` é único global e
-- `enfileirar_email()` desiste em silêncio se já existir linha com
-- aquele ref — é a trava que impede reenvio na reentrega de webhook.
-- Usar só o id da solicitação faria os três avisos (aguardando,
-- aprovada, concluída) disputarem a mesma chave: o primeiro sairia e
-- os outros sumiriam sem erro. Com `tipo:id`, cada etapa avisa uma
-- vez e a idempotência continua valendo.
create or replace function public.avisar_aluno_contratacao(
  p_cliente uuid,
  p_tipo text,
  p_dados jsonb,
  p_ref uuid
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  destino text;
begin
  select nullif(btrim(coalesce(email, '')), '') into destino
  from public.clientes where id = p_cliente;
  if destino is null then
    return;
  end if;
  perform public.enfileirar_email(p_tipo, destino, p_dados, p_tipo || ':' || p_ref::text);
end;
$function$;

revoke execute on function public.avisar_aluno_contratacao(uuid, text, jsonb, uuid)
  from public, anon;

-- ------------------------------------------------------------
-- 4. Solicitar
-- ------------------------------------------------------------
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

  -- Turma fixa: a escolha acontece aqui, não na aprovação. Validar o
  -- assento agora evita o pedido entrar na fila para uma turma lotada.
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

  -- Mesma conta de matricular_produto(): o pedido não entra na fila se
  -- a matrícula fosse ser recusada no fim.
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

  -- Checado antes do insert para dar a mensagem certa: a violação crua
  -- do índice diria "duplicate key value violates…", que na recepção
  -- não é informação, é susto.
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

  -- Gestão decide no mesmo passo (D14: "sempre passa por alguém" — e
  -- aqui alguém já é quem tem a autoridade). Um clique na recepção, e
  -- mesmo assim fica gravado quem autorizou e quando.
  if eh_gestao then
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
-- 5. Aprovar, recusar, cancelar
-- ------------------------------------------------------------
-- Cortesia (preço zero) não tem o que cobrar: aprovar já conclui. É o
-- mesmo caminho do Plano Equipe e de qualquer produto gratuito —
-- `cobrar_ciclo()` já devolve null para valor <= 0.
create or replace function public.aprovar_contratacao(
  p_solicitacao uuid,
  p_motivo text default null
) returns public.status_solicitacao
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
begin
  if not public.is_gestao() then
    raise exception 'só a gestão aprova contratação';
  end if;

  select * into s from public.solicitacoes_contratacao
  where id = p_solicitacao for update;
  if not found then
    raise exception 'solicitação não encontrada';
  end if;
  if s.status <> 'aguardando_aprovacao' then
    raise exception 'esta solicitação já foi decidida (%)', s.status;
  end if;

  update public.solicitacoes_contratacao
  set status = 'aguardando_pagamento',
      decidida_por = auth.uid(),
      decidida_em = now(),
      motivo_decisao = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = p_solicitacao;

  -- Cortesia não tem o que cobrar: aprovar já conclui. Passa pelo
  -- mesmo caminho do pagamento para não existir uma segunda rota que
  -- cria matrícula — uma só, e o histórico fica igual.
  if s.preco_centavos <= 0 then
    perform public.confirmar_pagamento_contratacao(p_solicitacao, 'cortesia', now());
    return 'concluida';
  end if;

  perform public.avisar_aluno_contratacao(
    s.cliente_id, 'contratacao_aprovada',
    jsonb_build_object(
      'produto', (select nome from public.produtos where id = s.produto_id),
      'valor_centavos', s.preco_centavos),
    p_solicitacao);

  return 'aguardando_pagamento';
end;
$function$;

revoke execute on function public.aprovar_contratacao(uuid, text) from public, anon;
grant execute on function public.aprovar_contratacao(uuid, text) to authenticated;


create or replace function public.recusar_contratacao(
  p_solicitacao uuid,
  p_motivo text
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
  motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not public.is_gestao() then
    raise exception 'só a gestão decide contratação';
  end if;
  if motivo is null then
    raise exception 'diga por que está recusando — é o que o aluno vai ler';
  end if;

  select * into s from public.solicitacoes_contratacao
  where id = p_solicitacao for update;
  if not found then
    raise exception 'solicitação não encontrada';
  end if;
  if s.status not in ('aguardando_aprovacao', 'aguardando_pagamento') then
    raise exception 'esta solicitação já foi decidida (%)', s.status;
  end if;

  update public.solicitacoes_contratacao
  set status = 'recusada',
      decidida_por = auth.uid(),
      decidida_em = now(),
      motivo_decisao = motivo
  where id = p_solicitacao;

  perform public.avisar_aluno_contratacao(
    s.cliente_id, 'contratacao_recusada',
    jsonb_build_object(
      'produto', (select nome from public.produtos where id = s.produto_id),
      'motivo', motivo),
    p_solicitacao);
end;
$function$;

revoke execute on function public.recusar_contratacao(uuid, text) from public, anon;
grant execute on function public.recusar_contratacao(uuid, text) to authenticated;


-- Desistir. O aluno pode cancelar o próprio pedido enquanto ele não
-- virou matrícula; a equipe também, para limpar fila.
create or replace function public.cancelar_solicitacao(
  p_solicitacao uuid
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
begin
  select * into s from public.solicitacoes_contratacao
  where id = p_solicitacao for update;
  if not found then
    raise exception 'solicitação não encontrada';
  end if;

  if public.is_cliente() and not public.is_socia() then
    if s.cliente_id <> public.cliente_atual() then
      raise exception 'este pedido não é seu';
    end if;
  elsif not public.is_operacional() then
    raise exception 'acesso restrito';
  end if;

  if s.status not in ('aguardando_aprovacao', 'aguardando_pagamento') then
    raise exception 'este pedido já foi decidido (%)', s.status;
  end if;

  update public.solicitacoes_contratacao
  set status = 'cancelada', decidida_em = now(), decidida_por = auth.uid()
  where id = p_solicitacao;
end;
$function$;

revoke execute on function public.cancelar_solicitacao(uuid) from public, anon;
grant execute on function public.cancelar_solicitacao(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. O pagamento é o que cria a matrícula
-- ------------------------------------------------------------
-- Esta é a função que o webhook do Asaas vai chamar quando a cobrança
-- confirmar. Até lá, a gestão chama pela tela ao receber em dinheiro,
-- Pix na chave ou maquininha — o fluxo é o mesmo e não fica esperando
-- integração para funcionar.
--
-- A entrada financeira nasce por `cobrar_ciclo()` dentro de
-- `matricular_produto()` como 'prevista' e é quitada aqui, na mesma
-- transação: o dinheiro entrou, e o regime de caixa do MEI (CLAUDE.md
-- §8) conta pela `data_caixa`.
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
  update public.entradas_financeiras
  set status = 'recebida', data_caixa = (p_pago_em at time zone 'America/Sao_Paulo')::date
  where matricula_id = m_id and ciclo = 1 and status = 'prevista';

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

revoke execute on function public.confirmar_pagamento_contratacao(uuid, text, timestamptz)
  from public, anon;
grant execute on function public.confirmar_pagamento_contratacao(uuid, text, timestamptz)
  to authenticated;

-- ------------------------------------------------------------
-- 7. A fila, pronta para a tela
-- ------------------------------------------------------------
-- View e não join no front: a tela de aprovações precisa do nome do
-- aluno e do produto, e `security_invoker` mantém o recorte da RLS de
-- cada papel (a secretária vê a fila, o aluno vê só o dele).
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
  s.forma_pagamento
from public.solicitacoes_contratacao s
join public.clientes c on c.id = s.cliente_id
join public.produtos p on p.id = s.produto_id;

grant select on public.vw_solicitacoes to authenticated;
