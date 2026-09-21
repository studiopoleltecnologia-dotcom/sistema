-- ============================================================
-- Planos legados do Wix — existem para honrar quem já contratou,
-- não para vender.
--
-- Decisão da gestão (21/09/2026): "esses planos são atuais e os clientes
-- que têm continuarão válidos até o fim deles. Depois, só poderão
-- adquirir os novos planos."
--
-- Como isso vira banco, sem código novo — o modelo já previa os dois
-- lados disto:
--
--   visivel_no_catalogo = false  → o aluno nunca vê nem contrata. Quem
--       filtra é a RLS (`cliente ve produtos do catalogo` exige a
--       coluna), não a tela. A equipe continua enxergando, marcado como
--       "· só a equipe" na tela de matrícula — e precisa disso, porque é
--       assim que o import do Wix vai registrar quem já tem o plano.
--
--   ativo = true  → `renovar_ciclo()` exige produto ativo. Arquivar
--       (ativo = false) pareceria a escolha óbvia de "não vender mais",
--       mas quebraria a renovação de quem está no meio do semestre.
--
--   renova_automaticamente = false  → acabou o ciclo contratado, o
--       sistema recusa com "compromisso encerrado — contrate um plano
--       novo" em vez de renovar no plano velho. É a tradução literal do
--       "depois, só poderão adquirir os novos planos": o aluno escolhe,
--       ninguém é migrado à revelia.
--
-- ⚠️ O caminho alternativo, se um dia a gestão preferir migração
-- automática em vez de nova escolha: preencher `produto_sucessor_id`
-- apontando para o plano novo equivalente. `renovar_ciclo()` (ver
-- 20260821120000, "Fim do compromisso: sucessão") troca o plano da
-- matrícula sozinho e recongela o preço no valor do sucessor. Fica
-- deliberadamente nulo aqui.
--
-- O preço na tabela é o preço de tabela do Wix HOJE. O que cada aluno
-- realmente paga vai em `matriculas.preco_contratado_centavos` no
-- import — há gente em R$160 num plano que hoje custa R$170, e é assim
-- que o preço herdado sobrevive.
--
-- Só entram os planos com assinatura ATIVA no Wix em 21/09/2026
-- (levantados via API). Catálogo morto não vira linha aqui.
-- `Aula Avulsa` (R$60) e `Aula Experimental` (R$40) ficaram de fora de
-- propósito: já existem no catálogo novo, com o mesmo preço.
-- Wellhub e TotalPass também não entram — são CANAL, não produto.
-- ============================================================

-- 1. Planos mensais por frequência (o "1x na semana" vira 4 créditos/mês)
insert into public.produtos (
  nome, descricao, tipo_produto, preco_centavos, periodicidade_dias,
  ciclos_compromisso, renova_automaticamente, gera_credito, creditos_por_ciclo,
  acumula_creditos, teto_acumulo_ciclos, dias_antecedencia_agendamento,
  max_agendamentos_simultaneos, horas_cancelamento, desconto_eventos_pct,
  convidados_por_ciclo, turmas_fixas, ordem, ativo, visivel_no_catalogo)
select v.nome, v.descricao, 'plano', v.preco, 30,
       v.ciclos, false, true, v.creditos,
       false, 1, 14,
       8, 4, 0,
       0, 0, v.ordem, true, false
from (values
  ('Plano Mensal  - 1x na semana',      'Legado do Wix. Não contratável.', 17000,  4, 1, 900),
  ('Plano Mensal - 2x na semana',       'Legado do Wix. Não contratável.', 30000,  8, 1, 901),
  ('Plano Mensal - 3x na semana',       'Legado do Wix. Não contratável.', 42000, 12, 1, 902),
  ('Plano Mensal - 4x por semana',      'Legado do Wix. Não contratável.', 57000, 16, 1, 903),
  ('Plano Trimestral - 1x por semana',  'Legado do Wix. Compromisso de 3 ciclos.', 16000,  4, 3, 910),
  ('Plano Semestral - 1x por semana',   'Legado do Wix. Compromisso de 6 ciclos.', 15500,  4, 6, 920),
  ('Plano Semestral - 2x por semana',   'Legado do Wix. Compromisso de 6 ciclos.', 28000,  8, 6, 921)
) as v(nome, descricao, preco, creditos, ciclos, ordem)
where not exists (select 1 from public.produtos p where p.nome = v.nome);

-- 2. Planos de modalidade única (Dança do Ventre, Hatha Yoga).
--    ⚠️ `creditos_por_ciclo` destes três é ESTIMATIVA: o nome não diz a
--    frequência ("Perfil Social" / "Perfil Amplo" é recorte de preço, não
--    de quantidade) e o Wix não guarda essa informação em lugar nenhum.
--    Foram postos em 4 (1x/semana) e a descrição avisa. Confirmar com a
--    professora antes de o aluno agendar — são 4 pessoas ao todo.
insert into public.produtos (
  nome, descricao, tipo_produto, preco_centavos, periodicidade_dias,
  ciclos_compromisso, renova_automaticamente, gera_credito, creditos_por_ciclo,
  acumula_creditos, teto_acumulo_ciclos, dias_antecedencia_agendamento,
  max_agendamentos_simultaneos, horas_cancelamento, desconto_eventos_pct,
  convidados_por_ciclo, turmas_fixas, ordem, ativo, visivel_no_catalogo)
select v.nome, v.descricao, 'plano', v.preco, 30,
       1, false, true, 4,
       false, 1, 14,
       8, 4, 0,
       0, 0, v.ordem, true, false
from (values
  ('Plano Mensal Dança do Ventre', 'Legado do Wix. CRÉDITOS A CONFIRMAR (estimados em 4/mês).', 16000, 930),
  ('Hatha Yoga - Perfil Social',   'Legado do Wix. CRÉDITOS A CONFIRMAR (estimados em 4/mês).',  8000, 931),
  ('Hatha Yoga - Perfil Amplo',    'Legado do Wix. CRÉDITOS A CONFIRMAR (estimados em 4/mês).', 15000, 932)
) as v(nome, descricao, preco, ordem)
where not exists (select 1 from public.produtos p where p.nome = v.nome);

-- 3. Pacotes avulsos do Wix. Validade de 40 dias é a do próprio Wix
--    (`singlePaymentForDuration`), não a nossa.
insert into public.produtos (
  nome, descricao, tipo_produto, preco_centavos, periodicidade_dias,
  ciclos_compromisso, renova_automaticamente, gera_credito, creditos_por_ciclo,
  validade_creditos_dias, acumula_creditos, teto_acumulo_ciclos,
  dias_antecedencia_agendamento, max_agendamentos_simultaneos,
  horas_cancelamento, desconto_eventos_pct, convidados_por_ciclo,
  turmas_fixas, ordem, ativo, visivel_no_catalogo)
select v.nome, 'Legado do Wix. Não contratável.', 'pacote', v.preco, 40,
       1, false, true, v.creditos,
       40, false, 1,
       14, 8,
       4, 0, 0,
       0, v.ordem, true, false
from (values
  ('Pacotes - 4 Aulas', 19000, 4, 940),
  ('Pacotes - 6 Aulas', 24000, 6, 941)
) as v(nome, preco, creditos, ordem)
where not exists (select 1 from public.produtos p where p.nome = v.nome);

-- 4. Plano Equipe — cortesia (R$0, sem validade no Wix). São 12 pessoas
--    ativas, a maior fatia dos "planos" de lá. Não é venda: é acesso de
--    professora/sócia/parceria. Fica com crédito alto e sem renovação
--    automática para não virar cobrança nem expirar sozinho no meio do
--    mês; quem controla é a equipe, manualmente.
insert into public.produtos (
  nome, descricao, tipo_produto, preco_centavos, periodicidade_dias,
  ciclos_compromisso, renova_automaticamente, gera_credito, creditos_por_ciclo,
  acumula_creditos, teto_acumulo_ciclos, dias_antecedencia_agendamento,
  max_agendamentos_simultaneos, horas_cancelamento, desconto_eventos_pct,
  convidados_por_ciclo, turmas_fixas, ordem, ativo, visivel_no_catalogo)
select 'Plano Equipe', 'Cortesia da equipe. Legado do Wix, não contratável.', 'plano', 0, 30,
       1, false, true, 30,
       false, 1, 14,
       8, 4, 0,
       0, 0, 950, true, false
where not exists (select 1 from public.produtos p where p.nome = 'Plano Equipe');

comment on column public.produtos.visivel_no_catalogo is
  'Falso = existe no sistema mas não é vendável: plano legado, cortesia ou personalizado. A RLS do aluno exige esta coluna, então ele nem recebe a linha; a equipe continua vendo para poder registrar matrícula. Ver 20260921130000.';
