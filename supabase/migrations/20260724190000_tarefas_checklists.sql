-- Módulo Tarefas & checklists.
--
-- Dois conceitos:
--  1. Checklists de rotina (abertura/fechamento) que "renascem" todo dia: os
--     ITENS são um template fixo; a execução do dia é uma linha em
--     checklist_execucoes (item + data). Marcado hoje = existe linha para hoje.
--  2. Tarefas avulsas da equipe, com responsável e prazo.
--
-- Acesso: equipe interna (is_socia()), como os demais módulos operacionais.
-- Toda tabela nasce com RLS (CLAUDE.md §3).

create type public.rotina_checklist as enum ('abertura', 'fechamento');

-- Template dos itens de cada rotina.
create table public.checklist_itens (
  id uuid primary key default gen_random_uuid(),
  rotina public.rotina_checklist not null,
  titulo text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  criada_em timestamptz not null default now()
);

-- Execução de um item numa data (a "marcação" do dia). Única por item+data.
create table public.checklist_execucoes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.checklist_itens(id) on delete cascade,
  data date not null default current_date,
  feito_por uuid references auth.users(id) default auth.uid(),
  feito_em timestamptz not null default now(),
  unique (item_id, data)
);

-- Tarefas avulsas.
create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  responsavel_id uuid references public.socias(id),
  prazo date,
  concluida boolean not null default false,
  concluida_em timestamptz,
  criada_por uuid references auth.users(id) default auth.uid(),
  criada_em timestamptz not null default now()
);

create index tarefas_abertas_idx on public.tarefas (concluida, prazo);
create index checklist_execucoes_data_idx on public.checklist_execucoes (data);

alter table public.checklist_itens enable row level security;
alter table public.checklist_execucoes enable row level security;
alter table public.tarefas enable row level security;

create policy "equipe gerencia itens de checklist" on public.checklist_itens
  for all using (public.is_socia()) with check (public.is_socia());
create policy "equipe gerencia execucoes de checklist" on public.checklist_execucoes
  for all using (public.is_socia()) with check (public.is_socia());
create policy "equipe gerencia tarefas" on public.tarefas
  for all using (public.is_socia()) with check (public.is_socia());

-- Itens padrão das rotinas (editáveis pela equipe depois).
insert into public.checklist_itens (rotina, titulo, ordem) values
  ('abertura', 'Abrir o estúdio e acender as luzes', 1),
  ('abertura', 'Ligar ar-condicionado e som', 2),
  ('abertura', 'Conferir limpeza da sala e das barras', 3),
  ('abertura', 'Checar materiais (colchonetes, grips, crash mat)', 4),
  ('abertura', 'Conferir a agenda e as turmas do dia', 5),
  ('fechamento', 'Guardar materiais e organizar a sala', 1),
  ('fechamento', 'Limpar barras e espelhos', 2),
  ('fechamento', 'Conferir se as presenças do dia foram lançadas', 3),
  ('fechamento', 'Desligar ar-condicionado, som e luzes', 4),
  ('fechamento', 'Trancar o estúdio', 5);
