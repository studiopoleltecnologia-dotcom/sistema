-- ============================================================
-- Segurança: auth_users_exposed em vw_equipe + escalação de
-- privilégio via UPDATE em public.socias.
--
-- Contexto (Supabase Advisor, 22/08/2026 — 6 achados ERROR):
--   auth_users_exposed .... vw_equipe            -> CORRIGIDO aqui
--   security_definer_view . vw_equipe            -> aceito, documentado
--   security_definer_view . vw_professoras_nomes -> aceito, documentado
--   security_definer_view . vw_grade_publica     -> aceito, documentado
--   security_definer_view . vw_vagas_turma       -> aceito, documentado
--   security_definer_view . vw_alunas_da_aula    -> aceito, documentado
--
-- Os 5 "security_definer_view" CONTINUAM aparecendo no Advisor depois
-- desta migration, de caso pensado. Motivo estrutural: gestao,
-- secretaria, cliente e professora são todos o MESMO role Postgres
-- (`authenticated`) — CLAUDE.md §5.1. RLS filtra LINHA, GRANT filtra
-- COLUNA por ROLE; nenhum dos dois expressa "estas colunas para todo
-- mundo, aquelas só para quem satisfaz uma condição calculada". A view
-- SECURITY DEFINER com WHERE de auto-filtro é o único mecanismo nativo
-- para isso, e é a remediação que a própria doc do linter (0011)
-- reconhece. O motivo de cada uma está no `comment on view` respectivo.
--
-- Fora do Advisor, esta migration fecha um risco MAIOR: a policy
-- "socia atualiza o proprio perfil" permitia a qualquer conta interna
-- fazer PATCH /rest/v1/socias {"funcao":"gestao"} e se auto-promover,
-- contornando definir_funcao() e a trava do Financeiro (§5.2).
-- ============================================================

-- ------------------------------------------------------------
-- 1. ESCALAÇÃO DE PRIVILÉGIO em public.socias.
--
-- A policy "socia atualiza o proprio perfil" (20260719120000) libera
-- UPDATE da própria LINHA — e RLS não restringe COLUNA. Com o grant
-- default do Supabase (all privileges em public para authenticated),
-- qualquer conta interna podia mudar a própria `funcao` para 'gestao'.
--
-- Atenção ao mecanismo: REVOKE de COLUNA não subtrai um GRANT de
-- TABELA (privilégios se somam). É obrigatório revogar o UPDATE de
-- tabela e devolver só a coluna permitida.
--
-- Isto NÃO quebra as rotinas legítimas: definir_funcao(),
-- remover_acesso(), convidar_equipe(), handle_new_user() e
-- sync_socia_email() são SECURITY DEFINER e rodam como dono, ignorando
-- estes grants. E o front nunca dá .update() em socias (único uso é um
-- select em src/modules/clientes/api/clientes.ts).
-- ------------------------------------------------------------
revoke update on public.socias from authenticated, anon;
grant  update (nome) on public.socias to authenticated;

-- ------------------------------------------------------------
-- 2. socias.email — o e-mail passa a ser dado da própria tabela, para
-- vw_equipe nunca mais precisar de `join auth.users` (raiz do achado
-- auth_users_exposed).
-- ------------------------------------------------------------
alter table public.socias
  add column if not exists email text;

comment on column public.socias.email is
  'Espelho de auth.users.email. Mantido em sincronia por convidar_equipe(), '
  'handle_new_user() e pelo trigger on_auth_user_email_changed. Escrita direta '
  'por authenticated está revogada (grant de coluna, ver passo 1 da migration '
  '20260822120000) — estes são os únicos caminhos de escrita. Existe para que '
  'vw_equipe não referencie auth.users.';

-- ------------------------------------------------------------
-- 3. Backfill único das contas já existentes.
-- ------------------------------------------------------------
update public.socias s
set email = u.email
from auth.users u
where u.id = s.id
  and s.email is null;

-- ------------------------------------------------------------
-- 4. Sincronização contínua. Sem isso o espelho vale só no dia em que
-- foi criado: hoje não existe fluxo de troca de e-mail no app (só
-- updateUser({password}) e resetPasswordForEmail), então o caso real é
-- admin trocando o e-mail pelo Supabase Studio — silencioso e sem
-- ninguém perceber o drift.
--
-- `update of email` só dispara quando a coluna é mencionada no SET, e
-- o `is distinct from` transforma o resto em no-op: o caminho de login
-- do Auth não paga por isto.
-- ------------------------------------------------------------
create or replace function public.sync_socia_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.socias
  set email = new.email
  where id = new.id
    and email is distinct from new.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_socia_email();

-- ------------------------------------------------------------
-- 5. convidar_equipe() — grava o e-mail no ramo "ativa na hora".
-- Corpo idêntico ao vigente em 20260721170000_convites_equipe.sql,
-- fora da coluna `email` nos dois inserts.
-- ------------------------------------------------------------
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
    insert into public.socias (id, nome, funcao, email)
    values (u_id, p_nome, p_funcao, lower(p_email))
    on conflict (id) do update
      set nome = excluded.nome, funcao = excluded.funcao, email = excluded.email;
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
-- 6. handle_new_user() — o ramo que consome convite de equipe grava o
-- e-mail do signup. Precedência inalterada (professora -> convite de
-- equipe -> nada); corpo idêntico ao vigente em 20260721170000.
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
    insert into public.socias (id, nome, funcao, email)
    values (new.id, conv.nome, conv.funcao, lower(new.email))
    on conflict (id) do update set funcao = excluded.funcao, email = excluded.email;
    update public.equipe_convites set usado_em = now() where email = conv.email;
    return new;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 7. vw_equipe sem auth.users — resolve o achado auth_users_exposed.
--
-- DROP + CREATE (não `create or replace`): a coluna `email` muda de
-- varchar(255) (auth.users) para text (socias), e `create or replace
-- view` recusa mudança de tipo. Nada depende desta view (conferido em
-- supabase/migrations/). O DROP leva o GRANT junto — reemitir abaixo.
-- ------------------------------------------------------------
drop view if exists public.vw_equipe;

create view public.vw_equipe as
select id, nome, funcao, email, criada_em
from public.socias
where public.is_gestao();

grant select on public.vw_equipe to authenticated;

comment on view public.vw_equipe is
  'SECURITY DEFINER deliberado (Advisor: security_definer_view ACEITO, não é bug). '
  'auth_users_exposed foi resolvido em 22/08/2026: a view lê socias.email e não '
  'referencia mais auth.users. O gate is_gestao() fica no WHERE porque a policy de '
  'RLS de socias ("socias veem socias") usa is_socia(), mais permissiva — sob '
  'security_invoker=true a secretaria passaria a ver o e-mail de toda a equipe. '
  'NÃO ligar security_invoker nem remover este WHERE sem antes trocar a policy da '
  'tabela para is_gestao() e auditar quem depende de ler nome/funcao de colegas.';

-- ------------------------------------------------------------
-- 8. As outras 4 views — SÓ documentação. Nenhuma mudança de
-- comportamento, nenhum security_invoker alterado.
-- ------------------------------------------------------------
comment on view public.vw_professoras_nomes is
  'SECURITY DEFINER deliberado (Advisor: security_definer_view ACEITO, não é bug). '
  'A tabela professoras é gestão-only desde a M8 (policy is_gestao()) porque carrega '
  'valor_por_aluna_centavos e telefone. Esta view projeta só id/nome/ativa para '
  'qualquer conta interna (is_socia(), inclusive secretaria). Sob security_invoker=true '
  'ela devolveria ZERO linhas para a secretaria (não é is_gestao() nem é a própria '
  'professora), quebrando o seletor de turma da Agenda e o CRM '
  '(src/modules/agenda/api/agenda.ts, src/modules/clientes/api/clientes.ts). '
  'Abrir professoras via policy is_operacional() não substitui: RLS libera a LINHA '
  'inteira, incluindo as colunas que esta view existe para esconder. Revisado 22/08/2026.';

comment on view public.vw_grade_publica is
  'SECURITY DEFINER deliberado (Advisor: security_definer_view ACEITO, não é bug) — '
  'já documentado desde a criação (20260719220000): válvula de escape para expor um '
  'recorte seguro de turmas+professoras sem dar select amplo nas tabelas de origem. '
  'professoras e modalidades não têm policy de leitura para is_cliente() nem '
  'is_professora(); como o join com professoras é INNER, sob security_invoker=true a '
  'grade inteira do Portal do Aluno voltaria vazia (o INNER JOIN elimina a linha toda, '
  'não só a coluna do nome). Revisado 22/08/2026.';

comment on view public.vw_vagas_turma is
  'SECURITY DEFINER deliberado (Advisor: security_definer_view ACEITO, não é bug). '
  'Agregado sem identidade de aluno (só turma_id, data, contagem), aberto a qualquer '
  'authenticated de propósito. Sob security_invoker=true a policy "cliente ve os '
  'proprios agendamentos" restringiria o count às linhas do próprio aluno: a ocupação '
  'apareceria SUBCONTADA, sem erro e sem tela em branco — turma cheia oferecida como '
  'vaga livre. Abrir agendamentos com uma policy using(true) para resolver o agregado '
  'seria pior: exporia quem mais está agendado em cada aula. Revisado 22/08/2026.';

comment on view public.vw_alunas_da_aula is
  'SECURITY DEFINER deliberado (Advisor: security_definer_view ACEITO, não é bug), '
  'já documentado desde a criação (20260721110000, CLAUDE.md §9.6): por não passar por '
  'RLS, o recorte de quem-vê-o-quê está no WHERE (is_socia() or t.professora_id = '
  'professora_atual()), aplicado nos dois ramos do union all. A tabela clientes não tem '
  'nenhuma policy de select para is_professora(); como o join com clientes é INNER, sob '
  'security_invoker=true a lista de chamada do Portal da Professora ficaria vazia — a '
  'função central do portal. Revisado 22/08/2026.';
