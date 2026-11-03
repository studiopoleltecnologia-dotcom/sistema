-- ============================================================
-- Notificações da equipe: o sino, o histórico e a preferência
-- 05/10/2026
-- ============================================================
-- Bloco 12 da revisão da jornada comercial, e com ele o A27 ("o sistema
-- só precisa nos avisar que a cobrança não foi realizada").
--
-- ## O problema, como ele aparece hoje
--
-- Toda fila que a equipe precisa responder — contratação, cancelamento,
-- pausa, convidado, aula cancelada por falta de quórum — avisa por
-- **e-mail, para todas as sócias de gestão, sempre**. São cinco fluxos
-- com o mesmo desenho:
--
--     for destino in select public.emails_gestao() loop
--       perform public.enfileirar_email(tipo, destino, dados, ref);
--     end loop;
--
-- Isso dá dois problemas opostos ao mesmo tempo:
--
-- * **volume.** O quórum sozinho pode mandar vários e-mails por dia para
--   três pessoas. E-mail demais vira e-mail não lido, e aí o aviso que
--   importava some junto com o resto.
-- * **nenhum lugar no sistema.** Quem abre o ERP não tem como saber que
--   há algo esperando resposta sem passar tela por tela. A fila existe,
--   a aba existe, mas nada chama.
--
-- ## A decisão de desenho: o tipo vira catálogo
--
-- `tipos_notificacao` lista os avisos que são **da equipe** (não os do
-- aluno), com rótulo, para onde o clique leva e se o e-mail vem ligado
-- de fábrica. A partir daí, cada sócia escolhe por tipo: sino, e-mail,
-- os dois ou nenhum.
--
-- ## Onde o desvio acontece, e por que ali
--
-- Em `enfileirar_email()`, e não nos cinco chamadores.
--
-- É uma escolha com um custo que fica dito: quem ler `solicitar_pausa()`
-- vê "enfileirar_email" e não adivinha que um sino acende. Em troca,
-- **nenhuma das cinco funções precisou ser reescrita** — e três delas
-- são funções grandes (`solicitar_cancelamento_plano`, `solicitar_pausa`,
-- `indicar_convidado`) onde o aviso é um bloco no meio. Reescrever três
-- funções de 100 linhas para mudar 5 é trocar risco por elegância.
--
-- O catálogo é o que torna isso legível: um tipo listado lá é um aviso
-- de equipe, e o caminho dele está escrito numa tabela que dá para
-- consultar — não espalhado por cinco funções.
--
-- E funciona por pessoa de graça: os chamadores já chamam
-- `enfileirar_email` **uma vez por sócia**, então a preferência de cada
-- uma é consultada no ponto em que o e-mail dela seria criado.
--
-- ⚠️ **Nada muda no volume de e-mail até alguém mexer.** Todos os tipos
-- nascem com `email_padrao = true`, ou seja, exatamente o comportamento
-- de hoje. O que esta migration entrega é o sino e o botão de desligar —
-- desligar é decisão de cada sócia, não minha.
--
-- ## O que NÃO muda
--
-- O público continua sendo `emails_gestao()` (função = gestão). Levar o
-- sino para a secretária é uma linha nessa função, mas é decisão de
-- produto: ela resolve convidado e check-in pendente, então faz sentido
-- — só não por tabela, sem alguém pedir.
-- ============================================================


-- ------------------------------------------------------------
-- 1. O catálogo dos avisos de equipe
-- ------------------------------------------------------------
create table if not exists public.tipos_notificacao (
  tipo text primary key,
  rotulo text not null,
  descricao text,
  -- Para onde o clique leva, dentro do ERP (hash route, sem domínio).
  link text,
  -- E-mail ligado de fábrica. O sino é sempre o padrão: ele não
  -- incomoda ninguém.
  email_padrao boolean not null default true,
  ordem integer not null default 0,
  ativo boolean not null default true
);

comment on table public.tipos_notificacao is
  'Os avisos que são da EQUIPE (não do aluno). Um tipo listado aqui deixa de ser só e-mail: enfileirar_email() passa a criar também a notificação do sino, e cada sócia escolhe os canais em preferencias_notificacao.';

alter table public.tipos_notificacao enable row level security;

drop policy if exists "equipe ve tipos de notificacao" on public.tipos_notificacao;
create policy "equipe ve tipos de notificacao" on public.tipos_notificacao
  for select to authenticated using (public.is_socia());

insert into public.tipos_notificacao (tipo, rotulo, descricao, link, ordem) values
  ('contratacao_para_aprovar', 'Contratação esperando aprovação',
   'Alguém pediu um plano que depende do seu ok — e não paga nada até você aprovar.',
   '#/matriculas?aba=contratacoes', 10),
  ('cancelamento_solicitado', 'Pedido de cancelamento de plano',
   'O aluno pediu para cancelar. O prazo do pedido já está calculado na fila.',
   '#/matriculas?aba=cancelamentos', 20),
  ('pausa_solicitada', 'Pedido de pausa de plano',
   'O plano segue ativo e a cobrança também até alguém decidir.',
   '#/matriculas?aba=pausas', 30),
  ('convidado_indicado', 'Convidado esperando confirmação',
   'A vaga só é reservada depois do ok da equipe (nível e segurança).',
   '#/matriculas?aba=convidados', 40),
  ('aula_cancelada_quorum', 'Aula cancelada por falta de alunos',
   'O sistema cancelou sozinho no marco das 4h, devolveu os créditos e avisou os alunos.',
   '#/agenda', 50),
  ('cobranca_falhou', 'Cobrança não realizada',
   'A cobrança venceu sem pagamento. A liberação da vaga, quando for o caso, é manual.',
   '#/matriculas?aba=em_aberto', 60)
on conflict (tipo) do update
set rotulo = excluded.rotulo,
    descricao = excluded.descricao,
    link = excluded.link,
    ordem = excluded.ordem;


-- ------------------------------------------------------------
-- 2. A preferência de cada sócia
-- ------------------------------------------------------------
-- Linha ausente = padrão do catálogo. Só quem mexeu tem linha, o que
-- deixa o padrão livre para mudar depois sem reescrever preferência de
-- ninguém.
create table if not exists public.preferencias_notificacao (
  socia_id uuid not null references public.socias(id) on delete cascade,
  tipo text not null references public.tipos_notificacao(tipo) on delete cascade,
  no_sistema boolean not null default true,
  por_email boolean not null default true,
  atualizada_em timestamptz not null default now(),
  primary key (socia_id, tipo)
);

comment on table public.preferencias_notificacao is
  'Canais escolhidos por cada sócia, por tipo de aviso. Linha ausente significa o padrão do catálogo — só quem mexeu tem linha.';

alter table public.preferencias_notificacao enable row level security;

-- Cada uma mexe na própria, e só nela.
drop policy if exists "socia ve as proprias preferencias" on public.preferencias_notificacao;
create policy "socia ve as proprias preferencias" on public.preferencias_notificacao
  for select to authenticated using (socia_id = auth.uid());

drop policy if exists "socia escreve as proprias preferencias" on public.preferencias_notificacao;
create policy "socia escreve as proprias preferencias" on public.preferencias_notificacao
  for all to authenticated
  using (socia_id = auth.uid())
  with check (socia_id = auth.uid());


-- ------------------------------------------------------------
-- 3. As notificações
-- ------------------------------------------------------------
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  socia_id uuid not null references public.socias(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  descricao text,
  link text,
  dados jsonb not null default '{}',
  -- O mesmo `ref` do e-mail: é o que impede duas notificações do mesmo
  -- fato quando um webhook é reentregue.
  ref text,
  lida_em timestamptz,
  criada_em timestamptz not null default now()
);

comment on table public.notificacoes is
  'O sino da equipe. Uma linha por sócia e por fato — a dedup é o mesmo `ref` que a fila de e-mails usa, então reentrega de webhook não vira dois avisos.';

create unique index if not exists notificacoes_ref_unica
  on public.notificacoes (socia_id, ref) where ref is not null;

-- O índice que o sino usa: as não lidas de quem está olhando.
create index if not exists notificacoes_nao_lidas
  on public.notificacoes (socia_id, criada_em desc) where lida_em is null;

create index if not exists notificacoes_por_socia
  on public.notificacoes (socia_id, criada_em desc);

alter table public.notificacoes enable row level security;

-- Notificação é pessoal: ninguém lê a de ninguém, nem a gestão.
drop policy if exists "socia ve as proprias notificacoes" on public.notificacoes;
create policy "socia ve as proprias notificacoes" on public.notificacoes
  for select to authenticated using (socia_id = auth.uid());

drop policy if exists "socia marca as proprias notificacoes" on public.notificacoes;
create policy "socia marca as proprias notificacoes" on public.notificacoes
  for update to authenticated
  using (socia_id = auth.uid())
  with check (socia_id = auth.uid());

-- Sem policy de insert: quem cria é `enfileirar_email()`, definer.


-- ------------------------------------------------------------
-- 4. O resumo que aparece embaixo do título
-- ------------------------------------------------------------
-- O `dados` do e-mail já carrega o essencial de cada fluxo, e todos eles
-- trazem `nome`. Em vez de um texto por tipo (que seria um segundo lugar
-- para manter), o sino monta uma linha curta com o que houver.
create or replace function public.resumo_notificacao(p_dados jsonb)
returns text
language sql
immutable
set search_path to ''
as $function$
  select nullif(
    array_to_string(
      array_remove(array[
        nullif(btrim(coalesce(p_dados->>'nome', '')), ''),
        nullif(btrim(coalesce(p_dados->>'plano',
                     coalesce(p_dados->>'produto', p_dados->>'turma'))), ''),
        nullif(btrim(coalesce(p_dados->>'convidado', '')), '')
      ], null),
      ' · '),
    '');
$function$;

comment on function public.resumo_notificacao(jsonb) is
  'A linha curta do sino, montada do mesmo `dados` que o e-mail usa. Sem texto próprio por tipo — o detalhe mora na tela para onde o clique leva.';

revoke execute on function public.resumo_notificacao(jsonb) from public, anon;
grant execute on function public.resumo_notificacao(jsonb) to authenticated;


-- ------------------------------------------------------------
-- 5. O desvio: enfileirar_email passa a acender o sino
-- ------------------------------------------------------------
-- Reescrita de `20260724130000`. O corpo original está inteiro aqui
-- dentro; o que entrou foi o bloco do meio.
--
-- Três cuidados que não são óbvios:
--
-- 1. **O bloco novo tem `exception` próprio.** A função inteira engole
--    exceções de propósito (um e-mail nunca pode derrubar a operação que
--    o dispara), mas em plpgsql um erro desfaz o bloco inteiro — sem o
--    sub-bloco, um defeito na notificação faria o E-MAIL se perder
--    também.
-- 2. **Destinatário que não é sócia segue o caminho de antes**, sem
--    nenhuma consulta a mais: o `select` do catálogo é por chave
--    primária e só acontece se o tipo estiver listado.
-- 3. **A dedup do e-mail continua sendo a primeira coisa.** Se o `ref`
--    já existe, nada acontece — nem e-mail nem sino —, que é o
--    comportamento que a reentrega de webhook depende.
create or replace function public.enfileirar_email(
  p_tipo text, p_destinatario text, p_dados jsonb default '{}', p_ref text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  tn record;
  sc record;
  manda_email boolean := true;
  no_sino boolean;
begin
  if p_destinatario is null or length(trim(p_destinatario)) = 0 then return; end if;
  if p_ref is not null and exists (select 1 from public.emails_fila where ref = p_ref) then return; end if;

  -- ---- o sino (bloco 12) ----
  begin
    select * into tn from public.tipos_notificacao
     where tipo = p_tipo and ativo;

    if found then
      select * into sc from public.socias
       where lower(email) = lower(btrim(p_destinatario));

      if found then
        select pn.no_sistema, pn.por_email into no_sino, manda_email
          from public.preferencias_notificacao pn
         where pn.socia_id = sc.id and pn.tipo = p_tipo;
        if not found then
          -- Sem linha = padrão: sino sempre, e-mail como o catálogo diz.
          no_sino := true;
          manda_email := tn.email_padrao;
        end if;

        if no_sino then
          insert into public.notificacoes
            (socia_id, tipo, titulo, descricao, link, dados, ref)
          values
            (sc.id, p_tipo, tn.rotulo, public.resumo_notificacao(p_dados),
             tn.link, coalesce(p_dados, '{}'::jsonb), p_ref)
          on conflict do nothing;
        end if;
      end if;
    end if;
  exception when others then
    -- Sino quebrado não pode levar o e-mail junto.
    manda_email := true;
  end;

  if not manda_email then return; end if;

  insert into public.emails_fila (tipo, destinatario, dados, ref)
  values (p_tipo, p_destinatario, coalesce(p_dados, '{}'::jsonb), p_ref);
exception when others then
  null;
end; $$;

comment on function public.enfileirar_email(text, text, jsonb, text) is
  'Enfileira o e-mail e, quando o tipo está em tipos_notificacao E o destinatário é uma sócia, cria também a notificação do sino — respeitando a preferência dela em cada canal. Tipo fora do catálogo ou destinatário que não é da equipe seguem o caminho de sempre.';


-- ------------------------------------------------------------
-- 6. O que a tela do sino lê
-- ------------------------------------------------------------
create or replace function public.minhas_notificacoes(
  p_limite integer default 30,
  p_so_nao_lidas boolean default false
)
returns table (
  id uuid,
  tipo text,
  titulo text,
  descricao text,
  link text,
  criada_em timestamptz,
  lida_em timestamptz
)
language sql
stable security definer
set search_path to ''
as $function$
  select n.id, n.tipo, n.titulo, n.descricao, n.link, n.criada_em, n.lida_em
  from public.notificacoes n
  where n.socia_id = auth.uid()
    and (not p_so_nao_lidas or n.lida_em is null)
  order by n.criada_em desc
  limit greatest(coalesce(p_limite, 30), 1);
$function$;

revoke execute on function public.minhas_notificacoes(integer, boolean) from public, anon;
grant execute on function public.minhas_notificacoes(integer, boolean) to authenticated;


create or replace function public.notificacoes_nao_lidas()
returns integer
language sql
stable security definer
set search_path to ''
as $function$
  select count(*)::integer from public.notificacoes
  where socia_id = auth.uid() and lida_em is null;
$function$;

revoke execute on function public.notificacoes_nao_lidas() from public, anon;
grant execute on function public.notificacoes_nao_lidas() to authenticated;


create or replace function public.marcar_notificacao_lida(p_id uuid)
returns void
language sql
security definer
set search_path to ''
as $function$
  update public.notificacoes
  set lida_em = now()
  where id = p_id and socia_id = auth.uid() and lida_em is null;
$function$;

revoke execute on function public.marcar_notificacao_lida(uuid) from public, anon;
grant execute on function public.marcar_notificacao_lida(uuid) to authenticated;


create or replace function public.marcar_notificacoes_lidas()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare n integer;
begin
  update public.notificacoes
  set lida_em = now()
  where socia_id = auth.uid() and lida_em is null;
  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke execute on function public.marcar_notificacoes_lidas() from public, anon;
grant execute on function public.marcar_notificacoes_lidas() to authenticated;


-- ------------------------------------------------------------
-- 7. A tela de preferências
-- ------------------------------------------------------------
-- Devolve o catálogo inteiro com a escolha de quem está perguntando já
-- resolvida: a tela não precisa saber o que é padrão e o que é escolha.
create or replace function public.minhas_preferencias_notificacao()
returns table (
  tipo text,
  rotulo text,
  descricao text,
  no_sistema boolean,
  por_email boolean,
  ordem integer
)
language sql
stable security definer
set search_path to ''
as $function$
  select
    t.tipo,
    t.rotulo,
    t.descricao,
    coalesce(p.no_sistema, true),
    coalesce(p.por_email, t.email_padrao),
    t.ordem
  from public.tipos_notificacao t
  left join public.preferencias_notificacao p
    on p.tipo = t.tipo and p.socia_id = auth.uid()
  where t.ativo
  order by t.ordem, t.rotulo;
$function$;

revoke execute on function public.minhas_preferencias_notificacao() from public, anon;
grant execute on function public.minhas_preferencias_notificacao() to authenticated;


create or replace function public.salvar_preferencia_notificacao(
  p_tipo text,
  p_no_sistema boolean,
  p_por_email boolean
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.is_socia() then
    raise exception 'acesso restrito à equipe';
  end if;
  if not exists (select 1 from public.tipos_notificacao where tipo = p_tipo) then
    raise exception 'tipo de aviso desconhecido: %', p_tipo;
  end if;

  insert into public.preferencias_notificacao (socia_id, tipo, no_sistema, por_email)
  values (auth.uid(), p_tipo, coalesce(p_no_sistema, true), coalesce(p_por_email, true))
  on conflict (socia_id, tipo) do update
  set no_sistema = excluded.no_sistema,
      por_email = excluded.por_email,
      atualizada_em = now();
end;
$function$;

revoke execute on function public.salvar_preferencia_notificacao(text, boolean, boolean)
  from public, anon;
grant execute on function public.salvar_preferencia_notificacao(text, boolean, boolean)
  to authenticated;


-- ------------------------------------------------------------
-- 8. A27: a cobrança que não foi paga avisa
-- ------------------------------------------------------------
-- Gerada do arquivo de `20260926120000` (§4). A única diferença é o
-- bloco do aviso, entre marcar a cobrança como vencida e marcar a
-- matrícula como inadimplente.
--
-- O aviso diz se o aluno tem **turma fixa**, e isso não é enfeite: é
-- justamente o caso em que alguém precisa decidir alguma coisa à mão
-- (regulamento 13.3), por decisão da gestão de não automatizar a
-- liberação da vaga.
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
  cl record;
  nome_plano text;
  dados jsonb;
  destino text;
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

  -- ---- A27: avisar que a cobrança não foi realizada ----
  -- Pedido da gestão, com o limite junto: *"não precisa ser algo no
  -- sistema, será algo manual. O sistema só precisa nos avisar que a
  -- cobrança não foi realizada."* Então aqui não há liberação de vaga,
  -- não há bloqueio novo e não há régua de cobrança — há um aviso.
  select * into cl from public.clientes where id = cb.cliente_id;
  -- Variável de texto e não `record`: a cobrança da PRIMEIRA
  -- contratação não tem matrícula ainda (ela aponta para a
  -- solicitação), e um record sem linha explode no primeiro acesso
  -- a um campo. Assim fica nulo, e o coalesce abaixo resolve.
  select p.nome into nome_plano
    from public.produtos p
    join public.matriculas m on m.plano_id = p.id
   where m.id = cb.matricula_id;

  dados := jsonb_build_object(
    'nome', coalesce(cl.nome, 'Aluno'),
    'telefone', cl.telefone,
    'plano', coalesce(nome_plano, cb.descricao, 'Plano'),
    'valor_centavos', cb.valor_centavos,
    'vencimento', cb.vencimento,
    'turma_fixa', coalesce((
      select count(*) > 0 from public.matricula_turmas mt
       where mt.matricula_id = cb.matricula_id
         and (mt.fim is null or mt.fim >= current_date)), false));

  for destino in select public.emails_gestao() loop
    perform public.enfileirar_email('cobranca_falhou', destino, dados,
      'cobranca-falhou:' || cb.id::text || ':' || destino);
  end loop;

  if cb.matricula_id is not null then
    perform public.marcar_inadimplente(cb.matricula_id);
    return 'matricula_inadimplente';
  end if;

  return 'solicitacao_segue_aberta';
end;
$function$;


revoke execute on function public.cobranca_vencida(text, text) from public, anon;
grant execute on function public.cobranca_vencida(text, text) to authenticated;