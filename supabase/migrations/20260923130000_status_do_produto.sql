-- ============================================================
-- Item 05 — plano antigo é um ESTADO do produto, não um adjetivo
-- na descrição
-- ============================================================
-- Hoje o catálogo tem dois booleanos, `ativo` e `visivel_no_catalogo`,
-- e quatro combinações possíveis das quais só três significam algo.
-- Para dizer "o Wix vendia isto, nós não vendemos mais", a migration
-- `20260921130000` teve que escrever a intenção na **descrição**
-- ("Legado do Wix. Não contratável.") e torcer para alguém ler.
--
-- Ninguém leu, porque a tela de matrícula filtra por `ativo` e nada
-- mais: os 12 planos do Wix aparecem na mesma lista dos planos de
-- venda, separados por um "· só a equipe" no fim da linha. É o que a
-- gestão relatou — "continua mostrando planos antigos na mesma lista,
-- mesmo que seja só pra equipe".
--
-- A causa é que "não vender mais" nunca virou dado. Vira agora:
--
--   venda      o catálogo de verdade. Aparece, vende, renova.
--   interno    cortesia da equipe (D7). Não é venda: fora da lista
--              normal, só a gestão concede, e `cobrar_ciclo()` já não
--              gera cobrança porque o preço é zero.
--   legado     quem já tem continua até o fim do contrato; contratar
--              de novo é recusado pelo banco. Vive numa seção à parte
--              na tela, não misturado.
--   arquivado  sumiu de tudo. O histórico permanece.
--
-- `ativo` e `visivel_no_catalogo` continuam existindo e passam a ser
-- DERIVADOS de `status`, por gatilho. Não é redundância por descuido:
-- `renovar_ciclo()`, a policy do portal e meia dúzia de consultas já
-- leem essas colunas, e reescrever tudo de uma vez para trocar a fonte
-- da verdade seria uma mudança muito maior do que o problema. O
-- gatilho garante que não podem divergir.

-- ------------------------------------------------------------
-- 1. O estado
-- ------------------------------------------------------------
do $$
begin
  create type public.status_produto as enum ('venda', 'interno', 'legado', 'arquivado');
exception when duplicate_object then null;
end $$;

alter table public.produtos
  add column if not exists status public.status_produto not null default 'venda';

comment on column public.produtos.status is
  'venda = catálogo atual · interno = cortesia da equipe, só a gestão concede · legado = quem já tem continua, não se contrata mais · arquivado = fora de tudo, histórico preservado';

-- ------------------------------------------------------------
-- 2. Backfill
-- ------------------------------------------------------------
-- `visivel_no_catalogo = false` hoje marca exatamente o conjunto que
-- queremos separar: os 12 planos do Wix mais o Plano Equipe. Usar essa
-- coluna em vez de data de criação ou lista de nomes mantém a migration
-- verdadeira nos dois ambientes, sem depender de UUID.
update public.produtos
set status = case
  when nome = 'Plano Equipe' then 'interno'
  else 'legado'
end::public.status_produto
where not visivel_no_catalogo
  and ativo
  and status = 'venda';

update public.produtos
set status = 'arquivado'
where not ativo and status = 'venda';

-- ------------------------------------------------------------
-- 3. `ativo` e `visivel_no_catalogo` passam a seguir o status
-- ------------------------------------------------------------
create or replace function public.sincronizar_status_produto()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- Escrita antiga que só mexe em `ativo` (código que ainda não conhece
  -- `status`, import): traduz para o estado equivalente em vez de deixar
  -- os dois se contradizerem. Arquivar continua sendo `ativo = false`.
  if tg_op = 'UPDATE'
     and new.ativo is distinct from old.ativo
     and new.status is not distinct from old.status then
    new.status := case
      when new.ativo then 'venda'
      else 'arquivado'
    end::public.status_produto;
  end if;

  -- Mesmo raciocínio no insert: quem cria um produto já arquivado passa
  -- `ativo = false` e não conhece `status`, que cairia no default
  -- 'venda' e ressuscitaria o produto na linha seguinte.
  if tg_op = 'INSERT' and not new.ativo and new.status = 'venda' then
    new.status := 'arquivado';
  end if;

  -- Legado continua ATIVO de propósito: `renovar_ciclo()` exige produto
  -- ativo, e arquivar quebraria a renovação de quem está no meio de um
  -- semestral. O que impede a venda é o status, não o `ativo`.
  new.ativo := (new.status <> 'arquivado');

  -- Só o catálogo de venda chega ao aluno. Cortesia, legado e
  -- arquivado nunca — e não dá para ligar a visibilidade por engano.
  if new.status <> 'venda' then
    new.visivel_no_catalogo := false;
  end if;

  return new;
end;
$function$;

drop trigger if exists produtos_sincroniza_status on public.produtos;
create trigger produtos_sincroniza_status
  before insert or update on public.produtos
  for each row execute function public.sincronizar_status_produto();

-- ------------------------------------------------------------
-- 4. A policy do aluno passa a olhar o status
-- ------------------------------------------------------------
-- `visivel_no_catalogo` fica na condição junto: o gatilho já garante
-- que ela é falsa fora de `venda`, mas a policy não deve depender de um
-- gatilho para estar correta.
drop policy if exists "cliente ve produtos do catalogo" on public.produtos;
create policy "cliente ve produtos do catalogo" on public.produtos
  for select to authenticated
  using (public.is_cliente() and status = 'venda' and visivel_no_catalogo);

-- ------------------------------------------------------------
-- 5. matricular_produto() recusa o que não está à venda
-- ------------------------------------------------------------
-- Mesma mecânica da elegibilidade (#70): o banco recusa, a gestão pode
-- passar por cima **com justificativa**, e a autorização fica em
-- `auditoria` junto da matrícula que ela liberou. A tela não
-- reimplementa a regra — reage à mensagem.
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
  ja_tem integer;
  eleg record;
  just text := nullif(btrim(coalesce(p_justificativa, '')), '');
  email_cliente text;
  bloqueio text;
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

  -- ---- Cortesia da equipe (D7) ----
  -- Não é exceção de venda: é uma concessão, e quem concede é a gestão.
  -- Não tem válvula por justificativa porque não há nada a excepcionar
  -- — a secretária simplesmente não decide isto.
  if pr.status = 'interno' and auth.uid() is not null and not public.is_gestao() then
    raise exception
      '“%” é um plano interno da equipe — só a gestão pode conceder', pr.nome;
  end if;

  -- ---- O que impede a venda, em ordem de generalidade ----
  select * into eleg from public.elegivel_para_produto(p_cliente, p_plano);

  bloqueio := case
    when pr.status = 'legado' then format(
      '“%s” é um plano antigo, fora de venda — quem já tem continua nele até o fim do contrato, mas ele não se contrata mais',
      pr.nome)
    when not eleg.ok then eleg.motivo
  end;

  -- `auth.uid() is null` é contexto de serviço (import, cron, migration),
  -- e o resto desta função já o trata como confiável — a checagem de
  -- papel acima também é pulada nele. É o que deixa o import do Wix
  -- registrar quem já tem plano legado, que é justamente para o que
  -- esses produtos existem.
  if bloqueio is not null and auth.uid() is not null then
    -- Aluno nunca passa, com ou sem justificativa.
    if eh_cliente or not public.is_gestao() then
      raise exception '%', bloqueio;
    end if;
    -- Gestão passa, mas escrevendo por quê (D9).
    if just is null then
      raise exception
        '% — para vender assim mesmo, informe a justificativa (ela fica registrada)',
        bloqueio;
    end if;
  end if;

  -- ---- E-mail é pré-requisito de plano, não detalhe de cadastro ----
  if pr.tipo_produto = 'plano' then
    select nullif(btrim(coalesce(email, '')), '') into email_cliente
    from public.clientes where id = p_cliente;
    if email_cliente is null then
      raise exception
        'este aluno está sem e-mail. Plano manda confirmação de contratação, aviso de aula cancelada e cobrança por e-mail — cadastre antes de matricular';
    end if;
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

  -- A autorização de exceção fica junto da matrícula que ela liberou:
  -- é assim que alguém entende, meses depois, por que aquela venda
  -- passou por cima da regra.
  if bloqueio is not null then
    insert into public.auditoria (tabela, registro_id, acao, depois, motivo)
    values ('matriculas', m_id,
            case when pr.status = 'legado' then 'venda_de_produto_legado'
                 else 'excecao_elegibilidade' end,
            jsonb_build_object('produto', pr.nome, 'cliente_id', p_cliente,
                               'status_produto', pr.status,
                               'requisito_nao_atendido', bloqueio),
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

comment on function public.matricular_produto(uuid, uuid, text) is
  'Contrata um produto. Barra produto legado (item 05), produto interno fora da gestão (D7) e produto_requisitos (§8, §10). Gestão pode excepcionar legado/requisito com justificativa, que fica em auditoria; aluno nunca.';

revoke execute on function public.matricular_produto(uuid, uuid, text) from public, anon;
grant execute on function public.matricular_produto(uuid, uuid, text) to authenticated;
