-- ============================================================
-- A cobrança de todo mês, sem ninguém clicar
-- ============================================================
-- A `20260926120000` emitiu a PRIMEIRA cobrança, por um botão. Faltava
-- o resto: a gestão pediu que fosse recorrente, e do jeito que estava
-- alguém geraria link todo mês.
--
-- O que já era automático antes disto: o cron `processar-assinaturas`
-- já roda e chama `renovar_ciclo()` → `cobrar_ciclo()`, que decide que
-- chegou a hora e cria a linha `prevista` no financeiro. O sistema já
-- sabia QUANDO cobrar. O que faltava era emitir e avisar.
--
-- ## Dois caminhos, cada um com o dono certo
--
-- **Pix** — nosso cron emite uma cobrança por ciclo e manda o link por
--   e-mail. A equipe não faz nada; o aluno paga ativamente. R$1,99.
--
-- **Cartão** — assinatura no Asaas, autorizada UMA vez pelo aluno na
--   página deles. O Asaas gera a cobrança de cada ciclo e debita
--   sozinho; nós só recebemos o webhook. ~3%.
--
-- ## Por que o cartão não passa pelo nosso cron
--
-- Não é preferência: `POST /payments` com `creditCardToken` exige
-- `remoteIp`, e a doc do Asaas é explícita em que precisa ser o IP do
-- APARELHO DO ALUNO, não o do servidor. Numa cobrança mensal disparada
-- por cron não existe aluno na tela, logo não existe esse IP.
--
-- O checkout recorrente resolve na raiz: o aluno autoriza na página do
-- Asaas, e quem captura o IP é o Asaas. Por isso o cartão é assinatura
-- deles, e não cobrança nossa com token guardado.

-- ------------------------------------------------------------
-- 1. A assinatura no gateway (só o caminho do cartão)
-- ------------------------------------------------------------
create table if not exists public.assinaturas_gateway (
  id uuid primary key default gen_random_uuid(),

  -- Mesma razão de `cobrancas`: o checkout é criado quando a matrícula
  -- ainda não existe, então ele nasce preso à solicitação e ganha a
  -- matrícula quando o primeiro pagamento confirma.
  solicitacao_id uuid references public.solicitacoes_contratacao(id) on delete cascade,
  matricula_id uuid references public.matriculas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,

  provider text not null default 'asaas',
  /** id do checkout enquanto o aluno não autorizou. */
  checkout_ref text,
  /** id da assinatura, depois que ele autorizou. */
  provider_ref text,
  url_checkout text,

  status text not null default 'aguardando'
    check (status in ('aguardando', 'ativa', 'cancelada', 'expirada')),

  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),

  constraint assinatura_tem_dono check (
    solicitacao_id is not null or matricula_id is not null
  )
);

comment on table public.assinaturas_gateway is
  'Assinatura de cartão no gateway. Existe só para o caminho do cartão: o Asaas gera a cobrança de cada ciclo, e por isso o nosso emissor precisa saber que NÃO deve emitir Pix para essa matrícula.';

create unique index if not exists assinatura_checkout_unico
  on public.assinaturas_gateway (provider, checkout_ref) where checkout_ref is not null;
create unique index if not exists assinatura_provider_ref_unico
  on public.assinaturas_gateway (provider, provider_ref) where provider_ref is not null;

drop trigger if exists assinaturas_gateway_atualizada_em on public.assinaturas_gateway;
create trigger assinaturas_gateway_atualizada_em
  before update on public.assinaturas_gateway
  for each row execute function public.set_atualizada_em();

alter table public.assinaturas_gateway enable row level security;

drop policy if exists "gestao ve assinaturas gateway" on public.assinaturas_gateway;
create policy "gestao ve assinaturas gateway" on public.assinaturas_gateway
  for select to authenticated using (public.is_gestao());

drop policy if exists "cliente ve a propria assinatura" on public.assinaturas_gateway;
create policy "cliente ve a propria assinatura" on public.assinaturas_gateway
  for select to authenticated using (cliente_id = public.cliente_atual());

-- ------------------------------------------------------------
-- 2. O que precisa ser cobrado e ainda não foi
-- ------------------------------------------------------------
-- `cobrar_ciclo()` já cria a entrada `prevista` de cada ciclo. Esta
-- view é a diferença entre "o que devia estar cobrado" e "o que já tem
-- cobrança emitida" — é ela que o emissor consome.
--
-- Três exclusões, e cada uma tem motivo:
--
--  · já existe cobrança para o ciclo → não emitir de novo;
--  · a matrícula tem assinatura ATIVA no gateway → o Asaas é que gera,
--    e emitir aqui cobraria o aluno duas vezes;
--  · matrícula cancelada → não se cobra quem saiu.
create or replace view public.vw_cobrancas_a_emitir
with (security_invoker = true) as
select
  ef.id as entrada_id,
  ef.matricula_id,
  ef.ciclo,
  ef.valor_centavos,
  coalesce(ef.data_prevista, ef.data_competencia) as vencimento,
  ef.descricao,
  m.cliente_id,
  c.nome as cliente_nome,
  c.email as cliente_email,
  c.cpf as cliente_cpf,
  c.asaas_customer_id
from public.entradas_financeiras ef
join public.matriculas m on m.id = ef.matricula_id
join public.clientes c on c.id = m.cliente_id
where ef.status = 'prevista'
  and ef.matricula_id is not null
  and m.status <> 'cancelada'
  and not exists (
    select 1 from public.cobrancas cb
    where cb.matricula_id = ef.matricula_id
      and cb.ciclo = ef.ciclo
      and cb.status <> 'cancelada'
  )
  and not exists (
    select 1 from public.assinaturas_gateway ag
    where ag.matricula_id = ef.matricula_id and ag.status = 'ativa'
  );

grant select on public.vw_cobrancas_a_emitir to authenticated;

comment on view public.vw_cobrancas_a_emitir is
  'Ciclos com entrada prevista e sem cobrança emitida. Exclui quem tem assinatura ativa no gateway — lá quem emite é o próprio gateway, e emitir aqui cobraria duas vezes.';

-- ------------------------------------------------------------
-- 3. Registrar o checkout de assinatura
-- ------------------------------------------------------------
create or replace function public.registrar_assinatura_gateway(
  p_solicitacao uuid,
  p_matricula uuid,
  p_cliente uuid,
  p_provider text,
  p_checkout_ref text,
  p_url text
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  a_id uuid;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  select id into a_id from public.assinaturas_gateway
  where provider = p_provider and checkout_ref = p_checkout_ref;
  if a_id is not null then return a_id; end if;

  insert into public.assinaturas_gateway
    (solicitacao_id, matricula_id, cliente_id, provider, checkout_ref, url_checkout)
  values (p_solicitacao, p_matricula, p_cliente, p_provider, p_checkout_ref, p_url)
  returning id into a_id;

  return a_id;
end;
$function$;

revoke execute on function public.registrar_assinatura_gateway(uuid,uuid,uuid,text,text,text)
  from public, anon;
grant execute on function public.registrar_assinatura_gateway(uuid,uuid,uuid,text,text,text)
  to authenticated;

-- ------------------------------------------------------------
-- 4. O aluno autorizou o cartão
-- ------------------------------------------------------------
-- Vem do evento CHECKOUT_PAID. A partir daqui o Asaas passa a gerar as
-- cobranças, e `vw_cobrancas_a_emitir` para de listar essa matrícula.
create or replace function public.assinatura_ativada(
  p_provider text,
  p_checkout_ref text,
  p_provider_ref text
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ag record;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  select * into ag from public.assinaturas_gateway
  where provider = p_provider and checkout_ref = p_checkout_ref for update;
  if not found then return 'desconhecida'; end if;

  update public.assinaturas_gateway
  set status = 'ativa',
      provider_ref = coalesce(p_provider_ref, provider_ref),
      -- A matrícula pode ter nascido entre o checkout e o pagamento.
      matricula_id = coalesce(
        matricula_id,
        (select matricula_id from public.solicitacoes_contratacao
          where id = ag.solicitacao_id))
  where id = ag.id;

  return 'ativa';
end;
$function$;

revoke execute on function public.assinatura_ativada(text, text, text) from public, anon;
grant execute on function public.assinatura_ativada(text, text, text) to authenticated;


create or replace function public.assinatura_encerrada(
  p_provider text,
  p_checkout_ref text,
  p_status text
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;
  if p_status not in ('cancelada', 'expirada') then
    raise exception 'status inválido: %', p_status;
  end if;

  update public.assinaturas_gateway
  set status = p_status
  where provider = p_provider and checkout_ref = p_checkout_ref
    and status = 'aguardando';

  -- Checkout que expirou sem ser pago não é problema: a contratação
  -- segue em `aguardando_pagamento`, e a gestão gera outro link.
  return p_status;
end;
$function$;

revoke execute on function public.assinatura_encerrada(text, text, text) from public, anon;
grant execute on function public.assinatura_encerrada(text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Cobrança de ciclo que o GATEWAY gerou
-- ------------------------------------------------------------
-- Na assinatura de cartão, a cobrança nasce lá. Registramos quando o
-- evento chega, para o financeiro ter a linha e para a baixa achar a
-- cobrança depois.
create or replace function public.registrar_cobranca_de_assinatura(
  p_provider text,
  p_assinatura_ref text,
  p_provider_ref text,
  p_valor_centavos bigint,
  p_vencimento date,
  p_descricao text
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ag record;
  prox integer;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  select * into ag from public.assinaturas_gateway
  where provider = p_provider and provider_ref = p_assinatura_ref;
  if not found then return 'assinatura_desconhecida'; end if;
  if ag.matricula_id is null then return 'sem_matricula'; end if;

  if exists (select 1 from public.cobrancas
             where provider = p_provider and provider_ref = p_provider_ref) then
    return 'ja_registrada';
  end if;

  -- O ciclo da matrícula no momento em que a cobrança nasceu.
  select ciclo_atual into prox from public.matriculas where id = ag.matricula_id;

  insert into public.cobrancas
    (matricula_id, ciclo, cliente_id, valor_centavos, vencimento,
     descricao, provider, provider_ref)
  values
    (ag.matricula_id, prox, ag.cliente_id, p_valor_centavos, p_vencimento,
     p_descricao, p_provider, p_provider_ref);

  return 'registrada';
end;
$function$;

revoke execute on function public.registrar_cobranca_de_assinatura(text,text,text,bigint,date,text)
  from public, anon;
grant execute on function public.registrar_cobranca_de_assinatura(text,text,text,bigint,date,text)
  to authenticated;

-- ------------------------------------------------------------
-- 6. O cron que manda emitir
-- ------------------------------------------------------------
-- Mesmo padrão de `disparar_emails()` (20260806120000): lê `project_url`
-- e `anon_key` do Vault DESTE projeto. Ambiente sem os segredos não faz
-- nada, de propósito — é o que impede o DEV de emitir cobrança real.
create or replace function public.disparar_cobrancas()
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'anon_key';

  if v_url is null or v_key is null then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/asaas-cobranca',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('modo', 'pendentes')
  );
end;
$$;

comment on function public.disparar_cobrancas() is
  'Manda a Edge Function emitir as cobranças dos ciclos vencendo. Sem project_url/anon_key no Vault, não faz nada — trava de isolamento do DEV.';

revoke all on function public.disparar_cobrancas() from public, anon, authenticated;

-- Uma vez por dia, de manhã. Não precisa ser de hora em hora: o que se
-- emite é cobrança de ciclo, que muda uma vez por mês por aluno.
select cron.unschedule('emitir-cobrancas')
where exists (select 1 from cron.job where jobname = 'emitir-cobrancas');

select cron.schedule(
  'emitir-cobrancas',
  '0 9 * * *',
  $$select public.disparar_cobrancas()$$
);
