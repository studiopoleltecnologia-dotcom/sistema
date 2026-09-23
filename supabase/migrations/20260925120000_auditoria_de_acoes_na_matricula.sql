-- ============================================================
-- Toda ação importante deixa rastro de quem fez
-- ============================================================
-- A tabela `auditoria` existe desde 20260922160000 e, até aqui, só uma
-- coisa escrevia nela: a autorização de exceção na venda. Renovar ciclo,
-- marcar pagamento em aberto e cancelar assinatura — as três ações que
-- mexem em dinheiro e em contrato — não deixavam rastro nenhum.
--
-- Dava para saber que a matrícula estava inadimplente. Não dava para
-- saber quem marcou, quando, nem o que havia antes.
--
-- ## Gatilho, não quatro funções reescritas
--
-- O caminho óbvio seria pôr um `insert into auditoria` dentro de
-- `renovar_ciclo()`, `marcar_inadimplente()` e `cancelar_assinatura()`.
-- Recusado por dois motivos:
--
--  1. depende de lembrar. A quarta função que mexer em `matriculas`
--     amanhã — e o cron de renovação já mexe — nasce sem auditoria, e
--     ninguém percebe porque a ausência de log não dá erro;
--  2. o `update` feito por qualquer outro caminho (correção manual,
--     import, migration) passaria em branco.
--
-- No gatilho, é a tabela que se audita. Não há como mexer numa
-- matrícula sem deixar rastro.
--
-- ## `auth.uid()` nulo é informação, não falha
--
-- Renovação feita pelo cron (`processar_assinaturas`) não tem sessão, e
-- a linha fica com autor nulo. Isso é exatamente o que se quer saber:
-- distingue "o sistema renovou sozinho na virada" de "alguém adiantou a
-- renovação na recepção". A tela mostra "sistema" nesse caso.

-- ------------------------------------------------------------
-- 1. O gatilho
-- ------------------------------------------------------------
create or replace function public.auditar_matricula()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  antes jsonb := '{}'::jsonb;
  depois jsonb := '{}'::jsonb;
  acao text;
begin
  -- A ordem importa: a ação registrada é a mais específica que couber.
  -- Cancelar também mexe em `renova_automaticamente`, e "cancelamento"
  -- diz mais do que "renovação automática desligada".
  if new.ciclo_atual is distinct from old.ciclo_atual then
    acao := 'renovacao_de_ciclo';
    antes := antes || jsonb_build_object('ciclo_atual', old.ciclo_atual);
    depois := depois || jsonb_build_object('ciclo_atual', new.ciclo_atual);
  end if;

  if new.status is distinct from old.status then
    acao := 'mudanca_de_situacao';
    antes := antes || jsonb_build_object('status', old.status);
    depois := depois || jsonb_build_object('status', new.status);
  end if;

  if new.preco_contratado_centavos is distinct from old.preco_contratado_centavos then
    acao := 'mudanca_de_preco';
    antes := antes || jsonb_build_object('preco_centavos', old.preco_contratado_centavos);
    depois := depois || jsonb_build_object('preco_centavos', new.preco_contratado_centavos);
  end if;

  if new.renova_automaticamente is distinct from old.renova_automaticamente then
    acao := coalesce(acao, 'renovacao_automatica');
    antes := antes || jsonb_build_object('renova_automaticamente', old.renova_automaticamente);
    depois := depois || jsonb_build_object('renova_automaticamente', new.renova_automaticamente);
  end if;

  if new.cancelada_em is distinct from old.cancelada_em then
    acao := case when new.cancelada_em is null then 'cancelamento_desfeito' else 'cancelamento' end;
    antes := antes || jsonb_build_object('cancelada_em', old.cancelada_em);
    depois := depois || jsonb_build_object(
      'cancelada_em', new.cancelada_em,
      'efetivo_em', new.cancelamento_efetivo_em,
      'motivo', new.motivo_cancelamento);
  end if;

  -- Mudança de data de ciclo sem mudar mais nada é a virada normal
  -- acompanhando a renovação; não vira linha própria.
  if acao is null then
    return new;
  end if;

  insert into public.auditoria (tabela, registro_id, acao, antes, depois, autor)
  values ('matriculas', new.id, acao, antes, depois, auth.uid());

  return new;
end;
$function$;

drop trigger if exists matriculas_auditoria on public.matriculas;
create trigger matriculas_auditoria
  after update on public.matriculas
  for each row execute function public.auditar_matricula();

comment on function public.auditar_matricula() is
  'Registra em auditoria toda mudança relevante de matrícula, com o autor da sessão. Autor nulo = contexto de serviço (cron da renovação, import).';

-- ------------------------------------------------------------
-- 2. O histórico da matrícula, num lugar só
-- ------------------------------------------------------------
-- Três assuntos — crédito, dinheiro e decisão administrativa — viram uma
-- linha do tempo. Para quem atende, é uma pergunta só: "o que houve com
-- essa aluna?".
--
-- `security_invoker` faz o recorte sozinho, e é isso que torna a view
-- segura para a operação inteira: a secretária enxerga os créditos (a
-- policy de `creditos_eventos` permite) e **não** enxerga as linhas de
-- `entradas_financeiras` nem de `auditoria`, que são gestão-only. A view
-- não precisa saber quem está perguntando.
create or replace view public.vw_historico_matricula
with (security_invoker = true) as

  select
    ce.id,
    ce.matricula_id,
    ce.criado_em as quando,
    'credito'::text as tipo,
    (case when ce.delta > 0 then '+' else '' end) || ce.delta || ' crédito'
      || (case when abs(ce.delta) = 1 then '' else 's' end)
      || ' · ' || ce.motivo as titulo,
    ce.detalhe,
    null::bigint as valor_centavos,
    s.nome as autor_nome
  from public.creditos_eventos ce
  left join public.socias s on s.id = ce.criado_por

  union all

  select
    ef.id,
    ef.matricula_id,
    ef.criada_em as quando,
    'financeiro'::text,
    coalesce(ef.descricao, 'Cobrança'),
    ef.status::text
      || case when ef.data_caixa is not null then ' em ' || to_char(ef.data_caixa, 'DD/MM/YYYY') else '' end,
    ef.valor_centavos,
    null::text
  from public.entradas_financeiras ef
  where ef.matricula_id is not null

  union all

  select
    a.id,
    a.registro_id as matricula_id,
    a.criado_em as quando,
    'acao'::text,
    case a.acao
      when 'renovacao_de_ciclo' then 'Ciclo renovado'
      when 'mudanca_de_situacao' then
        'Situação: ' || coalesce(a.antes->>'status', '—') || ' → ' || coalesce(a.depois->>'status', '—')
      when 'mudanca_de_preco' then 'Preço do ciclo alterado'
      when 'cancelamento' then 'Assinatura cancelada'
      when 'cancelamento_desfeito' then 'Cancelamento desfeito'
      when 'renovacao_automatica' then
        case when (a.depois->>'renova_automaticamente')::boolean
             then 'Renovação automática ligada'
             else 'Renovação automática desligada' end
      when 'excecao_elegibilidade' then 'Venda autorizada por exceção'
      when 'venda_de_produto_legado' then 'Venda de plano antigo autorizada'
      else a.acao
    end,
    a.motivo,
    null::bigint,
    -- Autor nulo é o cron/import, e dizer "sistema" é mais verdadeiro do
    -- que deixar em branco, que pareceria dado faltando.
    coalesce(s.nome, 'sistema')
  from public.auditoria a
  left join public.socias s on s.id = a.autor
  where a.tabela = 'matriculas';

grant select on public.vw_historico_matricula to authenticated;

comment on view public.vw_historico_matricula is
  'Linha do tempo da matrícula: créditos, cobranças e decisões administrativas, com quem fez cada uma. security_invoker recorta por papel — a secretária vê só os créditos.';

-- ------------------------------------------------------------
-- 3. Quem pediu e quem decidiu, na fila de contratações
-- ------------------------------------------------------------
-- `solicitacoes_contratacao` já guardava `solicitada_por` e
-- `decidida_por` desde 20260924120000, mas a view só devolvia os ids —
-- então a tela não tinha como mostrar o nome, e a informação existia
-- sem servir para nada.
--
-- `create or replace` com colunas **acrescentadas no fim** é aceito
-- pelo Postgres; mudar ordem ou tipo das existentes exigiria drop, que
-- derrubaria a policy de quem depende dela.
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
  dec.nome as decisor_nome
from public.solicitacoes_contratacao s
join public.clientes c on c.id = s.cliente_id
join public.produtos p on p.id = s.produto_id
left join public.socias sol on sol.id = s.solicitada_por
left join public.socias dec on dec.id = s.decidida_por;

grant select on public.vw_solicitacoes to authenticated;
