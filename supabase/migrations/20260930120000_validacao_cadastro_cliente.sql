-- ============================================================
-- Validação do cadastro de cliente (homologação da contratação)
--
-- Pedido da gestão (27/09/2026): não registrar nome sem sobrenome,
-- telefone precisa de DDD e ser válido, CPF e e-mail obrigatórios —
-- e estrangeiro não é afetado por nenhuma dessas regras.
--
-- O que motivou: o primeiro cadastro real feito pelo portal entrou como
-- nome "caroline", telefone "54561515" e sem CPF. Sem CPF o Asaas recusa
-- criar o cliente, então esse aluno nunca poderia ser cobrado — e só se
-- descobriria na hora de cobrar.
--
-- ## Onde cada regra vale (a parte que exigiu decisão)
--
-- FORMATO vale sempre que o campo é preenchido ou alterado: nome com
-- sobrenome, telefone com DDD, CPF com dígito verificador, e-mail com @.
--
-- PRESENÇA de CPF e e-mail é exigida em três momentos (o "funil" é
-- lead, pediu_informacoes, agendou_experimental e fez_experimental):
--   · criar a conta no portal (`criar_conta_aluna`);
--   · cadastrar pela equipe alguém que já saiu do funil (matrícula rápida,
--     ou ClienteForm com estágio ≠ lead);
--   · contratar um plano (`impedimento_para_contratar`).
-- O LEAD do funil continua nascendo só com nome e WhatsApp. É a decisão
-- de 26/09 (20260926120000 §6): exigir CPF de quem ainda está
-- conversando põe uma barreira no começo do funil. Quem quiser o
-- contrário liga `exigir_cpf_email_no_lead` na tela, sem deploy.
--
-- ## Por que NÃO normalizar o telefone aqui
--
-- Seria natural gravar só dígitos. Mas `registrar_presenca()` →
-- `integrar_presenca()` faz `update clientes set ultima_aula` com a
-- sessão da professora — não é contexto de serviço. Se este gatilho
-- reescrevesse o telefone em todo UPDATE, o campo passaria a contar
-- como "alterado" e seria validado; um cadastro antigo sem DDD faria a
-- professora não conseguir marcar presença. Então: valida pelos
-- dígitos, grava como digitado, e só olha o campo que de fato mudou.
--
-- ## Contexto de serviço
--
-- `auth.uid() is null` passa direto: webhook da Wellhub (cria cliente
-- só com nome), webhook e cobrança do Asaas (gravam asaas_customer_id),
-- cron, migrations. É a convenção do projeto para "chamada confiável".
-- ============================================================


-- ------------------------------------------------------------
-- 1. Estrangeiro
-- ------------------------------------------------------------
alter table public.clientes
  add column if not exists estrangeiro boolean not null default false;

comment on column public.clientes.estrangeiro is
  'Isenta das regras de nome, telefone BR, CPF e e-mail. Cobrança pelo Asaas exige CPF — estrangeiro sem CPF paga por fora.';


-- ------------------------------------------------------------
-- 2. Configuração — tudo desligável pela gestão, sem deploy
-- ------------------------------------------------------------
create table if not exists public.config_cadastro (
  id boolean primary key default true check (id),
  exigir_sobrenome boolean not null default true,
  validar_telefone_br boolean not null default true,
  exigir_cpf boolean not null default true,
  exigir_email boolean not null default true,
  exigir_cpf_email_no_lead boolean not null default false,
  atualizada_em timestamptz not null default now()
);

insert into public.config_cadastro default values on conflict do nothing;

alter table public.config_cadastro enable row level security;

-- Leitura para qualquer sessão autenticada: o portal do aluno precisa
-- saber o que exigir na tela. Não há dado sensível aqui.
drop policy if exists "config_cadastro leitura" on public.config_cadastro;
create policy "config_cadastro leitura"
  on public.config_cadastro for select to authenticated
  using (true);

drop policy if exists "config_cadastro gestao altera" on public.config_cadastro;
create policy "config_cadastro gestao altera"
  on public.config_cadastro for update to authenticated
  using (public.is_gestao()) with check (public.is_gestao());

drop trigger if exists config_cadastro_atualizada_em on public.config_cadastro;
create trigger config_cadastro_atualizada_em
  before update on public.config_cadastro
  for each row execute function public.set_atualizada_em();


-- ------------------------------------------------------------
-- 3. Validadores puros (espelhados em src/lib/cadastro.ts)
-- ------------------------------------------------------------

-- CPF (11) com dígito verificador. Aceita também CNPJ (14), porque a
-- coluna já aceitava (`cpf_so_digitos`) e o Asaas cobra empresa pelo
-- mesmo campo `cpfCnpj`.
create or replace function public.cpf_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int;
  r int;
  i int;
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if d ~ '^(\d)\1*$' then
    return false;  -- vazio ou todos os dígitos iguais
  end if;

  if length(d) = 11 then
    s := 0;
    for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::int then return false; end if;
    s := 0;
    for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = substr(d, 11, 1)::int;
  end if;

  if length(d) = 14 then
    s := 0;
    for i in 1..12 loop s := s + substr(d, i, 1)::int * pesos1[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 13, 1)::int then return false; end if;
    s := 0;
    for i in 1..13 loop s := s + substr(d, i, 1)::int * pesos2[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    return r = substr(d, 14, 1)::int;
  end if;

  return false;
end;
$$;

-- Telefone brasileiro: DDD da lista da Anatel + número.
--   11 dígitos = celular, o 3º dígito é 9
--   10 dígitos = fixo,    o 3º dígito é 2 a 5
-- "+55" ou "55" na frente é tolerado. A lista de DDD é norma nacional,
-- não preferência — por isso fica aqui, e não na configuração.
create or replace function public.telefone_br_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  ddd int;
begin
  if length(d) in (12, 13) and left(d, 2) = '55' then
    d := substr(d, 3);
  end if;
  if length(d) not in (10, 11) or d ~ '^(\d)\1*$' then
    return false;
  end if;

  ddd := left(d, 2)::int;
  if not (ddd between 11 and 19 or ddd in (21, 22, 24, 27, 28)
          or ddd between 31 and 35 or ddd in (37, 38)
          or ddd between 41 and 49 or ddd = 51 or ddd between 53 and 55
          or ddd between 61 and 69 or ddd = 71 or ddd between 73 and 75
          or ddd in (77, 79) or ddd between 81 and 89 or ddd between 91 and 99)
  then
    return false;
  end if;

  if length(d) = 11 then
    return substr(d, 3, 1) = '9';
  end if;
  return substr(d, 3, 1) between '2' and '5';
end;
$$;

-- Nome e sobrenome: pelo menos duas palavras com duas letras ou mais,
-- e a última não pode ser partícula. "caroline", "Carol S." e
-- "Maria da" falham; "Ana Lu" e sobrenomes curtos como "Li" passam.
-- Conta letra como "tudo que não é dígito nem pontuação ASCII" — assim
-- acento conta como letra sem depender do locale do banco.
create or replace function public.nome_completo_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  partes text[] := regexp_split_to_array(
    btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), ' ');
  w text;
  n int := 0;
begin
  foreach w in array partes loop
    if length(regexp_replace(w, '[[:digit:][:punct:]]', '', 'g')) >= 2 then
      n := n + 1;
    end if;
  end loop;
  return n >= 2
    and lower(partes[array_length(partes, 1)])
        not in ('da', 'de', 'do', 'das', 'dos', 'e');
end;
$$;

create or replace function public.email_valido(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p, '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
$$;

revoke execute on function public.cpf_valido(text) from public, anon;
revoke execute on function public.telefone_br_valido(text) from public, anon;
revoke execute on function public.nome_completo_valido(text) from public, anon;
revoke execute on function public.email_valido(text) from public, anon;


-- ------------------------------------------------------------
-- 4. O gatilho de validação
-- ------------------------------------------------------------
-- `05` no nome: roda depois de `clientes_00_normaliza_email`, então já
-- recebe o e-mail em minúsculas e o CPF só com dígitos.
create or replace function public.validar_cadastro_cliente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cfg public.config_cadastro;
  novo boolean := tg_op = 'INSERT';
  virou_brasileiro boolean := false;
  exige_presenca boolean;
begin
  if auth.uid() is null then
    return new;  -- contexto de serviço (ver cabeçalho)
  end if;

  select * into cfg from public.config_cadastro where id;
  if not found then
    return new;
  end if;

  if not novo then
    virou_brasileiro := old.estrangeiro and not new.estrangeiro;

    -- Apagar é sempre recusado, estrangeiro ou não: é dado que alguém
    -- informou e que a cobrança ou a comunicação já podem estar usando.
    if old.cpf is not null and new.cpf is null then
      raise exception 'o CPF não pode ser apagado do cadastro';
    end if;
    if old.email is not null and new.email is null then
      raise exception 'o e-mail não pode ser apagado do cadastro';
    end if;
  end if;

  if new.estrangeiro then
    return new;
  end if;

  -- ---- Formato: só o que entrou agora ----
  if cfg.exigir_sobrenome
     and (novo or virou_brasileiro or new.nome is distinct from old.nome)
     and not public.nome_completo_valido(new.nome) then
    raise exception 'informe nome e sobrenome';
  end if;

  if cfg.validar_telefone_br then
    if nullif(btrim(coalesce(new.telefone, '')), '') is not null
       and (novo or virou_brasileiro or new.telefone is distinct from old.telefone)
       and not public.telefone_br_valido(new.telefone) then
      raise exception 'telefone inválido — informe com DDD, ex.: (21) 98765-4321';
    end if;
    if nullif(btrim(coalesce(new.contato_emergencia_telefone, '')), '') is not null
       and (novo or virou_brasileiro
            or new.contato_emergencia_telefone is distinct from old.contato_emergencia_telefone)
       and not public.telefone_br_valido(new.contato_emergencia_telefone) then
      raise exception 'telefone do contato de emergência inválido — informe com DDD, ex.: (21) 98765-4321';
    end if;
  end if;

  if new.cpf is not null
     and (novo or virou_brasileiro or new.cpf is distinct from old.cpf)
     and not public.cpf_valido(new.cpf) then
    raise exception 'CPF inválido — confira os números';
  end if;

  if new.email is not null
     and (novo or virou_brasileiro or new.email is distinct from old.email)
     and not public.email_valido(new.email) then
    raise exception 'e-mail inválido';
  end if;

  -- ---- Presença: na criação de quem não é lead, e ao deixar de ser
  -- estrangeiro. Lead só quando a gestão ligar a opção. ----
  -- "Lead" aqui é todo o funil antes de virar aluno — não só o estágio
  -- `lead`. Quem só agendou experimental ainda não é cobrado.
  exige_presenca := virou_brasileiro
    or (novo and (coalesce(new.estagio::text, 'lead') not in
                    ('lead', 'pediu_informacoes', 'agendou_experimental', 'fez_experimental')
                  or cfg.exigir_cpf_email_no_lead));

  if exige_presenca then
    if cfg.exigir_cpf and new.cpf is null then
      raise exception 'CPF é obrigatório — o gateway de pagamento não emite cobrança sem ele';
    end if;
    if cfg.exigir_email and new.email is null then
      raise exception 'e-mail é obrigatório — é por ele que o aluno recebe confirmações e cobranças';
    end if;
  end if;

  return new;
end;
$$;

-- Função de gatilho não é RPC (padrão de 20260921120000).
revoke execute on function public.validar_cadastro_cliente() from public, anon, authenticated;

drop trigger if exists clientes_05_valida_cadastro on public.clientes;
create trigger clientes_05_valida_cadastro
  before insert or update on public.clientes
  for each row execute function public.validar_cadastro_cliente();


-- ------------------------------------------------------------
-- 5. O que o aluno não altera no próprio cadastro
-- ------------------------------------------------------------
-- Duas mudanças sobre a versão de 20260923120000:
--
-- a) `pg_trigger_depth() = 1` — CORRIGE UM BUG EM PRODUÇÃO. Desde
--    20260921150000 a professora pode também ser aluna. Quando ela
--    marca presença, `integrar_presenca()` atualiza
--    `clientes.ultima_aula` do aluno presente — e esta função, que
--    olha a SESSÃO e não a linha, via "aluna mexendo em ultima_aula" e
--    recusava. Resultado: a professora que treina aqui não conseguia
--    registrar presença de ninguém. Com a profundidade, só vale para o
--    UPDATE que o próprio aluno dispara; o que um gatilho faz em
--    cascata é regra do sistema, não edição do aluno.
--
-- b) `estrangeiro`, `asaas_customer_id` e `cpf` já preenchido entram
--    na lista. O aluno preenche o CPF quando está vazio; corrigir passa
--    pelo estúdio, porque é o documento em que a cobrança é emitida.
create or replace function public.validar_edicao_cliente()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if public.is_cliente() and not public.is_socia() and pg_trigger_depth() = 1 then
    if new.estagio is distinct from old.estagio
      or new.origem is distinct from old.origem
      or new.responsavel_id is distinct from old.responsavel_id
      or new.vip is distinct from old.vip
      or new.gympass_id is distinct from old.gympass_id
      or new.primeiro_contato is distinct from old.primeiro_contato
      or new.ultima_aula is distinct from old.ultima_aula
      or new.ultima_conversa is distinct from old.ultima_conversa
      or new.estrangeiro is distinct from old.estrangeiro
      or new.asaas_customer_id is distinct from old.asaas_customer_id
    then
      raise exception 'campo não editável pela própria aluna';
    end if;
    if new.email is distinct from old.email then
      raise exception
        'o e-mail é o que liga esta conta ao seu cadastro — peça a troca ao estúdio';
    end if;
    if old.cpf is not null and new.cpf is distinct from old.cpf then
      raise exception 'para corrigir o CPF, fale com o estúdio';
    end if;
  end if;
  return new;
end;
$function$;


-- ------------------------------------------------------------
-- 6. Contratar plano exige CPF
-- ------------------------------------------------------------
-- Corpo idêntico ao de 20260924120000, mais o bloco do CPF logo depois
-- do e-mail. `excepcionavel = true`: a gestão ainda consegue matricular,
-- com justificativa, o aluno antigo que paga em dinheiro e nunca deu
-- CPF. O aluno pelo portal é sempre recusado (solicitar_contratacao não
-- aceita exceção vinda dele).
create or replace function public.impedimento_para_contratar(p_cliente uuid, p_produto uuid)
returns table(motivo text, excepcionavel boolean)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  pr record;
  eleg record;
  email_cliente text;
  cl record;
  ja_tem integer;
begin
  select * into pr from public.produtos where id = p_produto and ativo;
  if not found then
    return query select 'produto inexistente ou inativo'::text, false;
    return;
  end if;

  -- E-mail antes de tudo: sem ele o aluno não recebe confirmação de
  -- contratação, aviso de aula cancelada nem cobrança (4.18, 7.1), e
  -- não há justificativa que resolva — é dado que falta, não regra.
  if pr.tipo_produto = 'plano' then
    select nullif(btrim(coalesce(email, '')), '') into email_cliente
    from public.clientes where id = p_cliente;
    if email_cliente is null then
      return query select
        'este aluno está sem e-mail. Plano manda confirmação de contratação, aviso de aula cancelada e cobrança por e-mail — cadastre antes de matricular'::text,
        false;
      return;
    end if;

    select c.cpf, c.estrangeiro into cl from public.clientes c where c.id = p_cliente;
    if coalesce((select exigir_cpf from public.config_cadastro where id), true)
       and not cl.estrangeiro
       and not public.cpf_valido(cl.cpf) then
      return query select
        'este aluno está sem CPF válido no cadastro. O gateway de pagamento não emite cobrança sem ele — complete o cadastro antes de contratar'::text,
        true;
      return;
    end if;
  end if;

  if pr.limite_por_cliente is not null then
    select count(*) into ja_tem from public.matriculas
    where cliente_id = p_cliente and plano_id = p_produto
      and status <> 'cancelada';
    if ja_tem >= pr.limite_por_cliente then
      return query select
        format('limite de %s contratação(ões) deste produto por cliente já atingido',
               pr.limite_por_cliente)::text,
        false;
      return;
    end if;
  end if;

  if pr.status = 'legado' then
    return query select format(
      '“%s” é um plano antigo, fora de venda — quem já tem continua nele até o fim do contrato, mas ele não se contrata mais',
      pr.nome)::text, true;
    return;
  end if;

  select * into eleg from public.elegivel_para_produto(p_cliente, p_produto);
  if not eleg.ok then
    return query select eleg.motivo::text, true;
    return;
  end if;

  return;  -- nenhuma linha = pode contratar
end;
$function$;


-- ------------------------------------------------------------
-- 7. Portal: criar a conta com CPF
-- ------------------------------------------------------------
-- Drop explícito da assinatura antiga: `create or replace` com
-- parâmetros novos criaria um SEGUNDO overload, e o PostgREST passaria
-- a escolher entre os dois pelo nome dos argumentos.
drop function if exists public.criar_conta_aluna(text, text, text, date, boolean, text, text, text);

create or replace function public.criar_conta_aluna(
  p_nome text,
  p_telefone text,
  p_email text,
  p_data_nascimento date,
  p_aceite_lgpd boolean,
  p_contato_emergencia_nome text default null,
  p_contato_emergencia_telefone text default null,
  p_versao_termo text default 'v1'::text,
  p_cpf text default null,
  p_estrangeiro boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c_id uuid;
  c_cpf text;
  c_estrangeiro boolean;
  email_conta text;
  cpf_informado text := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  estrangeiro_final boolean;
begin
  if auth.uid() is null then
    raise exception 'requer sessão autenticada';
  end if;
  if public.is_socia() then
    raise exception 'conta da equipe não pode virar conta de aluna';
  end if;
  if exists (select 1 from public.contas_aluna where auth_user_id = auth.uid()) then
    raise exception 'esta conta já está vinculada a uma cliente';
  end if;
  if not p_aceite_lgpd then
    raise exception 'aceite dos termos é obrigatório para criar a conta';
  end if;
  if p_contato_emergencia_nome is null or length(trim(p_contato_emergencia_nome)) = 0
     or p_contato_emergencia_telefone is null or length(trim(p_contato_emergencia_telefone)) = 0 then
    raise exception 'contato de emergência (nome e telefone) é obrigatório';
  end if;

  -- O e-mail da SESSÃO, não o do formulário (20260923120000).
  select lower(btrim(u.email)) into email_conta
  from auth.users u where u.id = auth.uid();

  if email_conta is null or email_conta = '' then
    raise exception 'sua conta de acesso está sem e-mail confirmado';
  end if;

  select c.id, c.cpf, c.estrangeiro into c_id, c_cpf, c_estrangeiro
  from public.clientes c
  where lower(btrim(c.email)) = email_conta;

  -- Estrangeiro: o que o aluno marcou, ou o que a equipe já tinha
  -- registrado no cadastro prévio. Quem já tem CPF gravado não "vira"
  -- estrangeiro pelo portal.
  estrangeiro_final := case
    when c_cpf is not null then coalesce(c_estrangeiro, false)
    else coalesce(p_estrangeiro, false) or coalesce(c_estrangeiro, false)
  end;

  -- CPF obrigatório aqui, e não no gatilho: no gatilho isto é um
  -- INSERT de lead como qualquer outro, e lead não exige CPF.
  if not estrangeiro_final
     and coalesce((select exigir_cpf from public.config_cadastro where id), true)
     and coalesce(cpf_informado, c_cpf) is null then
    raise exception 'CPF é obrigatório — o gateway de pagamento não emite cobrança sem ele';
  end if;

  if c_id is null then
    insert into public.clientes
      (nome, telefone, email, data_nascimento, origem,
       contato_emergencia_nome, contato_emergencia_telefone,
       cpf, estrangeiro)
    values
      (p_nome, p_telefone, email_conta, p_data_nascimento, 'portal_aluna',
       p_contato_emergencia_nome, p_contato_emergencia_telefone,
       cpf_informado, estrangeiro_final)
    returning id into c_id;
  else
    -- Cadastro que a gestão deixou pronto. A tela mostrou esses dados
    -- para ele conferir, então o que volta do formulário é o valor
    -- confirmado e substitui — menos quando vem vazio, que aí é
    -- campo não preenchido, não correção. O CPF já gravado não é
    -- trocado por aqui (correção passa pelo estúdio).
    update public.clientes c
    set nome = coalesce(nullif(btrim(p_nome), ''), c.nome),
        telefone = coalesce(nullif(btrim(p_telefone), ''), c.telefone),
        data_nascimento = coalesce(p_data_nascimento, c.data_nascimento),
        contato_emergencia_nome =
          coalesce(nullif(btrim(p_contato_emergencia_nome), ''), c.contato_emergencia_nome),
        contato_emergencia_telefone =
          coalesce(nullif(btrim(p_contato_emergencia_telefone), ''), c.contato_emergencia_telefone),
        cpf = coalesce(c.cpf, cpf_informado),
        estrangeiro = estrangeiro_final
    where c.id = c_id;
  end if;

  insert into public.contas_aluna (auth_user_id, cliente_id, aceite_lgpd_em, versao_termo)
  values (auth.uid(), c_id, now(), p_versao_termo);

  return c_id;
end;
$function$;

revoke execute on function
  public.criar_conta_aluna(text, text, text, date, boolean, text, text, text, text, boolean)
  from public, anon;
grant execute on function
  public.criar_conta_aluna(text, text, text, date, boolean, text, text, text, text, boolean)
  to authenticated;


-- ------------------------------------------------------------
-- 8. Cadastro prévio devolve CPF e estrangeiro
-- ------------------------------------------------------------
-- Senão o aluno que a equipe pré-cadastrou teria de redigitar o CPF.
-- Mudou o RETURNS TABLE, então drop + create.
drop function if exists public.meu_cadastro_previo();

create function public.meu_cadastro_previo()
returns table(
  nome text,
  telefone text,
  data_nascimento date,
  contato_emergencia_nome text,
  contato_emergencia_telefone text,
  cpf text,
  estrangeiro boolean
)
language sql
stable security definer
set search_path to ''
as $function$
  select c.nome, c.telefone, c.data_nascimento,
         c.contato_emergencia_nome, c.contato_emergencia_telefone,
         c.cpf, c.estrangeiro
  from public.clientes c
  join auth.users u on u.id = auth.uid()
  where lower(btrim(c.email)) = lower(btrim(u.email))
  limit 1;
$function$;

revoke execute on function public.meu_cadastro_previo() from public, anon;
grant execute on function public.meu_cadastro_previo() to authenticated;
