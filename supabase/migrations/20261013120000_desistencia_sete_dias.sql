-- ============================================================
-- Desistência de 7 dias (CDC art. 49)
-- 05/10/2026
-- ============================================================
-- A26. Pedido da gestão, com a razão junto: *"é parte da lei, precisa
-- ter essa opção no sistema para a gestão cancelar"*.
--
-- Regulamento 9.7, cláusula "Desistência de compra feita fora do Studio":
--
--   "Contratações realizadas fora do Studio — pelo site, WhatsApp ou
--    telefone — podem ser desfeitas em até {{DIAS_DESISTENCIA}} dias
--    corridos a contar da compra, conforme o art. 49 do Código de Defesa
--    do Consumidor.
--    Se já houver aula utilizada nesse período, será descontado o valor
--    da aula avulsa correspondente e devolvido o saldo remanescente."
--
-- ## Desistir não é cancelar
--
-- Os dois já existem e fazem coisas opostas, o que é a parte fácil de
-- errar aqui:
--
-- | | cancelar assinatura (9.1) | desistência (9.7) |
-- |---|---|---|
-- | o contrato | continua até o fim do ciclo pago | é **desfeito** |
-- | os créditos | valem até expirarem | expiram **agora** |
-- | o dinheiro | fica | **volta**, menos as aulas usadas |
-- | quem decide | aluno pede, gestão encerra | **gestão**, porque mexe em dinheiro |
--
-- Por isso é função própria e não um parâmetro de `cancelar_assinatura()`:
-- ela foi escrita justamente para NÃO tirar o que já foi pago.
--
-- ## O que o sistema não sabe, e por isso não decide
--
-- O art. 49 vale para compra **fora do estabelecimento**. O sistema sabe
-- se o pedido entrou pelo portal (aí é fora, sem dúvida), mas uma venda
-- registrada pela equipe pode ter sido no balcão (não vale) ou por
-- WhatsApp (vale). Essa é uma informação que só quem atendeu tem.
--
-- Então o sistema **calcula e mostra**, e quem decide é a gestão —
-- inclusive porque é ela que vai fazer o Pix de volta. `origem` e o
-- alerta vão junto na tela, para a decisão ser tomada com o dado à
-- vista em vez de de memória.
--
-- ## O dinheiro
--
-- * **devolvido** = pago − (aulas utilizadas × valor da aula avulsa).
--   Nenhum dos dois é constante: o pago é a soma das entradas
--   `recebidas` da matrícula, e o valor da avulsa sai do catálogo (o
--   produto com a etiqueta `AULA_AVULSA`, derivada de coluna). Havendo
--   mais de uma avulsa ativa, vale a **mais barata** — em dúvida sobre
--   qual é a "correspondente", a lei do consumidor pende para o
--   consumidor.
-- * **aula utilizada é presença**, não crédito consumido. Quem agendou e
--   não foi perdeu o crédito pela regra de no-show, mas não "utilizou"
--   aula nenhuma — e num direito de arrependimento essa diferença é a
--   favor de quem desiste.
-- * a entrada do financeiro fica no valor **retido**, pelo mesmo caminho
--   que o estorno de cartão já usa (`20261003190000`): entrada positiva
--   menor, nunca lançamento negativo, porque `entradas_financeiras` tem
--   `check (valor_centavos > 0)` e o módulo inteiro assume isso. Retido
--   zero cancela a entrada.
--
-- ⚠️ **O Pix de volta é manual**, e tem de ser: não existe (nem deve
-- existir sem decisão) caminho automático para o sistema devolver
-- dinheiro. O registro em `desistencias` é o comprovante do que foi
-- combinado, com valor, data e autor.
--
-- ⚠️ **Assinatura de cartão ativa no gateway não é encerrada daqui.**
-- Quem cancela recorrência no Asaas é o painel deles. A função avisa, a
-- tela avisa, e sem isso o aluno que desistiu seria cobrado de novo no
-- mês seguinte — o pior desfecho possível desta história.
-- ============================================================


-- ------------------------------------------------------------
-- 1. O registro
-- ------------------------------------------------------------
-- Guarda os números do momento da decisão, não ponteiros para eles: o
-- preço da avulsa muda, o catálogo muda, e seis meses depois ninguém
-- consegue reconstruir por que o valor devolvido foi aquele.
create table if not exists public.desistencias (
  id uuid primary key default gen_random_uuid(),

  matricula_id uuid not null references public.matriculas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  produto_nome text not null,

  -- 'portal' | 'equipe' | null (matrícula criada direto, sem solicitação)
  origem_contratacao text,
  comprada_em date not null,
  dias_desde_compra integer not null,

  pago_centavos bigint not null check (pago_centavos >= 0),
  aulas_utilizadas integer not null check (aulas_utilizadas >= 0),
  valor_aula_avulsa_centavos bigint not null check (valor_aula_avulsa_centavos >= 0),
  retido_centavos bigint not null check (retido_centavos >= 0),
  devolvido_centavos bigint not null check (devolvido_centavos >= 0),

  motivo text,
  decidida_por uuid references auth.users(id),
  criada_em timestamptz not null default now(),

  -- Uma matrícula se desfaz uma vez só.
  unique (matricula_id)
);

comment on table public.desistencias is
  'Desistência de contratação feita fora do estúdio (regulamento 9.7 / CDC art. 49). Guarda os números do momento da decisão — pago, aulas usadas, preço da avulsa, retido e devolvido — porque é esse o comprovante do acerto, e o catálogo muda.';

create index if not exists desistencias_por_cliente
  on public.desistencias (cliente_id, criada_em desc);

alter table public.desistencias enable row level security;

-- Dinheiro: leitura da gestão, como cobranças e entradas. A secretária
-- não vê valor em lugar nenhum do sistema (CLAUDE.md 5.2).
drop policy if exists "gestao ve desistencias" on public.desistencias;
create policy "gestao ve desistencias" on public.desistencias
  for select to authenticated using (public.is_gestao());

-- Sem policy de escrita: quem grava é a RPC `security definer` abaixo.


-- ------------------------------------------------------------
-- 2. Quanto, e se dá
-- ------------------------------------------------------------
-- Uma linha sempre, com `motivo` dizendo por que não dá quando não dá —
-- é o texto que a tela mostra. E com os números mesmo quando não dá: a
-- gestão quer ver a conta antes de responder ao aluno, mesmo que a
-- resposta seja "fora do prazo".
create or replace function public.desistencia_possivel(p_matricula uuid)
returns table (
  pode boolean,
  motivo text,
  comprada_em date,
  dias_desde_compra integer,
  prazo_ate date,
  pago_centavos bigint,
  aulas_utilizadas integer,
  valor_aula_avulsa_centavos bigint,
  retido_centavos bigint,
  devolver_centavos bigint,
  origem_contratacao text,
  alerta text
)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  m record;
  pr record;
  cfg record;
  dias integer;
  compra date;
  prazo date;
  pago bigint;
  aulas integer;
  avulsa bigint;
  retido bigint;
  origem text;
  avisos text[] := '{}';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into m from public.matriculas where id = p_matricula;
  if not found then
    return query select false, 'matrícula não encontrada'::text, null::date, 0, null::date,
      0::bigint, 0, 0::bigint, 0::bigint, 0::bigint, null::text, null::text;
    return;
  end if;
  select * into pr from public.produtos where id = m.plano_id;
  select * into cfg from public.config_agendamento where id;

  dias := coalesce(cfg.dias_desistencia_fora_estudio, 0);
  compra := (m.criada_em at time zone 'America/Sao_Paulo')::date;
  prazo := compra + dias;

  -- ---- os números, calculados sempre ----
  pago := coalesce((
    select sum(e.valor_centavos) from public.entradas_financeiras e
     where e.matricula_id = p_matricula and e.status = 'recebida'
  ), 0)::bigint;

  -- Presença, não crédito consumido: ver o cabeçalho. Pelo agendamento,
  -- que é o que amarra a aula a ESTA matrícula — quem tem dois planos
  -- não pode ter a aula de um contada no outro.
  aulas := coalesce((
    select count(*) from public.presencas p
     join public.agendamentos a on a.id = p.agendamento_id
    where a.matricula_id = p_matricula and p.presente
  ), 0)::integer;

  -- O valor da avulsa sai do catálogo, pela etiqueta derivada de coluna.
  -- A mais barata entre as ativas: ver o cabeçalho.
  select min(x.preco_centavos) into avulsa
  from public.produtos x
  where x.ativo and x.status = 'venda' and x.preco_centavos > 0
    and 'AULA_AVULSA' = any(public.contrato_tags(x.id));
  avulsa := coalesce(avulsa, 0);

  retido := least(aulas * avulsa, pago);

  select s.origem into origem
  from public.solicitacoes_contratacao s
  where s.matricula_id = p_matricula
  order by s.solicitada_em desc
  limit 1;

  -- ---- os alertas ----
  if aulas > 0 and avulsa = 0 then
    avisos := avisos || 'não há aula avulsa ativa no catálogo para calcular o desconto das aulas já utilizadas — confira o valor à mão'::text;
  end if;
  if exists (
    select 1 from public.assinaturas_gateway g
     where g.matricula_id = p_matricula and g.status = 'ativa'
  ) then
    avisos := avisos || 'há assinatura de cartão ATIVA no gateway: cancele no painel do Asaas, senão o aluno será cobrado de novo no próximo ciclo'::text;
  end if;
  -- A primeira cobrança de uma contratação aponta para a SOLICITAÇÃO,
  -- não para a matrícula (ela ainda não existia quando a cobrança
  -- nasceu). Procurar só por matricula_id deixaria passar justamente
  -- a cobrança que interessa numa desistência de 7 dias.
  if exists (
    select 1 from public.cobrancas c
     where c.status = 'pendente'
       and (c.matricula_id = p_matricula
            or c.solicitacao_id in (select s2.id from public.solicitacoes_contratacao s2
                                     where s2.matricula_id = p_matricula))
  ) then
    avisos := avisos || 'há cobrança em aberto: o link de pagamento continua válido no gateway até ser cancelado lá'::text;
  end if;

  -- ---- dá ou não dá ----
  if exists (select 1 from public.desistencias d where d.matricula_id = p_matricula) then
    return query select false, 'esta contratação já foi desfeita por desistência'::text,
      compra, (hoje - compra), prazo, pago, aulas, avulsa, retido, (pago - retido),
      origem, nullif(array_to_string(avisos, ' · '), '');
    return;
  end if;

  if dias <= 0 then
    return query select false, 'o prazo de desistência está desligado na configuração'::text,
      compra, (hoje - compra), prazo, pago, aulas, avulsa, retido, (pago - retido),
      origem, nullif(array_to_string(avisos, ' · '), '');
    return;
  end if;

  if m.status = 'cancelada' then
    return query select false, 'esta matrícula já está cancelada'::text,
      compra, (hoje - compra), prazo, pago, aulas, avulsa, retido, (pago - retido),
      origem, nullif(array_to_string(avisos, ' · '), '');
    return;
  end if;

  if hoje > prazo then
    return query select false,
      format('o prazo de %s dias corridos terminou em %s — o cancelamento comum (9.1) é o caminho',
             dias, to_char(prazo, 'DD/MM/YYYY'))::text,
      compra, (hoje - compra), prazo, pago, aulas, avulsa, retido, (pago - retido),
      origem, nullif(array_to_string(avisos, ' · '), '');
    return;
  end if;

  return query select true, null::text,
    compra, (hoje - compra), prazo, pago, aulas, avulsa, retido, (pago - retido),
    origem, nullif(array_to_string(avisos, ' · '), '');
end;
$function$;

comment on function public.desistencia_possivel(uuid) is
  'A conta da desistência de 7 dias (regulamento 9.7 / CDC art. 49): prazo, valor pago, aulas utilizadas (presenças), desconto pela avulsa do catálogo e quanto devolver. Uma conta só, lida pela tela antes do clique e aplicada por desistir_da_contratacao().';

revoke execute on function public.desistencia_possivel(uuid) from public, anon;
grant execute on function public.desistencia_possivel(uuid) to authenticated;


-- ------------------------------------------------------------
-- 3. Desfazer
-- ------------------------------------------------------------
-- A ordem das operações importa e não é óbvia:
--
--   1. cancelar os agendamentos futuros ANTES de expirar o crédito —
--      cancelar devolve crédito ao lote, e expirar antes deixaria esse
--      crédito vivo depois;
--   2. expirar os lotes, pelo livro-razão (motivo `expiracao`), e não
--      apagando linha: o razão é o que explica ao aluno o que houve com
--      o saldo dele;
--   3. só então mexer na matrícula e no financeiro.
create or replace function public.desistir_da_contratacao(
  p_matricula uuid,
  p_motivo text default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  d record;
  m record;
  pr record;
  r record;
  ag uuid;
  entrada_mantida uuid;
  motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- Mexe em dinheiro: gestão, como o resto do financeiro.
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'só a gestão registra desistência — ela devolve dinheiro';
  end if;

  select * into m from public.matriculas where id = p_matricula for update;
  if not found then raise exception 'matrícula não encontrada'; end if;
  select * into pr from public.produtos where id = m.plano_id;

  select * into d from public.desistencia_possivel(p_matricula);
  if not d.pode then raise exception '%', d.motivo; end if;

  insert into public.desistencias
    (matricula_id, cliente_id, produto_nome, origem_contratacao, comprada_em,
     dias_desde_compra, pago_centavos, aulas_utilizadas,
     valor_aula_avulsa_centavos, retido_centavos, devolvido_centavos,
     motivo, decidida_por)
  values
    (p_matricula, m.cliente_id, coalesce(pr.nome, 'Produto'), d.origem_contratacao,
     d.comprada_em, d.dias_desde_compra, d.pago_centavos, d.aulas_utilizadas,
     d.valor_aula_avulsa_centavos, d.retido_centavos, d.devolver_centavos,
     motivo, auth.uid());

  -- O painel da matrícula tem uma linha do tempo, e ela é o lugar onde
  -- alguém vai procurar "o que houve com essa aluna" daqui a seis
  -- meses. O gatilho de auditoria registra a mudança de situação
  -- sozinho, mas não os NÚMEROS — e numa devolução de dinheiro é o
  -- número que importa.
  insert into public.auditoria (tabela, registro_id, acao, depois, motivo, autor)
  values ('matriculas', p_matricula, 'desistencia_sete_dias',
          jsonb_build_object(
            'pago_centavos', d.pago_centavos,
            'aulas_utilizadas', d.aulas_utilizadas,
            'retido_centavos', d.retido_centavos,
            'devolvido_centavos', d.devolver_centavos,
            'origem_contratacao', d.origem_contratacao),
          motivo, auth.uid());

  -- 1. as aulas que ela ainda tinha marcadas
  for ag in
    select a.id from public.agendamentos a
     where a.matricula_id = p_matricula
       and a.status = 'agendado'
       and a.data >= hoje
  loop
    perform public.cancelar_agendamento(ag, 'socia');
  end loop;

  -- 2. o saldo que sobrou
  for r in
    select l.id, coalesce(sum(ce.delta), 0) as saldo
      from public.creditos_lotes l
      left join public.creditos_eventos ce on ce.lote_id = l.id
     where l.matricula_id = p_matricula
     group by l.id
    having coalesce(sum(ce.delta), 0) > 0
  loop
    insert into public.creditos_eventos
      (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
    values (p_matricula, r.id, -r.saldo, 'expiracao',
            'desistência de 7 dias (CDC art. 49)', auth.uid());
  end loop;

  -- 3. a matrícula se desfaz HOJE, não no fim do ciclo
  update public.matriculas
  set status = 'cancelada',
      cancelada_em = now(),
      cancelamento_efetivo_em = hoje,
      renova_automaticamente = false,
      motivo_cancelamento = coalesce(motivo, 'desistência de 7 dias (CDC art. 49)')
  where id = p_matricula;

  -- A vaga da turma fixa volta para a sala: o contrato que a reservava
  -- deixou de existir.
  -- `greatest(..., inicio)` nao e detalhe: a tabela tem
  -- `check (fim is null or fim >= inicio)`, e um assento que ainda nem
  -- comecou (vinculo com inicio no futuro) quebraria a constraint no
  -- meio da desistencia.
  update public.matricula_turmas
  set fim = greatest(least(coalesce(fim, hoje), hoje), inicio),
      motivo_saida = coalesce(motivo_saida, 'desistência de 7 dias')
  where matricula_id = p_matricula
    and (fim is null or fim > hoje);

  -- 4. o financeiro
  -- Previstas somem: não houve ciclo nenhum.
  update public.entradas_financeiras
  set status = 'cancelada'
  where matricula_id = p_matricula and status = 'prevista';

  -- O que entrou fica no valor RETIDO. Entrada positiva menor, nunca
  -- lançamento negativo — mesmo caminho do estorno de cartão.
  if d.retido_centavos > 0 then
    select e.id into entrada_mantida
      from public.entradas_financeiras e
     where e.matricula_id = p_matricula and e.status = 'recebida'
     order by e.data_caixa desc nulls last, e.criada_em desc
     limit 1;

    update public.entradas_financeiras
    set valor_centavos = d.retido_centavos,
        descricao = descricao || ' (desistência de 7 dias: devolvido R$ '
                    || to_char(d.devolver_centavos / 100.0, 'FM999G990D00') || ')'
    where id = entrada_mantida;

    -- Havendo mais de uma entrada recebida (improvável em 7 dias), as
    -- demais são canceladas: o retido já está inteiro na de cima. Por
    -- ID e não por valor — duas entradas podem ter o mesmo número.
    update public.entradas_financeiras
    set status = 'cancelada',
        descricao = descricao || ' (desistência de 7 dias)'
    where matricula_id = p_matricula and status = 'recebida'
      and id <> entrada_mantida;
  else
    update public.entradas_financeiras
    set status = 'cancelada',
        descricao = descricao || ' (desistência de 7 dias: devolvido integralmente)'
    where matricula_id = p_matricula and status = 'recebida';
  end if;

  -- Cobrança ainda em aberto não deve continuar de pé aqui dentro. No
  -- gateway ela continua — e é por isso que o alerta existe.
  update public.cobrancas
  set status = 'cancelada'
  where status = 'pendente'
    and (matricula_id = p_matricula
         or solicitacao_id in (select s2.id from public.solicitacoes_contratacao s2
                                where s2.matricula_id = p_matricula));

  perform public.avisar_desistencia(p_matricula);

  return d.devolver_centavos;
end;
$function$;

comment on function public.desistir_da_contratacao(uuid, text) is
  'Desfaz a contratação dentro do prazo do art. 49: cancela aulas marcadas, expira o saldo, encerra a matrícula HOJE, libera a vaga de turma fixa e deixa no financeiro só o valor retido pelas aulas usadas. Devolve quanto tem de ser devolvido ao aluno — o Pix é manual, de propósito.';

revoke execute on function public.desistir_da_contratacao(uuid, text) from public, anon;
grant execute on function public.desistir_da_contratacao(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 4. O aviso ao aluno
-- ------------------------------------------------------------
-- O e-mail é o comprovante do acerto para o lado de lá: valor, prazo e o
-- que foi descontado. Sem ele, o aluno fica esperando um Pix sem saber
-- de quanto.
create or replace function public.avisar_desistencia(p_matricula uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  d record;
  c record;
begin
  select * into d from public.desistencias where matricula_id = p_matricula;
  if not found then return; end if;
  select * into c from public.clientes where id = d.cliente_id;
  if nullif(btrim(coalesce(c.email, '')), '') is null then return; end if;

  perform public.enfileirar_email(
    'desistencia_registrada', c.email,
    jsonb_build_object(
      'nome', c.nome,
      'produto', d.produto_nome,
      'pago_centavos', d.pago_centavos,
      'aulas', d.aulas_utilizadas,
      'retido_centavos', d.retido_centavos,
      'devolvido_centavos', d.devolvido_centavos),
    'desistencia:' || d.id::text);
end;
$function$;

revoke execute on function public.avisar_desistencia(uuid) from public, anon;


-- ------------------------------------------------------------
-- 5. A lista, para a tela da gestão
-- ------------------------------------------------------------
create or replace view public.vw_desistencias
with (security_invoker = true) as
select
  d.id,
  d.matricula_id,
  d.cliente_id,
  c.nome as cliente_nome,
  c.telefone as cliente_telefone,
  d.produto_nome,
  d.origem_contratacao,
  d.comprada_em,
  d.dias_desde_compra,
  d.pago_centavos,
  d.aulas_utilizadas,
  d.valor_aula_avulsa_centavos,
  d.retido_centavos,
  d.devolvido_centavos,
  d.motivo,
  d.criada_em,
  s.nome as decisor_nome
from public.desistencias d
join public.clientes c on c.id = d.cliente_id
left join public.socias s on s.id = d.decidida_por;

grant select on public.vw_desistencias to authenticated;

comment on view public.vw_desistencias is
  'As desistências registradas (regulamento 9.7). Leitura da gestão pela RLS da tabela — é o histórico de quanto foi devolvido, a quem e por quem.';


-- ------------------------------------------------------------
-- 6. O parâmetro deixa de ser só texto
-- ------------------------------------------------------------
comment on column public.config_agendamento.dias_desistencia_fora_estudio is
  'Regulamento 9.7 / CDC art. 49: prazo em dias corridos, contado da COMPRA, para desfazer contratação feita fora do estúdio. Lido por desistencia_possivel(). Mudar aqui muda o comportamento e o texto do contrato, que lê pelo marcador DIAS_DESISTENCIA.';


-- ------------------------------------------------------------
-- 7. A desistência na linha do tempo da matrícula
-- ------------------------------------------------------------
-- Gerada do arquivo de `20260925120000` (§2). A única diferença é uma
-- linha a mais no `case` dos rótulos: sem ela, a ação apareceria no
-- histórico como o slug cru `desistencia_sete_dias` (é o `else` da
-- função). As colunas e os tipos não mudam, então o `create or replace`
-- passa.
create or replace view public.vw_historico_matricula
with (security_invoker = true) as

  select
    ce.id,
    ce.matricula_id,
    ce.criado_em as quando,
    'credito'::text as tipo,
    (case when ce.delta > 0 then '+' else '' end) || ce.delta || ' crédito'
      || (case when abs(ce.delta) = 1 then '' else 's' end)
      || ' · ' || ce.motivo as titulo,
    ce.detalhe,
    null::bigint as valor_centavos,
    s.nome as autor_nome
  from public.creditos_eventos ce
  left join public.socias s on s.id = ce.criado_por

  union all

  select
    ef.id,
    ef.matricula_id,
    ef.criada_em as quando,
    'financeiro'::text,
    coalesce(ef.descricao, 'Cobrança'),
    ef.status::text
      || case when ef.data_caixa is not null then ' em ' || to_char(ef.data_caixa, 'DD/MM/YYYY') else '' end,
    ef.valor_centavos,
    null::text
  from public.entradas_financeiras ef
  where ef.matricula_id is not null

  union all

  select
    a.id,
    a.registro_id as matricula_id,
    a.criado_em as quando,
    'acao'::text,
    case a.acao
      when 'renovacao_de_ciclo' then 'Ciclo renovado'
      when 'mudanca_de_situacao' then
        'Situação: ' || coalesce(a.antes->>'status', '—') || ' → ' || coalesce(a.depois->>'status', '—')
      when 'mudanca_de_preco' then 'Preço do ciclo alterado'
      when 'cancelamento' then 'Assinatura cancelada'
      when 'cancelamento_desfeito' then 'Cancelamento desfeito'
      when 'renovacao_automatica' then
        case when (a.depois->>'renova_automaticamente')::boolean
             then 'Renovação automática ligada'
             else 'Renovação automática desligada' end
      when 'excecao_elegibilidade' then 'Venda autorizada por exceção'
      when 'venda_de_produto_legado' then 'Venda de plano antigo autorizada'
      when 'desistencia_sete_dias' then 'Desistência de 7 dias (CDC art. 49)'
      else a.acao
    end,
    a.motivo,
    null::bigint,
    -- Autor nulo é o cron/import, e dizer "sistema" é mais verdadeiro do
    -- que deixar em branco, que pareceria dado faltando.
    coalesce(s.nome, 'sistema')
  from public.auditoria a
  left join public.socias s on s.id = a.autor
  where a.tabela = 'matriculas';


grant select on public.vw_historico_matricula to authenticated;