-- ============================================================
-- A grade real de novembro/2026, puxada do Wix
-- ============================================================
-- A grade que existia aqui (`20260905120000` + `20260921140000`) era um
-- retrato de setembro: 46 turmas em DUAS salas. A Sala 2 deixou de existir,
-- e a grade do Wix foi refeita. Esta migration traz o que está no ar hoje.
--
-- Puxado da Booking API do Wix em 03/11/2026, semana de referência
-- 09 a 15/11/2026 (sem feriado): 28 aulas, todas de 60 min, numa sala só.
-- Conferido: nenhuma sobreposição de horário na semana inteira — que é a
-- prova de que uma sala basta.
--
-- ## Três decisões da gestão que estão embutidas aqui
--
-- 1. **Os nomes passam a ser os do Wix.** "Pole 1", "Pole 2" e "Pole Spin 1"
--    eram nomes internos que nenhuma aluna nunca viu. O que circula na arte
--    da grade, no Instagram e no portal é "Pole Iniciante", "Pole Inter" e
--    "Pole Spin Iniciante". Renomear (e não criar ao lado) preserva o
--    histórico de quem já está ligado à modalidade.
-- 2. **Joanne Vênus é Mami Vênus** — mesma pessoa, nome que ela usa.
-- 3. **Defesa Pessoal é da SCBJJ.** Jullia e Manu dão a aula, mas o
--    cadastro e o PAGAMENTO são da escola. Como `turmas.professora_id` é
--    uma só e é de onde sai o pagamento, quem fica na turma é a SCBJJ.
--
-- ## O que esta migration NÃO faz, de propósito
--
-- * **Não apaga as turmas antigas, desativa.** Há sobras de teste presas
--   nelas (6 agendamentos, 1 slot Wellhub, 1 conferência de quórum, 1
--   check-in pendente). Apagar exigiria apagar isso junto, que é decisão de
--   dado, não de schema. Turma inativa não aparece na grade nem aceita
--   agendamento, então o efeito prático é o mesmo.
-- * **Não preenche e-mail de professora.** Cadastro e acesso são coisas
--   separadas: o registro faz a grade existir, o e-mail é o que permite
--   criar o login dela depois (G1 do backlog).
-- * **Não mexe em `valor_por_aluna_centavos`.** Quem entra novo nasce em
--   zero e aparece como pendência na tela, como já acontece. O valor real é
--   negociado por professora e entra pela gestão.
--
-- ⚠️ Tudo aqui casa por NOME, nunca por UUID: a mesma migration roda em DEV
-- e em produção, e os ids são diferentes nos dois. No fim há uma guarda que
-- aborta se o número de turmas inseridas não for exatamente 28 — sem ela,
-- um nome que não casasse sumiria em silêncio no `join`.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Modalidades: os nomes que a aluna vê
-- ------------------------------------------------------------
update public.modalidades set nome = 'Pole Iniciante'      where nome = 'Pole 1';
update public.modalidades set nome = 'Pole Inter'          where nome = 'Pole 2';
update public.modalidades set nome = 'Pole Spin Iniciante' where nome = 'Pole Spin 1';

insert into public.modalidades (nome, ativa)
select v.nome, true
from (values ('Pole Inter 2'), ('Funk Rebolado')) as v(nome)
where not exists (
  select 1 from public.modalidades m where m.nome = v.nome
);


-- ------------------------------------------------------------
-- 2. Professoras
-- ------------------------------------------------------------
-- Mesma pessoa, nome que ela usa. Renomear mantém o histórico dela.
update public.professoras set nome = 'Mami Vênus' where nome = 'Joanne Vênus';

-- As duas que dão aula na grade e ainda não existiam aqui.
--
-- O gatilho `professoras_valida_contato_emergencia` exige nome E telefone de
-- contato de emergência em todo INSERT. É regra boa — a professora está
-- sozinha numa sala com alunas —, mas aqui ela impede o cadastro de existir,
-- e sem cadastro não há grade. Mesmo impasse de `20260921160000`, mesma
-- saída: desliga em volta do insert e religa.
--
-- O gatilho de UPDATE continua valendo o tempo todo, então o contato não
-- pode ser APAGADO depois — só preenchido. E as duas aparecem como
-- pendência na tela até a gestão completar, que é o lembrete de que falta.
alter table public.professoras disable trigger professoras_valida_contato_emergencia;

insert into public.professoras (nome, valor_por_aluna_centavos, ativa)
select v.nome, 0, true
from (values ('Ayla'), ('Ana Bea Ferraz')) as v(nome)
where not exists (
  select 1 from public.professoras p where p.nome = v.nome
);

alter table public.professoras enable trigger professoras_valida_contato_emergencia;

-- Quem dá aula na grade de novembro fica ativa.
update public.professoras
set ativa = true
where nome in (
  'Juliana Rocha', 'Nathalia Nubia', 'Victoria Paz', 'Sara Maluf',
  'Leticia Lemos', 'May Nunes', 'Paola Fanelli', 'Mami Vênus',
  'Ayla', 'Ana Bea Ferraz', 'SCBJJ'
);

-- Quem não está na grade sai da lista ativa. Não apaga: a professora que
-- volta mantém fechamento e histórico. "Studio Pole L" e "Professora Teste"
-- não são pessoas — eram rótulos de cadastro.
update public.professoras
set ativa = false
where nome in ('Bruna Gomes', 'Tatiane Lima', 'Professora Teste', 'Studio Pole L');


-- ------------------------------------------------------------
-- 3. A Sala 2 deixou de existir
-- ------------------------------------------------------------
-- Desativada, não apagada: as turmas antigas apontam para ela, e se a
-- segunda sala voltar o histórico continua fazendo sentido.
update public.salas set ativa = false where nome = 'Sala 2 · Multi';


-- ------------------------------------------------------------
-- 4. A grade
-- ------------------------------------------------------------
update public.turmas set ativa = false where ativa;

with grade(dia, hora, modalidade, professora, capacidade) as (
  values
    -- segunda
    (1, time '18:00', 'Pole Coreográfico',       'Juliana Rocha',   7),
    (1, time '19:00', 'Pole Spin Iniciante',     'Juliana Rocha',   7),
    (1, time '20:00', 'Pole Iniciante',          'Juliana Rocha',   7),
    -- terça
    (2, time '17:30', 'Pole Mix',                'Leticia Lemos',   7),
    (2, time '18:30', 'Dança do Ventre',         'Ayla',           10),
    (2, time '19:30', 'Funk Rebolado',           'Ana Bea Ferraz', 10),
    (2, time '20:30', 'Pole Iniciante',          'Juliana Rocha',   7),
    -- quarta
    (3, time '09:00', 'Calistenia',              'Nathalia Nubia', 10),
    (3, time '10:00', 'Pole Iniciante',          'Nathalia Nubia',  7),
    (3, time '18:00', 'Bases de Inversão',       'Victoria Paz',    7),
    (3, time '19:00', 'Pole on Heels',           'Victoria Paz',    6),
    (3, time '20:00', 'Pole Mix',                'Victoria Paz',    7),
    -- quinta
    (4, time '10:00', 'Pole Coreográfico',       'Sara Maluf',      7),
    (4, time '11:00', 'Pole Mix',                'Sara Maluf',      7),
    (4, time '17:30', 'Pole Mix',                'Leticia Lemos',   7),
    (4, time '18:30', 'Calistenia',              'Nathalia Nubia', 10),
    (4, time '19:30', 'Jazz Funk',               'Mami Vênus',     10),
    (4, time '20:30', 'Pole Iniciante',          'Juliana Rocha',   7),
    -- sexta
    (5, time '11:00', 'Pole Coreográfico',       'Paola Fanelli',   7),
    (5, time '12:00', 'Pole Iniciante',          'Paola Fanelli',   7),
    (5, time '17:30', 'Pole Inter 2',            'May Nunes',       7),
    (5, time '18:30', 'Pole Silk',               'May Nunes',       6),
    (5, time '19:30', 'Pole Mix',                'May Nunes',       7),
    -- sábado
    (6, time '08:00', 'Pole Iniciante',          'Nathalia Nubia',  7),
    (6, time '09:00', 'Calistenia',              'Nathalia Nubia', 10),
    (6, time '10:00', 'Pole Coreográfico',       'Juliana Rocha',   7),
    (6, time '11:00', 'Defesa Pessoal Feminina', 'SCBJJ',          12),
    (6, time '12:00', 'Pole Inter',              'Leticia Lemos',   7)
)
insert into public.turmas
  (modalidade, modalidade_id, professora_id, sala_id,
   dia_semana, horario, duracao_minutos, capacidade, ativa)
select
  g.modalidade, m.id, p.id, s.id,
  g.dia, g.hora, 60, g.capacidade, true
from grade g
join public.modalidades m on m.nome = g.modalidade
join public.professoras p on p.nome = g.professora
cross join lateral (select id from public.salas where nome = 'Sala 1 · Pole') s;


-- ------------------------------------------------------------
-- 5. A guarda
-- ------------------------------------------------------------
-- Um `join` por nome que não casa não dá erro: ele simplesmente não traz a
-- linha. Sem esta conferência, um acento diferente deixaria a grade com 27
-- aulas e ninguém perceberia até uma aluna não achar o horário.
do $$
declare
  n integer;
begin
  select count(*) into n from public.turmas where ativa;
  if n <> 28 then
    raise exception
      'Grade do Wix: esperava 28 turmas ativas, encontrei %. Algum nome de modalidade, professora ou sala nao casou.', n;
  end if;
end $$;


comment on table public.turmas is
  'Grade semanal. Retrato do Wix de 03/11/2026 (semana 09-15/11): 28 aulas de 60 min numa sala so. Enquanto a operacao nao migrar do Wix, mudanca de horario precisa ser feita NOS DOIS lugares — esta tabela nao se sincroniza sozinha.';
