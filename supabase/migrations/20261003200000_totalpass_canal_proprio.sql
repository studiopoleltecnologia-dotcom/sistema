-- ============================================================
-- TotalPass como canal próprio
-- 01/10/2026
-- ============================================================
-- Decisão de 21/09 (backlog X5), e agora o bloco 15 do pedido de revisão: a
-- integração com o TotalPass **não fica pronta antes do lançamento**, e isso
-- não pode impedir a implantação.
--
-- Há alunos TotalPass ativos no Wix hoje — 34 pelo levantamento de 21/09 —
-- e o ERP só conhece `wellhub` e `classpass`.
--
-- ## A solução temporária é uma reserva de verdade, não um improviso
--
-- O que o pedido exige da reserva manual:
--
-- | precisa contar para | como fica |
-- |---|---|
-- | ocupação da turma | o gatilho de vaga conta `agendamentos`, qualquer canal |
-- | lista de presença | `presencas` não filtra canal |
-- | mínimo de alunos | conta reserva válida de qualquer canal (regulamento 4.6) |
-- | pagamento da professora | derivado de presença, não de canal |
-- | **não** consumir crédito | `agendar_aula()` só mexe em crédito quando `canal = 'mensalista'` |
-- | **não** gerar cobrança | cobrança nasce de `solicitacoes_contratacao`, não de agendamento |
--
-- Nenhuma dessas seis linhas precisou de código: todas já valem para
-- `wellhub` e `classpass`. **O que faltava era o valor no enum.** É por isso
-- que esta migration é curta — a arquitetura de canal já estava certa, e o
-- TotalPass simplesmente não existia nela.
--
-- ## Por que isso facilita a transição, em vez de atrapalhar
--
-- Quando a integração real chegar, o webhook do TotalPass vai criar
-- `agendamentos` e `presencas` com `canal = 'totalpass'` — exatamente as
-- mesmas linhas que a equipe cria à mão hoje. Não há nada para desfazer: o
-- que muda é **quem** insere, não o que é inserido.
--
-- A alternativa que seria gambiarra — marcar TotalPass como `avulsa` com uma
-- observação no texto, ou criar uma tabela paralela — é que daria trabalho
-- de remover depois.
--
-- ## Receita: mesmo molde do Wellhub
--
-- Check-in de plataforma vira entrada `prevista` com `data_prevista` no
-- repasse (CLAUDE.md §8: receita por check-in, paga em lote com atraso). O
-- gatilho `integrar_presenca` já faz isso para o Wellhub; passa a fazer para
-- o TotalPass.
--
-- ⚠️ **A data do repasse do TotalPass está assumida igual à do Wellhub** (dia
-- 15 do mês seguinte). Não achei a confirmação em documento nenhum, e é
-- parâmetro de conciliação: se o calendário deles for outro, o que muda é
-- `data_prevista` — o valor e a competência continuam certos. Confirmar no
-- portal do parceiro antes do primeiro fechamento.
--
-- ⚠️ `valor_checkin_totalpass_centavos` nasce **0**, e com zero o gatilho não
-- lança nada. É de propósito: lançar receita com valor inventado é pior que
-- não lançar. A gestão preenche quando souber o valor do repasse.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Os três enums
-- ------------------------------------------------------------
-- Canal da reserva e da presença.
alter type public.canal_aula add value if not exists 'totalpass';

-- Origem do aluno, para a ficha dizer de onde ele veio (bloco 15 do pedido:
-- "Origem do aluno: TotalPass").
alter type public.origem_cliente add value if not exists 'totalpass';

-- Categoria financeira, para o repasse do TotalPass não cair em 'outros' e
-- virar invisível no mix de receita.
alter type public.categoria_entrada add value if not exists 'totalpass';


-- ------------------------------------------------------------
-- 2. Valor do check-in
-- ------------------------------------------------------------
alter table public.config_agendamento
  add column if not exists valor_checkin_totalpass_centavos bigint not null default 0;

do $$
begin
  alter table public.config_agendamento
    add constraint valor_checkin_totalpass_nao_negativo
    check (valor_checkin_totalpass_centavos >= 0);
exception when duplicate_object then null;
end $$;

comment on column public.config_agendamento.valor_checkin_totalpass_centavos is
  'Quanto o TotalPass paga por check-in. Nasce 0, e com 0 nenhuma receita é lançada — lançar valor inventado é pior que não lançar. A gestão preenche quando souber o repasse.';


-- ------------------------------------------------------------
-- 3. A presença de TotalPass vira receita a reconciliar
-- ------------------------------------------------------------
-- Reescrita fiel de `20260719180000`, com o TotalPass ao lado do Wellhub. O
-- resto do corpo é idêntico: última aula da pessoa, e a limpeza da previsão
-- quando a presença é corrigida para falta.
create or replace function public.integrar_presenca()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  valor bigint;
  prox15 date;
  rotulo text;
  cat public.categoria_entrada;
begin
  if new.presente then
    update public.clientes
    set ultima_aula = new.data_aula
    where id = new.cliente_id
      and (ultima_aula is null or ultima_aula < new.data_aula);

    if new.canal in ('wellhub', 'totalpass') and not exists (
      select 1 from public.entradas_financeiras where presenca_id = new.id
    ) then
      if new.canal = 'wellhub' then
        select valor_checkin_wellhub_centavos into valor from public.config_agendamento;
        rotulo := 'Check-in Wellhub';
        cat := 'wellhub';
      else
        select valor_checkin_totalpass_centavos into valor from public.config_agendamento;
        rotulo := 'Check-in TotalPass';
        cat := 'totalpass';
      end if;

      -- Valor 0 = não sabemos quanto a plataforma paga. Não lança.
      if valor > 0 then
        prox15 := (date_trunc('month', new.data_aula) + interval '1 month + 14 days')::date;
        insert into public.entradas_financeiras
          (descricao, valor_centavos, categoria, status, data_competencia,
           data_prevista, cliente_id, presenca_id)
        values
          (rotulo, valor, cat, 'prevista', new.data_aula,
           prox15, new.cliente_id, new.id);
      end if;
    end if;
  else
    -- correção de presença → falta: remove a previsão ainda não reconciliada
    delete from public.entradas_financeiras
    where presenca_id = new.id and status = 'prevista';
  end if;
  return new;
end;
$function$;

comment on function public.integrar_presenca() is
  'Presença alimenta "última aula" e, nos canais de plataforma (Wellhub, TotalPass), lança a receita prevista do repasse. Valor 0 na configuração = não lança.';
