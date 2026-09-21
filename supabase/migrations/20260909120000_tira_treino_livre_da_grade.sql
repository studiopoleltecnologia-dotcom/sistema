-- Tira o Treino Livre da grade de horários.
--
-- Decisão da equipe em 09/09/2026: o Treino Livre deixa de ocupar horário fixo
-- na grade. Eram 9 turmas de capacidade 1 (seg 14/15/16h, qua 13/14/15h,
-- sex 13/14/15h) carregadas por 20260905120000_grade_real_do_wix.sql — o
-- retrato do Wix trouxe cada janela de treino como se fosse uma turma, e numa
-- grade que agora resume o dia no painel elas eram um quarto das linhas sem
-- nunca terem recebido um agendamento sequer (0 agendamentos e 0 presenças nos
-- dois ambientes na data desta migration).
--
-- **Desativa, não apaga.** `turmas.ativa = false` é o mesmo que a tela de
-- Agenda faz ao remover uma turma: some da grade, da ocupação e do painel, mas
-- o id continua de pé caso alguma presença histórica venha a apontar para ele.
-- Reverter é um UPDATE, não um re-cadastro.
--
-- O que NÃO muda de propósito:
--   • a modalidade "Treino Livre" continua cadastrada — o estúdio segue
--     vendendo treino livre, só não em horário fixo;
--   • o produto "Treino livre" continua no catálogo, pelo mesmo motivo;
--   • **o Wix não sabe disto.** Enquanto a operação de reservas viver lá
--     (CLAUDE.md §12.5), quem tirar o horário aqui precisa tirar lá também,
--     senão o aluno continua reservando um horário que o ERP não conhece.

update turmas
   set ativa = false
 where ativa = true
   and modalidade ilike '%treino%livre%';
