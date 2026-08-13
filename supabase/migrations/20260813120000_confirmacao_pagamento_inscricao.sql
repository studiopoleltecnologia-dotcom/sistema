-- Confirmação manual de pagamento de inscrição em evento, com autoria real.
--
-- O problema que isto fecha: `inscricoes_evento` nasceu com
-- `grant select, insert, update, delete ... to authenticated`, ou seja, UPDATE
-- em TODAS as colunas, e a RLS só perguntava `is_operacional()`. Somando as
-- duas coisas, uma conta secretaria conseguia, por chamada direta à API:
--
--   * reescrever nome, telefone e valor_centavos da inscrição de outra pessoa;
--   * marcar pago = true gravando `confirmado_por` com o uuid de OUTRA conta e
--     `pago_em` retroativo — forjando exatamente a auditoria que essas colunas
--     existem para produzir.
--
-- Privilégio por coluna (`grant update (pago, pago_em, confirmado_por)`) é
-- nativo no Postgres e resolveria o primeiro item, mas não o segundo: ele
-- controla QUAIS colunas se escreve, nunca QUAIS VALORES. E no Supabase o
-- grant só enxerga o role `authenticated` — que é toda conta logada, inclusive
-- aluna e professora —, então o recorte por função continuaria dependendo da
-- RLS de qualquer jeito.
--
-- Por isso a escrita sai do UPDATE direto e passa a ter um caminho único:
-- uma função `security definer` que carimba autor e data no servidor. Mesmo
-- padrão de `registrar_presenca()` e `resolver_checkin_pendente()`.

-- ---------------------------------------------------------------------------
-- 1. Fecha a escrita direta
-- ---------------------------------------------------------------------------

revoke update on public.inscricoes_evento from authenticated;

-- Sem o grant acima a policy virou letra morta; deixá-la no schema só
-- sugeriria que existe um caminho de UPDATE que não existe mais.
drop policy if exists inscricoes_evento_update_equipe on public.inscricoes_evento;

-- SELECT segue liberado para a operação, em todas as colunas — inclusive
-- `valor_centavos`. Não fere a regra de "secretaria não vê financeiro"
-- (CLAUDE.md 5.2): R$70 e R$100 são preço de ingresso impresso na página
-- pública de inscrição, não faturamento do estúdio.

-- ---------------------------------------------------------------------------
-- 2. Caminho único de escrita
-- ---------------------------------------------------------------------------

create or replace function public.confirmar_pagamento_inscricao(
  p_inscricao   uuid,
  p_confirmado  boolean,
  p_observacao  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual record;
  obs   text;
begin
  if not public.is_operacional() then
    raise exception 'acesso restrito à equipe de operação';
  end if;

  select pago into atual from public.inscricoes_evento where id = p_inscricao;
  if not found then
    raise exception 'inscrição inexistente';
  end if;

  obs := nullif(btrim(coalesce(p_observacao, '')), '');
  if obs is not null then
    obs := left(obs, 500);  -- constraint inscricoes_evento_obs_chk
  end if;

  -- Clique repetido no mesmo estado não reescreve `pago_em`. A data da
  -- confirmação é prova de quando o comprovante chegou; regravá-la a cada
  -- clique transformaria a auditoria em "quando alguém mexeu por último".
  if atual.pago = p_confirmado then
    if obs is not null then
      update public.inscricoes_evento set observacoes = obs where id = p_inscricao;
    end if;
    return;
  end if;

  update public.inscricoes_evento
     set pago           = p_confirmado,
         -- Autor e data vêm do servidor: quem chama não escolhe nenhum dos dois.
         pago_em        = case when p_confirmado then now() else null end,
         confirmado_por = case when p_confirmado then (select auth.uid()) else null end,
         observacoes    = coalesce(obs, observacoes)
   where id = p_inscricao;
end;
$$;

comment on function public.confirmar_pagamento_inscricao(uuid, boolean, text) is
  'Único caminho de escrita em inscricoes_evento. Carimba confirmado_por = auth.uid() e pago_em = now() no servidor; desfazer limpa os dois.';

revoke all on function public.confirmar_pagamento_inscricao(uuid, boolean, text)
  from public, anon;
grant execute on function public.confirmar_pagamento_inscricao(uuid, boolean, text)
  to authenticated;
