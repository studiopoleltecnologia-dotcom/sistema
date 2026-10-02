-- ============================================================
-- Studio+ descontinuado
-- 01/10/2026
-- ============================================================
-- Decisão da gestão: o Studio+ **não existirá mais**. Era o pacote
-- adicional de 4 aulas para quem tinha Wellhub ativo na unidade
-- (regulamento v3 §10, especificação em docs/07-PACOTE-WELLHUB-ADICIONAL).
--
-- ## A retirada é limpa porque ninguém contratou
--
-- Conferido na produção antes de escrever isto: **0 matrículas, 0
-- solicitações**. O produto estava no catálogo desde `20260908130000` e
-- nunca foi vendido. Não há aluno para migrar, crédito para honrar nem
-- contrato aceito para preservar — o que torna esta migration um
-- arquivamento e não uma operação de dado.
--
-- ## Arquivar, não apagar
--
-- `status = 'arquivado'` é exatamente o estado que `20260923130000` criou
-- para isto: "fora de tudo, histórico preservado". Com `ativo = false`,
-- `solicitar_contratacao()` e `matricular_produto()` recusam no `where id
-- = p_produto and ativo` — a mesma recusa de produto inexistente, sem
-- precisar de regra nova.
--
-- Apagar a linha seria pior: `entradas_financeiras`, `auditoria` e
-- qualquer relatório histórico apontam para `produtos.id`, e um `delete`
-- quebraria a referência ou, com cascade, somiria com o histórico.
--
-- ## O produto é identificado pelo REQUISITO, não pelo nome
--
-- `checkins_wellhub` é o marcador estrutural — é por ele que
-- `contrato_tags()` reconhecia o Studio+, e é o único produto do catálogo
-- que o usa. Nome pode ter sido editado pela equipe; requisito, não.
--
-- ## A cláusula do contrato fica, e fica inalcançável
--
-- Duas coisas diferentes, e a distinção importa:
--
-- · **A cláusula da v1 permanece.** Ela é o registro do que a v1 era.
--   Apagar linha de uma versão publicada é justamente o que o modelo de
--   versionamento existe para evitar.
-- · **`contrato_tags()` deixa de emitir `STUDIO_PLUS`.** Sem a etiqueta,
--   a cláusula nunca mais entra em contrato nenhum.
--
-- A segunda parte não é zelo excessivo: sem ela, um produto FUTURO
-- cadastrado com o requisito `checkins_wellhub` — digamos, outro
-- complemento de Wellhub — herdaria em silêncio a cláusula que fala de
-- "4 créditos adicionais" e de validade do Studio+. Seria texto errado
-- num contrato real, e ninguém perceberia.
--
-- ## O que NÃO é mexido
--
-- · O tipo `checkins_wellhub` no enum `tipo_requisito_produto` continua.
--   É mecanismo genérico ("exige N check-ins em M dias"), remover valor
--   de enum no Postgres exige recriar o tipo, e a estratégia de reduzir
--   dependência da Wellhub pode precisar dele outra vez.
-- · A linha de `produto_requisitos` do Studio+ continua, presa ao produto
--   arquivado: é o registro de por que aquele produto existia.
-- · `elegivel_para_produto()` continua sabendo avaliar o requisito.
--
-- ## Para trazer de volta
--
-- Uma migration: `status = 'venda'`, `ativo = true`,
-- `visivel_no_catalogo = true` no produto, e devolver o ramo
-- `STUDIO_PLUS` a `contrato_tags()`. A cláusula já está lá.
--
-- ⚠️ **Pendente com a gestão, fora do código:** o §10 do Regulamento v3 é
-- inteiramente Studio+, e o §9.4 o referencia. O texto precisa sair na
-- próxima revisão do regulamento.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Arquivar o produto
-- ------------------------------------------------------------
update public.produtos p
set status = 'arquivado',
    ativo = false,
    visivel_no_catalogo = false,
    atualizada_em = now()
where exists (
  select 1 from public.produto_requisitos r
  where r.produto_id = p.id and r.tipo = 'checkins_wellhub'
);


-- ------------------------------------------------------------
-- 2. `contrato_tags()` para de emitir a etiqueta
-- ------------------------------------------------------------
-- Reescrita de `20261003120000` com o ramo do Studio+ removido. Com ele
-- fora, a supressão de `COMPRA_PONTUAL` que existia só para o Studio+
-- também sai: todo produto que não renova volta a receber o módulo de
-- compra pontual, que é o correto para avulsa, experimental, particular e
-- treino livre.
create or replace function public.contrato_tags(p_produto uuid)
returns text[]
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  pr record;
  t text[] := '{}';
begin
  select * into pr from public.produtos where id = p_produto;
  if not found then
    raise exception 'produto inexistente';
  end if;

  -- Formato. Turma fixa antes de crédito: o plano de turma fixa tem
  -- `gera_credito = false`, mas a ordem explícita evita que uma
  -- configuração estranha caia nos dois módulos.
  if coalesce(pr.turmas_fixas, 0) > 0 then
    t := t || 'TURMA_FIXA'::text;
  elsif pr.gera_credito and pr.renova_automaticamente then
    t := t || 'PLANO_POR_CREDITOS'::text;
  end if;

  -- Recorrência.
  if pr.renova_automaticamente then
    t := t || 'PLANO_RECORRENTE'::text;
    if coalesce(pr.ciclos_compromisso, 1) > 1 then
      t := t || 'SEMESTRAL'::text;
    else
      t := t || 'MENSAL'::text;
    end if;
  else
    t := t || 'COMPRA_PONTUAL'::text;
  end if;

  if coalesce(pr.convidados_por_ciclo, 0) > 0 then
    t := t || 'BENEFICIO_CONVIDADO_ATIVO'::text;
  end if;

  return t;
end;
$function$;

comment on function public.contrato_tags(uuid) is
  'Etiquetas de montagem do contrato para um produto, derivadas das colunas (nunca do nome). É a regra [EXIBIR SE:] do documento mestre, num lugar só. STUDIO_PLUS saiu em 01/10/2026 com o produto — a cláusula da v1 continua existindo e inalcançável.';

revoke execute on function public.contrato_tags(uuid) from public, anon;
grant execute on function public.contrato_tags(uuid) to authenticated;
