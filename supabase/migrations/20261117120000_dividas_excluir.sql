-- ============================================================
-- Dívidas: excluir um empréstimo (e o que ele deixou em Saídas)
-- ============================================================
-- A tela de Dívidas sabia criar, quitar, pagar e reprogramar — nunca
-- apagar. Empréstimo cadastrado errado (valor trocado, pessoa trocada,
-- linha duplicada) ficava na tela para sempre, e a única saída era
-- "marcar quitado", que mente: diz que o dinheiro voltou.
--
-- Por que isto é uma função e não um `delete` direto do front:
--
-- 1. A dívida não é uma linha só. Cada parcela programada e cada
--    pagamento é uma linha de `saidas_financeiras` apontando para ela.
--    A FK é `on delete set null` (20260818180000), então apagar só a
--    dívida deixaria essas saídas órfãs — e como o que tira a devolução
--    de capital do DRE e a agrupa em Saídas → Dívidas é justamente o
--    `divida_id`, elas virariam DESPESA comum no resultado do mês. Um
--    empréstimo apagado aumentaria o prejuízo do período, em silêncio.
--
-- 2. Apagar as saídas e depois a dívida em duas chamadas não é atômico:
--    a primeira passando e a segunda falhando apaga o histórico de
--    pagamento e mantém a dívida — o pior dos dois mundos. Dentro de uma
--    função é uma transação só.
--
-- Recebe um ARRAY porque a tela agrupa por pessoa: "excluir o MERCADO
-- PAGO" são os N empréstimos dele de uma vez, e metade excluída seria um
-- card com saldo pela metade.
--
-- ⚠️ Pagamento já realizado é dinheiro que saiu do caixa de verdade.
-- Esta função o apaga junto, porque um pagamento que aponta para um
-- empréstimo que não existe não tem como ser lido depois. Quem decide é
-- a tela, que diz no diálogo quantos pagamentos (e quanto) vão junto.
-- Para tirar da lista um empréstimo que foi REALMENTE devolvido, o
-- caminho continua sendo "marcar quitado".
-- ============================================================

create or replace function public.excluir_dividas(p_ids uuid[])
returns jsonb
language plpgsql
-- invoker de propósito: `dividas` e `saidas_financeiras` são gestão-only
-- por RLS, e esta função não pode ser a porta dos fundos que contorna isso.
security invoker
set search_path = public
as $$
declare
  v_dividas integer;
  v_previstas integer;
  v_pagas integer;
  v_canceladas integer;
  v_valor_pago bigint;
begin
  if not is_gestao() then
    raise exception 'Apenas a gestao pode excluir uma divida.';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'Informe ao menos um emprestimo para excluir.';
  end if;

  -- Conta antes de apagar: depois do delete não há mais o que contar, e é
  -- esse retorno que a tela usa para confirmar o que de fato saiu.
  select
    count(*) filter (where status_saida = 'prevista'),
    count(*) filter (where status_saida = 'paga'),
    count(*) filter (where status_saida = 'cancelada'),
    coalesce(sum(valor_centavos) filter (where status_saida = 'paga'), 0)
    into v_previstas, v_pagas, v_canceladas, v_valor_pago
    from public.saidas_financeiras
   where divida_id = any(p_ids);

  delete from public.saidas_financeiras
   where divida_id = any(p_ids);

  delete from public.dividas
   where id = any(p_ids);
  get diagnostics v_dividas = row_count;

  -- Zero linhas aqui não é "já estava apagado": pode ser id errado ou RLS
  -- escondendo a linha. Em ambos os casos a tela precisa saber que nada
  -- aconteceu, em vez de atualizar como se tivesse funcionado.
  if v_dividas = 0 then
    raise exception 'Nenhum emprestimo encontrado para excluir.';
  end if;

  return jsonb_build_object(
    'dividas', v_dividas,
    'parcelas_previstas', v_previstas,
    'pagamentos', v_pagas,
    'canceladas', v_canceladas,
    'valor_pago_centavos', v_valor_pago
  );
end;
$$;

comment on function public.excluir_dividas(uuid[]) is
  'Apaga emprestimos e TODAS as saidas ligadas a eles (previstas, pagas e canceladas), numa transacao so. Devolve o que foi apagado. Usada pela tela de Dividas.';

revoke all on function public.excluir_dividas(uuid[]) from public, anon;
grant execute on function public.excluir_dividas(uuid[]) to authenticated;
