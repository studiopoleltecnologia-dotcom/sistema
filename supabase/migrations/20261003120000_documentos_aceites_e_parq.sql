-- ============================================================
-- Regulamento com aceite rastreável, e PAR-Q
-- 30/09/2026
-- ============================================================
-- O sistema aplica hoje: prazo de 4h que devolve crédito, suspensão por
-- falta, 5 dias de antecedência para cancelar o plano, expiração de
-- crédito no fim do ciclo, devolução do desconto do semestral. Tudo
-- "conforme o regulamento".
--
-- E o aluno nunca viu o regulamento dentro do sistema. O único aceite
-- que existe é `contas_aluna.aceite_lgpd_em` + `versao_termo`, que é o
-- aceite de tratamento de dados do cadastro — não o do regulamento. A
-- palavra "regulamento" aparece 20 vezes no código, todas em
-- comentário.
--
-- Numa contestação de cartão ou numa reclamação de consumidor a
-- pergunta é literalmente "onde o cliente aceitou isso?". Esta migration
-- existe para haver resposta.
--
-- ## Por que o corpo do documento mora no banco
--
-- A alternativa era guardar um link para o Google Doc. Recusada: o Doc é
-- editável, então um aceite que aponta para ele não prova o que a pessoa
-- leu — e é justamente a prova que se quer. O corpo entra no banco, e o
-- aceite guarda o **hash** dele: se alguém editar a linha depois, o hash
-- não fecha e a adulteração fica visível.
--
-- ## Por que o IP não vem do front
--
-- Um IP que o navegador informa é um campo que o navegador escolhe —
-- vale zero como evidência. O Supabase repassa os headers da requisição
-- para o Postgres em `request.headers`, então a RPC lê `x-forwarded-for`
-- e `user-agent` ela mesma. O cliente não tem como forjar, e a função
-- não precisa confiar em parâmetro nenhum.
--
-- ## PAR-Q é dado de saúde
--
-- Categoria especial na LGPD (art. 11). Não é dado operacional: a
-- secretaria não precisa, a professora não pode. Por isso a tabela nasce
-- com policy de `is_gestao()` — e não de `is_operacional()`, que é o
-- recorte da operação — e o aluno vê só o que é dele.
--
-- **Decisão da gestão (30/09/2026):** resposta que pede atenção **não
-- bloqueia a compra**, bloqueia o **agendamento** até a gestão liberar.
-- O aluno paga e ativa o plano; a primeira reserva espera o aval. É mais
-- atrito que sinalizar, e foi escolha consciente: quem entra numa aula
-- de pole com dor no peito é risco físico, não risco de processo.
--
-- ## Nada disso liga sozinho
--
-- `config_cadastro.exigir_parq` nasce **false**. Ligar antes de os 147
-- alunos que vêm do Wix terem respondido bloquearia a agenda de todo
-- mundo no mesmo dia. É passo de runbook, não de migration.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Documentos com versão
-- ------------------------------------------------------------
do $$
begin
  create type public.tipo_documento as enum ('regulamento_aluno', 'politica_privacidade');
exception when duplicate_object then null;
end $$;

create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_documento not null,

  /** Rótulo da versão, como o aluno vê e como a gente cita: 'v3.1'. */
  versao text not null,
  titulo text not null,

  /**
   * O texto inteiro, em HTML simples (os mesmos elementos que o
   * documento do Drive usa: h2, h3, p, ul, table). É o que o aluno lê no
   * portal e o que o hash do aceite protege.
   */
  corpo_html text not null,

  vigente_desde date not null,
  /** Só um por tipo. Trocar de vigente é uma transação: desliga o antigo, liga o novo. */
  vigente boolean not null default false,

  criado_em timestamptz not null default now(),
  criado_por uuid references public.socias(id),

  unique (tipo, versao)
);

comment on table public.documentos is
  'Regulamento e políticas, versionados. O corpo mora aqui e não num link externo: aceite que aponta para documento editável não prova o que a pessoa leu.';

-- Um vigente por tipo, garantido pelo banco. Duas versões vigentes ao
-- mesmo tempo significaria que ninguém sabe qual regra vale.
create unique index if not exists documento_vigente_por_tipo
  on public.documentos (tipo) where vigente;

alter table public.documentos enable row level security;

drop policy if exists "gestao gerencia documentos" on public.documentos;
create policy "gestao gerencia documentos" on public.documentos
  for all to authenticated
  using (public.is_gestao()) with check (public.is_gestao());


-- ------------------------------------------------------------
-- 2. Aceites
-- ------------------------------------------------------------
create table if not exists public.aceites (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  documento_id uuid not null references public.documentos(id),

  aceito_em timestamptz not null default now(),

  /**
   * Retrato do que foi aceito, para o aceite não depender da linha de
   * `documentos` continuar intacta. `hash_corpo` é o md5 do corpo no
   * momento do aceite: se a linha for editada depois, o hash não fecha.
   */
  versao text not null,
  hash_corpo text not null,

  /** Lidos dos headers da requisição, nunca informados pelo cliente. */
  ip text,
  user_agent text
);

comment on table public.aceites is
  'Quem aceitou qual versão de qual documento, quando, de onde. hash_corpo prova o texto; ip e user_agent vêm de request.headers, não do front.';

-- Um aceite por documento. Reaceitar a MESMA versão não é evento novo;
-- versão nova é outra linha de `documentos`, e portanto outro aceite.
create unique index if not exists aceite_unico_por_documento
  on public.aceites (cliente_id, documento_id);

create index if not exists aceite_por_cliente on public.aceites (cliente_id, aceito_em desc);

alter table public.aceites enable row level security;

drop policy if exists "aluno le os proprios aceites" on public.aceites;
create policy "aluno le os proprios aceites" on public.aceites
  for select to authenticated
  using (cliente_id = public.cliente_atual());

-- A equipe precisa ver que o aluno aceitou (é pergunta de atendimento),
-- e ninguém — nem a gestão — reescreve aceite: a escrita é só pela RPC.
drop policy if exists "equipe le aceites" on public.aceites;
create policy "equipe le aceites" on public.aceites
  for select to authenticated
  using (public.is_socia());

-- Só agora, porque a policy consulta `aceites`: o aluno lê o documento
-- vigente e, além dele, a versão antiga que ELE aceitou — é o "o que eu
-- assinei" dele, e sem isto o aceite de ontem viraria um documento
-- invisível hoje.
drop policy if exists "todos leem documento vigente" on public.documentos;
create policy "todos leem documento vigente" on public.documentos
  for select to authenticated
  using (
    vigente
    or public.is_socia()
    or exists (
      select 1 from public.aceites a
      where a.documento_id = documentos.id
        and a.cliente_id = public.cliente_atual()
    )
  );


-- ------------------------------------------------------------
-- 3. Aceitar — a RPC que colhe a prova
-- ------------------------------------------------------------
create or replace function public.aceitar_documento(p_documento uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cl uuid;
  doc record;
  headers json;
  id_novo uuid;
begin
  cl := public.cliente_atual();
  if cl is null then
    raise exception 'requer sessão de aluno';
  end if;

  select * into doc from public.documentos where id = p_documento and vigente;
  if not found then
    raise exception 'documento inexistente ou não vigente';
  end if;

  -- `request.headers` não existe fora de uma requisição PostgREST (num
  -- psql, por exemplo). O `true` do current_setting devolve null em vez
  -- de erro, e aí ip/user_agent ficam nulos — o aceite vale, só não tem
  -- a origem.
  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    headers := null;
  end;

  insert into public.aceites
    (cliente_id, documento_id, versao, hash_corpo, ip, user_agent)
  values (
    cl, doc.id, doc.versao, md5(doc.corpo_html),
    -- x-forwarded-for pode vir como lista ("ip-do-cliente, proxy1");
    -- o primeiro é o do aluno.
    split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1),
    left(coalesce(headers->>'user-agent', ''), 400)
  )
  on conflict (cliente_id, documento_id) do nothing
  returning id into id_novo;

  if id_novo is null then
    select id into id_novo from public.aceites
    where cliente_id = cl and documento_id = doc.id;
  end if;

  return id_novo;
end;
$function$;

comment on function public.aceitar_documento(uuid) is
  'Registra o aceite do documento vigente pelo aluno da sessão, com hash do corpo, IP e user-agent lidos dos headers. Idempotente.';

revoke execute on function public.aceitar_documento(uuid) from public, anon;
grant execute on function public.aceitar_documento(uuid) to authenticated;


-- ------------------------------------------------------------
-- 4. PAR-Q — as perguntas
-- ------------------------------------------------------------
-- Em tabela, e não fixas no código, pelo mesmo motivo de todo o resto
-- do catálogo: a gestão muda o questionário sem migration. `versao`
-- muda quando a LISTA muda, e é ela que decide se um PAR-Q antigo
-- ainda serve.
create table if not exists public.parq_perguntas (
  id uuid primary key default gen_random_uuid(),
  ordem integer not null,
  texto text not null,

  /**
   * Qual resposta acende o sinal. Em quase toda pergunta do PAR-Q é o
   * "sim", mas deixar configurável evita que uma pergunta redigida ao
   * contrário exija código.
   */
  atencao_quando boolean not null default true,

  ativa boolean not null default true,
  criada_em timestamptz not null default now()
);

comment on table public.parq_perguntas is
  'Perguntas do PAR-Q. Editáveis pela gestão — mudar a lista é mudar a versão do questionário (parq_versao_vigente()).';

alter table public.parq_perguntas enable row level security;

-- Pergunta não é dado de saúde: o aluno precisa lê-las para responder.
drop policy if exists "todos leem perguntas ativas do parq" on public.parq_perguntas;
create policy "todos leem perguntas ativas do parq" on public.parq_perguntas
  for select to authenticated using (ativa or public.is_gestao());

drop policy if exists "gestao gerencia perguntas do parq" on public.parq_perguntas;
create policy "gestao gerencia perguntas do parq" on public.parq_perguntas
  for all to authenticated
  using (public.is_gestao()) with check (public.is_gestao());


-- ------------------------------------------------------------
-- 5. PAR-Q — as respostas (dado de saúde)
-- ------------------------------------------------------------
create table if not exists public.parq_respostas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,

  /** Versão do questionário respondido — muda quando a lista muda. */
  versao text not null,
  respondido_em timestamptz not null default now(),

  /**
   * Até quando esta resposta vale. 12 meses por decisão da gestão
   * (30/09/2026): repreencher a cada renovação mensal seria atrito sem
   * ganho — condição de saúde não muda de mês em mês, e um formulário
   * que se repete todo mês é um formulário que ninguém lê.
   */
  validade date not null,

  /** [{ "pergunta_id": uuid, "texto": "...", "resposta": true }] */
  respostas jsonb not null,
  observacoes text,

  tem_atencao boolean not null,

  /** Aval da gestão, exigido para agendar quando tem_atencao. */
  liberado_em timestamptz,
  liberado_por uuid references public.socias(id),
  liberacao_observacao text
);

comment on table public.parq_respostas is
  'PAR-Q respondido. DADO DE SAÚDE (LGPD art. 11): policy de is_gestao(), nunca is_operacional(). O aluno vê só o dele; a professora não vê nada.';

comment on column public.parq_respostas.tem_atencao is
  'Alguma resposta caiu no lado que pede atenção. Bloqueia o agendamento até liberado_em (decisão da gestão, 30/09/2026) — não bloqueia a compra.';

create index if not exists parq_por_cliente
  on public.parq_respostas (cliente_id, respondido_em desc);

alter table public.parq_respostas enable row level security;

drop policy if exists "aluno le o proprio parq" on public.parq_respostas;
create policy "aluno le o proprio parq" on public.parq_respostas
  for select to authenticated
  using (cliente_id = public.cliente_atual());

-- Só a GESTÃO, e de propósito: a operação inteira (secretaria) não
-- precisa de resposta de saúde para fazer o trabalho dela.
drop policy if exists "gestao le parq" on public.parq_respostas;
create policy "gestao le parq" on public.parq_respostas
  for select to authenticated using (public.is_gestao());

drop policy if exists "gestao libera parq" on public.parq_respostas;
create policy "gestao libera parq" on public.parq_respostas
  for update to authenticated
  using (public.is_gestao()) with check (public.is_gestao());
-- Escrita de resposta é só pela RPC (security definer): sem policy de
-- insert, nem o aluno nem a equipe inserem direto por PostgREST.


-- ------------------------------------------------------------
-- 6. Versão vigente do questionário
-- ------------------------------------------------------------
-- A versão é derivada da LISTA de perguntas ativas, não digitada: um md5
-- dos ids em ordem. Assim, mexer no questionário invalida os PAR-Q
-- antigos sozinho, e ninguém precisa lembrar de incrementar um número.
create or replace function public.parq_versao_vigente()
returns text
language sql
stable security definer
set search_path to ''
as $function$
  select coalesce(
    left(md5(string_agg(id::text, ',' order by ordem, id)), 12),
    'vazio'
  )
  from public.parq_perguntas where ativa;
$function$;

revoke execute on function public.parq_versao_vigente() from public, anon;
grant execute on function public.parq_versao_vigente() to authenticated;


-- ------------------------------------------------------------
-- 7. O PAR-Q vigente de um aluno
-- ------------------------------------------------------------
-- "Vigente" = da versão atual do questionário E dentro da validade.
-- Devolve também o que o AGENDAMENTO precisa saber, sem devolver
-- resposta nenhuma: quem chama isto no fluxo de reserva não tem que
-- enxergar dado de saúde.
create or replace function public.parq_situacao(p_cliente uuid)
returns table(
  respondido boolean,
  vence_em date,
  tem_atencao boolean,
  liberado boolean
)
language sql
stable security definer
set search_path to ''
as $function$
  select
    true,
    r.validade,
    r.tem_atencao,
    r.liberado_em is not null
  from public.parq_respostas r
  where r.cliente_id = p_cliente
    and r.versao = public.parq_versao_vigente()
    and r.validade >= (now() at time zone 'America/Sao_Paulo')::date
  order by r.respondido_em desc
  limit 1;
$function$;

comment on function public.parq_situacao(uuid) is
  'Situação do PAR-Q do aluno para o fluxo de reserva: respondido, validade, atenção e liberação. Nenhuma resposta sai daqui.';

revoke execute on function public.parq_situacao(uuid) from public, anon;
grant execute on function public.parq_situacao(uuid) to authenticated;


-- ------------------------------------------------------------
-- 8. Responder
-- ------------------------------------------------------------
create or replace function public.responder_parq(
  p_respostas jsonb,
  p_observacoes text default null,
  p_cliente uuid default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cl uuid;
  n_ativas integer;
  n_respondidas integer;
  atencao boolean;
  meses integer;
  id_novo uuid;
begin
  -- O aluno responde por si. A equipe pode responder POR ele (o PAR-Q
  -- de papel preenchido na recepção), e aí precisa dizer de quem é.
  if public.is_cliente() then
    cl := public.cliente_atual();
    if p_cliente is not null and p_cliente <> cl then
      raise exception 'aluno só responde o próprio questionário';
    end if;
  elsif public.is_socia() then
    cl := p_cliente;
    if cl is null then
      raise exception 'informe de qual aluno é o questionário';
    end if;
  else
    raise exception 'acesso restrito';
  end if;

  if jsonb_typeof(p_respostas) <> 'array' then
    raise exception 'respostas devem vir como lista';
  end if;

  select count(*) into n_ativas from public.parq_perguntas where ativa;

  -- Toda pergunta ativa precisa de resposta booleana. Questionário de
  -- saúde pela metade não protege ninguém.
  select count(*) into n_respondidas
  from public.parq_perguntas q
  where q.ativa
    and exists (
      select 1 from jsonb_array_elements(p_respostas) e
      where (e->>'pergunta_id')::uuid = q.id
        and jsonb_typeof(e->'resposta') = 'boolean'
    );

  if n_respondidas <> n_ativas then
    raise exception 'responda todas as % perguntas (faltaram %)',
      n_ativas, n_ativas - n_respondidas;
  end if;

  select exists (
    select 1
    from public.parq_perguntas q
    join jsonb_array_elements(p_respostas) e
      on (e->>'pergunta_id')::uuid = q.id
    where q.ativa and (e->'resposta')::boolean = q.atencao_quando
  ) into atencao;

  meses := coalesce((select validade_parq_meses from public.config_cadastro where id), 12);

  insert into public.parq_respostas
    (cliente_id, versao, validade, respostas, observacoes, tem_atencao)
  values (
    cl,
    public.parq_versao_vigente(),
    ((now() at time zone 'America/Sao_Paulo')::date + (meses || ' months')::interval)::date,
    p_respostas,
    nullif(btrim(coalesce(p_observacoes, '')), ''),
    atencao
  )
  returning id into id_novo;

  return id_novo;
end;
$function$;

comment on function public.responder_parq(jsonb, text, uuid) is
  'Grava o PAR-Q. Exige resposta para TODAS as perguntas ativas e calcula tem_atencao no banco — o front não decide isso.';

revoke execute on function public.responder_parq(jsonb, text, uuid) from public, anon;
grant execute on function public.responder_parq(jsonb, text, uuid) to authenticated;


-- ------------------------------------------------------------
-- 9. Liberar quem caiu no sinal
-- ------------------------------------------------------------
create or replace function public.liberar_parq(
  p_resposta uuid,
  p_observacao text
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_gestao() then
    raise exception 'liberação de PAR-Q é restrita à gestão';
  end if;
  if nullif(btrim(coalesce(p_observacao, '')), '') is null then
    raise exception 'descreva o que foi verificado (atestado, conversa) — fica registrado';
  end if;

  -- `socias.id` É o id do usuário de auth (não há coluna separada), então
  -- `auth.uid()` serve direto — é a convenção usada em conceder_creditos
  -- e em aprovar_contratacao.
  update public.parq_respostas
  set liberado_em = now(),
      liberado_por = auth.uid(),
      liberacao_observacao = btrim(p_observacao)
  where id = p_resposta and liberado_em is null;

  return found;
end;
$function$;

comment on function public.liberar_parq(uuid, text) is
  'Aval da gestão para o aluno com PAR-Q de atenção poder agendar. Observação obrigatória: é o registro de o que foi verificado.';

revoke execute on function public.liberar_parq(uuid, text) from public, anon;
grant execute on function public.liberar_parq(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 10. Configuração
-- ------------------------------------------------------------
alter table public.config_cadastro
  add column if not exists exigir_parq boolean not null default false,
  add column if not exists validade_parq_meses integer not null default 12;

comment on column public.config_cadastro.exigir_parq is
  'Liga a exigência de PAR-Q no agendamento. Nasce FALSE: ligar antes de os alunos vindos do Wix responderem bloquearia a agenda de todos no mesmo dia.';

comment on column public.config_cadastro.validade_parq_meses is
  'Quantos meses um PAR-Q vale. 12 por decisão da gestão — não se repreenche a cada renovação mensal.';

-- `add constraint` não aceita `if not exists`, e a migration tem que
-- poder ser reaplicada num banco que já a recebeu.
do $$
begin
  alter table public.config_cadastro
    add constraint validade_parq_razoavel check (validade_parq_meses between 1 and 60);
exception when duplicate_object then null;
end $$;


-- ------------------------------------------------------------
-- 11. As perguntas iniciais
-- ------------------------------------------------------------
-- As 7 do PAR-Q clássico (o questionário validado, usado no Brasil pela
-- SBME) mais 3 que a modalidade pede: pole carrega punho, ombro e
-- coluna, e gestação muda a orientação da aula inteira. A gestão edita
-- pela tela — a lista aqui é o ponto de partida, não a verdade final.
-- `where not exists` e não `on conflict`: não há chave natural em que
-- conflitar (a gestão pode reescrever o texto de uma pergunta), então a
-- semeadura acontece uma vez, com a tabela vazia.
insert into public.parq_perguntas (ordem, texto)
select * from (values
  (1,  'Algum médico já disse que você possui um problema cardíaco e que só deveria praticar atividade física com supervisão de profissionais de saúde?'),
  (2,  'Você sente dor no peito quando pratica atividade física?'),
  (3,  'No último mês, você sentiu dor no peito ao praticar atividade física?'),
  (4,  'Você perde o equilíbrio por tontura ou já perdeu a consciência alguma vez?'),
  (5,  'Você tem algum problema ósseo ou articular que poderia ser piorado por atividade física?'),
  (6,  'Você toma atualmente algum medicamento para pressão arterial ou problema cardíaco?'),
  (7,  'Você sabe de alguma outra razão pela qual não deveria praticar atividade física?'),
  (8,  'Você passou por alguma cirurgia nos últimos 12 meses?'),
  (9,  'Você tem alguma lesão ou dor em punho, ombro, coluna ou quadril?'),
  (10, 'Você está gestante ou no período pós-parto (até 6 meses)?')
) as q(ordem, texto)
where not exists (select 1 from public.parq_perguntas);
