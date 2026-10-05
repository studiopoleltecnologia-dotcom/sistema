-- ============================================================
-- Pausa do plano
-- 03/10/2026
-- ============================================================
-- Regulamento do Aluno de 01/10, §7; contrato §8; manual interno §7. Os
-- três documentos descrevem a pausa, e o sistema **não tinha uma linha**
-- sobre ela. Decisão da gestão em 02/10: construir a estrutura.
--
--   7.1  Mensal: 1 pausa de até 15 dias a cada 6 meses.
--        Semestral: 1 pausa de até 30 dias durante os 6 ciclos.
--   7.2  Atestado de saúde: até 90 dias, **sem consumir** a pausa regular.
--   7.3  Durante a pausa, cobrança e ciclo ficam congelados. No plano por
--        créditos preserva-se o saldo do ciclo em andamento; na turma fixa,
--        o período restante do ciclo.
--   7.4  Na turma fixa a vaga **poderá** ser liberada.
--   7.5  No semestral, a pausa estende o compromisso pelos dias pausados.
--   7.6  Deve ser solicitada antes de começar e não retroage.
--
-- ## Metade do trabalho já estava feita, sem ninguém notar
--
-- `status_matricula` tem o valor **`pausada`** desde a primeira migration
-- de agenda (`20260719180000`) e **nada nunca o escreveu**. Como meia
-- dúzia de lugares exige `status = 'ativa'`, pôr a matrícula em `pausada`
-- já produz, de graça:
--
-- * `agendar_aula()` não encontra a matrícula → não dá para agendar;
-- * `processar_assinaturas()` filtra `status in ('ativa','inadimplente')`
--   → não cobra e não renova, que é o "congelado" do item 7.3;
-- * `vw_mrr` deixa de contar a receita recorrente dela.
--
-- ## ⚠️ A pausa MOVE o aniversário da cobrança
--
-- Esta é a parte que exige decisão, e vale ler.
--
-- `renovar_ciclo()` calcula `novo_inicio := data_fim + 1` e depois
-- `novo_fim := data_renovacao(novo_inicio, 1, dia_renovacao, ...)`, que
-- puxa o fim de volta para o **dia do mês** da contratação (A17).
--
-- Se a pausa só empurrasse `data_fim`, o ciclo seguinte ficaria mais
-- curto: pausa de 15 dias num plano que renova dia 15 faria o próximo
-- ciclo ir de 31/10 a 15/11 — **mês cheio pago por meio mês de aula**. A
-- pausa viraria desconto para o estúdio e prejuízo para o aluno.
--
-- Então, ao retomar, `dia_renovacao` também anda: ele passa a ser o dia do
-- novo `data_fim + 1`. É uma mudança deliberada do A17 ("renova sempre no
-- dia da contratação") — o aniversário de cobrança daquele aluno muda de
-- dia, para sempre, e é o único jeito de "congelado" significar congelado.
--
-- ## A vaga da turma fixa NÃO é liberada pelo sistema
--
-- O item 7.4 diz "poderá ser liberada". Matrícula pausada não é
-- `cancelada`, então `assentos_fixos_ocupados()` continua contando o
-- assento dela — a vaga fica guardada.
--
-- É de propósito, e segue a decisão que a gestão já tomou para a
-- inadimplência: *"não precisa ser algo no sistema. Será algo manual."*
-- Liberar a vaga de quem volta em 15 dias e não ter onde pôr a pessoa é
-- pior que a sala com um lugar vazio por duas semanas. Se a gestão quiser
-- liberar, encerra o assento à mão (`encerrar_turma_fixa`).
--
-- ## O que NÃO entra aqui
--
-- A tela. Esta migration é a estrutura: tabela, direito, pedido,
-- aprovação, ativação e retomada, com cron para os dois extremos. O
-- portal e a tela da gestão vêm depois — e é lá que o aluno vai ler "seu
-- plano está pausado até DD/MM" em vez de receber "sem créditos válidos",
-- que é a mensagem genérica que `agendar_aula()` dá hoje para quem está
-- pausado.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Os estados de uma pausa
-- ------------------------------------------------------------
do $$
begin
  create type public.status_pausa as enum (
    'solicitada',   -- o aluno pediu, a gestão ainda não decidiu
    'aprovada',     -- decidida, mas o início ainda não chegou
    'ativa',        -- em curso: a matrícula está pausada agora
    'encerrada',    -- terminou (no prazo ou por retorno antecipado)
    'recusada',
    'cancelada'     -- desistiu antes de começar
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.tipo_pausa as enum ('regular', 'atestado');
exception when duplicate_object then null;
end $$;


-- ------------------------------------------------------------
-- 2. A tabela
-- ------------------------------------------------------------
create table if not exists public.pausas_matricula (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,

  tipo public.tipo_pausa not null default 'regular',
  status public.status_pausa not null default 'solicitada',

  -- O que foi pedido.
  inicio date not null,
  fim date not null,

  -- O que de fato aconteceu: `encerrada_em` é o dia em que a matrícula
  -- voltou. Pode ser antes do `fim` (retorno antecipado), e é ele que
  -- define quantos dias a vigência ganha — não o que foi planejado.
  ativada_em date,
  encerrada_em date,
  dias_efetivos integer,

  observacao text,

  -- Retrato do que a pausa congelou, para dar para explicar depois.
  ciclo_na_pausa integer,
  data_fim_antes date,
  dia_renovacao_antes integer,
  data_fim_depois date,
  lotes_estendidos integer,

  solicitada_por uuid references auth.users(id),
  solicitada_em timestamptz not null default now(),
  decidida_por uuid references auth.users(id),
  decidida_em timestamptz,
  motivo_decisao text,

  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),

  constraint pausa_periodo_coerente check (fim >= inicio),
  -- Recusa sem motivo deixa a próxima pessoa sem saber se pode repetir o
  -- pedido — mesma regra da recusa de contratação.
  constraint pausa_recusa_tem_motivo check (
    status <> 'recusada' or nullif(btrim(coalesce(motivo_decisao, '')), '') is not null
  )
);

comment on table public.pausas_matricula is
  'Pausas do plano (regulamento §7). Guarda o que foi pedido, o que foi decidido e o retrato do que a pausa congelou — incluindo o dia de renovação anterior, porque a pausa move o aniversário da cobrança.';

comment on column public.pausas_matricula.dias_efetivos is
  'Dias que a pausa realmente durou, e portanto quantos a vigência ganhou. Sai de encerrada_em - ativada_em, não do período planejado: quem volta antes não leva o resto.';

comment on column public.pausas_matricula.dia_renovacao_antes is
  'O dia do mês em que a matrícula renovava ANTES da pausa. Guardado porque a retomada muda esse dia (ver cabeçalho) e, sem o retrato, ninguém saberia explicar por que a cobrança do aluno mudou de data.';

-- Uma pausa em curso por matrícula. Duas seria dois congelamentos
-- simultâneos, e ninguém saberia quantos dias a vigência ganhou.
create unique index if not exists pausa_em_curso_unica
  on public.pausas_matricula (matricula_id)
  where status in ('solicitada', 'aprovada', 'ativa');

create index if not exists pausas_por_status on public.pausas_matricula (status, inicio);
create index if not exists pausas_por_cliente on public.pausas_matricula (cliente_id, solicitada_em desc);

drop trigger if exists pausas_atualizada_em on public.pausas_matricula;
create trigger pausas_atualizada_em
  before update on public.pausas_matricula
  for each row execute function public.set_atualizada_em();

alter table public.pausas_matricula enable row level security;

drop policy if exists "equipe ve pausas" on public.pausas_matricula;
create policy "equipe ve pausas" on public.pausas_matricula
  for select to authenticated using (public.is_operacional());

drop policy if exists "cliente ve as proprias pausas" on public.pausas_matricula;
create policy "cliente ve as proprias pausas" on public.pausas_matricula
  for select to authenticated using (cliente_id = public.cliente_atual());

-- Escrita só pelas RPCs: uma pausa gravada pela tela poderia nascer já
-- aprovada, e aprovar é o que para a cobrança.


-- ------------------------------------------------------------
-- 3. Tem direito a pausa?
-- ------------------------------------------------------------
-- Uma conta só, porque três lugares precisam dela: o pedido, a tela que
-- decide se mostra o botão, e a aprovação.
create or replace function public.direito_a_pausa(
  p_matricula uuid,
  p_tipo public.tipo_pausa default 'regular'
)
returns table (pode boolean, motivo text, max_dias integer, proxima_liberacao date)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  m record;
  cfg record;
  ultima record;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into m from public.matriculas where id = p_matricula;
  if not found then
    return query select false, 'plano não encontrado'::text, 0, null::date;
    return;
  end if;
  select * into cfg from public.config_agendamento where id;

  -- Quanto tempo a pausa pode durar depende do tipo e do formato.
  max_dias := case
    when p_tipo = 'atestado' then coalesce(cfg.dias_pausa_atestado, 90)
    when coalesce(m.ciclos_compromisso, 1) > 1 then coalesce(cfg.dias_pausa_semestral, 30)
    else coalesce(cfg.dias_pausa_mensal, 15)
  end;

  if m.status = 'cancelada' or m.cancelada_em is not null then
    return query select false, 'este plano já está cancelado'::text, max_dias, null::date;
    return;
  end if;
  if m.status = 'pausada' then
    return query select false, 'este plano já está pausado'::text, max_dias, null::date;
    return;
  end if;
  if m.status = 'inadimplente' then
    -- Regulamento 13.4: inadimplência não é pausa. Deixar pausar aqui
    -- seria uma forma de congelar a dívida.
    return query select false,
      'há pagamento em aberto neste plano — regularize antes de pedir a pausa'::text,
      max_dias, null::date;
    return;
  end if;
  if exists (
    select 1 from public.pausas_matricula p
    where p.matricula_id = p_matricula and p.status in ('solicitada', 'aprovada', 'ativa')
  ) then
    return query select false, 'já existe uma pausa em andamento ou em análise'::text,
      max_dias, null::date;
    return;
  end if;

  -- Atestado não consome o direito regular (7.2): passa daqui.
  if p_tipo = 'atestado' then
    return query select true, null::text, max_dias, null::date;
    return;
  end if;

  -- ---- o direito regular ----
  if coalesce(m.ciclos_compromisso, 1) > 1 then
    -- Semestral: uma pausa durante o compromisso. "Durante o compromisso"
    -- é o conjunto de ciclos que começou em `ciclo_inicio_contrato`, e é
    -- por isso que a conta é por ciclo e não por data.
    select * into ultima from public.pausas_matricula p
     where p.matricula_id = p_matricula and p.tipo = 'regular'
       and p.status in ('aprovada', 'ativa', 'encerrada')
       and p.ciclo_na_pausa >= m.ciclo_inicio_contrato
     order by p.inicio desc limit 1;
    if found then
      return query select false,
        'o plano semestral permite uma pausa por compromisso, e ela já foi usada'::text,
        max_dias, null::date;
      return;
    end if;
  else
    -- Mensal: uma a cada N meses, contados do início da última.
    select * into ultima from public.pausas_matricula p
     where p.matricula_id = p_matricula and p.tipo = 'regular'
       and p.status in ('aprovada', 'ativa', 'encerrada')
     order by p.inicio desc limit 1;
    if found and ultima.inicio
        > hoje - (coalesce(cfg.meses_entre_pausas, 6) || ' months')::interval then
      return query select false,
        format('a pausa do plano mensal é permitida uma vez a cada %s meses',
               coalesce(cfg.meses_entre_pausas, 6))::text,
        max_dias,
        (ultima.inicio + (coalesce(cfg.meses_entre_pausas, 6) || ' months')::interval)::date;
      return;
    end if;
  end if;

  return query select true, null::text, max_dias, null::date;
end;
$function$;

comment on function public.direito_a_pausa(uuid, public.tipo_pausa) is
  'Se este plano pode ser pausado agora, por quantos dias, e quando o direito volta. Atestado não consome o direito regular (7.2); inadimplência não pausa (13.4).';

revoke execute on function public.direito_a_pausa(uuid, public.tipo_pausa) from public, anon;
grant execute on function public.direito_a_pausa(uuid, public.tipo_pausa) to authenticated;


-- ------------------------------------------------------------
-- 4. O aluno pede
-- ------------------------------------------------------------
create or replace function public.solicitar_pausa(
  p_matricula uuid,
  p_inicio date,
  p_fim date,
  p_tipo public.tipo_pausa default 'regular',
  p_observacao text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  m record;
  d record;
  c record;
  pr record;
  eh_cliente boolean;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  obs text := nullif(left(btrim(coalesce(p_observacao, '')), 1000), '');
  p_id uuid;
  dados jsonb;
  destino text;
begin
  if auth.uid() is null then
    raise exception 'requer sessão autenticada';
  end if;
  eh_cliente := public.is_cliente() and not public.is_socia();

  select * into m from public.matriculas where id = p_matricula for update;
  if not found then raise exception 'plano não encontrado'; end if;

  if eh_cliente then
    if m.cliente_id <> public.cliente_atual() then
      raise exception 'plano não encontrado';
    end if;
  elsif not public.is_operacional() then
    raise exception 'acesso restrito à equipe ou ao próprio aluno';
  end if;

  -- Regulamento 7.6: antes de começar, e não retroage.
  if p_inicio < hoje then
    raise exception 'a pausa precisa ser pedida antes de começar — escolha uma data a partir de hoje';
  end if;
  if p_fim < p_inicio then
    raise exception 'a data de volta tem de ser depois do início da pausa';
  end if;

  select * into d from public.direito_a_pausa(p_matricula, p_tipo);
  if not d.pode then
    raise exception '%', d.motivo;
  end if;
  if (p_fim - p_inicio + 1) > d.max_dias then
    raise exception 'a pausa pode ter no máximo % dias; foram pedidos %',
      d.max_dias, (p_fim - p_inicio + 1);
  end if;
  if p_tipo = 'atestado' and obs is null then
    raise exception 'descreva o afastamento — o atestado é analisado pela equipe';
  end if;

  insert into public.pausas_matricula
    (matricula_id, cliente_id, tipo, inicio, fim, observacao, solicitada_por)
  values (p_matricula, m.cliente_id, p_tipo, p_inicio, p_fim, obs, auth.uid())
  returning id into p_id;

  select * into c from public.clientes where id = m.cliente_id;
  select * into pr from public.produtos where id = m.plano_id;

  dados := jsonb_build_object(
    'nome', c.nome,
    'telefone', c.telefone,
    'email', c.email,
    'plano', pr.nome,
    'tipo', case when p_tipo = 'atestado' then 'Afastamento de saúde (atestado)'
                 else 'Pausa regular' end,
    'inicio', p_inicio,
    'fim', p_fim,
    'dias', (p_fim - p_inicio + 1),
    'observacao', obs,
    'solicitada_em', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI'));

  for destino in select public.emails_gestao() loop
    perform public.enfileirar_email('pausa_solicitada', destino, dados,
      'pausa:' || p_id::text || ':' || destino);
  end loop;

  -- Comprovante com a data e a hora: é o que prova que o pedido foi
  -- feito antes de a pausa começar (7.6).
  if c.email is not null then
    perform public.enfileirar_email('pausa_recebida', c.email, dados,
      'pausa-recebida:' || p_id::text);
  end if;

  return p_id;
end;
$function$;

revoke execute on function public.solicitar_pausa(uuid, date, date, public.tipo_pausa, text)
  from public, anon;
grant execute on function public.solicitar_pausa(uuid, date, date, public.tipo_pausa, text)
  to authenticated;


-- ------------------------------------------------------------
-- 5. A gestão decide
-- ------------------------------------------------------------
create or replace function public.aprovar_pausa(p_pausa uuid, p_motivo text default null)
returns public.status_pausa
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p record;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_gestao() then
    raise exception 'só a gestão aprova pausa';
  end if;

  select * into p from public.pausas_matricula where id = p_pausa for update;
  if not found then raise exception 'pausa não encontrada'; end if;
  if p.status <> 'solicitada' then
    raise exception 'esta pausa já foi decidida (%)', p.status;
  end if;

  update public.pausas_matricula
  set status = 'aprovada', decidida_por = auth.uid(), decidida_em = now(),
      motivo_decisao = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = p_pausa;

  perform public.avisar_aluno_pausa(p_pausa, 'pausa_aprovada');

  -- Aprovada com início hoje (ou atrasado): entra em vigor agora, sem
  -- esperar o cron da madrugada. Quem aprova na recepção espera que o
  -- plano pare na hora.
  if p.inicio <= hoje then
    perform public.ativar_pausa(p_pausa);
    return 'ativa';
  end if;

  return 'aprovada';
end;
$function$;

revoke execute on function public.aprovar_pausa(uuid, text) from public, anon;
grant execute on function public.aprovar_pausa(uuid, text) to authenticated;


create or replace function public.recusar_pausa(p_pausa uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p record;
  motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not public.is_gestao() then
    raise exception 'só a gestão decide pausa';
  end if;
  if motivo is null then
    raise exception 'diga por que está recusando — é o que o aluno vai ler';
  end if;

  select * into p from public.pausas_matricula where id = p_pausa for update;
  if not found then raise exception 'pausa não encontrada'; end if;
  if p.status <> 'solicitada' then
    raise exception 'esta pausa já foi decidida (%)', p.status;
  end if;

  update public.pausas_matricula
  set status = 'recusada', decidida_por = auth.uid(), decidida_em = now(),
      motivo_decisao = motivo
  where id = p_pausa;

  perform public.avisar_aluno_pausa(p_pausa, 'pausa_recusada');
end;
$function$;

revoke execute on function public.recusar_pausa(uuid, text) from public, anon;
grant execute on function public.recusar_pausa(uuid, text) to authenticated;


-- Desistir, enquanto não começou.
create or replace function public.cancelar_pausa(p_pausa uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare p record;
begin
  select * into p from public.pausas_matricula where id = p_pausa for update;
  if not found then raise exception 'pausa não encontrada'; end if;

  if public.is_cliente() and not public.is_socia() then
    if p.cliente_id <> public.cliente_atual() then
      raise exception 'esta pausa não é sua';
    end if;
  elsif auth.uid() is not null and not public.is_operacional() then
    raise exception 'acesso restrito';
  end if;

  if p.status not in ('solicitada', 'aprovada') then
    raise exception 'esta pausa já está em curso ou encerrada (%) — para voltar antes do prazo, use o retorno antecipado', p.status;
  end if;

  update public.pausas_matricula
  set status = 'cancelada', decidida_em = now(), decidida_por = auth.uid()
  where id = p_pausa;
end;
$function$;

revoke execute on function public.cancelar_pausa(uuid) from public, anon;
grant execute on function public.cancelar_pausa(uuid) to authenticated;


-- ------------------------------------------------------------
-- 6. O aviso ao aluno
-- ------------------------------------------------------------
create or replace function public.avisar_aluno_pausa(p_pausa uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare p record; c record; pr record; m record;
begin
  select * into p from public.pausas_matricula where id = p_pausa;
  if not found then return; end if;
  select * into m from public.matriculas where id = p.matricula_id;
  select * into c from public.clientes where id = p.cliente_id;
  select * into pr from public.produtos where id = m.plano_id;
  if c.email is null then return; end if;

  perform public.enfileirar_email(p_tipo, c.email,
    jsonb_build_object(
      'nome', c.nome,
      'plano', pr.nome,
      'inicio', p.inicio,
      'fim', coalesce(p.encerrada_em, p.fim),
      'dias', coalesce(p.dias_efetivos, p.fim - p.inicio + 1),
      'motivo', p.motivo_decisao,
      'nova_vigencia', p.data_fim_depois),
    p_tipo || ':' || p_pausa::text);
end;
$function$;

revoke execute on function public.avisar_aluno_pausa(uuid, text) from public, anon;


-- ------------------------------------------------------------
-- 7. Ativar: é aqui que o plano congela
-- ------------------------------------------------------------
create or replace function public.ativar_pausa(p_pausa uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p record;
  m record;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is not null and not public.is_operacional() then
    raise exception 'acesso restrito';
  end if;

  select * into p from public.pausas_matricula where id = p_pausa for update;
  if not found then raise exception 'pausa não encontrada'; end if;
  if p.status <> 'aprovada' then
    raise exception 'só pausa aprovada entra em vigor (esta está %)', p.status;
  end if;

  select * into m from public.matriculas where id = p.matricula_id for update;

  -- Guarda o retrato ANTES de mexer: é o que permite explicar depois por
  -- que a vigência e o dia de cobrança mudaram.
  update public.pausas_matricula
  set status = 'ativa',
      ativada_em = greatest(p.inicio, hoje),
      ciclo_na_pausa = m.ciclo_atual,
      data_fim_antes = m.data_fim,
      dia_renovacao_antes = m.dia_renovacao
  where id = p_pausa;

  -- `pausada` é o que para tudo: agendar_aula não acha a matrícula,
  -- processar_assinaturas não cobra nem renova, e o MRR deixa de contar.
  update public.matriculas set status = 'pausada' where id = m.id;

  perform public.avisar_aluno_pausa(p_pausa, 'pausa_iniciada');
end;
$function$;

revoke execute on function public.ativar_pausa(uuid) from public, anon;
grant execute on function public.ativar_pausa(uuid) to authenticated;


-- ------------------------------------------------------------
-- 8. Retomar: a vigência e o aniversário andam
-- ------------------------------------------------------------
create or replace function public.encerrar_pausa(p_pausa uuid, p_em date default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p record;
  m record;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  fim_real date;
  dias integer;
  novo_fim date;
  n_lotes integer := 0;
begin
  if auth.uid() is not null and not public.is_operacional() then
    raise exception 'acesso restrito';
  end if;

  select * into p from public.pausas_matricula where id = p_pausa for update;
  if not found then raise exception 'pausa não encontrada'; end if;
  if p.status <> 'ativa' then
    raise exception 'esta pausa não está em curso (%)', p.status;
  end if;

  select * into m from public.matriculas where id = p.matricula_id for update;

  -- Quem volta antes não leva o resto: os dias contados são os vividos.
  fim_real := least(coalesce(p_em, hoje), p.fim);
  if fim_real < p.ativada_em then fim_real := p.ativada_em; end if;
  dias := fim_real - p.ativada_em;

  novo_fim := m.data_fim + dias;

  -- ⚠️ O aniversário da cobrança anda junto. Sem isto, `renovar_ciclo()`
  -- calcula `novo_inicio := data_fim + 1` e puxa o fim de volta para o
  -- `dia_renovacao` antigo — o ciclo seguinte ficaria mais curto e o aluno
  -- pagaria mês cheio por meio mês. Ver o cabeçalho.
  update public.matriculas
  set status = 'ativa',
      data_fim = novo_fim,
      dia_renovacao = extract(day from (novo_fim + 1))::integer
  where id = m.id;

  -- Regulamento 7.3: preserva o saldo do ciclo em andamento. Os lotes que
  -- estavam válidos quando a pausa começou ganham os mesmos dias — senão
  -- o crédito morreria durante a pausa, que é o oposto de "preservado".
  update public.creditos_lotes l
  set validade = l.validade + dias
  where l.matricula_id = m.id
    and l.validade >= p.ativada_em;
  get diagnostics n_lotes = row_count;

  update public.pausas_matricula
  set status = 'encerrada',
      encerrada_em = fim_real,
      dias_efetivos = dias,
      data_fim_depois = novo_fim,
      lotes_estendidos = n_lotes
  where id = p_pausa;

  perform public.avisar_aluno_pausa(p_pausa, 'pausa_encerrada');

  return dias;
end;
$function$;

comment on function public.encerrar_pausa(uuid, date) is
  'Retoma o plano: devolve a matrícula para ativa, estende a vigência pelos dias efetivamente pausados, MOVE o dia de renovação (ver cabeçalho da migration) e estende a validade dos créditos que a pausa congelou.';

revoke execute on function public.encerrar_pausa(uuid, date) from public, anon;
grant execute on function public.encerrar_pausa(uuid, date) to authenticated;


-- ------------------------------------------------------------
-- 9. O cron dos dois extremos
-- ------------------------------------------------------------
-- Uma função só para começar e terminar: as duas pontas são o mesmo
-- assunto, e separá-las em dois crons faria uma rodar sem a outra no dia
-- em que alguém mexesse no agendamento.
create or replace function public.processar_pausas()
returns table (acao text, pausa_id uuid, matricula_id uuid, dias integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r record;
  d integer;
begin
  if auth.uid() is not null and not public.is_operacional() then
    raise exception 'acesso restrito';
  end if;

  -- Começa o que chegou a hora de começar.
  for r in
    select * from public.pausas_matricula
     where status = 'aprovada' and inicio <= hoje
     order by inicio
  loop
    perform public.ativar_pausa(r.id);
    return query select 'ativada'::text, r.id, r.matricula_id, null::integer;
  end loop;

  -- Encerra o que passou do prazo. `fim < hoje` e não `<=`: o último dia
  -- da pausa é dia pausado, então a volta é no dia seguinte.
  for r in
    select * from public.pausas_matricula
     where status = 'ativa' and fim < hoje
     order by fim
  loop
    d := public.encerrar_pausa(r.id, r.fim);
    return query select 'encerrada'::text, r.id, r.matricula_id, d;
  end loop;
end;
$function$;

comment on function public.processar_pausas() is
  'Começa as pausas aprovadas que chegaram na data e encerra as que passaram do prazo. Roda uma vez por dia, antes do processamento de assinaturas.';

revoke execute on function public.processar_pausas() from public, anon;
grant execute on function public.processar_pausas() to authenticated;

-- Às 7h, uma hora antes de `processar-assinaturas` (8h): a matrícula que
-- volta hoje precisa estar `ativa` antes de o motor de cobrança olhar
-- para ela, e a que entra em pausa hoje precisa estar `pausada` antes.
select cron.unschedule('processar-pausas')
  where exists (select 1 from cron.job where jobname = 'processar-pausas');

select cron.schedule(
  'processar-pausas',
  '0 7 * * *',
  $$select count(*) from public.processar_pausas()$$
);


-- ------------------------------------------------------------
-- 10. As telas
-- ------------------------------------------------------------
create or replace view public.vw_pausas
with (security_invoker = true) as
select
  p.id,
  p.matricula_id,
  p.cliente_id,
  c.nome as cliente_nome,
  c.email as cliente_email,
  c.telefone as cliente_telefone,
  pr.nome as plano_nome,
  (coalesce(pr.ciclos_compromisso, 1) > 1) as semestral,
  (coalesce(pr.turmas_fixas, 0) > 0) as turma_fixa,
  p.tipo,
  p.status,
  p.inicio,
  p.fim,
  (p.fim - p.inicio + 1) as dias_pedidos,
  p.ativada_em,
  p.encerrada_em,
  p.dias_efetivos,
  p.observacao,
  p.motivo_decisao,
  p.data_fim_antes,
  p.data_fim_depois,
  p.dia_renovacao_antes,
  p.lotes_estendidos,
  p.solicitada_em,
  p.decidida_em,
  dec.nome as decisor_nome
from public.pausas_matricula p
join public.clientes c on c.id = p.cliente_id
join public.matriculas m on m.id = p.matricula_id
join public.produtos pr on pr.id = m.plano_id
left join public.socias dec on dec.id = p.decidida_por;

grant select on public.vw_pausas to authenticated;
