-- ============================================================
-- M8 — Funções internas + trava do Financeiro (decisão 21/07/2026)
--
-- A equipe interna deixa de ser um bloco só ("é sócia → vê tudo").
-- Passa a ter FUNÇÃO, e cada função vê um recorte:
--   · gestao      → tudo, inclusive Financeiro, saldos, MEI, pagamento
--                   de professoras. São Carol + as 3 sócias.
--   · secretaria  → operação inteira (Agenda, CRM, Follow-up,
--                   Matrículas) SEM nenhum valor financeiro.
--   · social      → só Conteúdo (papel definido; conta ainda não criada).
--
-- is_socia() continua significando "tem conta interna" (qualquer
-- função) e segue guardando os módulos operacionais — está correto
-- enquanto só existirem gestao/secretaria. is_gestao() é a trava nova
-- do dinheiro.
--
-- ⚠️ PENDÊNCIA REGISTRADA: quando um dia existir conta 'social', as
-- policies operacionais (hoje em is_socia()) precisam migrar para
-- is_operacional() — senão social herdaria acesso à operação. Sem
-- conta social criada, não há vazamento hoje. Ver docs/05-BACKLOG.md.
-- ============================================================

create type public.funcao_interna as enum ('gestao', 'secretaria', 'social');

-- Todo mundo que já era conta interna é gestão (as sócias). O default
-- cobre as linhas existentes automaticamente.
alter table public.socias
  add column if not exists funcao public.funcao_interna not null default 'gestao';

-- ------------------------------------------------------------
-- FUNÇÕES DE PAPEL
-- ------------------------------------------------------------
create or replace function public.is_gestao()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.socias
    where id = (select auth.uid()) and funcao = 'gestao'
  );
$$;

-- gestao OU secretaria — "quem toca a operação". Pronta para o dia da
-- migração operacional (ver cabeçalho); ainda não usada em policy.
create or replace function public.is_operacional()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.socias
    where id = (select auth.uid()) and funcao in ('gestao', 'secretaria')
  );
$$;

-- Função da conta logada, para o front montar o menu certo.
create or replace function public.minha_funcao()
returns public.funcao_interna language sql stable security definer set search_path = ''
as $$
  select funcao from public.socias where id = (select auth.uid());
$$;

revoke execute on function public.is_gestao() from public, anon;
revoke execute on function public.is_operacional() from public, anon;
revoke execute on function public.minha_funcao() from public, anon;
grant execute on function public.is_gestao() to authenticated;
grant execute on function public.is_operacional() to authenticated;
grant execute on function public.minha_funcao() to authenticated;

-- ------------------------------------------------------------
-- TRAVA FINANCEIRA — as tabelas de dinheiro passam a is_gestao().
-- Como as views financeiras (vw_mei_acumulado, vw_saldo_caixa,
-- vw_mix_receita_mensal, vw_saidas_mensal) são security_invoker,
-- elas param de devolver dado para a secretária automaticamente —
-- não precisam de policy própria.
-- ------------------------------------------------------------
alter policy "socias gerenciam categorias de saida" on public.categorias_saida
  using (public.is_gestao()) with check (public.is_gestao());
alter policy "socias veem config financeiro" on public.config_financeiro
  using (public.is_gestao());
alter policy "socias ajustam config financeiro" on public.config_financeiro
  using (public.is_gestao()) with check (public.is_gestao());
alter policy "socias gerenciam despesas recorrentes" on public.despesas_recorrentes
  using (public.is_gestao()) with check (public.is_gestao());
alter policy "socias gerenciam entradas" on public.entradas_financeiras
  using (public.is_gestao()) with check (public.is_gestao());
alter policy "socias gerenciam reserva" on public.reserva_movimentos
  using (public.is_gestao()) with check (public.is_gestao());
alter policy "socias gerenciam saidas" on public.saidas_financeiras
  using (public.is_gestao()) with check (public.is_gestao());

-- ------------------------------------------------------------
-- PROFESSORAS — o quanto cada uma recebe (valor_por_aluna_centavos)
-- é dado financeiro. O cadastro inteiro vira gestão-only. A operação
-- (Agenda) ainda precisa do NOME da professora → view segura que
-- expõe só id/nome/ativa, nunca valor/telefone.
--
-- A policy "professora ve o proprio cadastro" NÃO muda: cada
-- professora continua vendo a própria linha (e seu pagamento no
-- portal dela). vw_pagamento_professoras é invoker, então:
--   gestão   → vê todas (policy is_gestao)
--   professora → vê a própria (policy professora_atual)
--   secretária → não vê professora nenhuma → pagamento vazio ✓
-- ------------------------------------------------------------
alter policy "socias gerenciam professoras" on public.professoras
  using (public.is_gestao()) with check (public.is_gestao());

-- View "definer" (mesmo padrão de vw_grade_publica): expõe só o
-- necessário para operar, filtrada a qualquer conta interna.
create or replace view public.vw_professoras_nomes as
select id, nome, ativa
from public.professoras
where public.is_socia();

grant select on public.vw_professoras_nomes to authenticated;

-- ------------------------------------------------------------
-- PROMOVER_A_EQUIPE — passa a receber a função. Assinatura antiga
-- (2 args) removida para não virar overload ambíguo.
-- ------------------------------------------------------------
drop function if exists public.promover_a_equipe(text, text);

create or replace function public.promover_a_equipe(
  p_email text, p_nome text, p_funcao public.funcao_interna default 'gestao'
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  u_id uuid;
begin
  if not public.is_gestao() then
    raise exception 'só a gestão define acessos internos';
  end if;

  select id into u_id from auth.users where lower(email) = lower(p_email);
  if u_id is null then
    raise exception 'nenhuma conta de acesso com este e-mail — peça para criar o login primeiro';
  end if;
  if exists (select 1 from public.contas_aluna where auth_user_id = u_id) then
    raise exception 'esta conta é de aluno; use outro e-mail para o acesso interno';
  end if;
  if exists (select 1 from public.contas_professora where auth_user_id = u_id) then
    raise exception 'esta conta é de professora; use outro e-mail para o acesso interno';
  end if;

  insert into public.socias (id, nome, funcao)
  values (u_id, p_nome, p_funcao)
  on conflict (id) do update set nome = excluded.nome, funcao = excluded.funcao;

  return u_id;
end;
$$;

revoke execute on function public.promover_a_equipe(text, text, public.funcao_interna)
  from public, anon;
grant execute on function public.promover_a_equipe(text, text, public.funcao_interna)
  to authenticated;
