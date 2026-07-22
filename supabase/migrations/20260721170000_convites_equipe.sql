-- ============================================================
-- M9 — Convites de equipe: a gestão cria/gerencia acessos internos
--
-- O front só tem a anon key, então NÃO pode criar login (isso exige a
-- service_role, que nunca vai ao repo público). Mesmo padrão das
-- professoras: a gestão pré-cadastra e-mail + função; quando a pessoa
-- faz o signup com esse e-mail, handle_new_user já a vincula com a
-- função certa.
--
-- Se a pessoa JÁ tem login (já se cadastrou antes), o convite promove
-- na hora — não precisa esperar signup.
-- ============================================================

create table public.equipe_convites (
  email text primary key,               -- sempre lower-case
  nome text not null,
  funcao public.funcao_interna not null,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  usado_em timestamptz                  -- nulo = ainda não virou conta
);

alter table public.equipe_convites enable row level security;

create policy "gestao gerencia convites" on public.equipe_convites
  for all to authenticated using (public.is_gestao()) with check (public.is_gestao());

-- ------------------------------------------------------------
-- HANDLE_NEW_USER — passa a consumir convite interno também.
-- Precedência: professora → convite de equipe → nada.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  prof_id uuid;
  conv record;
begin
  if new.email is null then
    return new;
  end if;

  -- 1. e-mail casa com professora cadastrada?
  select p.id into prof_id
  from public.professoras p
  where lower(p.email) = lower(new.email)
    and p.ativa
    and not exists (select 1 from public.contas_professora cp where cp.professora_id = p.id);
  if prof_id is not null then
    insert into public.contas_professora (auth_user_id, professora_id)
    values (new.id, prof_id);
    return new;
  end if;

  -- 2. e-mail tem convite interno pendente?
  select * into conv from public.equipe_convites
  where email = lower(new.email) and usado_em is null;
  if found then
    insert into public.socias (id, nome, funcao)
    values (new.id, conv.nome, conv.funcao)
    on conflict (id) do update set funcao = excluded.funcao;
    update public.equipe_convites set usado_em = now() where email = conv.email;
    return new;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- VW_EQUIPE — lista de contas internas com e-mail (gestão só).
-- Definer para poder ler auth.users; filtrada a is_gestao().
-- ------------------------------------------------------------
create view public.vw_equipe as
select s.id, s.nome, s.funcao, u.email, s.criada_em
from public.socias s
join auth.users u on u.id = s.id
where public.is_gestao();

grant select on public.vw_equipe to authenticated;

-- ------------------------------------------------------------
-- CONVIDAR / PROMOVER — uma ação só. Se o e-mail já tem login,
-- ativa na hora; senão deixa o convite pendente para o signup.
-- Substitui promover_a_equipe (removida — este é o caminho único).
-- ------------------------------------------------------------
drop function if exists public.promover_a_equipe(text, text, public.funcao_interna);

create or replace function public.convidar_equipe(
  p_email text, p_nome text, p_funcao public.funcao_interna
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  u_id uuid;
begin
  if not public.is_gestao() then
    raise exception 'só a gestão define acessos internos';
  end if;
  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'informe o e-mail';
  end if;

  select id into u_id from auth.users where lower(email) = lower(p_email);

  if u_id is not null then
    if exists (select 1 from public.contas_aluna where auth_user_id = u_id) then
      raise exception 'este e-mail é de um aluno; use outro para o acesso interno';
    end if;
    if exists (select 1 from public.contas_professora where auth_user_id = u_id) then
      raise exception 'este e-mail é de uma professora; use outro para o acesso interno';
    end if;
    insert into public.socias (id, nome, funcao)
    values (u_id, p_nome, p_funcao)
    on conflict (id) do update set nome = excluded.nome, funcao = excluded.funcao;
    delete from public.equipe_convites where email = lower(p_email);
    return 'ativado';
  end if;

  insert into public.equipe_convites (email, nome, funcao, criado_por)
  values (lower(p_email), p_nome, p_funcao, (select auth.uid()))
  on conflict (email) do update
    set nome = excluded.nome, funcao = excluded.funcao, usado_em = null,
        criado_por = excluded.criado_por, criado_em = now();
  return 'convidado';
end;
$$;

-- ------------------------------------------------------------
-- MUDAR FUNÇÃO / REMOVER ACESSO — sempre protegendo a última gestão
-- para ninguém se trancar para fora do próprio sistema.
-- ------------------------------------------------------------
create or replace function public.definir_funcao(p_id uuid, p_funcao public.funcao_interna)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_gestao() then
    raise exception 'só a gestão altera funções';
  end if;
  if p_funcao <> 'gestao'
     and (select funcao from public.socias where id = p_id) = 'gestao'
     and (select count(*) from public.socias where funcao = 'gestao') <= 1 then
    raise exception 'precisa haver ao menos uma pessoa na gestão';
  end if;
  update public.socias set funcao = p_funcao where id = p_id;
end;
$$;

create or replace function public.remover_acesso(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_gestao() then
    raise exception 'só a gestão remove acessos';
  end if;
  if (select funcao from public.socias where id = p_id) = 'gestao'
     and (select count(*) from public.socias where funcao = 'gestao') <= 1 then
    raise exception 'não dá para remover a última pessoa da gestão';
  end if;
  delete from public.socias where id = p_id;
end;
$$;

revoke execute on function public.convidar_equipe(text, text, public.funcao_interna) from public, anon;
revoke execute on function public.definir_funcao(uuid, public.funcao_interna) from public, anon;
revoke execute on function public.remover_acesso(uuid) from public, anon;
grant execute on function public.convidar_equipe(text, text, public.funcao_interna) to authenticated;
grant execute on function public.definir_funcao(uuid, public.funcao_interna) to authenticated;
grant execute on function public.remover_acesso(uuid) to authenticated;
