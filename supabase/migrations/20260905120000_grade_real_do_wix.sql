-- Grade de horários: substitui o esboço por dados reais do Wix Bookings.
--
-- Até aqui `turmas` era um rascunho — 17 linhas, todas com capacidade 8,
-- todas na Sala 1, quase nenhuma ligada a uma modalidade. A grade que o
-- estúdio realmente opera vive no Wix (CLAUDE.md 12.5), e a divergência
-- não era cosmética: capacidade 8 uniforme faz uma turma real de 5 alunas
-- aparecer como "37% ocupada" quando está LOTADA, o que contamina Análises,
-- ocupação e a decisão de abrir ou fechar horário.
--
-- Fonte: Wix Bookings, List Event Time Slots, semana de **14–20/09/2026**
-- (America/Sao_Paulo), puxada via MCP em 05/09/2026.
--
-- ⚠️ Por que essa semana e não a de 07/09: 7 de setembro é feriado e a
-- consulta daquela semana devolveu ZERO aulas na segunda-feira. Semear por
-- ela teria apagado as 9 aulas recorrentes de segunda. Semana de referência
-- tem que ser semana cheia — conferido contra 07–13/09 para quarta a sábado,
-- que batem aula por aula.
--
-- Decisões registradas:
--  * **Arquiva, não apaga.** `agendamentos`, `presencas` e
--    `fechamentos_professora` referenciam `turmas`; deletar levaria junto o
--    histórico e a folha já fechada. `ativa = false` é o que "excluir turma"
--    sempre significou neste sistema.
--  * **Tudo na Sala 1.** O Wix tem uma única location e nenhum conceito de
--    sala, e nesta grade não há duas aulas no mesmo horário — então não há o
--    que dividir. Quando a segunda sala entrar de fato na operação, é
--    remanejamento pela tela de turma, não migration.
--  * **Treino Livre tem capacidade 1** de propósito: no Wix é atendimento
--    individual, não turma. Não é erro de digitação.
--  * A aula de sábado 13:00 (Treino Livre, 12/09) ficou de fora: aparece só
--    naquela semana, é agendamento avulso, não horário fixo.
--
-- ⚠️ **Deixa 4 professoras sem contato de emergência** (Paola Fanelli, Sara
-- Maluf, Tatiane Lima, Bruna Gomes) — decisão do estúdio para não travar a
-- grade. Elas aparecem em Professoras com o alerta âmbar até alguém
-- preencher. Ver seção 1.

-- ---------------------------------------------------------------
-- 1. Professoras que a grade cita e ainda não existiam
-- ---------------------------------------------------------------
-- `professoras_valida_contato_emergencia` recusa INSERT sem nome e telefone
-- de contato de emergência, e a primeira versão desta migration morreu nele.
-- O estúdio decidiu (Caroline, 05/09/2026) seguir sem esse contato por ora e
-- preencher depois. Como isso foi feito importa:
--
--  * O trigger é **desligado só para este INSERT** e religado na sequência.
--    A regra continua valendo para todo cadastro feito pela tela — que é
--    onde professora nasce no dia a dia. Relaxar o trigger de vez trocaria
--    uma exceção pontual e datada por uma regra permanentemente mais fraca.
--  * Os campos ficam **NULL, não preenchidos com "a definir"**. NULL é a
--    verdade: falta. Texto de fachada faria a tela de Professoras exibir a
--    pastilha cinza de "tem contato", escondendo o buraco exatamente de quem
--    precisa enxergá-lo.
--  * A tela de Professoras já marca quem está sem contato com `ShieldAlert`
--    em âmbar, clicável para preencher. Ou seja: as quatro entram com a
--    pendência **visível**, a um clique de resolver — não somem no sistema.
--  * Nenhum dado pessoal vai para o repositório: só nomes, que já são
--    públicos na página de reservas do estúdio. Telefone e contato de
--    emergência continuam fora daqui — o repositório é público (CLAUDE.md §3)
--    e isso não muda.
--
-- `valor_por_aluna_centavos` entra ZERO, igual a todas as professoras já
-- cadastradas hoje. Não invento remuneração: o valor é gestão-only e sai
-- errado em silêncio na folha se alguém chutar. Definir em Professoras.
alter table professoras disable trigger professoras_valida_contato_emergencia;

insert into professoras (nome, valor_por_aluna_centavos)
select v.nome, 0
from (values ('Paola Fanelli'), ('Sara Maluf'), ('Tatiane Lima'), ('Bruna Gomes')) as v(nome)
where not exists (select 1 from professoras p where p.nome = v.nome);

alter table professoras enable trigger professoras_valida_contato_emergencia;

-- Rede de segurança: nome divergente (acento, espaço a mais) resolveria para
-- nada e a turma sumiria da grade sem avisar. Falhar aqui, antes de arquivar
-- a grade antiga, deixa o banco exatamente como estava.
do $$
declare faltando text;
begin
  select string_agg(v.nome, ', ' order by v.nome) into faltando
  from (values
    ('Nathalia Nubia'), ('May Nunes'), ('Juliana Rocha'), ('Victoria Paz'),
    ('Studio Pole L'), ('Paola Fanelli'), ('Sara Maluf'), ('Tatiane Lima'),
    ('Bruna Gomes')
  ) as v(nome)
  where not exists (select 1 from professoras p where p.nome = v.nome);

  if faltando is not null then
    raise exception 'Grade real do Wix: professoras não encontradas: %', faltando;
  end if;
end $$;

-- ---------------------------------------------------------------
-- 2. Modalidades da grade
-- ---------------------------------------------------------------
-- Nomes canônicos do ERP, não os rótulos do Wix. O Wix chama duas delas de
-- "Aula de Pole on Heels" e "Aula de Pole Power" — prefixo que ele nem aplica
-- de forma consistente (tem "Aula de Pole Spin" mas "Pole Mix" e "Pole
-- Dance"). O ERP já tem "Pole on Heels" e "Pole Power" cadastradas e
-- categorizadas; criar as variantes com prefixo geraria duas duplicatas na
-- estreia, e duplicata de modalidade racha a ocupação da MESMA aula em
-- linhas diferentes nas Análises. A grade abaixo usa estes nomes.
insert into modalidades (nome, ordem)
select v.nome, 10
from (values
  ('Pole Dance'), ('Pole Coreográfico'), ('Aula de Pole Spin'),
  ('Pole Power'), ('Pole on Heels'), ('Pole Mix'),
  ('Bases de Salto'), ('Flexibilidade'), ('Calistenia'),
  ('Treino Livre'), ('Yoga'), ('Jazz Adulto'), ('Dança do Ventre')
) as v(nome)
where not exists (select 1 from modalidades m where m.nome = v.nome);

-- Categoria = a cor do cartão na grade. O agrupamento abaixo é o ponto de
-- partida; a equipe reclassifica pela tela de Modalidades sem deploy, que é
-- justamente por que a cor mora no banco e não no código.
update modalidades set categoria_id = (select id from categorias_modalidade where nome = 'Pole' limit 1)
where nome in ('Pole Dance', 'Pole Coreográfico', 'Aula de Pole Spin',
               'Pole Power', 'Pole on Heels', 'Pole Mix');

-- Bases de Salto entra em Dança (é aula de salto, não de barra). Se o
-- estúdio a considerar Pole, é um clique na tela de Modalidades.
update modalidades set categoria_id = (select id from categorias_modalidade where nome = 'Dança' limit 1)
where nome in ('Jazz Adulto', 'Dança do Ventre', 'Bases de Salto');

update modalidades set categoria_id = (select id from categorias_modalidade where nome = 'Condicionamento' limit 1)
where nome in ('Flexibilidade', 'Calistenia', 'Yoga', 'Treino Livre');

-- ---------------------------------------------------------------
-- 3. Fora a grade antiga
-- ---------------------------------------------------------------
update turmas set ativa = false, atualizada_em = now() where ativa;

-- ---------------------------------------------------------------
-- 4. A grade real
-- ---------------------------------------------------------------
-- dia_semana: 0 = domingo … 6 = sábado. Domingo não tem aula.
with grade(dia, hora, modalidade, professora, capacidade) as (values
  -- Segunda
  (1, '08:00', 'Pole Dance',            'Nathalia Nubia', 6),
  (1, '09:00', 'Calistenia',            'Nathalia Nubia', 7),
  (1, '11:00', 'Pole Coreográfico',     'May Nunes',      6),
  (1, '12:00', 'Pole Mix',              'May Nunes',      6),
  (1, '14:00', 'Treino Livre',          'Studio Pole L',  1),
  (1, '15:00', 'Treino Livre',          'Studio Pole L',  1),
  (1, '16:00', 'Treino Livre',          'Studio Pole L',  1),
  (1, '19:00', 'Aula de Pole Spin',     'Juliana Rocha',  6),
  (1, '20:00', 'Pole Dance',            'Juliana Rocha',  6),
  -- Terça
  (2, '18:00', 'Pole Dance',            'Victoria Paz',   5),
  (2, '19:00', 'Pole Dance',            'Victoria Paz',   5),
  (2, '20:00', 'Aula de Pole Spin',     'Victoria Paz',   6),
  -- Quarta
  (3, '09:00', 'Calistenia',            'Nathalia Nubia', 7),
  (3, '10:00', 'Pole Dance',            'Nathalia Nubia', 5),
  (3, '11:00', 'Flexibilidade',         'Nathalia Nubia', 7),
  (3, '13:00', 'Treino Livre',          'Studio Pole L',  1),
  (3, '14:00', 'Treino Livre',          'Studio Pole L',  1),
  (3, '15:00', 'Treino Livre',          'Studio Pole L',  1),
  (3, '16:00', 'Pole Dance',            'Paola Fanelli',  5),
  (3, '17:00', 'Pole Coreográfico',     'Paola Fanelli',  6),
  (3, '18:00', 'Flexibilidade',         'Victoria Paz',   7),
  (3, '19:00', 'Pole on Heels', 'Victoria Paz',   6),
  (3, '20:00', 'Yoga',                  'Studio Pole L',  7),
  -- Quinta (os horários quebrados são reais: 18:30 / 19:30 / 20:30)
  (4, '09:00', 'Pole Dance',            'Sara Maluf',     6),
  (4, '10:00', 'Pole Coreográfico',     'Sara Maluf',     6),
  (4, '11:00', 'Pole Power',    'Sara Maluf',     5),
  (4, '17:00', 'Jazz Adulto',           'Tatiane Lima',   5),
  (4, '18:30', 'Dança do Ventre',       'Bruna Gomes',   10),
  (4, '19:30', 'Pole Coreográfico',     'Juliana Rocha',  6),
  (4, '20:30', 'Pole Dance',            'Juliana Rocha',  6),
  -- Sexta
  (5, '11:00', 'Pole Dance',            'Paola Fanelli',  6),
  (5, '12:00', 'Pole Coreográfico',     'Paola Fanelli',  5),
  (5, '13:00', 'Treino Livre',          'Studio Pole L',  1),
  (5, '14:00', 'Treino Livre',          'Studio Pole L',  1),
  (5, '15:00', 'Treino Livre',          'Studio Pole L',  1),
  (5, '16:00', 'Pole Mix',              'May Nunes',      6),
  (5, '17:00', 'Pole Dance',            'May Nunes',      6),
  (5, '18:00', 'Bases de Salto',        'Victoria Paz',   6),
  (5, '19:00', 'Pole Dance',            'Victoria Paz',   6),
  -- Sábado
  (6, '08:00', 'Pole Dance',            'Nathalia Nubia', 6),
  (6, '09:00', 'Flexibilidade',         'Nathalia Nubia', 7),
  (6, '10:00', 'Calistenia',            'Nathalia Nubia', 7),
  (6, '11:00', 'Pole Coreográfico',     'Juliana Rocha',  6),
  (6, '12:00', 'Pole Dance',            'Juliana Rocha',  6)
)
insert into turmas (
  modalidade, modalidade_id, professora_id, sala_id,
  dia_semana, horario, duracao_minutos, capacidade, ativa
)
select
  g.modalidade,
  -- Subquery escalar, não join: nome duplicado em `modalidades` ou
  -- `professoras` multiplicaria a turma silenciosamente.
  (select m.id from modalidades m where m.nome = g.modalidade order by m.criada_em limit 1),
  (select p.id from professoras p where p.nome = g.professora order by p.criada_em limit 1),
  (select s.id from salas s where s.nome = 'Sala 1' order by s.ordem limit 1),
  g.dia,
  g.hora::time,
  60,
  g.capacidade,
  true
from grade g;

-- ---------------------------------------------------------------
-- 5. Trava de segurança
-- ---------------------------------------------------------------
-- Uma professora ou modalidade que não resolvesse deixaria `professora_id`
-- nulo e a linha estouraria no NOT NULL; mas uma sala ausente passaria
-- batido, e uma contagem errada indicaria que o VALUES acima foi editado
-- pela metade. Falhar aqui aborta a migration inteira, que é o que se quer.
do $$
declare n int;
begin
  select count(*) into n from turmas where ativa;
  if n <> 44 then
    raise exception 'Grade real do Wix: esperava 44 turmas ativas, encontrei %', n;
  end if;

  if exists (select 1 from turmas where ativa and (sala_id is null or modalidade_id is null)) then
    raise exception 'Grade real do Wix: turma ativa sem sala ou sem modalidade';
  end if;
end $$;
