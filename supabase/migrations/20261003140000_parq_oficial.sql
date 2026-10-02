-- ============================================================
-- PAR-Q, Termo de Responsabilidade e documento médico
-- 30/09/2026
-- ============================================================
-- Fonte: `PAR-Q_Studio_Pole_L.docx` (entregue pela gestão em 30/09/2026),
-- cujo apêndice interno é a especificação: 10 perguntas Sim/Não
-- obrigatórias, Termo de Responsabilidade aceito separadamente, bloqueio
-- até atestado quando houver qualquer "Sim", renovação anual com histórico
-- preservado, e aceite do responsável legal para menor de 18.
--
-- Base jurídica citada no documento: **Lei Estadual RJ nº 6.765/2014**,
-- anexos I e II, com renovação anual. O documento pede revisão jurídica
-- antes de produção — é pendência registrada, não resolvida aqui.
--
-- ## O texto das perguntas não é nosso
--
-- As 10 perguntas entram **literalmente** como estão no documento. O
-- apêndice é explícito ao pedir que não se altere o conteúdo
-- jurídico/médico, e a redação delas difere da do PAR-Q clássico em
-- pontos que importam (a 6 pergunta sobre medicação de uso contínuo em
-- geral, não só cardíaca; a 8 sobre tratamento contínuo).
--
-- ## Versão derivada, não digitada
--
-- `parq_versoes` guarda a versão, e as perguntas pendem dela. Editar
-- pergunta não é permitido: cria-se uma versão nova. Assim, "qual
-- questionário essa pessoa respondeu" tem resposta exata para sempre —
-- exigência do item 7 do pedido ("não sobrescrever o formulário anterior").
--
-- ## O estado que bloqueia a prática
--
-- Do documento e do pedido, sete situações. Cinco são estado gravado,
-- duas são derivadas (e é por isso que não estão no enum):
--
--   nao_preenchido        → não existe linha
--   apto                  → todas "Não" + Termo aceito
--   aguardando_documento  → alguma "Sim"
--   documento_enviado     → atestado anexado, esperando a gestão
--   documento_aprovado    → atestado validado → libera
--   documento_recusado    → volta a precisar de documento
--   expirado              → `validade` no passado, qualquer que seja o estado
--
-- "Apto pelo fluxo PAR-Q" e não "liberado medicamente": o próprio
-- documento pede para evitar a segunda expressão.
--
-- ## Dado de saúde
--
-- LGPD art. 11, categoria especial. Policy de `is_gestao()` — **não** de
-- `is_operacional()`, porque a secretaria faz o trabalho dela sem ler
-- resposta de saúde. A professora não vê nada. O apêndice pede registro de
-- acesso: `parq_acessos` grava quem abriu o quê.
--
-- ⚠️ `config_cadastro.exigir_parq` nasce **false**. Ligar antes de os
-- alunos vindos do Wix responderem bloquearia a agenda de todos no mesmo
-- dia. É passo de runbook.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Versões do questionário
-- ------------------------------------------------------------
create table if not exists public.parq_versoes (
  id uuid primary key default gen_random_uuid(),
  versao text not null unique,
  vigente_desde date not null,
  vigente boolean not null default false,

  /** O bloco "IMPORTANTE" que abre o formulário. */
  aviso_html text not null,
  /** O Termo de Responsabilidade, aceito junto com as respostas. */
  termo_html text not null,
  /** As três mensagens de desfecho do documento. */
  mensagem_apto text not null,
  mensagem_atencao text not null,
  mensagem_renovacao text not null,
  mensagem_menor text not null,

  criada_em timestamptz not null default now()
);

comment on table public.parq_versoes is
  'Versões do PAR-Q. Editar pergunta não é permitido: publica-se versão nova, e as respostas antigas continuam apontando para a versão que responderam.';

create unique index if not exists parq_versao_vigente_unica
  on public.parq_versoes (vigente) where vigente;

alter table public.parq_versoes enable row level security;

drop policy if exists "todos leem versao vigente do parq" on public.parq_versoes;
create policy "todos leem versao vigente do parq" on public.parq_versoes
  for select to authenticated using (vigente or public.is_socia());

drop policy if exists "gestao gerencia versoes do parq" on public.parq_versoes;
create policy "gestao gerencia versoes do parq" on public.parq_versoes
  for all to authenticated
  using (public.is_gestao()) with check (public.is_gestao());


-- ------------------------------------------------------------
-- 2. As perguntas
-- ------------------------------------------------------------
create table if not exists public.parq_perguntas (
  id uuid primary key default gen_random_uuid(),
  versao_id uuid not null references public.parq_versoes(id) on delete cascade,
  ordem integer not null,
  texto text not null,

  /**
   * Qual resposta acende o sinal. Nas 10 do documento é sempre o "Sim",
   * mas configurável evita que uma pergunta redigida ao contrário, numa
   * versão futura, exija código.
   */
  atencao_quando boolean not null default true,

  unique (versao_id, ordem)
);

comment on table public.parq_perguntas is
  'Perguntas de uma versão do PAR-Q, literais como no documento oficial. Não alterar o conteúdo jurídico/médico — versão nova, se preciso.';

alter table public.parq_perguntas enable row level security;

-- Pergunta não é dado de saúde: o aluno precisa lê-las para responder.
drop policy if exists "todos leem perguntas do parq" on public.parq_perguntas;
create policy "todos leem perguntas do parq" on public.parq_perguntas
  for select to authenticated
  using (
    exists (select 1 from public.parq_versoes v
            where v.id = versao_id and (v.vigente or public.is_socia()))
  );

drop policy if exists "gestao gerencia perguntas do parq" on public.parq_perguntas;
create policy "gestao gerencia perguntas do parq" on public.parq_perguntas
  for all to authenticated
  using (public.is_gestao()) with check (public.is_gestao());


-- ------------------------------------------------------------
-- 3. As respostas
-- ------------------------------------------------------------
do $$
begin
  create type public.status_parq as enum (
    'apto',
    'aguardando_documento',
    'documento_enviado',
    'documento_aprovado',
    'documento_recusado'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.parq_respostas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  versao_id uuid not null references public.parq_versoes(id),
  /** Retrato do rótulo: sobrevive a qualquer edição da linha da versão. */
  versao text not null,

  respondido_em timestamptz not null default now(),
  /** Renovação anual (documento oficial + Lei RJ 6.765/2014). */
  validade date not null,

  /** [{ "pergunta_id": uuid, "ordem": 1, "texto": "…", "resposta": true }] */
  respostas jsonb not null,
  /** Quantas vieram "Sim" — evita reabrir o jsonb para saber o desfecho. */
  respostas_sim integer not null,

  status public.status_parq not null,

  /** Aceite do Termo de Responsabilidade, junto com as respostas. */
  termo_aceito_em timestamptz not null default now(),
  termo_hash text not null,
  ip text,
  user_agent text,
  /** Quem estava autenticado — pode ser o responsável, num cadastro de menor. */
  aceito_por uuid,

  /** Menor de 18: o documento exige identificação e aceite do responsável. */
  responsavel_nome text,
  responsavel_cpf text,
  responsavel_vinculo text,
  responsavel_aceito_em timestamptz,

  observacoes text,
  criada_em timestamptz not null default now()
);

comment on table public.parq_respostas is
  'PAR-Q respondido, com o Termo de Responsabilidade aceito. DADO DE SAÚDE (LGPD art. 11): policy de is_gestao(), nunca is_operacional(); a professora não vê. Nunca sobrescrito — renovação é linha nova.';

comment on column public.parq_respostas.status is
  'apto = todas "Não" + Termo. aguardando_documento = alguma "Sim". "não preenchido" é a AUSÊNCIA de linha e "expirado" é validade no passado — nenhum dos dois é estado gravado.';

create index if not exists parq_resposta_por_cliente
  on public.parq_respostas (cliente_id, respondido_em desc);

alter table public.parq_respostas enable row level security;

drop policy if exists "aluno le o proprio parq" on public.parq_respostas;
create policy "aluno le o proprio parq" on public.parq_respostas
  for select to authenticated
  using (cliente_id = public.cliente_atual());

drop policy if exists "gestao le parq" on public.parq_respostas;
create policy "gestao le parq" on public.parq_respostas
  for select to authenticated using (public.is_gestao());

-- Sem policy de insert/update: escrita só pelas RPCs. Histórico de saúde
-- não é tabela que se edita por PostgREST.


-- ------------------------------------------------------------
-- 4. Documento médico
-- ------------------------------------------------------------
create table if not exists public.parq_documentos (
  id uuid primary key default gen_random_uuid(),
  resposta_id uuid not null references public.parq_respostas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,

  /** Caminho no Storage (bucket privado `atestados`). Nunca URL pública. */
  arquivo_path text not null,
  arquivo_nome text not null,
  /** Data de emissão do atestado, informada por quem envia. */
  emitido_em date,

  enviado_em timestamptz not null default now(),
  enviado_por uuid,

  /** null = ainda não avaliado. */
  aprovado boolean,
  avaliado_em timestamptz,
  avaliado_por uuid references public.socias(id),
  /** Obrigatório na recusa: é o que o aluno lê para saber o que refazer. */
  motivo text,

  /** Até quando o atestado vale, quando o próprio documento disser. */
  valido_ate date
);

comment on table public.parq_documentos is
  'Atestados de aptidão física. Documentos anteriores são PRESERVADOS (exigência do apêndice do PAR-Q): reenvio é linha nova, não update.';

create index if not exists parq_documento_por_resposta
  on public.parq_documentos (resposta_id, enviado_em desc);

alter table public.parq_documentos enable row level security;

drop policy if exists "aluno le os proprios atestados" on public.parq_documentos;
create policy "aluno le os proprios atestados" on public.parq_documentos
  for select to authenticated
  using (cliente_id = public.cliente_atual());

drop policy if exists "gestao le atestados" on public.parq_documentos;
create policy "gestao le atestados" on public.parq_documentos
  for select to authenticated using (public.is_gestao());


-- ------------------------------------------------------------
-- 5. Registro de acesso ao dado de saúde
-- ------------------------------------------------------------
-- "Dados de saúde são sensíveis: limitar acesso no painel às pessoas que
-- realmente precisam consultá-los e registrar acessos quando possível"
-- (apêndice do PAR-Q). O limite é a policy; o registro é esta tabela.
create table if not exists public.parq_acessos (
  id bigserial primary key,
  resposta_id uuid not null references public.parq_respostas(id) on delete cascade,
  quem uuid not null,
  em timestamptz not null default now()
);

comment on table public.parq_acessos is
  'Quem abriu o PAR-Q de quem, e quando. Append-only, pedido pelo apêndice do documento oficial.';

create index if not exists parq_acesso_por_resposta on public.parq_acessos (resposta_id, em desc);

alter table public.parq_acessos enable row level security;

drop policy if exists "gestao le acessos ao parq" on public.parq_acessos;
create policy "gestao le acessos ao parq" on public.parq_acessos
  for select to authenticated using (public.is_gestao());


-- ------------------------------------------------------------
-- 6. A situação do PAR-Q de um aluno
-- ------------------------------------------------------------
-- Uma conta só, usada pelo portal, pela gestão e pelo agendamento. Devolve
-- o veredito **sem devolver resposta nenhuma**: quem checa no fluxo de
-- reserva não precisa enxergar dado de saúde.
create or replace function public.parq_situacao(p_cliente uuid)
returns table(
  situacao text,
  resposta_id uuid,
  versao text,
  respondido_em timestamptz,
  validade date,
  /** true quando a prática está liberada por este PAR-Q. */
  liberado boolean,
  /** Mensagem própria do desfecho, na voz do documento oficial. */
  mensagem text
)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  r record;
  v record;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  vigente text;
begin
  select pv.versao into vigente from public.parq_versoes pv where pv.vigente;

  select * into r
  from public.parq_respostas x
  where x.cliente_id = p_cliente
  order by x.respondido_em desc
  limit 1;

  if not found then
    select * into v from public.parq_versoes where vigente;
    return query select 'nao_preenchido'::text, null::uuid, null::text, null::timestamptz,
      null::date, false,
      'Preencha o PAR-Q antes da sua primeira aula.'::text;
    return;
  end if;

  select * into v from public.parq_versoes where id = r.versao_id;

  -- Expirado vem antes de tudo: PAR-Q vencido não libera, qualquer que
  -- fosse o estado. Versão do questionário mudou = também precisa refazer,
  -- porque as perguntas não são mais as mesmas.
  if r.validade < hoje or (vigente is not null and r.versao <> vigente) then
    return query select 'expirado'::text, r.id, r.versao, r.respondido_em, r.validade, false,
      v.mensagem_renovacao;
    return;
  end if;

  return query select
    r.status::text,
    r.id,
    r.versao,
    r.respondido_em,
    r.validade,
    r.status in ('apto', 'documento_aprovado'),
    case r.status
      when 'apto' then v.mensagem_apto
      when 'documento_aprovado' then
        'Documento médico aprovado. Você está liberado para a prática.'
      when 'documento_enviado' then
        'Recebemos seu documento médico. A equipe vai conferir e liberar seu cadastro.'
      when 'documento_recusado' then
        coalesce(
          (select 'Seu documento médico não pôde ser aceito: ' || d.motivo
             from public.parq_documentos d
             where d.resposta_id = r.id and d.aprovado is false
             order by d.avaliado_em desc limit 1),
          'Seu documento médico não pôde ser aceito. Envie outro.')
      else v.mensagem_atencao
    end;
end;
$function$;

comment on function public.parq_situacao(uuid) is
  'Situação do PAR-Q: nao_preenchido | apto | aguardando_documento | documento_enviado | documento_aprovado | documento_recusado | expirado. Nenhuma resposta de saúde sai daqui.';

revoke execute on function public.parq_situacao(uuid) from public, anon;
grant execute on function public.parq_situacao(uuid) to authenticated;


-- ------------------------------------------------------------
-- 7. Responder
-- ------------------------------------------------------------
create or replace function public.responder_parq(
  p_respostas jsonb,
  p_aceita_termo boolean,
  p_observacoes text default null,
  p_cliente uuid default null,
  p_responsavel_nome text default null,
  p_responsavel_cpf text default null,
  p_responsavel_vinculo text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cl uuid;
  v record;
  cliente record;
  n_perguntas integer;
  n_respondidas integer;
  n_sim integer;
  meses integer;
  menor boolean;
  headers json;
  novo_status public.status_parq;
  agora timestamptz := now();
  id_novo uuid;
begin
  -- `auth.uid() is null` é contexto de serviço (import do PAR-Q de papel
  -- que já existe em pasta, migration, teste), e segue a convenção de
  -- `matricular_produto()`. Nele o aluno é obrigatório, porque não há
  -- sessão de onde deduzir.
  if auth.uid() is null then
    cl := p_cliente;
    if cl is null then raise exception 'informe de qual aluno é o questionário'; end if;
  elsif public.is_cliente() then
    cl := public.cliente_atual();
    if p_cliente is not null and p_cliente <> cl then
      raise exception 'você só pode responder o seu próprio questionário';
    end if;
  elsif public.is_socia() then
    -- A equipe digita o PAR-Q de papel preenchido na recepção.
    cl := p_cliente;
    if cl is null then raise exception 'informe de qual aluno é o questionário'; end if;
  else
    raise exception 'acesso restrito';
  end if;

  if not coalesce(p_aceita_termo, false) then
    raise exception 'é necessário aceitar o Termo de Responsabilidade para concluir o PAR-Q';
  end if;

  select * into v from public.parq_versoes where vigente;
  if not found then
    raise exception 'nenhuma versão de PAR-Q vigente';
  end if;

  select * into cliente from public.clientes where id = cl;
  if not found then raise exception 'aluno inexistente'; end if;

  -- Menor de 18: o documento exige que o questionário e o termo sejam
  -- aceitos PELO responsável, com identificação e vínculo. Sem data de
  -- nascimento não há como saber, e a resposta segura é exigir.
  menor := cliente.data_nascimento is null
        or cliente.data_nascimento > ((now() at time zone 'America/Sao_Paulo')::date - interval '18 years');

  if menor then
    if nullif(btrim(coalesce(p_responsavel_nome, '')), '') is null
       or nullif(btrim(coalesce(p_responsavel_cpf, '')), '') is null
       or nullif(btrim(coalesce(p_responsavel_vinculo, '')), '') is null then
      if cliente.data_nascimento is null then
        raise exception 'informe a data de nascimento do aluno no cadastro antes de preencher o PAR-Q';
      end if;
      raise exception 'aluno menor de 18 anos: o PAR-Q e o Termo precisam do nome, CPF e vínculo do responsável legal';
    end if;
    if not public.cpf_valido(p_responsavel_cpf) then
      raise exception 'o CPF do responsável não é válido';
    end if;
  end if;

  if jsonb_typeof(p_respostas) <> 'array' then
    raise exception 'respostas devem vir como lista';
  end if;

  select count(*) into n_perguntas from public.parq_perguntas where versao_id = v.id;

  -- "Não permitir envio com pergunta em branco" (apêndice do documento).
  select count(*) into n_respondidas
  from public.parq_perguntas q
  where q.versao_id = v.id
    and exists (
      select 1 from jsonb_array_elements(p_respostas) e
      where (e->>'pergunta_id')::uuid = q.id
        and jsonb_typeof(e->'resposta') = 'boolean'
    );

  if n_respondidas <> n_perguntas then
    raise exception 'responda todas as % perguntas (faltaram %)',
      n_perguntas, n_perguntas - n_respondidas;
  end if;

  -- O desfecho é calculado NO BANCO. O front não decide se alguém está apto.
  select count(*) into n_sim
  from public.parq_perguntas q
  join jsonb_array_elements(p_respostas) e on (e->>'pergunta_id')::uuid = q.id
  where q.versao_id = v.id and (e->'resposta')::boolean = q.atencao_quando;

  novo_status := case when n_sim = 0 then 'apto' else 'aguardando_documento' end;

  meses := coalesce((select validade_parq_meses from public.config_cadastro where id), 12);

  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    headers := null;
  end;

  insert into public.parq_respostas (
    cliente_id, versao_id, versao, respondido_em, validade,
    respostas, respostas_sim, status,
    termo_aceito_em, termo_hash, ip, user_agent, aceito_por,
    responsavel_nome, responsavel_cpf, responsavel_vinculo, responsavel_aceito_em,
    observacoes
  ) values (
    cl, v.id, v.versao, agora,
    ((now() at time zone 'America/Sao_Paulo')::date + (meses || ' months')::interval)::date,
    p_respostas, n_sim, novo_status,
    agora, md5(v.termo_html),
    split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1),
    left(coalesce(headers->>'user-agent', ''), 400),
    auth.uid(),
    nullif(btrim(coalesce(p_responsavel_nome, '')), ''),
    nullif(btrim(coalesce(p_responsavel_cpf, '')), ''),
    nullif(btrim(coalesce(p_responsavel_vinculo, '')), ''),
    case when menor then agora end,
    nullif(btrim(coalesce(p_observacoes, '')), '')
  )
  returning id into id_novo;

  return id_novo;
end;
$function$;

comment on function public.responder_parq(jsonb, boolean, text, uuid, text, text, text) is
  'Grava o PAR-Q e o aceite do Termo. Exige todas as perguntas, calcula o desfecho no banco e exige responsável legal para menor de 18. Renovação é linha nova: nada é sobrescrito.';

revoke execute on function public.responder_parq(jsonb, boolean, text, uuid, text, text, text)
  from public, anon;
grant execute on function public.responder_parq(jsonb, boolean, text, uuid, text, text, text)
  to authenticated;


-- ------------------------------------------------------------
-- 8. Enviar o atestado
-- ------------------------------------------------------------
create or replace function public.enviar_atestado_parq(
  p_resposta uuid,
  p_arquivo_path text,
  p_arquivo_nome text,
  p_emitido_em date default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r record;
  id_novo uuid;
begin
  select * into r from public.parq_respostas where id = p_resposta;
  if not found then raise exception 'PAR-Q inexistente'; end if;

  -- Contexto de serviço (import de atestado que já está em pasta) passa,
  -- como em `matricular_produto()`.
  if auth.uid() is not null then
    if public.is_cliente() then
      if r.cliente_id <> public.cliente_atual() then
        raise exception 'PAR-Q de outra pessoa';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito';
    end if;
  end if;

  if r.status = 'apto' then
    raise exception 'este PAR-Q não exige atestado';
  end if;

  insert into public.parq_documentos
    (resposta_id, cliente_id, arquivo_path, arquivo_nome, emitido_em, enviado_por)
  values (r.id, r.cliente_id, p_arquivo_path, p_arquivo_nome, p_emitido_em, auth.uid())
  returning id into id_novo;

  -- Reenvio depois de recusa volta o PAR-Q para a fila da gestão; o
  -- documento recusado FICA (o apêndice pede preservar os anteriores).
  update public.parq_respostas set status = 'documento_enviado' where id = r.id;

  return id_novo;
end;
$function$;

revoke execute on function public.enviar_atestado_parq(uuid, text, text, date) from public, anon;
grant execute on function public.enviar_atestado_parq(uuid, text, text, date) to authenticated;


-- ------------------------------------------------------------
-- 9. Avaliar o atestado
-- ------------------------------------------------------------
create or replace function public.avaliar_atestado_parq(
  p_documento uuid,
  p_aprovado boolean,
  p_motivo text default null,
  p_valido_ate date default null
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  d record;
begin
  -- Mesmo recorte de `confirmar_pagamento_contratacao()`: pela tela só a
  -- gestão; contexto de serviço (import, job) passa.
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'avaliar documento médico é restrito à gestão';
  end if;

  select * into d from public.parq_documentos where id = p_documento;
  if not found then raise exception 'documento inexistente'; end if;

  -- Na recusa o motivo é obrigatório: é o que o aluno lê para saber o que
  -- refazer, e sem ele a recusa é um beco sem saída.
  if not p_aprovado and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'informe o motivo da recusa — o aluno vê essa mensagem';
  end if;

  update public.parq_documentos
  set aprovado = p_aprovado,
      avaliado_em = now(),
      avaliado_por = auth.uid(),
      motivo = nullif(btrim(coalesce(p_motivo, '')), ''),
      valido_ate = p_valido_ate
  where id = p_documento;

  -- Cast explícito: um `case` produz `text`, e o Postgres não converte
  -- para o enum sozinho (um literal nu, sim — por isso o update de
  -- `enviar_atestado_parq` passa e este não passava).
  update public.parq_respostas
  set status = (case when p_aprovado then 'documento_aprovado'
                     else 'documento_recusado' end)::public.status_parq
  where id = d.resposta_id;

  return true;
end;
$function$;

revoke execute on function public.avaliar_atestado_parq(uuid, boolean, text, date) from public, anon;
grant execute on function public.avaliar_atestado_parq(uuid, boolean, text, date) to authenticated;


-- ------------------------------------------------------------
-- 10. Ler o PAR-Q (com registro de acesso)
-- ------------------------------------------------------------
-- A gestão lê as respostas por aqui, e não por select na tabela, para o
-- acesso ficar registrado. A policy de select continua existindo como
-- última linha de defesa.
create or replace function public.ler_parq(p_resposta uuid)
returns table(
  cliente_id uuid,
  versao text,
  respondido_em timestamptz,
  validade date,
  status text,
  respostas jsonb,
  observacoes text,
  responsavel_nome text,
  responsavel_cpf text,
  responsavel_vinculo text,
  termo_aceito_em timestamptz,
  ip text
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_gestao() then
    raise exception 'consulta de PAR-Q é restrita à gestão';
  end if;

  insert into public.parq_acessos (resposta_id, quem) values (p_resposta, auth.uid());

  return query
  select r.cliente_id, r.versao, r.respondido_em, r.validade, r.status::text,
         r.respostas, r.observacoes,
         r.responsavel_nome, r.responsavel_cpf, r.responsavel_vinculo,
         r.termo_aceito_em, r.ip
  from public.parq_respostas r where r.id = p_resposta;
end;
$function$;

comment on function public.ler_parq(uuid) is
  'Leitura das respostas de saúde pela gestão, com registro em parq_acessos. Não é volátil por acaso: ela escreve o log de acesso.';

revoke execute on function public.ler_parq(uuid) from public, anon;
grant execute on function public.ler_parq(uuid) to authenticated;


-- ------------------------------------------------------------
-- 11. Configuração
-- ------------------------------------------------------------
alter table public.config_cadastro
  add column if not exists exigir_parq boolean not null default false,
  add column if not exists validade_parq_meses integer not null default 12;

comment on column public.config_cadastro.exigir_parq is
  'Liga o bloqueio de agendamento por PAR-Q. Nasce FALSE: ligar antes de os alunos vindos do Wix responderem bloquearia a agenda de todos no mesmo dia.';

comment on column public.config_cadastro.validade_parq_meses is
  'Validade do PAR-Q. 12 meses — renovação anual, conforme o documento oficial e a Lei RJ 6.765/2014.';

do $$
begin
  alter table public.config_cadastro
    add constraint validade_parq_razoavel check (validade_parq_meses between 1 and 60);
exception when duplicate_object then null;
end $$;


-- ------------------------------------------------------------
-- 12. Autorização de imagem — preferência separada
-- ------------------------------------------------------------
-- Item 9 do pedido, e regulamento 11.4 ("quem preferir não aparecer marca
-- isso na ficha, a qualquer momento, sem precisar justificar").
--
-- Fica FORA do aceite do contrato de propósito: consentimento embutido em
-- aceite obrigatório não é consentimento livre, e o regulamento promete
-- que é revogável. `null` = nunca respondeu, e é diferente de "não
-- autorizo" — só a resposta explícita autoriza.
alter table public.clientes
  add column if not exists autoriza_imagem boolean,
  add column if not exists autoriza_imagem_em timestamptz;

comment on column public.clientes.autoriza_imagem is
  'Uso de imagem em divulgação. null = não respondeu (trate como NÃO autorizado). Preferência separada do contrato, revogável a qualquer momento (regulamento 11.4).';

create or replace function public.definir_autorizacao_imagem(p_autoriza boolean, p_cliente uuid default null)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cl uuid;
begin
  if public.is_cliente() then
    cl := public.cliente_atual();
    if p_cliente is not null and p_cliente <> cl then
      raise exception 'você só pode alterar a sua própria preferência';
    end if;
  elsif public.is_socia() then
    cl := p_cliente;
    if cl is null then raise exception 'informe o aluno'; end if;
  else
    raise exception 'acesso restrito';
  end if;

  if p_autoriza is null then
    raise exception 'responda sim ou não';
  end if;

  update public.clientes
  set autoriza_imagem = p_autoriza, autoriza_imagem_em = now()
  where id = cl;

  return true;
end;
$function$;

revoke execute on function public.definir_autorizacao_imagem(boolean, uuid) from public, anon;
grant execute on function public.definir_autorizacao_imagem(boolean, uuid) to authenticated;


-- ------------------------------------------------------------
-- 13. Responsável legal no cadastro
-- ------------------------------------------------------------
-- Regulamento 11.3 e o bloco de menores do PAR-Q. Fica em `clientes`
-- porque vale para o aluno, não para um PAR-Q específico — a cada
-- renovação o aceite é novo, mas o responsável é o mesmo.
alter table public.clientes
  add column if not exists responsavel_legal_nome text,
  add column if not exists responsavel_legal_cpf text,
  add column if not exists responsavel_legal_vinculo text;

comment on column public.clientes.responsavel_legal_nome is
  'Responsável legal, para aluno menor de 18 anos (regulamento 11.3). O aceite do PAR-Q guarda o retrato próprio em parq_respostas.';
