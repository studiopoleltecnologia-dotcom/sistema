-- ============================================================
-- Faltas: 2 no ciclo, 20 dias de suspensão
-- 05/10/2026
-- ============================================================
-- Achado na homologação do bloco 21, comparando a configuração do DEV com
-- a da produção:
--
--   | | DEV | produção |
--   |---|---|---|
--   | `faltas_para_suspensao`  | 3  | **2**  |
--   | `dias_suspensao_faltas`  | 15 | **20** |
--
-- O regulamento oficial de 01/10/2026, item 4.7, decide a questão:
--
--   "Para alunos que utilizam sistemas de agendamento por créditos,
--    **2 faltas** sem cancelamento no mesmo ciclo geram suspensão de
--    novos agendamentos por **20 dias**. Essa penalidade não se aplica às
--    aulas vinculadas ao Plano Turma Fixa."
--
-- Ou seja: a produção está certa e o DEV é que ficou para trás, com os
-- valores do regulamento de setembro (3 faltas / 15 dias). Confirmado
-- pela gestão em 05/10.
--
-- ## Por que isto é migration e não um update no DEV
--
-- Não é valor que varia por ambiente (CLAUDE.md §14.4): é **regra de
-- regulamento**, e tem de ser igual nos dois lados. Como migration, o
-- DEV se corrige sozinho pelo `dev.yml` e a produção não sente nada —
-- lá o `update` é no-op, porque os valores já são esses.
--
-- O `default` da coluna muda junto: ambiente novo (DEV recriado) nasceria
-- com 3/15 de novo, e a divergência voltaria sozinha. Foi exatamente
-- assim que ela apareceu.
--
-- ⚠️ A cláusula do contrato **lê estes parâmetros** por marcador
-- (`{{FALTAS_SUSPENSAO}}` e `{{DIAS_SUSPENSAO}}`), então o texto que o
-- aluno aceita acompanha sem edição. É a razão de o número nunca ter
-- sido escrito no texto.
-- ============================================================

alter table public.config_agendamento
  alter column faltas_para_suspensao set default 2;

alter table public.config_agendamento
  alter column dias_suspensao_faltas set default 20;

update public.config_agendamento
set faltas_para_suspensao = 2,
    dias_suspensao_faltas = 20
where id;

comment on column public.config_agendamento.faltas_para_suspensao is
  'Regulamento 4.7 (01/10/2026): quantas faltas sem cancelamento no mesmo ciclo suspendem novos agendamentos. 2. Nao se aplica a Plano Turma Fixa. O texto do contrato le daqui pelo marcador FALTAS_SUSPENSAO.';

comment on column public.config_agendamento.dias_suspensao_faltas is
  'Regulamento 4.7 (01/10/2026): por quantos dias o aluno fica sem poder agendar com antecedencia depois de atingir o limite de faltas. 20. Ele continua podendo treinar: agenda no mesmo dia ou entra na lista de espera.';
