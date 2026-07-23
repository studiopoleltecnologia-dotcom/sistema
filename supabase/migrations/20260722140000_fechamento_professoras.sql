-- === Fechamento mensal (folha) das professoras (PR2) ===
-- fechamentos_professora congela o mês na aprovação; fechamento_ajustes é o
-- livro de ajustes manuais (bônus/desconto/substituição/etc). Tudo gestão-only.

create type public.status_fechamento as enum ('aberto', 'aprovado');
create type public.tipo_ajuste_folha as enum
  ('bonus', 'desconto', 'falta', 'substituicao', 'reposicao', 'passagem', 'workshop', 'outro');

create table public.fechamentos_professora (
  id uuid primary key default gen_random_uuid(),
  professora_id uuid not null references public.professoras(id),
  competencia text not null,                -- 'YYYY-MM'
  status public.status_fechamento not null default 'aberto',
  -- snapshots congelados na aprovação (nulos = calcula ao vivo pela view)
  aulas integer,
  horas numeric,
  alunas integer,
  bruto_centavos integer,
  observacao text,
  aprovado_em timestamptz,
  aprovado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  unique (professora_id, competencia)
);
alter table public.fechamentos_professora enable row level security;
create policy "gestao gerencia fechamentos" on public.fechamentos_professora
  for all using (is_gestao()) with check (is_gestao());

create table public.fechamento_ajustes (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos_professora(id) on delete cascade,
  tipo public.tipo_ajuste_folha not null default 'outro',
  descricao text,
  valor_centavos integer not null,          -- assinado: adicional > 0, desconto < 0
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) default auth.uid()
);
alter table public.fechamento_ajustes enable row level security;
create policy "gestao gerencia ajustes" on public.fechamento_ajustes
  for all using (is_gestao()) with check (is_gestao());

create index on public.fechamento_ajustes (fechamento_id);
