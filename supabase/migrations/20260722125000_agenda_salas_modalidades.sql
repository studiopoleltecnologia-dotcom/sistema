-- Agenda · salas e modalidades como cadastro (não enum)
--
-- Sala e modalidade precisam ser adicionáveis pela operação a qualquer
-- momento (princípio: "manipulável pelas administradoras, não fixo em
-- código"). Por isso são TABELAS com RLS, não enums. A trava é is_operacional()
-- — gestão e secretaria cuidam da grade; social não.
--
-- turmas.modalidade (text) é mantida denormalizada ao lado de modalidade_id
-- para não quebrar as views públicas/portal que já leem o texto. O FK é a
-- fonte de verdade para o cadastro; o texto acompanha por conveniência.

create table if not exists salas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativa boolean not null default true,
  ordem integer not null default 0,
  criada_em timestamptz not null default now()
);

create table if not exists modalidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativa boolean not null default true,
  ordem integer not null default 0,
  criada_em timestamptz not null default now()
);

alter table salas enable row level security;
alter table modalidades enable row level security;

create policy "operacao gerencia salas" on salas
  for all using (is_operacional()) with check (is_operacional());
create policy "operacao gerencia modalidades" on modalidades
  for all using (is_operacional()) with check (is_operacional());

-- Vínculo das turmas com o cadastro (nullable: turmas antigas podem não ter).
alter table turmas add column if not exists sala_id uuid references salas(id);
alter table turmas add column if not exists modalidade_id uuid references modalidades(id);

-- Seed: salas do estúdio.
insert into salas (nome, ordem) values
  ('Sala 1', 1),
  ('Sala 2', 2)
on conflict do nothing;

-- Seed: modalidades oferecidas (ordem = ordem de exibição no dropdown).
insert into modalidades (nome, ordem) values
  ('Pole Dance 1', 1),
  ('Pole Dance 1 e 2', 2),
  ('Pole Dance 2', 3),
  ('Pole Mix', 4),
  ('Pole on Heels', 5),
  ('Pole Coreográfico', 6),
  ('Pole Power', 7),
  ('Yoga', 8),
  ('Calistenia', 9),
  ('Flexibilidade', 10),
  ('Jazz Adulto', 11),
  ('Jazz Juvenil', 12),
  ('Ballet Baby', 13),
  ('Defesa Pessoal', 14),
  ('Muay Thai', 15)
on conflict (nome) do nothing;

-- Backfill: turmas existentes vão para a Sala 1 e casam a modalidade por nome.
update turmas t
   set sala_id = (select id from salas where nome = 'Sala 1' limit 1)
 where t.sala_id is null;

update turmas t
   set modalidade_id = m.id
  from modalidades m
 where t.modalidade_id is null
   and lower(t.modalidade) = lower(m.nome);
