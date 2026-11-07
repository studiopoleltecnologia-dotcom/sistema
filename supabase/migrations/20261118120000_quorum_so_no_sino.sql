-- ============================================================
-- Aula cancelada por quórum: sino sim, e-mail não
-- 07/11/2026
-- ============================================================
-- Decisão da gestão, depois de cinco dias recebendo o aviso: *"são esses
-- os e-mails que eu continuo recebendo e não precisa mais"*.
--
-- ## O que estava acontecendo
--
-- O cron `conferir-quorum` (`20261005120000`) confere, 4h antes de cada
-- aula, quantos alunos estão agendados **no Supabase**. Só que o
-- agendamento real ainda roda no **Wix** — aqui são zero agendados em
-- todas as turmas da grade. Então a conferência encontrava o que o
-- desenho dela manda encontrar: toda aula abaixo do mínimo.
--
-- Entre 03 e 07/11/2026 isso cancelou **25 aulas** e gerou **70 e-mails**
-- para a gestão (25 aulas × 3 sócias) — nenhuma delas com um aluno
-- sequer, e todas aconteceram normalmente no estúdio.
--
-- Os registros falsos (25 cancelamentos, 27 conferências, 50 sinos) foram
-- apagados da produção à mão nesta mesma data. **Não entram nesta
-- migration de propósito:** um `delete ... where motivo = 'quorum'` num
-- arquivo versionado apagaria, no dia em que chegasse ao outro ambiente,
-- cancelamentos legítimos criados nesse meio-tempo.
--
-- ## O que esta migration muda, e o que ela NÃO muda
--
-- Muda uma coluna: o aviso `aula_cancelada_quorum` deixa de sair por
-- e-mail e passa a viver só no sino (`20261014120000`, bloco 2 — linha
-- ausente em `preferencias_notificacao` significa "o padrão do
-- catálogo"). Nenhuma sócia tem preferência própria desse tipo hoje, então
-- a troca do padrão vale para as três.
--
-- ⚠️ **Não desliga o cancelamento.** O cron continua ativo e continua
-- cancelando toda a grade enquanto a agenda estiver no Wix — agora em
-- silêncio, o que é mais discreto e não mais correto. Foi a opção
-- escolhida pela gestão entre as três oferecidas; a alternativa era
-- desligar o `conferir-quorum` até o agendamento ser do ERP.
--
-- Duas consequências de deixá-lo ligado, para quem vier depois:
--
-- * a aba Agenda → canceladas volta a encher de aula cancelada que
--   aconteceu;
-- * `recusar_aula_cancelada` barra agendamento em aula cancelada, então
--   no dia em que o portal do aluno for usado para valer, o aluno não
--   consegue reservar. Hoje há 1 conta de aluna cadastrada, por isso
--   ninguém esbarrou nisso ainda.
--
-- Religar o e-mail é esta mesma linha com `true`. Desligar o cron é
-- `select cron.alter_job((select jobid from cron.job where jobname =
-- 'conferir-quorum'), active := false);`
-- ============================================================

update public.tipos_notificacao
   set email_padrao = false
 where tipo = 'aula_cancelada_quorum';

comment on column public.tipos_notificacao.email_padrao is
  'E-mail ligado de fábrica para este aviso. O sino é sempre o padrão — ele não incomoda ninguém. aula_cancelada_quorum está em false desde 07/11/2026: enquanto a agenda estiver no Wix a conferência lê zero agendados e cancela a grade inteira, e o e-mail disso é só ruído.';
