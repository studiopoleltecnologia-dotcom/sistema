-- ============================================================
-- Item 09 — a cobrança vira um registro nosso, não do gateway
-- ============================================================
-- Até aqui, "aprovado, aguardando pagamento" era um estado sem nada por
-- trás: a gestão aprovava e alguém tinha que combinar o pagamento por
-- fora, depois voltar na tela e dar baixa à mão.
--
-- `cobrancas` é o elo que faltava. Ela guarda o que foi cobrado, de quem
-- e por qual solicitação — e, quando existe gateway, o `provider_ref`
-- que amarra a nossa linha à cobrança lá.
--
-- ## Por que `provider` e não colunas do Asaas
--
-- A tabela não menciona Asaas em nenhum lugar a não ser num default.
-- `provider` + `provider_ref` + `url_pagamento` descrevem qualquer
-- gateway, e é isso que permite trocar depois sem migrar dado. O
-- backlog §11 já registra a decisão de manter a arquitetura agnóstica —
-- a InfinitePay foi avaliada e recusada, e essa avaliação pode se
-- repetir.
--
-- ## Por que não é o Asaas que controla o ciclo
--
-- O Asaas tem assinatura própria, e usá-la seria o caminho curto. Mas
-- o ciclo aqui tem regra: `data_renovacao()` renova no mesmo dia do mês
-- civil (A17), o semestral vira mensal no fim do compromisso (7.7), e
-- `renovar_ciclo()` decide o que acontece com o saldo. Dois agendadores
-- decidindo a mesma coisa divergem no primeiro mês de 31 dias.
--
-- Então: **nós decidimos quando cobrar, o gateway só emite e avisa.**
-- Uma cobrança por ciclo, criada por nós.

-- ------------------------------------------------------------
-- 1. A tabela
-- ------------------------------------------------------------
do $$
begin
  create type public.status_cobranca as enum (
    'pendente', 'paga', 'vencida', 'cancelada', 'estornada'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.cobrancas (
  id uuid primary key default gen_random_uuid(),

  -- A qual contratação esta cobrança pertence. Uma das duas é
  -- preenchida: a primeira cobrança nasce de uma solicitação (a
  -- matrícula ainda não existe); as seguintes, da renovação.
  solicitacao_id uuid references public.solicitacoes_contratacao(id) on delete cascade,
  matricula_id uuid references public.matriculas(id) on delete cascade,
  ciclo integer,

  cliente_id uuid not null references public.clientes(id) on delete cascade,
  valor_centavos bigint not null check (valor_centavos > 0),
  vencimento date not null,
  descricao text,

  status public.status_cobranca not null default 'pendente',

  provider text not null default 'asaas',
  provider_ref text,
  /** Página de pagamento do gateway: o aluno escolhe Pix ou cartão lá. */
  url_pagamento text,
  forma_pagamento text,

  pago_em timestamptz,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),

  constraint cobranca_tem_dono check (
    solicitacao_id is not null or matricula_id is not null
  )
);

comment on table public.cobrancas is
  'O que foi cobrado, de quem e por qual contratação. Agnóstica de gateway: provider + provider_ref descrevem qualquer um.';

-- A reentrega de webhook é rotina (o Asaas tenta 15 vezes). O índice
-- único é o que garante que duas entregas do mesmo evento não virem
-- duas cobranças nem duas baixas.
create unique index if not exists cobranca_provider_ref_unico
  on public.cobrancas (provider, provider_ref)
  where provider_ref is not null;

create index if not exists cobrancas_por_status on public.cobrancas (status, vencimento);
create index if not exists cobrancas_por_cliente on public.cobrancas (cliente_id, criada_em desc);

drop trigger if exists cobrancas_atualizada_em on public.cobrancas;
create trigger cobrancas_atualizada_em
  before update on public.cobrancas
  for each row execute function public.set_atualizada_em();

alter table public.cobrancas enable row level security;

-- Cobrança é dinheiro: leitura é da gestão. A secretária não vê valor
-- em lugar nenhum do sistema (CLAUDE.md 5.2) e aqui não seria diferente.
drop policy if exists "gestao ve cobrancas" on public.cobrancas;
create policy "gestao ve cobrancas" on public.cobrancas
  for select to authenticated using (public.is_gestao());

-- O aluno vê as próprias, para conseguir abrir o link e pagar.
drop policy if exists "cliente ve as proprias cobrancas" on public.cobrancas;
create policy "cliente ve as proprias cobrancas" on public.cobrancas
  for select to authenticated using (cliente_id = public.cliente_atual());

-- Sem policy de escrita: quem grava são as RPCs `security definer`
-- abaixo, chamadas pela Edge Function com a service key.

-- ------------------------------------------------------------
-- 2. Registrar a cobrança emitida
-- ------------------------------------------------------------
-- Chamada pela Edge Function depois de criar a cobrança no gateway.
-- Idempotente pelo `provider_ref`: se o mesmo pagamento chegar duas
-- vezes, devolve a linha que já existe em vez de duplicar.
create or replace function public.registrar_cobranca(
  p_solicitacao uuid,
  p_matricula uuid,
  p_ciclo integer,
  p_cliente uuid,
  p_valor_centavos bigint,
  p_vencimento date,
  p_descricao text,
  p_provider text,
  p_provider_ref text,
  p_url text
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c_id uuid;
begin
  -- Só contexto de serviço (Edge Function) ou gestão. O aluno não
  -- inventa cobrança para si.
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  select id into c_id from public.cobrancas
  where provider = p_provider and provider_ref = p_provider_ref;
  if c_id is not null then
    return c_id;
  end if;

  insert into public.cobrancas
    (solicitacao_id, matricula_id, ciclo, cliente_id, valor_centavos,
     vencimento, descricao, provider, provider_ref, url_pagamento)
  values
    (p_solicitacao, p_matricula, p_ciclo, p_cliente, p_valor_centavos,
     p_vencimento, p_descricao, p_provider, p_provider_ref, p_url)
  returning id into c_id;

  return c_id;
end;
$function$;

revoke execute on function public.registrar_cobranca(uuid,uuid,integer,uuid,bigint,date,text,text,text,text)
  from public, anon;
grant execute on function public.registrar_cobranca(uuid,uuid,integer,uuid,bigint,date,text,text,text,text)
  to authenticated;

-- ------------------------------------------------------------
-- 3. O pagamento confirmado
-- ------------------------------------------------------------
-- É esta que o webhook chama. Ela decide o que o pagamento significa:
--
--  · cobrança de uma SOLICITAÇÃO → conclui a contratação, o que cria a
--    matrícula e libera os créditos (é o "crédito no pagamento, não no
--    clique" da #76, agora disparado pelo gateway em vez da mão);
--  · cobrança de um CICLO de matrícula → quita a entrada financeira e
--    renova, se for a virada.
--
-- Devolve texto e não exceção para o desfecho de negócio: o webhook
-- precisa responder 2xx mesmo quando não há o que fazer, porque 15
-- respostas de erro seguidas fazem o Asaas PAUSAR a fila inteira. Erro
-- de verdade (banco fora) continua estourando e vira 500.
create or replace function public.cobranca_paga(
  p_provider text,
  p_provider_ref text,
  p_forma text,
  p_pago_em timestamptz
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cb record;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  select * into cb from public.cobrancas
  where provider = p_provider and provider_ref = p_provider_ref
  for update;

  if not found then
    -- Cobrança criada fora do sistema (direto no painel do gateway).
    -- Não é erro nosso e não há o que atualizar.
    return 'desconhecida';
  end if;
  if cb.status = 'paga' then
    return 'ja_paga';
  end if;

  update public.cobrancas
  set status = 'paga',
      pago_em = p_pago_em,
      forma_pagamento = nullif(btrim(coalesce(p_forma, '')), '')
  where id = cb.id;

  if cb.solicitacao_id is not null then
    perform public.confirmar_pagamento_contratacao(cb.solicitacao_id, p_forma, p_pago_em);
    return 'contratacao_concluida';
  end if;

  -- Ciclo de matrícula já existente: quita a entrada prevista daquele
  -- ciclo. A renovação em si continua sendo decisão de
  -- `processar_assinaturas()` — aqui só se registra que entrou dinheiro.
  update public.entradas_financeiras
  set status = 'recebida',
      data_caixa = (p_pago_em at time zone 'America/Sao_Paulo')::date
  where matricula_id = cb.matricula_id
    and ciclo = cb.ciclo
    and status = 'prevista';

  return 'ciclo_quitado';
end;
$function$;

revoke execute on function public.cobranca_paga(text, text, text, timestamptz) from public, anon;
grant execute on function public.cobranca_paga(text, text, text, timestamptz) to authenticated;

-- ------------------------------------------------------------
-- 4. Vencida e cancelada
-- ------------------------------------------------------------
-- Vencer não cancela a contratação: o aluno pode pagar com atraso, e o
-- pedido continua esperando. O que muda é a matrícula existente, que
-- fica inadimplente e para de agendar — a regra que já existia.
create or replace function public.cobranca_vencida(
  p_provider text,
  p_provider_ref text
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cb record;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  select * into cb from public.cobrancas
  where provider = p_provider and provider_ref = p_provider_ref
  for update;

  if not found then return 'desconhecida'; end if;
  if cb.status in ('paga', 'cancelada') then return 'sem_efeito'; end if;

  update public.cobrancas set status = 'vencida' where id = cb.id;

  if cb.matricula_id is not null then
    perform public.marcar_inadimplente(cb.matricula_id);
    return 'matricula_inadimplente';
  end if;

  return 'solicitacao_segue_aberta';
end;
$function$;

revoke execute on function public.cobranca_vencida(text, text) from public, anon;
grant execute on function public.cobranca_vencida(text, text) to authenticated;


create or replace function public.cobranca_cancelada(
  p_provider text,
  p_provider_ref text,
  p_estorno boolean default false
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cb record;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'acesso restrito';
  end if;

  select * into cb from public.cobrancas
  where provider = p_provider and provider_ref = p_provider_ref
  for update;

  if not found then return 'desconhecida'; end if;

  update public.cobrancas
  set status = case when p_estorno then 'estornada' else 'cancelada' end
  where id = cb.id;

  -- Estorno NÃO desfaz matrícula automaticamente. Devolver dinheiro e
  -- tirar o acesso são decisões diferentes, e a segunda pode envolver
  -- aula já usada — quem decide é a gestão, na tela.
  return 'registrada';
end;
$function$;

revoke execute on function public.cobranca_cancelada(text, text, boolean) from public, anon;
grant execute on function public.cobranca_cancelada(text, text, boolean) to authenticated;

-- ------------------------------------------------------------
-- 5. A cobrança na fila de contratações
-- ------------------------------------------------------------
-- A tela precisa do link para mandar ao aluno. Acrescentado no fim da
-- view, que é o que `create or replace` aceita sem drop.
create or replace view public.vw_solicitacoes
with (security_invoker = true) as
select
  s.id,
  s.cliente_id,
  c.nome as cliente_nome,
  c.email as cliente_email,
  s.produto_id,
  p.nome as produto_nome,
  p.tipo_produto,
  p.status as produto_status,
  s.turmas,
  s.status,
  s.origem,
  s.preco_centavos,
  s.justificativa,
  s.solicitada_em,
  s.decidida_em,
  s.motivo_decisao,
  s.matricula_id,
  s.pago_em,
  s.forma_pagamento,
  sol.nome as solicitante_nome,
  dec.nome as decisor_nome,
  cb.id as cobranca_id,
  cb.status as cobranca_status,
  cb.url_pagamento,
  cb.vencimento as cobranca_vencimento
from public.solicitacoes_contratacao s
join public.clientes c on c.id = s.cliente_id
join public.produtos p on p.id = s.produto_id
left join public.socias sol on sol.id = s.solicitada_por
left join public.socias dec on dec.id = s.decidida_por
left join lateral (
  select * from public.cobrancas x
  where x.solicitacao_id = s.id
  order by x.criada_em desc
  limit 1
) cb on true;

grant select on public.vw_solicitacoes to authenticated;

-- ------------------------------------------------------------
-- 6. CPF do aluno — pré-requisito para cobrar, não para cadastrar
-- ------------------------------------------------------------
-- `POST /customers` do Asaas exige `cpfCnpj` (é campo obrigatório na
-- API deles). O sistema nunca coletou CPF, então sem isto nenhuma
-- cobrança sai.
--
-- Nullable de propósito: lead que ainda não virou aluno não tem por que
-- informar CPF, e exigir no cadastro colocaria uma barreira no começo
-- do funil. Quem cobra é que recusa, com mensagem dizendo o que falta.
--
-- Guardado só com dígitos. O `check` pega o erro comum — telefone
-- digitado no lugar do CPF — sem fazer validação de dígito
-- verificador, que o Asaas faz de qualquer jeito e recusa na hora.
alter table public.clientes
  add column if not exists cpf text,
  add column if not exists asaas_customer_id text;

do $$
begin
  alter table public.clientes
    add constraint cpf_so_digitos check (cpf is null or cpf ~ '^\d{11}$|^\d{14}$');
exception when duplicate_object then null;
end $$;

comment on column public.clientes.cpf is
  'Só dígitos. Exigido pelo Asaas para emitir cobrança; opcional no cadastro para não barrar lead.';
comment on column public.clientes.asaas_customer_id is
  'Id do cliente no gateway. Guardado para não recriar o cadastro a cada cobrança.';

-- Normaliza junto com o e-mail: o gatilho já existe e roda antes de
-- tudo, então é o lugar natural para tirar ponto e traço do CPF.
create or replace function public.normalizar_email_cliente()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.email := nullif(lower(btrim(new.email)), '');
  new.cpf := nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '');
  return new;
end;
$function$;

-- Um CPF, um cadastro. Mesma razão do e-mail único: é identificador de
-- pessoa, e dois cadastros com o mesmo CPF quebram a cobrança.
create unique index if not exists clientes_cpf_unico
  on public.clientes (cpf) where cpf is not null;
