-- ============================================================
-- Elegibilidade que de fato barra · e-mail obrigatório no plano
-- 22/09/2026
--
-- ------------------------------------------------------------
-- O que estava errado
-- ------------------------------------------------------------
-- `produto_requisitos` existe desde `20260820120000`, com os três tipos
-- certos e os dados certos em produção:
--   · Aula experimental e 2 experimentais → nunca_treinou
--   · Crédito extra                       → plano_ativo
--   · Studio+ · 4 aulas                   → checkins_wellhub 4/30d
--
-- E NADA lia essa tabela. `matricular_produto()` não a consulta em
-- momento nenhum, e o portal usa os requisitos só para desenhar um selo
-- ("Primeira vez aqui"). A única trava real era `limite_por_cliente`,
-- que impede comprar O MESMO produto duas vezes — não impede um
-- ex-aluno de 2024 comprar a aula experimental hoje, que é justamente
-- o caso que a gestão levantou.
--
-- ------------------------------------------------------------
-- Onde a trava tem que morar
-- ------------------------------------------------------------
-- Dentro de `matricular_produto()`. A RPC é SECURITY DEFINER, então a
-- RLS não alcança o que ela faz — é ela mesma quem precisa recusar.
-- `matricular_turma_fixa()` delega para ela, então os dois caminhos
-- ficam cobertos por uma checagem só.
--
-- ------------------------------------------------------------
-- "Wellhub ativo" não é dado que o ERP tenha
-- ------------------------------------------------------------
-- O regulamento 10.2 exige "possuir Wellhub ativo na unidade E ter
-- realizado no mínimo 4 check-ins pelo Wellhub nos últimos 30 dias". A
-- Wellhub não expõe vínculo nem financeiro por API (§12.6), então a
-- primeira metade é inverificável aqui. A segunda é exata: está em
-- `presencas` com canal = 'wellhub'. É o proxy legítimo, e é o que a
-- função checa — quem não tem Wellhub ativo não acumula 4 check-ins.
--
-- ------------------------------------------------------------
-- Refinamento do §8 (regulamento de outubro)
-- ------------------------------------------------------------
-- O crédito extra passou a ser "só para quem tem PLANO POR CRÉDITOS
-- ativo" — antes era "plano ativo". Quem tem Mensalidade por Turma Fixa
-- deixa de poder comprar, porque não tem saldo em que o crédito caiba.
-- Por isso `plano_ativo` exige `gera_credito`, não só matrícula viva.
--
-- ------------------------------------------------------------
-- A exceção da gestão (D9)
-- ------------------------------------------------------------
-- "Somente a gestão pode passar por cima, mas precisa ter telas de
-- confirmação e históricos de autorização." A RPC ganha
-- `p_justificativa`: sem ela, a gestão é barrada igual a todo mundo;
-- com ela, a venda passa e a autorização fica gravada em `auditoria`
-- com quem, quando, qual requisito e por quê. Aluno nunca passa, com
-- ou sem justificativa.
--
-- ------------------------------------------------------------
-- E-mail obrigatório em plano (item 04)
-- ------------------------------------------------------------
-- `clientes.email` é a coluna que TODOS os e-mails transacionais usam,
-- e o formulário da gestão nunca teve esse campo — todo aluno criado
-- por ela nascia mudo. O 4.18 promete comunicar cancelamento de aula
-- "pelos canais de contato cadastrados" e o 7.1 exige confirmação de
-- cancelamento "por escrito". Sem e-mail, as duas promessas são
-- impossíveis. Exigido para `tipo_produto = 'plano'`; pacote e serviço
-- avulso seguem sem exigir, para não travar a venda de balcão.
--
-- Idempotente de propósito: roda igual numa base que já a recebeu.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Livro de auditoria
-- ------------------------------------------------------------
-- Primeiro uso é a autorização de exceção deste PR. A tabela é genérica
-- porque o item 22 da auditoria vai pendurar nela as demais ações
-- administrativas (alteração de preço, de remuneração, de config) —
-- hoje nenhuma delas deixa rastro de "valor anterior → valor novo".

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid,
  acao text not null,
  antes jsonb,
  depois jsonb,
  motivo text,
  autor uuid references auth.users(id) default auth.uid(),
  criado_em timestamptz not null default now()
);

comment on table public.auditoria is
  'Quem fez o quê, quando, com que valores e por quê. Append-only por '
  'convenção: não há RPC que apague linha daqui.';

create index if not exists auditoria_tabela_registro_idx
  on public.auditoria (tabela, registro_id);
create index if not exists auditoria_criado_em_idx
  on public.auditoria (criado_em desc);

alter table public.auditoria enable row level security;

drop policy if exists "gestao le auditoria" on public.auditoria;
create policy "gestao le auditoria" on public.auditoria
  for select using (public.is_gestao());

-- Escrita só pelas RPCs (security definer). Sem policy de insert, nem a
-- gestão grava direto — o que impede linha de auditoria forjada pela UI.


-- ------------------------------------------------------------
-- 2) A elegibilidade, como função consultável
-- ------------------------------------------------------------
-- Devolve linha única para a tela conseguir explicar o "por quê" antes
-- de o usuário tentar comprar. A mesma função é a trava na RPC.

create or replace function public.elegivel_para_produto(
  p_cliente uuid,
  p_produto uuid
) returns table (ok boolean, motivo text)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  req record;
  n integer;
begin
  for req in
    select * from public.produto_requisitos where produto_id = p_produto
  loop
    case req.tipo

      -- 8.x: "para quem NUNCA treinou no Studio". Histórico, não estado
      -- atual: quem treinou em 2024 e sumiu continua sem direito.
      when 'nunca_treinou' then
        if exists (select 1 from public.presencas where cliente_id = p_cliente)
           or exists (select 1 from public.matriculas where cliente_id = p_cliente)
           or exists (select 1 from public.clientes
                      where id = p_cliente and ultima_aula is not null)
        then
          return query select false,
            'este produto é só para quem nunca treinou no Studio'::text;
          return;
        end if;

      -- §8: "só para quem tem Plano por Créditos ativo". Turma Fixa não
      -- serve — não há saldo em que o crédito extra caiba.
      when 'plano_ativo' then
        if not exists (
          select 1 from public.matriculas m
          join public.produtos pr on pr.id = m.plano_id
          where m.cliente_id = p_cliente
            and m.status = 'ativa'
            and pr.gera_credito
            and coalesce(pr.creditos_por_ciclo, 0) > 0
            and pr.id <> p_produto
        ) then
          return query select false,
            'este produto é só para quem tem um Plano por Créditos ativo'::text;
          return;
        end if;

      -- 10.2: mínimo de check-ins Wellhub na janela. É o proxy de
      -- "Wellhub ativo na unidade", que a API deles não expõe.
      when 'checkins_wellhub' then
        select count(*) into n
        from public.presencas
        where cliente_id = p_cliente
          and canal = 'wellhub'
          and presente
          and data_aula >= current_date - coalesce(req.janela_dias, 30);
        if n < coalesce(req.parametro_int, 1) then
          return query select false,
            format('este produto exige %s check-ins pelo Wellhub nos últimos %s dias (você tem %s)',
                   coalesce(req.parametro_int, 1), coalesce(req.janela_dias, 30), n)::text;
          return;
        end if;
    end case;
  end loop;

  return query select true, null::text;
end;
$$;

comment on function public.elegivel_para_produto(uuid, uuid) is
  'Avalia produto_requisitos para um cliente. Serve à tela (explicar '
  'por que não aparece) e é a trava dentro de matricular_produto().';

revoke execute on function public.elegivel_para_produto(uuid, uuid) from public, anon;
grant execute on function public.elegivel_para_produto(uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- 3) matricular_produto(): a trava, a exceção e o e-mail
-- ------------------------------------------------------------

create or replace function public.matricular_produto(
  p_cliente uuid,
  p_plano uuid,
  p_justificativa text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  pr record;
  m_id uuid;
  lote uuid;
  autor uuid;
  eh_cliente boolean;
  dia smallint;
  fim date;
  validade date;
  ja_tem integer;
  eleg record;
  just text := nullif(btrim(coalesce(p_justificativa, '')), '');
  email_cliente text;
begin
  eh_cliente := public.is_cliente();

  if auth.uid() is not null then
    if eh_cliente then
      if p_cliente <> public.cliente_atual() then
        raise exception 'aluno só pode contratar para si mesmo';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito à equipe ou ao próprio aluno';
    end if;
  end if;

  autor := case when public.is_socia() then auth.uid() end;

  select * into pr from public.produtos where id = p_plano and ativo;
  if not found then
    raise exception 'produto inexistente ou inativo';
  end if;

  -- A trava que a RLS não consegue dar aqui (SECURITY DEFINER).
  -- Mensagem deliberadamente igual à de produto inexistente: dizer
  -- "este é oculto" confirmaria a existência dele para quem tentou.
  if eh_cliente and not pr.visivel_no_catalogo then
    raise exception 'produto inexistente ou inativo';
  end if;

  -- ---- Elegibilidade (regulamento §8 e §10) ----
  select * into eleg from public.elegivel_para_produto(p_cliente, p_plano);

  -- `auth.uid() is null` é contexto de serviço (import, cron, migration),
  -- e o resto desta função já o trata como confiável — a checagem de
  -- papel logo acima também é pulada nele. Manter a mesma convenção
  -- aqui: a primeira versão barrava o import do Wix, que não tem uid e
  -- por isso reprovava em `is_gestao()`.
  if not eleg.ok and auth.uid() is not null then
    -- Aluno nunca passa, com ou sem justificativa.
    if eh_cliente or not public.is_gestao() then
      raise exception '%', eleg.motivo;
    end if;
    -- Gestão passa, mas escrevendo por quê (D9).
    if just is null then
      raise exception
        '% — para vender assim mesmo, informe a justificativa (ela fica registrada)',
        eleg.motivo;
    end if;
  end if;

  -- ---- E-mail é pré-requisito de plano, não detalhe de cadastro ----
  if pr.tipo_produto = 'plano' then
    select nullif(btrim(coalesce(email, '')), '') into email_cliente
    from public.clientes where id = p_cliente;
    if email_cliente is null then
      raise exception
        'este aluno está sem e-mail. Plano manda confirmação de contratação, aviso de aula cancelada e cobrança por e-mail — cadastre antes de matricular';
    end if;
  end if;

  if pr.limite_por_cliente is not null then
    select count(*) into ja_tem from public.matriculas
    where cliente_id = p_cliente and plano_id = p_plano
      and status <> 'cancelada';
    if ja_tem >= pr.limite_por_cliente then
      raise exception 'limite de % contratação(ões) deste produto por cliente já atingido',
        pr.limite_por_cliente;
    end if;
  end if;

  -- A17: assinatura vai até a véspera do mesmo dia no mês seguinte.
  dia := extract(day from current_date)::smallint;
  fim := public.data_renovacao(current_date, 1, dia, pr.periodicidade_meses, pr.periodicidade_dias) - 1;

  insert into public.matriculas
    (cliente_id, plano_id, data_inicio, data_fim, creditos_total,
     ciclos_compromisso, ciclo_atual,
     preco_contratado_centavos, renova_automaticamente, dia_renovacao)
  values
    (p_cliente, p_plano, current_date, fim,
     pr.creditos_por_ciclo, pr.ciclos_compromisso, 1,
     pr.preco_centavos, coalesce(pr.renova_automaticamente, false), dia)
  returning id into m_id;

  -- A autorização de exceção fica junto da matrícula que ela liberou:
  -- é assim que alguém entende, meses depois, por que aquela venda
  -- passou por cima do requisito.
  if not eleg.ok then
    insert into public.auditoria (tabela, registro_id, acao, depois, motivo)
    values ('matriculas', m_id, 'excecao_elegibilidade',
            jsonb_build_object('produto', pr.nome, 'cliente_id', p_cliente,
                               'requisito_nao_atendido', eleg.motivo),
            just);
  end if;

  if pr.gera_credito and pr.creditos_por_ciclo > 0 then
    -- Sem validade própria, o crédito vale até o fim do ciclo.
    validade := case
      when pr.validade_creditos_dias is not null then current_date + pr.validade_creditos_dias
      else fim
    end;

    insert into public.creditos_lotes
      (matricula_id, ciclo, quantidade, validade, origem, detalhe)
    values (m_id, 1, pr.creditos_por_ciclo, validade, 'compra',
            pr.nome || ' — ciclo 1')
    returning id into lote;

    insert into public.creditos_eventos
      (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
    values (m_id, lote, pr.creditos_por_ciclo, 'compra',
            pr.nome || ' — ciclo 1', autor);
  end if;

  perform public.cobrar_ciclo(m_id, 1, current_date);

  return m_id;
end;
$$;

comment on function public.matricular_produto(uuid, uuid, text) is
  'Contrata um produto. Barra por produto_requisitos (§8, §10) e por '
  'e-mail ausente em plano. Gestão pode excepcionar com justificativa, '
  'que fica em auditoria; aluno nunca.';

revoke execute on function public.matricular_produto(uuid, uuid, text) from public, anon;
grant execute on function public.matricular_produto(uuid, uuid, text) to authenticated;

-- A versão de 2 argumentos deixa de existir: `matricular_turma_fixa()`
-- e o portal chamam com 2 e caem no default do 3º. Deixar as duas
-- assinaturas vivas criaria ambiguidade de resolução.
drop function if exists public.matricular_produto(uuid, uuid);


-- ------------------------------------------------------------
-- 4) Os dois wrappers propagam a justificativa
-- ------------------------------------------------------------
-- `matricular()` e `matricular_turma_fixa()` delegam para
-- `matricular_produto()`, e é por eles que o front entra. Sem repassar
-- a justificativa, a exceção da gestão seria inalcançável pela tela —
-- a trava existiria e não teria válvula.

create or replace function public.matricular(
  p_cliente uuid,
  p_plano uuid,
  p_justificativa text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  pr record;
begin
  select turmas_fixas, nome into pr from public.produtos where id = p_plano;
  if found and coalesce(pr.turmas_fixas, 0) > 0 then
    raise exception
      '% é uma Mensalidade por Turma Fixa: a matrícula precisa escolher a(s) turma(s) da grade',
      pr.nome;
  end if;
  return public.matricular_produto(p_cliente, p_plano, p_justificativa);
end; $$;

revoke execute on function public.matricular(uuid, uuid, text) from public, anon;
grant execute on function public.matricular(uuid, uuid, text) to authenticated;
drop function if exists public.matricular(uuid, uuid);


create or replace function public.matricular_turma_fixa(
  p_cliente uuid,
  p_produto uuid,
  p_turmas uuid[],
  p_justificativa text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  pr record;
  m_id uuid;
  t uuid;
  n integer;
  distintas uuid[];
begin
  if auth.uid() is not null and not public.is_socia() then
    -- Turma fixa nao e autocompra: o assento sai da capacidade da sala
    -- e a escolha da turma passa pela equipe (regulamento 2.3.1).
    raise exception 'acesso restrito à equipe';
  end if;

  select * into pr from public.produtos where id = p_produto and ativo;
  if not found then
    raise exception 'produto inexistente ou inativo';
  end if;
  if coalesce(pr.turmas_fixas, 0) = 0 then
    raise exception '% não é uma Mensalidade por Turma Fixa', pr.nome;
  end if;

  -- Distintas: array com a mesma turma duas vezes viraria uma linha so
  -- pelo indice unico e o aluno pagaria por 2 assentos tendo 1.
  select count(distinct x) into n from unnest(p_turmas) as x;
  if n <> pr.turmas_fixas then
    raise exception '% exige % turma(s) distinta(s); vieram %',
      pr.nome, pr.turmas_fixas, n;
  end if;

  foreach t in array p_turmas loop
    perform public.validar_assento_fixo(t, current_date);
  end loop;

  select array_agg(distinct x) into distintas from unnest(p_turmas) as x;

  m_id := public.matricular_produto(p_cliente, p_produto, p_justificativa);

  foreach t in array distintas loop
    insert into public.matricula_turmas (matricula_id, turma_id, inicio, criada_por)
    values (m_id, t, current_date, auth.uid());
  end loop;

  return m_id;
end; $$;

revoke execute on function public.matricular_turma_fixa(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.matricular_turma_fixa(uuid, uuid, uuid[], text) to authenticated;
drop function if exists public.matricular_turma_fixa(uuid, uuid, uuid[]);
