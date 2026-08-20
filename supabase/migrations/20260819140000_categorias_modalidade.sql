-- ============================================================
-- Categorias de modalidade — a cor da grade vira cadastro
--
-- A grade que o estúdio publica agrupa as aulas em QUATRO categorias e
-- dá uma cor a cada uma: Pole, Dança, Projeto Casinha e Condicionamento.
-- No sistema a cor era sorteada por hash do nome da modalidade
-- (`corModalidade()` em src/modules/agenda/cores.ts): "Pole 1" e "Pole
-- Coreográfico" caíam em cores diferentes, e renomear uma modalidade
-- mudava a cor dela. Não era a identidade da grade — era ruído estável.
--
-- Aqui a hierarquia vira dado: turma → modalidade → categoria → cor.
-- Categoria é AGRUPAMENTO, modalidade é o tipo de aula. "Condicionamento"
-- nunca é uma modalidade.
--
-- As três cores de cada categoria foram MEDIDAS na grade vigente
-- (amostragem dos pixels da legenda e do preenchimento dos cartões em
-- `grade atualizada.jpeg`, 19/08/2026), não escolhidas por semelhança.
-- Três das quatro já são tokens do Guia de Marca que vivem em
-- src/index.css — a grade sempre foi a paleta do sistema:
--
--   Pole             #443A66  = --color-brand-700
--   Projeto Casinha  #32A7A6  = --color-success-500
--   Dança            #BE7926  ≈ --color-warning-600 (#c1721f)
--   Condicionamento  #7D8D30  — família nova (oliva), sem token
--
-- Por que as três cores são guardadas e não derivadas de uma só: o fundo
-- medido não é mistura matemática do acento (#ECE8F6 é mais azulado que
-- qualquer tinta de #443A66 sobre branco). Derivar aproximaria, e é
-- justamente a identidade da grade impressa que não pode mudar.
-- ============================================================

create table if not exists public.categorias_modalidade (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  -- acento: bolinha da legenda, título, badge
  cor text not null check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  -- preenchimento do cartão na grade
  cor_fundo text not null check (cor_fundo ~ '^#[0-9A-Fa-f]{6}$'),
  -- texto secundário sobre o preenchimento (precisa de contraste real:
  -- o acento do Condicionamento sobre o fundo dele dá 2,6:1 e some)
  cor_texto text not null check (cor_texto ~ '^#[0-9A-Fa-f]{6}$'),
  ordem integer not null default 0,
  ativa boolean not null default true,
  criada_em timestamptz not null default now()
);

comment on table public.categorias_modalidade is
  'Agrupamento visual das modalidades na grade. Cor cadastrável pela equipe.';

alter table public.categorias_modalidade enable row level security;

-- Leitura liberada a qualquer conta autenticada de propósito: a cor
-- também colore a grade do portal do aluno e o dia da professora, e cor
-- de categoria não é dado sensível. Escrita fica na operação (gestão +
-- secretaria), a mesma trava de `modalidades` e `salas`.
drop policy if exists "autenticado le categorias" on public.categorias_modalidade;
create policy "autenticado le categorias" on public.categorias_modalidade
  for select to authenticated using (true);

drop policy if exists "operacao cria categorias" on public.categorias_modalidade;
create policy "operacao cria categorias" on public.categorias_modalidade
  for insert to authenticated with check (public.is_operacional());

drop policy if exists "operacao edita categorias" on public.categorias_modalidade;
create policy "operacao edita categorias" on public.categorias_modalidade
  for update to authenticated
  using (public.is_operacional()) with check (public.is_operacional());

drop policy if exists "operacao remove categorias" on public.categorias_modalidade;
create policy "operacao remove categorias" on public.categorias_modalidade
  for delete to authenticated using (public.is_operacional());

-- ------------------------------------------------------------
-- Vínculo modalidade → categoria
-- `on delete set null` e não cascade: apagar uma categoria nunca pode
-- levar junto a modalidade (que carrega turmas e histórico). Sem
-- categoria, a modalidade só volta a ser neutra na grade.
-- ------------------------------------------------------------

alter table public.modalidades
  add column if not exists categoria_id uuid
  references public.categorias_modalidade (id) on delete set null;

comment on column public.modalidades.categoria_id is
  'agrupamento visual; nulo = sem categoria (cartão neutro na grade)';

-- ------------------------------------------------------------
-- Seed: as quatro categorias da grade vigente
-- `do nothing` no conflito: se a equipe já ajustou uma cor, o replay
-- desta migration não desfaz o ajuste.
-- ------------------------------------------------------------

insert into public.categorias_modalidade (nome, cor, cor_fundo, cor_texto, ordem) values
  ('Pole',            '#443A66', '#ECE8F6', '#3D3753', 1),
  ('Dança',           '#BE7926', '#FAF0E1', '#9C5A18', 2),
  ('Projeto Casinha', '#32A7A6', '#E4F4F3', '#1F726F', 3),
  ('Condicionamento', '#7D8D30', '#EDF0DF', '#58622D', 4)
on conflict (nome) do nothing;

-- ------------------------------------------------------------
-- Backfill das modalidades já cadastradas
--
-- Só preenche o que está nulo — reorganização feita à mão pela equipe
-- não é desfeita por um replay. Modalidades fora das quatro categorias
-- (Defesa Pessoal, Muay Thai, Bases de Salto…) ficam sem categoria de
-- propósito: chutar o agrupamento delas seria inventar produto.
-- ------------------------------------------------------------

-- Pole cobre toda a família ("Pole Dance 1", "Pole Mix", "Pole Spin"…).
update public.modalidades m
   set categoria_id = c.id
  from public.categorias_modalidade c
 where c.nome = 'Pole'
   and m.categoria_id is null
   and m.nome ilike 'pole%';

update public.modalidades m
   set categoria_id = c.id
  from public.categorias_modalidade c
 where c.nome = 'Dança'
   and m.categoria_id is null
   and (lower(m.nome) in ('jazz adulto', 'jazz') or lower(m.nome) like 'dança do ventre%');

-- Jazz Juvenil é Casinha, não Dança — por isso as listas são explícitas
-- em vez de um `like 'jazz%'` que atropelaria a turma infantil.
update public.modalidades m
   set categoria_id = c.id
  from public.categorias_modalidade c
 where c.nome = 'Projeto Casinha'
   and m.categoria_id is null
   and lower(m.nome) in ('jazz juvenil', 'ballet baby');

update public.modalidades m
   set categoria_id = c.id
  from public.categorias_modalidade c
 where c.nome = 'Condicionamento'
   and m.categoria_id is null
   and lower(m.nome) in ('calistenia', 'flexibilidade', 'yoga');

-- ------------------------------------------------------------
-- vw_grade_publica passa a carregar a cor
--
-- É a view que o portal do aluno e o portal da professora leem. Continua
-- "definer" e autofiltrada (a exceção deliberada já registrada no
-- backlog S5): expõe grade e nome de professora, nada de identidade de
-- aluno. As colunas novas são só cor e nome de categoria.
--
-- `drop` antes de `create`: `create or replace view` não aceita colunas
-- novas no meio da lista.
-- ------------------------------------------------------------

drop view if exists public.vw_grade_publica;
create view public.vw_grade_publica as
select
  t.id as turma_id,
  t.modalidade,
  t.dia_semana,
  t.horario,
  t.duracao_minutos,
  t.capacidade,
  p.nome as professora_nome,
  c.nome as categoria_nome,
  c.cor as categoria_cor,
  c.cor_fundo as categoria_cor_fundo,
  c.cor_texto as categoria_cor_texto
from public.turmas t
  join public.professoras p on p.id = t.professora_id
  left join public.modalidades m on m.id = t.modalidade_id
  left join public.categorias_modalidade c on c.id = m.categoria_id
where t.ativa;

grant select on public.vw_grade_publica to authenticated;
