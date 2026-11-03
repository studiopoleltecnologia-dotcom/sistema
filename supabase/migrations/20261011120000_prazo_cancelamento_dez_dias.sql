-- ============================================================
-- Cancelamento de plano: 10 dias de antecedência
-- 05/10/2026
-- ============================================================
-- A28. Os três documentos oficiais de 01/10 dizem **10 dias** — o
-- regulamento 9.1, o contrato 9.1 e o manual interno §9 — e o sistema
-- aplicava **5**, herdado do regulamento v3 de setembro. Decisão da
-- gestão em 05/10: vale o que está nos documentos.
--
-- O texto do contrato não precisa de edição: a cláusula usa o marcador
-- `{{DIAS_ANTECEDENCIA_CANCELAMENTO}}`, que lê esta configuração. Mudar
-- aqui muda o documento que o aluno aceita, e é essa a razão de o número
-- nunca ter sido escrito no texto.
--
-- ## O efeito colateral que vem junto, e que não é opcional
--
-- `dias_aviso_fim_compromisso` (o e-mail de que o semestral vai virar
-- mensal, 7.7) estava em **10** justamente para chegar ANTES do prazo de
-- cancelar, que era 5. Subindo o prazo para 10, os dois ficariam iguais:
-- o aviso chegaria no último dia útil de decisão — tecnicamente dentro
-- do prazo, e na prática inútil.
--
-- Então o aviso sobe para **15**, mantendo os mesmos 5 dias de folga que
-- existiam. E a relação entre os dois passa a ser **constraint**: o
-- comentário da coluna já dizia "deve ser maior", mas nada impedia, e
-- isso é exatamente o tipo de inversão que ninguém percebe até um aluno
-- reclamar de ter sido cobrado de um ciclo que tentou cancelar.
--
-- ## Por que dá para mudar sem combinar caso a caso
--
-- Conferido na produção em 05/10, antes de escrever isto: **nenhum**
-- semestral ativo (os planos com compromisso não começaram a ser
-- vendidos pelo sistema) e a tabela `contratos` ainda não existe lá —
-- nenhum aluno aceitou um documento que prometia 5 dias. O contrato já
-- aceito é imutável por desenho, então, se algum dia houver um com o
-- número antigo, é o dele que vale; hoje não há nenhum.
-- ============================================================


-- ------------------------------------------------------------
-- 1. O prazo
-- ------------------------------------------------------------
-- O default muda junto: ambiente novo (DEV recriado) tem de nascer com o
-- valor dos documentos, senão a divergência volta sozinha.
alter table public.config_agendamento
  alter column dias_antecedencia_cancelamento_plano set default 10;

alter table public.config_agendamento
  alter column dias_aviso_fim_compromisso set default 15;

-- `greatest` e não `15` fixo: se a gestão já tiver subido o aviso à mão
-- para mais que isso, esta migration não desfaz a escolha dela.
update public.config_agendamento
set dias_antecedencia_cancelamento_plano = 10,
    dias_aviso_fim_compromisso = greatest(dias_aviso_fim_compromisso, 15)
where id;


-- ------------------------------------------------------------
-- 2. A relação entre os dois, enforçada
-- ------------------------------------------------------------
-- Depois do update, de propósito: a constraint é validada contra as
-- linhas existentes, e a ordem inversa reprovaria a própria migration.
alter table public.config_agendamento
  drop constraint if exists config_aviso_antes_do_prazo;
alter table public.config_agendamento
  add constraint config_aviso_antes_do_prazo
  check (dias_aviso_fim_compromisso > dias_antecedencia_cancelamento_plano);


-- ------------------------------------------------------------
-- 3. Os comentários
-- ------------------------------------------------------------
comment on column public.config_agendamento.dias_antecedencia_cancelamento_plano is
  'Regulamento 9.1 (01/10): quantos dias antes da renovacao o pedido de cancelamento precisa chegar para impedir aquela renovacao. Pedido depois disso vale para a seguinte. 10 desde 05/10/2026 — os tres documentos oficiais dizem 10, e o sistema estava em 5. O texto do contrato le daqui pelo marcador DIAS_ANTECEDENCIA_CANCELAMENTO.';

comment on column public.config_agendamento.dias_aviso_fim_compromisso is
  'Regulamento 7.7: quantos dias antes do fim do semestral o aluno recebe o e-mail de que o plano vai passar a Mensal. Tem de ser MAIOR que dias_antecedencia_cancelamento_plano (constraint config_aviso_antes_do_prazo), senao o aviso chega depois de o prazo de cancelar ter passado — um aviso que nao serve para decidir nada.';
