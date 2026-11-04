-- ============================================================
-- A previsão de mensalidades passa a sair do Asaas
-- ============================================================
-- Decisão da gestão em 04/11/2026: **o gateway é a fonte**. Toda
-- cobrança de mensalidade vai sair do Asaas, então a previsão de
-- receita tem de ser o que o Asaas vai cobrar — não o que o ERP acha
-- que deveria cobrar.
--
-- O que havia antes (`vw_previsao_mensalidades`, 20261110120000)
-- projetava as renovações a partir de `matriculas`: ciclo, dia de
-- renovação e preço contratado. Era a melhor previsão possível enquanto
-- o ERP era o emissor. Com o gateway no comando ela passa a ser uma
-- SEGUNDA opinião — e duas previsões de receita que discordam são pior
-- que uma. A view continua existindo (ela responde "o que o ERP
-- esperaria", útil no dia em que faltar conciliar), mas não alimenta
-- mais nenhuma tela.
--
-- ------------------------------------------------------------
-- Por que uma TABELA, e não uma chamada ao vivo na API
-- ------------------------------------------------------------
--  · a previsão tem de ser **editável** (pedido explícito): a gestão
--    sabe de coisas que o gateway não sabe — o aluno que avisou que vai
--    sair, o valor combinado à parte, a assinatura que está lá com o
--    preço velho. Resposta de API não se edita;
--  · a tela de Entradas e a de Previsão leem o mesmo número. Cada uma
--    chamando o Asaas por conta própria daria dois totais e duas
--    chances de a API estar fora do ar;
--  · a chave do Asaas não pode ir ao front (repo público, §3). Quem
--    fala com eles é Edge Function, e o resultado tem de pousar em
--    algum lugar que a RLS saiba proteger.
--
-- ------------------------------------------------------------
-- A regra que faz a edição sobreviver à sincronização
-- ------------------------------------------------------------
-- `editado_em` não nulo = a gestão mexeu nesta linha. A sincronização
-- **não sobrescreve** valor, vencimento nem descrição dessas linhas.
-- Sem isso, a correção feita de manhã desapareceria no cron da noite,
-- e a tela deixaria de merecer confiança depois do primeiro sumiço.
-- `redefinir_previsao_asaas()` desfaz a marca e devolve a linha ao
-- gateway — editar não é um caminho sem volta.
--
-- ------------------------------------------------------------
-- O que é previsão e o que é cobrança — a fronteira
-- ------------------------------------------------------------
-- Esta tabela NÃO é `entradas_financeiras` e nunca vira uma por conta
-- própria. Ela não entra no saldo do caixa, não conta no teto MEI e
-- não é cobrança a emitir (`vw_cobrancas_a_emitir` segue olhando
-- `entradas_financeiras`). Quando o Asaas efetivamente recebe, o
-- webhook já cria a entrada de verdade — e a linha de previsão
-- desaparece sozinha na sincronização seguinte, porque a cobrança
-- deixou de estar PENDING lá.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A tabela
-- ------------------------------------------------------------
create table if not exists public.previsoes_asaas (
  id uuid primary key default gen_random_uuid(),

  -- A identidade da linha NO GATEWAY, e o que torna a sincronização
  -- idempotente: 'pay_xxx' para cobrança já emitida lá, e
  -- 'sub_xxx@2027-02' para um ciclo que ainda vai ser gerado.
  ref text not null unique,
  tipo text not null check (tipo in ('cobranca', 'assinatura')),

  asaas_customer_id text not null,
  -- O nome como está no Asaas. Guardado mesmo quando casou com um
  -- cliente: é o que permite à gestão reconhecer quem é a linha que
  -- NÃO casou, sem abrir o painel do gateway.
  nome_no_gateway text,
  cliente_id uuid references public.clientes(id) on delete set null,

  vencimento date not null,
  valor_centavos integer not null check (valor_centavos >= 0),
  descricao text,

  -- A marca da edição (ver cabeçalho).
  editado_em timestamptz,
  editado_por uuid references auth.users(id) on delete set null,
  -- "Isto não vai entrar" sem apagar a linha: some do total e continua
  -- recuperável. Excluir uma previsão que o gateway vai recriar na
  -- próxima sync não resolveria nada.
  oculto boolean not null default false,
  -- A linha saiu do gateway mas tinha edição, então foi preservada em
  -- vez de apagada. É um aviso para a tela, não um estado normal.
  fora_do_gateway boolean not null default false,

  sincronizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

comment on table public.previsoes_asaas is
  'Previsao de receita de mensalidade COMO O ASAAS a ve: cobrancas pendentes mais os ciclos projetados '
  'das assinaturas ativas. Espelho editavel — linha com editado_em nao e sobrescrita pela sincronizacao. '
  'Nao e caixa, nao e cobranca a emitir e nao conta no teto MEI.';

comment on column public.previsoes_asaas.ref is
  'Identidade no gateway: pay_<id> (cobranca emitida la) ou sub_<id>@YYYY-MM (ciclo projetado). '
  'E a chave da idempotencia da sincronizacao.';

comment on column public.previsoes_asaas.editado_em is
  'Nao nulo = a gestao editou esta linha; a sincronizacao preserva valor, vencimento e descricao. '
  'redefinir_previsao_asaas() limpa a marca e devolve a linha ao gateway.';

create index if not exists previsoes_asaas_vencimento_idx
  on public.previsoes_asaas (vencimento);
create index if not exists previsoes_asaas_cliente_idx
  on public.previsoes_asaas (cliente_id);

alter table public.previsoes_asaas enable row level security;

-- Dinheiro previsto é gestão, como o resto do Financeiro (§5.2). A
-- secretária não vê — nem leitura.
drop policy if exists previsoes_asaas_leitura on public.previsoes_asaas;
create policy previsoes_asaas_leitura on public.previsoes_asaas
  for select using (public.is_gestao());

-- Nenhuma policy de escrita, de propósito: toda escrita passa pelas
-- funções abaixo, que é o que garante a marca de edição e a conta de
-- quem editou. A Edge Function entra pela service key.
grant select on public.previsoes_asaas to authenticated;


-- ------------------------------------------------------------
-- 2. Quando foi a última sincronização
-- ------------------------------------------------------------
-- Tabela de uma linha só. Existe para a tela distinguir dois casos que
-- se parecem na hora: "sincronizou e o gateway não tem nada a prever" e
-- "nunca sincronizou" (chave ausente, função não publicada, cron
-- desligado). Sem isso, uma lista vazia seria lida como "não há
-- mensalidade", que é a conclusão errada mais cara desta tela.
create table if not exists public.previsoes_asaas_sync (
  id boolean primary key default true check (id),
  ultima_em timestamptz,
  resultado jsonb
);

insert into public.previsoes_asaas_sync (id) values (true)
on conflict (id) do nothing;

alter table public.previsoes_asaas_sync enable row level security;

drop policy if exists previsoes_asaas_sync_leitura on public.previsoes_asaas_sync;
create policy previsoes_asaas_sync_leitura on public.previsoes_asaas_sync
  for select using (public.is_gestao());

grant select on public.previsoes_asaas_sync to authenticated;

comment on table public.previsoes_asaas_sync is
  'Carimbo da ultima sincronizacao com o Asaas. Lista vazia com ultima_em nula significa "nunca rodou", '
  'nao "nao ha mensalidades" — sao conclusoes muito diferentes.';


-- ------------------------------------------------------------
-- 3. A sincronização
-- ------------------------------------------------------------
-- Recebe o conjunto COMPLETO do que o gateway prevê e faz o espelho
-- bater com ele. Quem monta o payload é a Edge Function `asaas-previsao`
-- (ela tem a chave; o banco não).
--
-- Por que o conjunto completo, e não linha por linha: é a única forma
-- de saber o que SAIU do gateway (cobrança paga, assinatura cancelada,
-- vencimento remarcado). Uma sincronização parcial apagaria o resto, e
-- por isso a função recusa um payload vazio a menos que o chamador
-- diga, explicitamente, que o gateway está mesmo vazio.
create or replace function public.sincronizar_previsao_asaas(
  p_linhas jsonb,
  p_gateway_vazio boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  x jsonb;
  v_refs text[] := '{}';
  v_cliente uuid;
  v_cus text;
  v_cpf text;
  v_email text;
  v_novas integer := 0;
  v_atualizadas integer := 0;
  v_preservadas integer := 0;
  v_removidas integer := 0;
  v_orfas integer := 0;
  v_existe uuid;
  v_editada boolean;
  v_resultado jsonb;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'p_linhas precisa ser um array json';
  end if;

  if jsonb_array_length(p_linhas) = 0 and not p_gateway_vazio then
    -- Falha de rede no meio da coleta não pode zerar a previsão da
    -- gestão. Sem a afirmação explícita, nada é apagado.
    raise exception 'payload vazio sem p_gateway_vazio: recusado para não apagar a previsão inteira';
  end if;

  for x in select * from jsonb_array_elements(p_linhas) loop
    v_refs := v_refs || (x->>'ref');
    v_cus := x->>'asaas_customer_id';
    v_cpf := regexp_replace(coalesce(x->>'cpf_no_gateway', ''), '\D', '', 'g');
    v_email := lower(btrim(coalesce(x->>'email_no_gateway', '')));

    -- Quem é esta pessoa no ERP. Três tentativas, da mais confiável
    -- para a menos: o id do gateway já gravado, o CPF, o e-mail.
    v_cliente := null;
    select c.id into v_cliente from public.clientes c
      where c.asaas_customer_id = v_cus limit 1;

    if v_cliente is null and v_cpf <> '' then
      select c.id into v_cliente from public.clientes c
        where regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') = v_cpf limit 1;
    end if;

    if v_cliente is null and v_email <> '' then
      select c.id into v_cliente from public.clientes c
        where lower(c.email) = v_email limit 1;
    end if;

    -- Casou por CPF/e-mail: grava o id do gateway no cliente, para a
    -- próxima sincronização ser exata em vez de adivinhada. Só preenche
    -- o que está vazio — nunca sobrescreve um vínculo existente.
    if v_cliente is not null then
      update public.clientes
      set asaas_customer_id = v_cus
      where id = v_cliente and asaas_customer_id is null;
    end if;

    select p.id, p.editado_em is not null into v_existe, v_editada
    from public.previsoes_asaas p where p.ref = (x->>'ref');

    if v_existe is null then
      insert into public.previsoes_asaas
        (ref, tipo, asaas_customer_id, nome_no_gateway, cliente_id,
         vencimento, valor_centavos, descricao)
      values
        (x->>'ref',
         x->>'tipo',
         v_cus,
         nullif(btrim(coalesce(x->>'nome_no_gateway', '')), ''),
         v_cliente,
         (x->>'vencimento')::date,
         (x->>'valor_centavos')::integer,
         nullif(btrim(coalesce(x->>'descricao', '')), ''));
      v_novas := v_novas + 1;

    elsif v_editada then
      -- Linha editada: só o que não é opinião da gestão se atualiza.
      update public.previsoes_asaas
      set nome_no_gateway = coalesce(nullif(btrim(coalesce(x->>'nome_no_gateway', '')), ''), nome_no_gateway),
          cliente_id = coalesce(cliente_id, v_cliente),
          fora_do_gateway = false,
          sincronizado_em = now()
      where id = v_existe;
      v_preservadas := v_preservadas + 1;

    else
      update public.previsoes_asaas
      set tipo = x->>'tipo',
          asaas_customer_id = v_cus,
          nome_no_gateway = nullif(btrim(coalesce(x->>'nome_no_gateway', '')), ''),
          cliente_id = coalesce(cliente_id, v_cliente),
          vencimento = (x->>'vencimento')::date,
          valor_centavos = (x->>'valor_centavos')::integer,
          descricao = nullif(btrim(coalesce(x->>'descricao', '')), ''),
          fora_do_gateway = false,
          sincronizado_em = now()
      where id = v_existe;
      v_atualizadas := v_atualizadas + 1;
    end if;
  end loop;

  -- O que não veio no conjunto deixou de ser previsão: cobrança paga
  -- (já virou entrada pelo webhook), assinatura cancelada, ciclo
  -- remarcado. Linha sem edição vai embora.
  with mortas as (
    delete from public.previsoes_asaas
    where not (ref = any(v_refs)) and editado_em is null
    returning 1
  )
  select count(*) into v_removidas from mortas;

  -- Linha editada que saiu do gateway fica, marcada: apagar em silêncio
  -- o trabalho de alguém é pior do que mostrar uma linha a mais com
  -- etiqueta de "não existe mais no Asaas".
  with orfas as (
    update public.previsoes_asaas
    set fora_do_gateway = true, sincronizado_em = now()
    where not (ref = any(v_refs)) and editado_em is not null and not fora_do_gateway
    returning 1
  )
  select count(*) into v_orfas from orfas;

  v_resultado := jsonb_build_object(
    'recebidas', jsonb_array_length(p_linhas),
    'novas', v_novas,
    'atualizadas', v_atualizadas,
    'preservadas_por_edicao', v_preservadas,
    'removidas', v_removidas,
    'orfas_marcadas', v_orfas
  );

  update public.previsoes_asaas_sync
  set ultima_em = now(), resultado = v_resultado
  where id;

  return v_resultado;
end;
$fn$;

comment on function public.sincronizar_previsao_asaas(jsonb, boolean) is
  'Faz o espelho de previsao bater com o conjunto COMPLETO que o Asaas preve. Preserva linha editada, '
  'apaga linha sem edicao que saiu do gateway e recusa payload vazio sem p_gateway_vazio.';

revoke all on function public.sincronizar_previsao_asaas(jsonb, boolean) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 4. Editar uma linha da previsão
-- ------------------------------------------------------------
-- Um caminho só para a edição, porque é ele que põe a marca que
-- sobrevive à sincronização. Passar null em um campo significa "não
-- mexer nele", e não "apagar" — exceto `p_descricao`, onde string vazia
-- é um pedido legítimo de limpar o texto.
create or replace function public.editar_previsao_asaas(
  p_id uuid,
  p_valor_centavos integer default null,
  p_vencimento date default null,
  p_descricao text default null,
  p_oculto boolean default null
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not public.is_gestao() then
    raise exception 'apenas a gestão edita a previsão de receita';
  end if;

  if p_valor_centavos is not null and p_valor_centavos < 0 then
    raise exception 'valor não pode ser negativo';
  end if;

  update public.previsoes_asaas
  set valor_centavos = coalesce(p_valor_centavos, valor_centavos),
      vencimento = coalesce(p_vencimento, vencimento),
      descricao = case when p_descricao is null then descricao
                       else nullif(btrim(p_descricao), '') end,
      oculto = coalesce(p_oculto, oculto),
      editado_em = now(),
      editado_por = auth.uid()
  where id = p_id;

  if not found then
    raise exception 'linha de previsão inexistente';
  end if;
end;
$fn$;

comment on function public.editar_previsao_asaas(uuid, integer, date, text, boolean) is
  'Edita uma linha da previsao e marca editado_em, o que impede a sincronizacao de sobrescrever. '
  'Null = nao mexer no campo.';

revoke all on function public.editar_previsao_asaas(uuid, integer, date, text, boolean)
  from public, anon;
grant execute on function public.editar_previsao_asaas(uuid, integer, date, text, boolean)
  to authenticated;


-- Desfazer a edição: a linha volta a seguir o gateway na próxima sync.
create or replace function public.redefinir_previsao_asaas(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not public.is_gestao() then
    raise exception 'apenas a gestão edita a previsão de receita';
  end if;

  -- A linha que já tinha saído do gateway e só existia por causa da
  -- edição não tem a que voltar: desfazer a edição é apagá-la.
  delete from public.previsoes_asaas where id = p_id and fora_do_gateway;
  if found then
    return;
  end if;

  update public.previsoes_asaas
  set editado_em = null, editado_por = null, oculto = false
  where id = p_id;

  if not found then
    raise exception 'linha de previsão inexistente';
  end if;
end;
$fn$;

comment on function public.redefinir_previsao_asaas(uuid) is
  'Remove a marca de edicao: a linha volta a receber valor, vencimento e descricao do Asaas na proxima '
  'sincronizacao. Linha orfa (fora do gateway) e apagada, porque nao ha a que voltar.';

revoke all on function public.redefinir_previsao_asaas(uuid) from public, anon;
grant execute on function public.redefinir_previsao_asaas(uuid) to authenticated;


-- Vincular a um aluno quando o casamento automático não achou (nome
-- diferente no gateway, sem CPF, e-mail pessoal x e-mail do cadastro).
create or replace function public.vincular_previsao_cliente(
  p_id uuid,
  p_cliente uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_cus text;
begin
  if not public.is_gestao() then
    raise exception 'apenas a gestão vincula previsão a aluno';
  end if;

  update public.previsoes_asaas
  set cliente_id = p_cliente
  where id = p_id
  returning asaas_customer_id into v_cus;

  if v_cus is null then
    raise exception 'linha de previsão inexistente';
  end if;

  -- O vínculo feito à mão vale para o gateway inteiro: grava o id no
  -- cliente para as outras linhas dessa pessoa casarem sozinhas.
  update public.clientes
  set asaas_customer_id = v_cus
  where id = p_cliente and asaas_customer_id is null;

  update public.previsoes_asaas
  set cliente_id = p_cliente
  where asaas_customer_id = v_cus and cliente_id is null;
end;
$fn$;

comment on function public.vincular_previsao_cliente(uuid, uuid) is
  'Liga uma linha de previsao ao aluno e grava o asaas_customer_id no cadastro, para as demais linhas '
  'da mesma pessoa casarem automaticamente.';

revoke all on function public.vincular_previsao_cliente(uuid, uuid) from public, anon;
grant execute on function public.vincular_previsao_cliente(uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- 5. A view que as telas leem
-- ------------------------------------------------------------
-- `security_invoker`: a view para de devolver dado para quem não é
-- gestão por conta própria, pela policy da tabela (§5.2).
create or replace view public.vw_previsao_asaas
with (security_invoker = true) as
select
  p.id,
  p.ref,
  p.tipo,
  p.cliente_id,
  p.asaas_customer_id,
  -- O nome do cadastro quando existe; o do gateway quando a linha ainda
  -- não casou com ninguém.
  coalesce(c.nome, p.nome_no_gateway) as nome,
  (p.cliente_id is null) as sem_vinculo,
  p.vencimento,
  to_char(p.vencimento, 'YYYY-MM') as mes,
  p.valor_centavos,
  p.descricao,
  p.editado_em is not null as editada,
  p.oculto,
  p.fora_do_gateway,
  p.sincronizado_em
from public.previsoes_asaas p
left join public.clientes c on c.id = p.cliente_id;

comment on view public.vw_previsao_asaas is
  'Previsao do Asaas pronta para a tela: nome resolvido (cadastro ou gateway), mes do vencimento e as '
  'marcas de editada/oculta/orfa. Inclui as ocultas — quem filtra e a tela, senao nao haveria como reexibir.';

grant select on public.vw_previsao_asaas to authenticated;


-- ------------------------------------------------------------
-- 6. O cron
-- ------------------------------------------------------------
-- Mesmo padrão de `disparar_cobrancas()` (§14.4): lê `project_url` e
-- `anon_key` do Vault DESTE projeto, então ambiente sem os segredos não
-- faz nada — é o que impede o DEV de falar com o gateway de produção.
create or replace function public.disparar_previsao_asaas()
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
    url := v_url || '/functions/v1/asaas-previsao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('modo', 'cron')
  );
end;
$$;

comment on function public.disparar_previsao_asaas() is
  'Manda a Edge Function sincronizar a previsao com o Asaas. Sem project_url/anon_key no Vault, nao faz '
  'nada — trava de isolamento do DEV.';

revoke all on function public.disparar_previsao_asaas() from public, anon, authenticated;

-- 8h: antes das 9h de `emitir-cobrancas`, para a previsão do dia já
-- refletir o que o emissor vai fazer em seguida.
select cron.unschedule('sincronizar-previsao-asaas')
where exists (select 1 from cron.job where jobname = 'sincronizar-previsao-asaas');

select cron.schedule(
  'sincronizar-previsao-asaas',
  '0 8 * * *',
  $$select public.disparar_previsao_asaas()$$
);


-- ------------------------------------------------------------
-- 7. A view antiga deixa de ser a previsão
-- ------------------------------------------------------------
-- Só o comentário muda. A view fica: ela responde "o que o ERP
-- esperaria receber", que é a pergunta de conciliação do dia em que a
-- previsão do gateway e as matrículas discordarem. O que ela não é mais
-- é a fonte de nenhuma tela.
comment on view public.vw_previsao_mensalidades is
  'SEGUNDA opiniao: o que o ERP projetaria a partir de matriculas. NAO e mais a previsao de receita das '
  'telas — desde 04/11/2026 a previsao sai do Asaas (previsoes_asaas), porque o gateway e quem cobra. '
  'Serve para conciliar as duas visoes quando elas discordarem.';
