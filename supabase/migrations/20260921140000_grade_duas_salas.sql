-- ============================================================
-- A grade real, com as duas salas — levantada do Wix em 21/09/2026.
--
-- De onde vem: `calendar/v3/events/query` do Wix, semana de referência
-- 22–28/09/2026 (sem feriado), 45 aulas. Substitui o retrato de
-- 20260905120000, que tinha 35 aulas e punha todas na Sala 1 — e por
-- isso não representava um estúdio de duas salas.
--
-- ⚠️ A SALA NÃO VEM DO WIX. Lá existe um endereço só e nenhum campo de
-- sala: duas aulas no mesmo horário são a única pista de que há duas
-- salas. A atribuição abaixo é a regra que a gestão definiu em 21/09,
-- por MODALIDADE:
--
--   Sala 1 (Pole) .... todas as variações de pole, Calistenia,
--                      Bases de Inversão, Bases de Salto, Jazz Juvenil,
--                      Ballet Baby
--   Sala 2 (Multi) ... Jazz Funk, Stiletto, Flexibilidade, Floorwork,
--                      Dança do Ventre, Jazz Adulto, Yoga
--
-- A regra foi verificada contra a grade inteira: nenhum par de aulas
-- simultâneas caiu na mesma sala. Se um dia cair, a grade está errada
-- ou a regra mudou — é esse o teste. Ficou 35 aulas na Sala 1 e
-- 10 na Sala 2.
--
-- Idempotente por (dia, horário, sala): rodar de novo não duplica, e
-- turma que a equipe tiver criado à mão naquele encaixe é respeitada.
-- Ver docs/05-BACKLOG.md §3 (X3).
-- ============================================================

-- 1. As salas ganham nome de gente. "Sala 1" e "Sala 2" não dizem nada
--    para quem monta a grade; Pole e Multi dizem.
update public.salas set nome = 'Sala 1 · Pole'  where nome = 'Sala 1';
update public.salas set nome = 'Sala 2 · Multi' where nome = 'Sala 2';

-- 2. Modalidades que existem na grade e não existiam no cadastro.
--    Os níveis de pole (Pole 1, Pole 2, Pole 1 e 2) entram como
--    modalidades próprias, e não colapsados em "Pole Dance": é o nível
--    que decide quem pode entrar na aula, então perder isso seria
--    perder a regra.
insert into public.modalidades (nome, categoria_id)
select v.nome, c.id
from (values
    ('Bases de Inversão', 'Pole'),
    ('Floorwork', 'Dança'),
    ('Jazz Funk', 'Dança'),
    ('Pole 1', 'Pole'),
    ('Pole 1 e 2', 'Pole'),
    ('Pole 2', 'Pole'),
    ('Pole Silk', 'Pole'),
    ('Pole Spin 1', 'Pole'),
    ('Pole Spin 1 e 2', 'Pole'),
    ('Stiletto', 'Dança')
) as v(nome, grupo)
left join public.categorias_modalidade c on c.nome = v.grupo
where not exists (select 1 from public.modalidades m where m.nome = v.nome);

-- 3. Professora NÃO se cadastra por migration. Duas dão aula na grade e
--    não estão no sistema: **Joanne Vênus** e **Leticia Lemos**.
--
--    Tentei criá-las aqui e o banco recusou, com razão:
--    `validar_contato_emergencia_professora` exige nome e telefone de
--    contato de emergência (20260819150000). Não é burocracia — é a
--    pessoa para quem se liga quando alguém se machuca na aula, e
--    preencher com marcador para a migration passar seria pior do que
--    não ter: ninguém revisita um campo que já parece preenchido.
--
--    Consequência assumida: o INNER JOIN de baixo **descarta em
--    silêncio** as aulas dessas duas, e a migration avisa no fim
--    quantas ficaram de fora. Depois que a equipe cadastrá-las pela
--    tela, basta reaplicar o bloco 4 — ele é idempotente por
--    (dia, horário, sala), então só entra o que falta.

-- 4. A grade.
insert into public.turmas (
  dia_semana, horario, duracao_minutos, capacidade,
  modalidade, modalidade_id, professora_id, sala_id, ativa)
select v.dia, v.hora::time, v.dur, v.cap,
       v.modalidade, m.id, p.id, s.id, true
from (values
  /* seg 08:00 */ (1, '08:00', 60, 7, 'Pole 1', 'Nathalia Nubia', 1),
  /* seg 09:00 */ (1, '09:00', 60, 10, 'Calistenia', 'Nathalia Nubia', 1),
  /* seg 11:00 */ (1, '11:00', 60, 7, 'Pole Mix', 'May Nunes', 1),
  /* seg 12:00 */ (1, '12:00', 60, 6, 'Pole Silk', 'May Nunes', 1),
  /* seg 18:00 */ (1, '18:00', 60, 7, 'Bases de Inversão', 'Juliana Rocha', 1),
  /* seg 19:00 */ (1, '19:00', 60, 7, 'Pole Spin 1', 'Juliana Rocha', 1),
  /* seg 19:00 */ (1, '19:00', 60, 8, 'Stiletto', 'Joanne Vênus', 2),
  /* seg 20:00 */ (1, '20:00', 60, 7, 'Pole 1', 'Juliana Rocha', 1),
  /* seg 20:00 */ (1, '20:00', 60, 8, 'Floorwork', 'Joanne Vênus', 2),
  /* ter 18:00 */ (2, '18:00', 60, 7, 'Pole 1 e 2', 'Victoria Paz', 1),
  /* ter 19:00 */ (2, '19:00', 60, 7, 'Pole 1', 'Victoria Paz', 1),
  /* ter 20:00 */ (2, '20:00', 60, 7, 'Pole Spin 1 e 2', 'Victoria Paz', 1),
  /* qua 09:00 */ (3, '09:00', 60, 10, 'Calistenia', 'Nathalia Nubia', 1),
  /* qua 10:00 */ (3, '10:00', 60, 7, 'Pole 1', 'Nathalia Nubia', 1),
  /* qua 16:00 */ (3, '16:00', 60, 7, 'Pole 1', 'Paola Fanelli', 1),
  /* qua 17:00 */ (3, '17:00', 60, 7, 'Pole Coreográfico', 'Paola Fanelli', 1),
  /* qua 18:00 */ (3, '18:00', 60, 7, 'Bases de Inversão', 'Studio Pole L', 1),
  /* qua 18:00 */ (3, '18:00', 60, 8, 'Flexibilidade', 'Victoria Paz', 2),
  /* qua 19:00 */ (3, '19:00', 60, 6, 'Pole on Heels', 'Victoria Paz', 1),
  /* qua 19:00 */ (3, '19:00', 60, 8, 'Stiletto', 'Joanne Vênus', 2),
  /* qua 20:00 */ (3, '20:00', 60, 7, 'Pole 1 e 2', 'Victoria Paz', 1),
  /* qua 20:00 */ (3, '20:00', 60, 8, 'Yoga', 'Studio Pole L', 2),
  /* qui 09:00 */ (4, '09:00', 60, 7, 'Pole 1', 'Sara Maluf', 1),
  /* qui 10:00 */ (4, '10:00', 60, 7, 'Pole Coreográfico', 'Sara Maluf', 1),
  /* qui 11:00 */ (4, '11:00', 60, 7, 'Pole 1 e 2', 'Sara Maluf', 1),
  /* qui 17:00 */ (4, '17:00', 60, 5, 'Jazz Adulto', 'Tatiane Lima', 2),
  /* qui 18:30 */ (4, '18:30', 60, 7, 'Pole Coreográfico', 'Juliana Rocha', 1),
  /* qui 18:30 */ (4, '18:30', 60, 10, 'Dança do Ventre', 'Bruna Gomes', 2),
  /* qui 19:30 */ (4, '19:30', 60, 10, 'Calistenia', 'Nathalia Nubia', 1),
  /* qui 19:30 */ (4, '19:30', 60, 8, 'Jazz Funk', 'Joanne Vênus', 2),
  /* qui 20:30 */ (4, '20:30', 60, 7, 'Pole 1', 'Juliana Rocha', 1),
  /* sex 11:00 */ (5, '11:00', 60, 7, 'Pole Coreográfico', 'Paola Fanelli', 1),
  /* sex 12:00 */ (5, '12:00', 60, 7, 'Pole 1', 'Paola Fanelli', 1),
  /* sex 13:00 */ (5, '13:00', 60, 7, 'Bases de Inversão', 'Paola Fanelli', 1),
  /* sex 16:00 */ (5, '16:00', 60, 6, 'Pole Silk', 'May Nunes', 1),
  /* sex 17:00 */ (5, '17:00', 60, 7, 'Pole 2', 'May Nunes', 1),
  /* sex 18:00 */ (5, '18:00', 60, 7, 'Bases de Salto', 'Victoria Paz', 1),
  /* sex 18:00 */ (5, '18:00', 60, 8, 'Flexibilidade', 'May Nunes', 2),
  /* sex 19:00 */ (5, '19:00', 60, 7, 'Pole 1 e 2', 'Victoria Paz', 1),
  /* sáb 08:00 */ (6, '08:00', 60, 7, 'Pole 1', 'Nathalia Nubia', 1),
  /* sáb 09:00 */ (6, '09:00', 60, 10, 'Calistenia', 'Nathalia Nubia', 1),
  /* sáb 10:00 */ (6, '10:00', 60, 7, 'Pole Coreográfico', 'Juliana Rocha', 1),
  /* sáb 10:00 */ (6, '10:00', 60, 8, 'Flexibilidade', 'Nathalia Nubia', 2),
  /* sáb 11:00 */ (6, '11:00', 60, 7, 'Pole 1', 'Juliana Rocha', 1),
  /* sáb 12:00 */ (6, '12:00', 60, 7, 'Pole 1 e 2', 'Leticia Lemos', 1)
) as v(dia, hora, dur, cap, modalidade, professora, sala)
join public.modalidades m on m.nome = v.modalidade
join public.professoras p on p.nome = v.professora
join public.salas s on s.nome = case v.sala when 1 then 'Sala 1 · Pole' else 'Sala 2 · Multi' end
where not exists (
  select 1 from public.turmas t
  where t.dia_semana = v.dia and t.horario = v.hora::time and t.sala_id = s.id
);

do $$
declare n int; faltam text;
begin
  select count(*) into n from public.turmas where ativa;
  raise notice 'Grade ativa: % turmas', n;

  select string_agg(v.professora, ', ') into faltam
  from (values ('Joanne Vênus'), ('Leticia Lemos')) as v(professora)
  where not exists (select 1 from public.professoras p where p.nome = v.professora);

  if faltam is not null then
    raise warning 'GRADE INCOMPLETA — professora(s) sem cadastro: %. As aulas delas não entraram. Cadastre pela tela (com contato de emergência) e reaplique o bloco 4 desta migration.', faltam;
  end if;
end $$;
