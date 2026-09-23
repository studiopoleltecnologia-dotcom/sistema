-- ============================================================
-- Defesa Pessoal Feminina: sala, professora, modalidade, turma e a
-- regra de remuneração 50/50
-- 22/09/2026
--
-- Dados da gestão em 22/09:
--   · sábado às 11h            · Sala 2 · Multi
--   · capacidade 10 alunos     · tabela de Turma Fixa já existente
--   · aulas com Jullia e Manu; para faturamento, a contraparte é SCBJJ
--   · remuneração 50/50 sobre as mensalidades contratadas (D20)
--
-- ------------------------------------------------------------
-- Por que a Sala 2 precisa ser ativada
-- ------------------------------------------------------------
-- Ela existe desde `20260722125000` mas está `ativa = false`: foi
-- cadastrada antes de a segunda sala abrir. Sábado 11h a Sala 1 está
-- com Pole 1, então esta turma só cabe na 2 — e uma sala inativa some
-- dos seletores da Agenda, o que impediria a equipe de remanejar
-- depois.
--
-- ------------------------------------------------------------
-- Uma professora chamada SCBJJ
-- ------------------------------------------------------------
-- `turmas.professora_id` é obrigatório e único por turma, e a folha é
-- por professora. Como o pagamento vai para a SCBJJ e não para cada
-- instrutora, o cadastro é a contraparte financeira — é ela que tem
-- que aparecer no fechamento.
-- ⚠️ Consequência: a grade pública e a chamada mostram "SCBJJ", não
-- "Jullia e Manu". Se os nomes precisarem aparecer para o aluno, é uma
-- coluna de exibição a mais — não está neste PR de propósito, para não
-- inventar campo sem pedido.
--
-- `modelo` fica em `por_aluna` com valor 0 só para satisfazer o
-- not-null herdado do cadastro antigo: quem decide o pagamento é
-- `regras_remuneracao`, e a regra abaixo é do tipo percentual.
--
-- ------------------------------------------------------------
-- A regra 50/50
-- ------------------------------------------------------------
-- Percentual sobre `mensalidade_contratada`: soma das mensalidades de
-- quem está matriculado NA TURMA, rateada pelas ocorrências do mês.
-- Por isso o formato é Turma Fixa — em plano por créditos não existe
-- "matriculado nesta turma", e a base não teria como ser somada.
--
-- Escopo por modalidade e `professora_id` nulo: se amanhã outra pessoa
-- assumir a turma, o contrato continua valendo sem migration nova.
--
-- Vigência a partir de 01/10/2026, junto com a tabela do Pole.
--
-- Tudo idempotente e por nome: roda igual em DEV e produção, que têm
-- catálogos diferentes.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Sala 2 · Multi entra em operação
-- ------------------------------------------------------------

update public.salas set ativa = true where nome = 'Sala 2 · Multi';


-- ------------------------------------------------------------
-- 2) A contraparte de faturamento
-- ------------------------------------------------------------
-- "A completar" é a convenção já usada pelas professoras semeadas por
-- migration (`20260921160000`): a tela de Professoras marca quem está
-- sem contato como pendência, e é assim que a gestão lembra de
-- completar antes do primeiro fechamento.

insert into public.professoras
  (nome, valor_por_aluna_centavos, modelo,
   contato_emergencia_nome, contato_emergencia_telefone, ativa)
select 'SCBJJ', 0, 'por_aluna', 'A completar', 'A completar', true
where not exists (select 1 from public.professoras where nome = 'SCBJJ');

comment on column public.professoras.nome is
  'Nome da professora ou, quando o pagamento vai para uma escola '
  'parceira, a contraparte de faturamento (ex.: SCBJJ). É este nome '
  'que aparece na grade, na chamada e no fechamento.';


-- ------------------------------------------------------------
-- 3) A modalidade
-- ------------------------------------------------------------
-- Elegível para Turma Fixa: é justamente o formato que a remuneração
-- por percentual exige. Categoria Condicionamento — não é Pole nem
-- Dança, e o 2.3.6 não a alcança.

insert into public.modalidades (nome, categoria_id, elegivel_turma_fixa, ativa, ordem)
select 'Defesa Pessoal Feminina',
       (select id from public.categorias_modalidade where nome = 'Condicionamento'),
       true, true,
       coalesce((select max(ordem) + 1 from public.modalidades), 0)
where not exists (select 1 from public.modalidades where nome = 'Defesa Pessoal Feminina');


-- ------------------------------------------------------------
-- 4) A turma: sábado, 11h, Sala 2, 10 lugares
-- ------------------------------------------------------------
-- `dia_semana = 6` é sábado (mesma convenção de `extract(dow)` usada em
-- validar_vaga_agendamento e na grade).

insert into public.turmas
  (modalidade, modalidade_id, professora_id, sala_id,
   dia_semana, horario, duracao_minutos, capacidade, ativa)
select
  'Defesa Pessoal Feminina',
  (select id from public.modalidades where nome = 'Defesa Pessoal Feminina'),
  (select id from public.professoras where nome = 'SCBJJ'),
  (select id from public.salas where nome = 'Sala 2 · Multi'),
  6, time '11:00', 60, 10, true
where not exists (
  select 1 from public.turmas t
  join public.modalidades m on m.id = t.modalidade_id
  where m.nome = 'Defesa Pessoal Feminina'
    and t.dia_semana = 6 and t.horario = time '11:00'
);


-- ------------------------------------------------------------
-- 5) A remuneração 50/50 (D20)
-- ------------------------------------------------------------

insert into public.regras_remuneracao
  (modalidade_id, tipo, percentual, base_percentual, vigencia_inicio, observacao)
select
  (select id from public.modalidades where nome = 'Defesa Pessoal Feminina'),
  'percentual', 50.00, 'mensalidade_contratada', date '2026-10-01',
  'Contrato SCBJJ (D20, 22/09): 50% das mensalidades contratadas na turma'
where not exists (
  select 1 from public.regras_remuneracao r
  join public.modalidades m on m.id = r.modalidade_id
  where m.nome = 'Defesa Pessoal Feminina'
);
