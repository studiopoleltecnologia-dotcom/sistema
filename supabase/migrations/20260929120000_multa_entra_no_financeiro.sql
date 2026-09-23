-- ============================================================
-- A multa recebida vira receita, não some
-- ============================================================
-- Ligada a multa, o aluno que paga atrasado paga MAIS do que a
-- mensalidade: o Asaas recalcula e devolve `value` maior que o
-- `originalValue`.
--
-- Do jeito que estava, `cobranca_paga()` marcava a entrada como recebida
-- pelo valor original e a diferença sumia. O estúdio receberia R$173,40
-- e o financeiro registraria R$170,00 — subnotificando o faturamento,
-- que no MEI é justamente o número que importa (regime de caixa,
-- CLAUDE.md §8).
--
-- ## Linha separada, não valor corrigido
--
-- A alternativa seria aumentar `valor_centavos` da própria entrada.
-- Recusada: a receita de `mensalista` deixaria de ser o preço do plano,
-- e "quanto entra de mensalidade" — que é como se olha o negócio —
-- passaria a variar com atraso de aluno.
--
-- Multa é receita de outra natureza. Vira lançamento próprio, em
-- `outros`, e os dois números continuam verdadeiros: a mensalidade é o
-- preço do plano, e o total do caixa inclui a multa.

alter table public.cobrancas
  add column if not exists valor_pago_centavos bigint;

comment on column public.cobrancas.valor_pago_centavos is
  'O que de fato entrou. Difere de valor_centavos quando houve multa e juros por atraso.';

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

  if cb.solicitacao_id is not null then
    perform public.confirmar_pagamento_contratacao(cb.solicitacao_id, p_forma, p_pago_em);
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
       encargo, 'outros', 'recebida', dia, dia, cb.cliente_id, cb.matricula_id);
  end if;

  return case when cb.solicitacao_id is not null
              then 'contratacao_concluida' else 'ciclo_quitado' end;
end;
$function$;

-- A assinatura de 4 argumentos deixa de existir: deixar as duas vivas
-- criaria ambiguidade de resolução, e quem chama (webhook) já manda o
-- valor pago.
drop function if exists public.cobranca_paga(text, text, text, timestamptz);

revoke execute on function public.cobranca_paga(text, text, text, timestamptz, bigint)
  from public, anon;
grant execute on function public.cobranca_paga(text, text, text, timestamptz, bigint)
  to authenticated;
