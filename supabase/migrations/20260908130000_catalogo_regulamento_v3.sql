-- ============================================================
-- Catálogo real do estúdio — regulamento v3
--
-- `produtos` tinha uma linha só, "Plano Teste 8 creditos", de quando o
-- módulo foi construído. A estrutura está pronta desde 20/08 e a tabela
-- de preços foi fechada em set/2026; sem os produtos cadastrados a tela
-- de Produtos abre vazia e não dá para matricular ninguém.
--
-- Fonte: regulamento v3, itens 2.1 (créditos mensal), 2.2 (créditos
-- semestral), 2.3 (turma fixa), 2.4 (o que muda entre mensal e
-- semestral), 4.5 (máximo de 8 reservas), 4.6 (4h de cancelamento),
-- 7.7 (semestral vira mensal no fim) e 8 (aulas e pacotes fora do
-- plano).
--
-- IDEMPOTENTE POR NOME. Rodar duas vezes não duplica, e — o que
-- importa mais — NÃO sobrescreve preço que a equipe tenha ajustado
-- pela tela depois. Migration semeia o que não existe; quem manda no
-- preço, a partir daí, é quem vende.
--
-- O produto de teste NÃO é arquivado aqui de propósito: pode haver
-- matrícula presa nele em DEV, e arquivar é um clique na tela nova.
-- ============================================================

do $seed$
declare
  p_id uuid;
  suc_id uuid;
begin

  -- ==========================================================
  -- 1. Plano por Créditos — Mensal (2.1)
  --
  -- Sem compromisso (ciclos = 1), crédito que sobra expira (2.4),
  -- agenda com 14 dias de antecedência, no máximo 8 reservas em aberto
  -- (4.5), cancela até 4h antes (4.6), 5% em aulões (2.4).
  -- ==========================================================
  insert into public.produtos (
    nome, descricao, tipo_produto, preco_centavos, periodicidade_dias,
    ciclos_compromisso, renova_automaticamente, gera_credito, creditos_por_ciclo,
    acumula_creditos, teto_acumulo_ciclos, dias_antecedencia_agendamento,
    max_agendamentos_simultaneos, horas_cancelamento, desconto_eventos_pct,
    convidados_por_ciclo, turmas_fixas, ordem, ativo, visivel_no_catalogo)
  select v.nome, v.descricao, 'plano', v.preco, 30,
         1, true, true, v.creditos,
         false, 1, 14,
         8, 4, 5,
         0, 0, v.ordem, true, true
  from (values
    ('Mensal · 4 créditos',  'Um crédito, todas as modalidades da grade regular.', 17000,  4, 10),
    ('Mensal · 8 créditos',  'Um crédito, todas as modalidades da grade regular.', 30000,  8, 11),
    ('Mensal · 12 créditos', 'Um crédito, todas as modalidades da grade regular.', 42000, 12, 12),
    ('Mensal · 16 créditos', 'Um crédito, todas as modalidades da grade regular.', 56000, 16, 13)
  ) as v(nome, descricao, preco, creditos, ordem)
  where not exists (select 1 from public.produtos p where p.nome = v.nome);

  -- ==========================================================
  -- 2. Plano por Créditos — Semestral (2.2)
  --
  -- 6 ciclos de compromisso, acumula até o limite de 1 ciclo (3.4 —
  -- "seu saldo nunca passa do dobro do plano" é exatamente
  -- teto_acumulo_ciclos = 1), 21 dias de antecedência, 10% em aulões,
  -- 1 convidado por ciclo (2.4).
  -- ==========================================================
  insert into public.produtos (
    nome, descricao, tipo_produto, preco_centavos, periodicidade_dias,
    ciclos_compromisso, renova_automaticamente, gera_credito, creditos_por_ciclo,
    acumula_creditos, teto_acumulo_ciclos, dias_antecedencia_agendamento,
    max_agendamentos_simultaneos, horas_cancelamento, desconto_eventos_pct,
    convidados_por_ciclo, turmas_fixas, ordem, ativo, visivel_no_catalogo)
  select v.nome, v.descricao, 'plano', v.preco, 30,
         6, true, true, v.creditos,
         true, 1, 21,
         8, 4, 10,
         1, 0, v.ordem, true, true
  from (values
    ('Semestral · 4 créditos',  'Valor congelado por 6 ciclos. Crédito que sobra acumula.', 16000,  4, 20),
    ('Semestral · 8 créditos',  'Valor congelado por 6 ciclos. Crédito que sobra acumula.', 29000,  8, 21),
    ('Semestral · 12 créditos', 'Valor congelado por 6 ciclos. Crédito que sobra acumula.', 41000, 12, 22),
    ('Semestral · 16 créditos', 'Valor congelado por 6 ciclos. Crédito que sobra acumula.', 54500, 16, 23)
  ) as v(nome, descricao, preco, creditos, ordem)
  where not exists (select 1 from public.produtos p where p.nome = v.nome);

  -- ==========================================================
  -- 3. Mensalidade por Turma Fixa (2.3)
  --
  -- `gera_credito = false` e `creditos_por_ciclo = 0` são o formato,
  -- não uma omissão: 2.3.7/3.11 dizem que este plano não gera saldo
  -- nenhum. `turmas_fixas` é quantos assentos da grade a matrícula
  -- reserva — a turma em si é escolhida na matrícula do aluno, não
  -- aqui, senão seria um produto por horário da grade.
  -- ==========================================================
  insert into public.produtos (
    nome, descricao, tipo_produto, preco_centavos, periodicidade_dias,
    ciclos_compromisso, renova_automaticamente, gera_credito, creditos_por_ciclo,
    acumula_creditos, teto_acumulo_ciclos, dias_antecedencia_agendamento,
    max_agendamentos_simultaneos, horas_cancelamento, desconto_eventos_pct,
    convidados_por_ciclo, turmas_fixas, ordem, ativo, visivel_no_catalogo)
  select v.nome, v.descricao, 'plano', v.preco, 30,
         v.ciclos, true, false, 0,
         false, 1, null,
         null, null, v.desconto,
         v.convidados, v.turmas, v.ordem, true, true
  from (values
    ('Mensal · 1 turma fixa',
     'Vaga reservada em 1 turma da grade, 1 aula por semana, sempre no mesmo dia e horário.',
     13000, 1, 1, 5, 0, 30),
    ('Mensal · 2 turmas fixas',
     'Vaga reservada em 2 turmas da grade — podem ser da mesma modalidade ou de modalidades diferentes.',
     24000, 1, 2, 5, 0, 31),
    ('Semestral · 1 turma fixa',
     'Vaga reservada em 1 turma da grade. Valor congelado por 6 ciclos.',
     12000, 6, 1, 10, 1, 40),
    ('Semestral · 2 turmas fixas',
     'Vaga reservada em 2 turmas da grade. Valor congelado por 6 ciclos.',
     23000, 6, 2, 10, 1, 41)
  ) as v(nome, descricao, preco, ciclos, turmas, desconto, convidados, ordem)
  where not exists (select 1 from public.produtos p where p.nome = v.nome);

  -- ==========================================================
  -- 4. Sucessão: ao fim dos 6 ciclos o semestral vira mensal (7.7)
  --
  -- "não se renova automaticamente por mais seis: ele passa a Mensal,
  -- no valor Mensal vigente do MESMO FORMATO de plano". Por isso o
  -- semestral de turma fixa sucede para o mensal de turma fixa, e não
  -- para um plano de crédito.
  -- ==========================================================
  for p_id, suc_id in
    select s.id, m.id
    from (values
      ('Semestral · 4 créditos',    'Mensal · 4 créditos'),
      ('Semestral · 8 créditos',    'Mensal · 8 créditos'),
      ('Semestral · 12 créditos',   'Mensal · 12 créditos'),
      ('Semestral · 16 créditos',   'Mensal · 16 créditos'),
      ('Semestral · 1 turma fixa',  'Mensal · 1 turma fixa'),
      ('Semestral · 2 turmas fixas','Mensal · 2 turmas fixas')
    ) as par(semestral, mensal)
    join public.produtos s on s.nome = par.semestral
    join public.produtos m on m.nome = par.mensal
    where s.produto_sucessor_id is null
  loop
    update public.produtos set produto_sucessor_id = suc_id where id = p_id;
  end loop;

  -- ==========================================================
  -- 5. Aulas e pacotes fora do plano (item 8)
  --
  -- Compra única (`renova_automaticamente = false`): o crédito vem na
  -- compra e vale pela validade própria, não pelo ciclo.
  -- ==========================================================
  insert into public.produtos (
    nome, descricao, tipo_produto, preco_centavos, periodicidade_dias,
    ciclos_compromisso, renova_automaticamente, gera_credito, creditos_por_ciclo,
    validade_creditos_dias, acumula_creditos, teto_acumulo_ciclos,
    horas_cancelamento, limite_por_cliente, desconto_eventos_pct,
    convidados_por_ciclo, turmas_fixas, ordem, ativo, visivel_no_catalogo)
  select v.nome, v.descricao, v.tipo::public.tipo_produto, v.preco, 30,
         1, false, v.creditos > 0, v.creditos,
         v.validade, false, 1,
         4, v.limite, 0,
         0, 0, v.ordem, true, true
  from (values
    ('Aula experimental', 'Uma por pessoa, para quem nunca treinou aqui. Vale em qualquer modalidade da grade regular.',
     'pacote', 4000, 1, 30, 1, 50),
    ('2 aulas experimentais', 'Mesmas condições da experimental, para usar em até 15 dias da compra.',
     'pacote', 7000, 2, 15, 1, 51),
    ('Aula avulsa', 'Validade de 30 dias a partir da compra.',
     'pacote', 6000, 1, 30, null, 52),
    ('Crédito extra', 'Só para quem tem Plano por Créditos ativo. Vale até o fim do ciclo.',
     'pacote', 5000, 1, 30, null, 53),
    ('Studio+ · 4 aulas', 'Pacote adicional para quem tem Wellhub ativo na unidade. Não substitui o Wellhub.',
     'pacote', 13500, 4, 30, null, 54),
    ('Aula particular', 'Horário combinado, sujeito a sala e professora disponíveis. Não é coberta por planos.',
     'servico', 15000, 0, null, null, 60),
    ('Treino livre', 'Uso da sala sem acompanhamento de professora. Limite de 2 pessoas na sala.',
     'servico', 5000, 0, null, null, 61)
  ) as v(nome, descricao, tipo, preco, creditos, validade, limite, ordem)
  where not exists (select 1 from public.produtos p where p.nome = v.nome);

  -- ==========================================================
  -- 6. Requisitos de elegibilidade — declarativos, já existentes
  --
  -- Regulamento 8: experimental é "para quem nunca treinou no Studio",
  -- crédito extra é "só para quem tem plano ativo" e o Studio+ (10.2)
  -- exige Wellhub ativo com no mínimo 4 check-ins nos últimos 30 dias.
  -- ==========================================================
  insert into public.produto_requisitos (produto_id, tipo, parametro_int, janela_dias)
  select p.id, v.tipo::public.tipo_requisito_produto, v.param, v.janela
  from (values
    ('Aula experimental',     'nunca_treinou',    null, null),
    ('2 aulas experimentais', 'nunca_treinou',    null, null),
    ('Crédito extra',         'plano_ativo',      null, null),
    ('Studio+ · 4 aulas',     'checkins_wellhub',    4,   30)
  ) as v(produto, tipo, param, janela)
  join public.produtos p on p.nome = v.produto
  on conflict (produto_id, tipo) do nothing;

end $seed$;


-- ------------------------------------------------------------
-- Conferência: o que ficou no catálogo
-- ------------------------------------------------------------
do $conf$
declare
  n_credito integer;
  n_fixa integer;
  n_outros integer;
begin
  select count(*) into n_credito from public.produtos
   where ativo and renova_automaticamente and gera_credito and turmas_fixas = 0;
  select count(*) into n_fixa from public.produtos where ativo and turmas_fixas > 0;
  select count(*) into n_outros from public.produtos
   where ativo and not renova_automaticamente;

  raise notice 'Catálogo: % plano(s) por crédito, % de turma fixa, % fora do plano',
    n_credito, n_fixa, n_outros;
end $conf$;
