-- ============================================================
-- Cronograma de dívida: editável em bloco, e com data de verdade
-- ============================================================
-- Dois defeitos do cronograma de parcelas, com a mesma raiz: programar só
-- sabia INSERIR.
--
-- 1. A data era inventada. `programarParcelasDivida` gravava todo
--    vencimento no DIA 5 do mês, porque a tela só perguntava o mês. O
--    empréstimo que vence dia 20 aparecia vencendo dia 5 — e não havia
--    como corrigir.
--
-- 2. Corrigir exigia apagar lançamento a lançamento. Depois que
--    `20261105120000` criou o índice de uma parcela prevista por mês
--    (certo, e o que parou a duplicação), reprogramar passou a dar erro.
--    A trava funcionou, mas deixou a gestão sem saída: o jeito de mudar
--    12 datas virou apagar 12 linhas na mão.
--
-- A função abaixo substitui o cronograma PREVISTO inteiro, de uma vez.
--
-- Por que substituir em vez de atualizar linha a linha: deslocar o
-- cronograma um mês para a frente faria a parcela de novembro virar
-- dezembro enquanto a de dezembro ainda está lá — e o índice único
-- (divida_id, data_competencia) recusaria no meio do caminho, deixando
-- metade do cronograma movido. Apagar e reinserir não tem ordem possível
-- de dar errado, e dentro de uma função é tudo uma transação só: ou o
-- cronograma novo entra inteiro, ou o antigo continua como estava.
--
-- ⚠️ O filtro é `status_saida = 'prevista'` em TODO lugar. Parcela paga
-- não é cronograma, é fato consumado — não entra na conta, não é apagada
-- e não é reescrita.
-- ============================================================

create or replace function public.substituir_cronograma_divida(
  p_divida_id uuid,
  p_descricao text,
  p_parcelas jsonb  -- [{"data":"2026-11-20","valor_centavos":77713}, ...]
)
returns integer
language plpgsql
-- invoker de propósito: `saidas_financeiras` é gestão-only por RLS, e esta
-- função não pode ser a porta dos fundos que contorna isso.
security invoker
set search_path = public
as $$
declare
  v_categoria uuid;
  v_gravadas integer;
begin
  if not is_gestao() then
    raise exception 'Apenas a gestao pode alterar o cronograma de uma divida.';
  end if;

  if not exists (select 1 from public.dividas where id = p_divida_id) then
    raise exception 'Divida nao encontrada.';
  end if;

  select id into v_categoria
    from public.categorias_saida
   where nome = 'Pagamento de dívida'
   limit 1;
  if v_categoria is null then
    raise exception 'Categoria "Pagamento de divida" nao existe.';
  end if;

  -- ------------------------------------------------------------
  -- Validação antes de apagar nada
  -- ------------------------------------------------------------
  -- O índice único já recusaria dois vencimentos no mesmo mês, mas com uma
  -- mensagem sobre índice. Quem está programando parcela merece ler sobre
  -- parcela.
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_parcelas, '[]'::jsonb)) as p
     group by date_trunc('month', (p->>'data')::date)
    having count(*) > 1
  ) then
    raise exception 'Ha duas parcelas no mesmo mes. O cronograma aceita uma por mes.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_parcelas, '[]'::jsonb)) as p
     where (p->>'data') is null
        or coalesce((p->>'valor_centavos')::bigint, 0) <= 0
  ) then
    raise exception 'Toda parcela precisa de data e de valor maior que zero.';
  end if;

  -- ------------------------------------------------------------
  -- Troca
  -- ------------------------------------------------------------
  delete from public.saidas_financeiras
   where divida_id = p_divida_id
     and status_saida = 'prevista';

  insert into public.saidas_financeiras
    (descricao, valor_centavos, categoria_id, divida_id,
     data_competencia, data_prevista, data_caixa, status_saida)
  select
    coalesce(nullif(btrim(p_descricao), ''), 'Parcela'),
    (p->>'valor_centavos')::integer,
    v_categoria,
    p_divida_id,
    date_trunc('month', (p->>'data')::date)::date,
    (p->>'data')::date,
    -- data_caixa é NOT NULL e viria de `current_date`. Enquanto 'prevista'
    -- as views a ignoram (filtram por status), mas deixá-la igual ao
    -- vencimento evita uma parcela futura parecer paga hoje em qualquer
    -- tela que ordene por essa coluna.
    (p->>'data')::date,
    'prevista'
  from jsonb_array_elements(coalesce(p_parcelas, '[]'::jsonb)) as p;

  get diagnostics v_gravadas = row_count;
  return v_gravadas;
end;
$$;

comment on function public.substituir_cronograma_divida(uuid, text, jsonb) is
  'Troca o cronograma PREVISTO de uma divida inteiro, numa transacao so. Parcela paga nunca e tocada. Usada pela tela de Dividas para editar datas e valores em bloco.';

revoke all on function public.substituir_cronograma_divida(uuid, text, jsonb) from public, anon;
grant execute on function public.substituir_cronograma_divida(uuid, text, jsonb) to authenticated;
