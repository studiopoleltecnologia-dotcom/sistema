-- ============================================================
-- M3 — Portal das Professoras (CLAUDE.md §9.6)
--
-- Terceiro papel de RLS, no mesmo padrão de socia/cliente:
--   contas_professora (vínculo auth.users <-> professoras)
--   is_professora() / professora_atual()
--
-- Acesso deliberadamente estreito: as turmas dela, quem está
-- agendado nelas, marcar presença, incluir aluna que chegou por
-- fora, e o próprio pagamento previsto. Nada de financeiro, CRM,
-- outras turmas ou configuração.
--
-- ⚠️ CORREÇÃO DE SEGURANÇA INCLUÍDA — ver seção 2. handle_new_user()
-- criava uma sócia para todo signup sem metadata de papel. Como o
-- Portal da Aluna exige signup público habilitado, qualquer pessoa
-- podia criar conta direto na API de auth e cair em public.socias
-- com acesso total ao sistema, inclusive financeiro.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CONTAS_PROFESSORA — vínculo 1:1 com auth.users.
-- Professora existe em `professoras` desde a Fase 4 sem nunca ter
-- login (a equipe já a paga sem ela acessar nada); a linha aqui só
-- nasce quando ela de fato cria acesso — mesmo racional de
-- contas_aluna (docs/04 §1.3).
-- ------------------------------------------------------------
create table public.contas_professora (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  professora_id uuid not null unique references public.professoras (id) on delete cascade,
  criada_em timestamptz not null default now()
);

alter table public.contas_professora enable row level security;

create or replace function public.is_professora()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contas_professora where auth_user_id = (select auth.uid())
  );
$$;

create or replace function public.professora_atual()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select professora_id from public.contas_professora
  where auth_user_id = (select auth.uid());
$$;

revoke execute on function public.is_professora() from public, anon;
grant execute on function public.is_professora() to authenticated;
revoke execute on function public.professora_atual() from public, anon;
grant execute on function public.professora_atual() to authenticated;

create policy "professora ve a propria conta" on public.contas_professora
  for select to authenticated using (auth_user_id = (select auth.uid()));

create policy "equipe ve contas de professora" on public.contas_professora
  for select to authenticated using (public.is_socia());

-- sem insert/update/delete: o vínculo só nasce em handle_new_user().

-- ------------------------------------------------------------
-- 2. HANDLE_NEW_USER — deixa de criar sócia automaticamente.
--
-- O problema: raw_user_meta_data vem do corpo do signUp(), ou
-- seja, é escolhido por quem cria a conta. Nada ali pode decidir
-- privilégio. A versão anterior criava sócia sempre que o papel
-- não fosse 'cliente' — bastava um POST em /auth/v1/signup sem
-- metadata para virar equipe. E papel='equipe' seria igualmente
-- forjável, então a correção não é trocar a string: é o trigger
-- nunca conceder acesso de equipe.
--
-- Regra nova:
--   - e-mail casa com uma professora ativa cadastrada => vira
--     professora. É isto que faz o "convite": só quem a equipe já
--     cadastrou (com e-mail) consegue acesso, e o link chega no
--     e-mail dela.
--   - qualquer outro caso => nenhum papel. A conta existe e não
--     enxerga nada até criar_conta_aluna() (aluna) ou
--     promover_a_equipe() (equipe, chamada por quem já é equipe).
--
-- ⚠️ PRÉ-REQUISITO DE DEPLOY: confirmação de e-mail precisa estar
-- ATIVA no Supabase Auth. Sem ela, alguém que saiba o e-mail de
-- uma professora cria a conta dela sem provar que tem a caixa.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  prof_id uuid;
begin
  if new.email is not null then
    select p.id into prof_id
    from public.professoras p
    where lower(p.email) = lower(new.email)
      and p.ativa
      and not exists (
        select 1 from public.contas_professora cp where cp.professora_id = p.id
      );

    if prof_id is not null then
      insert into public.contas_professora (auth_user_id, professora_id)
      values (new.id, prof_id);
    end if;
  end if;

  return new;
end;
$$;

-- Equipe só entra por decisão de quem já é equipe. Substitui o
-- provisionamento implícito que o trigger fazia antes.
create or replace function public.promover_a_equipe(p_email text, p_nome text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  u_id uuid;
begin
  if not public.is_socia() then
    raise exception 'acesso restrito à equipe';
  end if;

  select id into u_id from auth.users where lower(email) = lower(p_email);
  if u_id is null then
    raise exception 'nenhuma conta de acesso com este e-mail — peça para criar o login primeiro';
  end if;
  if exists (select 1 from public.contas_aluna where auth_user_id = u_id) then
    raise exception 'esta conta é de aluna; use outro e-mail para o acesso da equipe';
  end if;

  insert into public.socias (id, nome) values (u_id, p_nome)
  on conflict (id) do nothing;

  return u_id;
end;
$$;

revoke execute on function public.promover_a_equipe(text, text) from public, anon;
grant execute on function public.promover_a_equipe(text, text) to authenticated;

-- Aluna e professora são papéis mutuamente exclusivos: as policies
-- de RLS se somam, então uma conta com os dois vínculos enxergaria
-- a união dos dois acessos. Equipe + professora continua permitido
-- de propósito (sócia que também dá aula é caso real).
create or replace function public.validar_papel_exclusivo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'contas_aluna' then
    if exists (select 1 from public.contas_professora
               where auth_user_id = new.auth_user_id) then
      raise exception 'esta conta de acesso já é de uma professora';
    end if;
  else
    if exists (select 1 from public.contas_aluna
               where auth_user_id = new.auth_user_id) then
      raise exception 'esta conta de acesso já é de uma aluna';
    end if;
  end if;
  return new;
end;
$$;

create trigger contas_aluna_papel_exclusivo
  before insert on public.contas_aluna
  for each row execute function public.validar_papel_exclusivo();

create trigger contas_professora_papel_exclusivo
  before insert on public.contas_professora
  for each row execute function public.validar_papel_exclusivo();

-- ------------------------------------------------------------
-- 3. O QUE A PROFESSORA ENXERGA
-- ------------------------------------------------------------

-- O próprio cadastro (precisa do valor_por_aluna para conferir o
-- que tem a receber). Nunca o das colegas.
create policy "professora ve o proprio cadastro" on public.professoras
  for select to authenticated using (id = public.professora_atual());

-- Só as turmas dela.
create policy "professora ve as proprias turmas" on public.turmas
  for select to authenticated
  using (professora_id = public.professora_atual());

-- Agendamentos das turmas dela — inclui histórico, porque é com
-- isso que ela confere as aulas dadas no fim do mês.
create policy "professora ve agendamentos das proprias turmas"
  on public.agendamentos for select to authenticated
  using (exists (
    select 1 from public.turmas t
    where t.id = agendamentos.turma_id
      and t.professora_id = public.professora_atual()
  ));

create policy "professora ve as proprias presencas"
  on public.presencas for select to authenticated
  using (professora_id = public.professora_atual());
-- sem insert/update direto: só via registrar_presenca(), onde mora
-- a validação de turma/data.

grant select on public.vw_pagamento_professoras to authenticated;
-- vw_pagamento_professoras é security_invoker: com as policies
-- acima ela devolve só as linhas da própria professora, sem
-- precisar de uma view separada.

-- ------------------------------------------------------------
-- 4. LISTA DE CHAMADA
-- View "definer" (sem security_invoker) para expor apenas o NOME
-- da aluna, nunca telefone, estágio de funil ou resto do CRM —
-- mesma válvula de escape de vw_grade_publica. Por não passar por
-- RLS, o recorte de quem-vê-o-quê está no WHERE: sem is_socia()
-- nem professora_atual() casando, a view devolve zero linhas.
--
-- Duas origens somadas: quem estava agendado, e quem foi incluída
-- na hora (presença sem agendamento, regra 9.6).
-- ------------------------------------------------------------
create view public.vw_alunas_da_aula as
select
  a.turma_id,
  a.data,
  c.id as cliente_id,
  c.nome as aluna,
  a.canal,
  a.id as agendamento_id,
  pr.presente
from public.agendamentos a
join public.turmas t on t.id = a.turma_id
join public.clientes c on c.id = a.cliente_id
left join public.presencas pr
  on pr.turma_id = a.turma_id
 and pr.data_aula = a.data
 and pr.cliente_id = a.cliente_id
where a.status = 'agendado'
  and (public.is_socia() or t.professora_id = public.professora_atual())

union all

select
  pr.turma_id,
  pr.data_aula as data,
  c.id as cliente_id,
  c.nome as aluna,
  pr.canal,
  null::uuid as agendamento_id,
  pr.presente
from public.presencas pr
join public.turmas t on t.id = pr.turma_id
join public.clientes c on c.id = pr.cliente_id
where pr.agendamento_id is null
  and not exists (
    select 1 from public.agendamentos a
    where a.turma_id = pr.turma_id and a.data = pr.data_aula
      and a.cliente_id = pr.cliente_id and a.status = 'agendado'
  )
  and (public.is_socia() or t.professora_id = public.professora_atual());

grant select on public.vw_alunas_da_aula to authenticated;

-- Busca de aluna para incluir na chamada. Devolve id+nome e mais
-- nada — a professora precisa achar a pessoa, não conhecer o
-- cadastro dela.
create or replace function public.buscar_aluna(p_termo text)
returns table (id uuid, nome text)
language plpgsql security definer
set search_path = ''
as $$
begin
  if not (public.is_socia() or public.is_professora()) then
    raise exception 'acesso restrito à equipe ou à professora';
  end if;
  if p_termo is null or length(trim(p_termo)) < 3 then
    return;
  end if;

  return query
    select c.id, c.nome
    from public.clientes c
    where c.nome ilike '%' || trim(p_termo) || '%'
    order by c.nome
    limit 20;
end;
$$;

revoke execute on function public.buscar_aluna(text) from public, anon;
grant execute on function public.buscar_aluna(text) to authenticated;

-- ------------------------------------------------------------
-- 5. REGISTRAR_PRESENÇA — liberada para a professora da turma.
-- Corpo igual ao da Fase 4; muda só o guard (que passou a precisar
-- da professora da turma antes de decidir) e o limite de data.
--
-- Incluir aluna que não estava agendada é esta mesma função: quando
-- não há agendamento, a presença nasce com agendamento_id null, que
-- é exatamente o caso previsto no comentário da tabela (regra 9.6).
-- Não vira agendamento retroativo de propósito — senão o trigger de
-- capacidade recusaria a aluna que já está fisicamente na sala.
-- ------------------------------------------------------------
create or replace function public.registrar_presenca(
  p_turma uuid, p_data date, p_cliente uuid, p_presente boolean,
  p_canal public.canal_aula default 'avulsa'
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  ag record;
  prof uuid;
  canal_final public.canal_aula;
  pr_id uuid;
begin
  select professora_id into prof from public.turmas where id = p_turma;
  if prof is null then
    raise exception 'turma inexistente';
  end if;

  if auth.uid() is not null then
    if public.is_professora() then
      if prof <> public.professora_atual() then
        raise exception 'professora só registra presença nas próprias turmas';
      end if;
      if p_data > current_date then
        raise exception 'não dá para registrar presença de aula que ainda não aconteceu';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito à equipe ou à professora da turma';
    end if;
  end if;

  select * into ag from public.agendamentos
  where turma_id = p_turma and data = p_data and cliente_id = p_cliente
    and status = 'agendado';

  canal_final := coalesce(ag.canal, p_canal);

  insert into public.presencas
    (agendamento_id, turma_id, cliente_id, professora_id, data_aula, canal, presente)
  values (ag.id, p_turma, p_cliente, prof, p_data, canal_final, p_presente)
  on conflict (turma_id, data_aula, cliente_id)
  do update set presente = excluded.presente
  returning id into pr_id;

  if ag.id is not null then
    insert into public.agendamentos_eventos (agendamento_id, evento, criado_por)
    values (ag.id, case when p_presente then 'presenca' else 'falta' end, auth.uid());
  end if;

  return pr_id;
end;
$$;
