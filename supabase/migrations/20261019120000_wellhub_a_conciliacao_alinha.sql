-- ============================================================
-- Wellhub: a conciliação é que alinha, e a primeira visita não paga
-- 05/10/2026
-- ============================================================
-- A gestão, depois de ver o PR do valor por plano, com três correções
-- que mudam o desenho:
--
--   "30,78 silver+ e 32,66 gold.
--    mas isso pode mudar/alterar... a construção do sistema não pode ser
--    100% baseada em cima disso.
--    além disso, quando é a primeira visita do aluno, a gente não recebe
--    o check-in.
--    então tem que ser uma forma de ao inputarmos o relatório final do
--    wellhub, o sistema alinhar e etc"
--
-- As três viram três mudanças:
--
-- ## 1. O preço combinado é um dado, não uma constante
--
-- `wellhub_precos_referencia` guarda o que foi combinado com a Wellhub,
-- **por nome** — porque é o nome que a gestão conhece ("Silver+"), não o
-- `product_id` que só aparece no primeiro check-in.
--
-- Quando um plano novo chega, `registrar_plano_wellhub()` procura o nome
-- nessa tabela: achou, nasce com o valor certo e já confirmado; não
-- achou, nasce com o padrão e pede o valor (como antes).
--
-- São duas tabelas porque são duas coisas: a referência é **o que foi
-- combinado**, `wellhub_planos` é **o que o sistema viu acontecer**. A
-- referência semeia; depois disso, quem manda é `wellhub_planos`, que é
-- onde a gestão edita. Mudar a referência não reescreve plano já visto —
-- senão uma correção de tabela mexeria em previsão de meses passados.
--
-- ## 2. A primeira visita não gera receita prevista
--
-- "Quando é a primeira visita do aluno, a gente não recebe o check-in."
-- O sistema lançava previsão para ela igual, e isso inflava a previsão
-- de todo mês que trouxe gente nova — justamente o que a gestão olha
-- para decidir.
--
-- Primeira visita = **nenhum check-in Wellhub anterior nossa casa**. A
-- partir do segundo, lança normal. O comentário do CLAUDE.md §12.5 já
-- previa o caso ("valor pode ser R$ 0 — primeira visita grátis"); o que
-- faltava era o sistema saber distinguir.
--
-- ## 3. A conciliação alinha, e mostra a diferença
--
-- Era uma divisão **igual** do repasse entre os check-ins do mês. Com
-- dois planos de valores diferentes, dividir igual apaga a distinção que
-- acabamos de criar: o Gold vira Silver+ no histórico.
--
-- Agora a distribuição é **proporcional ao previsto** de cada check-in,
-- e a função devolve o retrato do acerto: previsto, real e a diferença.
-- É esse número que responde "o nosso preço por plano ainda está certo?"
-- — e é a resposta para "não pode ser 100% baseado nisso". O sistema
-- prevê, o relatório corrige, e a diferença fica à vista.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Os preços combinados, por nome
-- ------------------------------------------------------------
create table if not exists public.wellhub_precos_referencia (
  nome text primary key,
  valor_centavos bigint not null check (valor_centavos >= 0),
  observacao text,
  atualizada_em timestamptz not null default now()
);

comment on table public.wellhub_precos_referencia is
  'O que foi combinado com a Wellhub, por nome de plano. Serve para um plano novo nascer com o valor certo em vez de pedir à gestão. Semeia wellhub_planos no primeiro check-in e para por aí: depois disso quem manda é wellhub_planos, que é onde a gestão edita.';

alter table public.wellhub_precos_referencia enable row level security;

drop policy if exists "gestao ve precos wellhub" on public.wellhub_precos_referencia;
create policy "gestao ve precos wellhub" on public.wellhub_precos_referencia
  for all to authenticated
  using (public.is_gestao()) with check (public.is_gestao());

-- Os valores informados pela gestão em 05/10/2026. Não são constante de
-- código: são linha de tabela, e mudam por edição.
insert into public.wellhub_precos_referencia (nome, valor_centavos, observacao) values
  ('Silver+', 3078, 'informado pela gestão em 05/10/2026'),
  ('Gold',    3266, 'informado pela gestão em 05/10/2026')
on conflict (nome) do nothing;


-- ------------------------------------------------------------
-- 2. O plano novo nasce com o preço combinado, quando há
-- ------------------------------------------------------------
-- Reescrita de `20261018120000`. Muda só a origem do valor inicial e a
-- consequência disso: com preço de referência, o plano já nasce
-- confirmado e ninguém precisa ser avisado.
create or replace function public.registrar_plano_wellhub(
  p_product_id integer,
  p_descricao text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ja boolean;
  destino text;
  dados jsonb;
  padrao bigint;
  combinado bigint;
  nome text := nullif(btrim(coalesce(p_descricao, '')), '');
begin
  if p_product_id is null then return; end if;

  select true into ja from public.wellhub_planos where product_id = p_product_id;

  if ja then
    update public.wellhub_planos
    set descricao = coalesce(nome, descricao),
        visto_em = now()
    where product_id = p_product_id;
    return;
  end if;

  select coalesce(valor_checkin_wellhub_centavos, 0) into padrao
  from public.config_agendamento where id;

  -- O nome vem da Wellhub e pode variar em maiúscula/espaço; a
  -- comparação ignora os dois.
  if nome is not null then
    select r.valor_centavos into combinado
    from public.wellhub_precos_referencia r
    where lower(btrim(r.nome)) = lower(nome);
  end if;

  insert into public.wellhub_planos (product_id, descricao, valor_centavos, confirmado)
  values (p_product_id, nome, coalesce(combinado, padrao, 0), combinado is not null)
  on conflict (product_id) do nothing;

  -- Plano que já nasceu com o preço combinado não precisa de aviso: não
  -- há nada para a gestão responder.
  if combinado is not null then return; end if;

  dados := jsonb_build_object(
    'nome', coalesce(nome, 'Plano ' || p_product_id),
    'product_id', p_product_id,
    'valor_padrao_centavos', coalesce(padrao, 0));

  for destino in select public.emails_gestao() loop
    perform public.enfileirar_email('wellhub_plano_novo', destino, dados,
      'wellhub-plano:' || p_product_id::text || ':' || destino);
  end loop;
end;
$function$;

comment on function public.registrar_plano_wellhub(integer, text) is
  'Cadastra o plano Wellhub na primeira vez que ele aparece num check-in. Se o nome estiver na tabela de preços combinados, nasce com o valor certo e confirmado; se não, nasce com o padrão e a gestão é avisada.';

revoke execute on function public.registrar_plano_wellhub(integer, text) from public, anon;


-- ------------------------------------------------------------
-- 3. A primeira visita nao gera receita prevista
-- ------------------------------------------------------------
-- Gerada do arquivo de `20261018120000`. A unica diferenca e o bloco da
-- primeira visita.
create or replace function public.integrar_presenca()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  valor bigint;
  prox15 date;
  rotulo text;
  cat public.categoria_entrada;
begin
  if new.presente then
    update public.clientes
    set ultima_aula = new.data_aula
    where id = new.cliente_id
      and (ultima_aula is null or ultima_aula < new.data_aula);

    if new.canal in ('wellhub', 'totalpass') then
      if new.canal = 'wellhub' then
        -- O valor depende do PLANO do assinante (Silver+, Gold…), que vem
        -- no payload do check-in. Sem plano conhecido, cai no padrão da
        -- configuração — que passou a ser justamente isso: o padrão.
        valor := public.valor_checkin_wellhub(new.wellhub_product_id);
        rotulo := 'Check-in Wellhub';
        cat := 'wellhub';

        -- A PRIMEIRA visita da pessoa pela Wellhub nao e repassada
        -- ("quando e a primeira visita do aluno, a gente nao recebe o
        -- check-in"). Lancar previsao nela inflava o mes que trouxe
        -- gente nova — justamente o mes que a gestao olha para decidir.
        -- A aula acontece e a professora e paga do mesmo jeito: o que
        -- nao existe e o repasse.
        if not exists (
          select 1 from public.presencas p
           where p.cliente_id = new.cliente_id
             and p.canal = 'wellhub' and p.presente and p.id <> new.id
             and (p.data_aula < new.data_aula
                  or (p.data_aula = new.data_aula and p.criado_em < new.criado_em))
        ) then
          valor := 0;
        end if;
      else
        select valor_checkin_totalpass_centavos into valor from public.config_agendamento;
        rotulo := 'Check-in TotalPass';
        cat := 'totalpass';
      end if;

      -- Valor 0 = não sabemos quanto a plataforma paga. Não lança.
      if valor > 0 then
        prox15 := (date_trunc('month', new.data_aula) + interval '1 month + 14 days')::date;

        -- Upsert, e não "insere se não existir": o plano do assinante
        -- chega DEPOIS da presença (o check-in grava a presença e só
        -- então marca o plano), e o gatilho roda de novo nessa hora. Sem
        -- reprecificar, a receita ficaria congelada no valor padrão.
        -- Só mexe no que ainda não foi conciliado.
        update public.entradas_financeiras
        set valor_centavos = valor, descricao = rotulo
        where presenca_id = new.id and status = 'prevista';

        if not found then
          insert into public.entradas_financeiras
            (descricao, valor_centavos, categoria, status, data_competencia,
             data_prevista, cliente_id, presenca_id)
          select rotulo, valor, cat, 'prevista', new.data_aula,
                 prox15, new.cliente_id, new.id
          where not exists (
            select 1 from public.entradas_financeiras where presenca_id = new.id);
        end if;
      end if;
    end if;
  else
    -- correção de presença → falta: remove a previsão ainda não reconciliada
    delete from public.entradas_financeiras
    where presenca_id = new.id and status = 'prevista';
  end if;
  return new;
end;
$function$;


-- ------------------------------------------------------------
-- 4. A conciliação alinha, em vez de dividir igual
-- ------------------------------------------------------------
-- `drop` antes do `create` porque o retorno muda: era `integer` (quantos
-- check-ins) e passa a ser o retrato do acerto. `create or replace` não
-- troca tipo de retorno.
--
-- O que muda no comportamento:
--
--   · a distribuição é PROPORCIONAL ao previsto de cada check-in, e não
--     igual. Dividir igual apagaria a distinção entre Silver+ e Gold
--     justamente no histórico, que é onde ela serve para conferir;
--   · a função devolve previsto, real e a diferença — com o detalhe por
--     plano. É esse número que responde "o preço que combinamos ainda
--     está valendo?", e é a razão de o sistema não depender da tabela
--     de preços estar certa.
--
-- O resto é igual ao de `20260808120000`: mesmas travas de papel, de
-- valor e de competência vazia.
drop function if exists public.conciliar_wellhub(date, bigint, date);

create or replace function public.conciliar_wellhub(
  p_mes date,
  p_valor_total_centavos bigint,
  p_data_caixa date default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ini date := date_trunc('month', p_mes)::date;
  fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  dcaixa date := coalesce(p_data_caixa, current_date);
  n integer;
  previsto bigint;
  distribuido bigint := 0;
  primeiro uuid;
  detalhe jsonb;
  r record;
  parte bigint;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito às sócias';
  end if;
  if p_valor_total_centavos <= 0 then
    raise exception 'valor do repasse deve ser maior que zero';
  end if;

  select count(*), coalesce(sum(valor_centavos), 0)
    into n, previsto
  from public.entradas_financeiras
  where categoria = 'wellhub' and status = 'prevista'
    and data_competencia >= ini and data_competencia < fim;

  if n = 0 then
    raise exception 'nenhum check-in a reconciliar na competência %',
      to_char(ini, 'MM/YYYY');
  end if;
  if p_valor_total_centavos < n then
    raise exception 'valor menor que o número de check-ins (%) — concilie manualmente', n;
  end if;

  -- O retrato por plano ANTES de mexer: depois do update os valores já
  -- são os reais, e a comparação deixaria de existir.
  select jsonb_agg(x order by x->>'plano') into detalhe
  from (
    select jsonb_build_object(
             'plano', coalesce(w.descricao, 'sem plano identificado'),
             'check_ins', count(*),
             'previsto_centavos', sum(e.valor_centavos)) as x
    from public.entradas_financeiras e
    left join public.presencas pr on pr.id = e.presenca_id
    left join public.wellhub_planos w on w.product_id = pr.wellhub_product_id
    where e.categoria = 'wellhub' and e.status = 'prevista'
      and e.data_competencia >= ini and e.data_competencia < fim
    group by coalesce(w.descricao, 'sem plano identificado')
  ) s;

  select id into primeiro
  from public.entradas_financeiras
  where categoria = 'wellhub' and status = 'prevista'
    and data_competencia >= ini and data_competencia < fim
  order by data_competencia, criada_em
  limit 1;

  -- Proporcional ao previsto. Sem previsão nenhuma (tudo zerado, ex.: mês
  -- só de primeiras visitas que ainda assim foram pagas), cai na divisão
  -- igual — é o melhor palpite possível quando não há proporção.
  for r in
    select id, valor_centavos
    from public.entradas_financeiras
    where categoria = 'wellhub' and status = 'prevista'
      and data_competencia >= ini and data_competencia < fim
    order by data_competencia, criada_em
  loop
    parte := case
      when previsto > 0
        then (p_valor_total_centavos * r.valor_centavos) / previsto
      else p_valor_total_centavos / n
    end;
    update public.entradas_financeiras
    set valor_centavos = greatest(parte, 1),
        status = 'recebida',
        data_caixa = dcaixa
    where id = r.id;
    distribuido := distribuido + greatest(parte, 1);
  end loop;

  -- O arredondamento sobra (ou falta) no primeiro lançamento, para a soma
  -- bater com o repasse ao centavo.
  if distribuido <> p_valor_total_centavos then
    update public.entradas_financeiras
    set valor_centavos = greatest(valor_centavos + (p_valor_total_centavos - distribuido), 1)
    where id = primeiro;
  end if;

  return jsonb_build_object(
    'check_ins', n,
    'previsto_centavos', previsto,
    'real_centavos', p_valor_total_centavos,
    'diferenca_centavos', p_valor_total_centavos - previsto,
    'por_plano', coalesce(detalhe, '[]'::jsonb));
end;
$function$;

comment on function public.conciliar_wellhub(date, bigint, date) is
  'Fecha a competência com o valor do relatório do Portal do Parceiro, distribuindo PROPORCIONALMENTE ao previsto de cada check-in (Silver+ e Gold valem diferente). Devolve previsto, real e a diferença, com detalhe por plano — é essa diferença que diz se o preço combinado ainda está valendo.';

revoke execute on function public.conciliar_wellhub(date, bigint, date) from public, anon;
grant execute on function public.conciliar_wellhub(date, bigint, date) to authenticated;
