-- ============================================================
-- Turma fixa pelo portal: o aluno pede, a equipe confirma a vaga
-- 01/10/2026
-- ============================================================
-- Bloco 7 do pedido de revisão. O texto é literal:
--
--   "Turma Fixa deve ter um fluxo diferente: solicitação → gestão valida
--    vaga → só então cobrar. NÃO cobrar o aluno antes da aprovação da
--    vaga pela gestão."
--
-- Hoje o aluno não consegue nem pedir: `solicitar_contratacao()` recusa
-- com *"mensalidade por turma fixa é contratada com a equipe"*. O portal
-- mostra o plano, o preço e um botão que leva ao WhatsApp. Quem está no
-- app às 22h de um domingo não contrata.
--
-- ## O que falta não é o fluxo, é a porta
--
-- A metade difícil já existe desde `20260924120000`:
--
--   * `solicitacoes_contratacao.turmas` guarda as turmas escolhidas antes
--     de a matrícula existir;
--   * `politica_contratacao = 'aprovacao_previa'` (de `20261003160000`)
--     já segura a turma fixa fora do caminho automático;
--   * `registrar_cobranca()` recusa cobrança sem contrato aceito;
--   * `confirmar_pagamento_contratacao()` **revalida o assento** antes de
--     criar a matrícula e só então grava `matricula_turmas`.
--
-- O que faltava: deixar o aluno escolher a turma, e a equipe saber que o
-- pedido chegou.
--
-- ## A regra "não cobrar antes" vira constraint, não `if`
--
-- Um produto de turma fixa com `politica_contratacao = 'automatica'`
-- emitiria cobrança no mesmo segundo do pedido — exatamente o que a
-- gestão proibiu —, e bastaria um clique errado na tela de produtos para
-- isso acontecer. Então a combinação passa a ser impossível no banco
-- (item 1). A gestão continua livre para mudar a política de qualquer
-- produto **por crédito**; o que ela não consegue mais é vender assento
-- de sala sem olhar.
--
-- ## Uma conta de vaga só
--
-- `validar_assento_fixo()` tinha a conta de ocupação escrita dentro dela,
-- e a tela da equipe (`SeletorTurmaFixa`) tinha **outra** conta no front,
-- que esquecia as reservas por crédito já feitas para a próxima aula. Dava
-- para a equipe ver "3/8" e o banco recusar o assento no clique seguinte.
--
-- Agora há `ocupacao_assento_fixo()`, e os três lugares que precisam da
-- vaga — validar, listar para o aluno, listar para a equipe — leem dela.
-- É a mesma lição de `entradas_da_cobranca()` no bloco 2: conta duplicada
-- não fica igual, fica parecida até o dia em que uma das duas muda.
--
-- ## Nada é cobrado antes da confirmação, e isso é dito três vezes
--
-- Na folha do pedido, na tela de confirmação e no e-mail. Não é repetição
-- decorativa: o aluno que pede turma fixa fica dias esperando, e a dúvida
-- natural ("já me cobraram?") é a que gera mensagem no WhatsApp.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Turma fixa nunca é automática
-- ------------------------------------------------------------
-- `20261003160000` já pôs a política certa nos produtos existentes. Isto
-- impede o retrocesso: assento de sala não se vende sem alguém conferir.
update public.produtos
set politica_contratacao = 'aprovacao_previa'
where coalesce(turmas_fixas, 0) > 0
  and politica_contratacao <> 'aprovacao_previa';

do $$
begin
  alter table public.produtos
    add constraint turma_fixa_exige_aprovacao
    check (coalesce(turmas_fixas, 0) = 0 or politica_contratacao = 'aprovacao_previa');
exception when duplicate_object then null;
end $$;

comment on constraint turma_fixa_exige_aprovacao on public.produtos is
  'A vaga de turma fixa sai da capacidade da sala, então ninguém é cobrado antes de a equipe confirmar que ela existe (pedido da gestão, bloco 7). Produto por crédito segue livre para ser automático.';


-- ------------------------------------------------------------
-- 2. A próxima vez que esta turma acontece
-- ------------------------------------------------------------
-- O assento começa a valer na próxima ocorrência da turma, não hoje — é
-- nessa data que a vaga precisa existir. Data de São Paulo, porque o
-- banco roda em UTC e às 21h de sábado `current_date` já é domingo.
create or replace function public.proxima_ocorrencia(p_dia_semana integer, p_de date default null)
returns date
language sql
immutable
set search_path to ''
as $function$
  select d + ((p_dia_semana - extract(dow from d)::integer + 7) % 7)
  from (select coalesce(p_de, (now() at time zone 'America/Sao_Paulo')::date) as d) x;
$function$;

comment on function public.proxima_ocorrencia(integer, date) is
  'A próxima data em que cai este dia da semana, contando hoje. É quando o assento fixo passa a valer, e portanto a data em que a vaga tem de existir.';


-- ------------------------------------------------------------
-- 3. Ocupação de uma turma para fins de assento fixo
-- ------------------------------------------------------------
-- A conta que decide se cabe mais um assento, num lugar só.
--
-- Soma assento fixo + reservas já feitas para aquela aula: assinar um
-- assento tira a vaga de quem reservou por crédito, então a reserva
-- existente é impedimento real, não detalhe (o comentário original de
-- `validar_assento_fixo` já dizia isso — agora a conta é reusável).
create or replace function public.ocupacao_assento_fixo(p_turma uuid, p_de date default null)
returns table (dia date, ocupadas integer, capacidade integer, vagas integer)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  t record;
begin
  select * into t from public.turmas where id = p_turma;
  if not found then
    return;
  end if;

  dia := public.proxima_ocorrencia(t.dia_semana, p_de);
  capacidade := t.capacidade;

  ocupadas := public.assentos_fixos_ocupados(p_turma, dia)
            + (select count(*)::integer from public.agendamentos a
                where a.turma_id = p_turma
                  and a.data = dia
                  and a.status = 'agendado');

  vagas := greatest(capacidade - ocupadas, 0);
  return next;
end;
$function$;

comment on function public.ocupacao_assento_fixo(uuid, date) is
  'Quantos lugares desta turma já estão tomados na próxima ocorrência dela, somando assento fixo e reserva por crédito. Fonte única: validar_assento_fixo, o catálogo do aluno e o seletor da equipe leem desta função — conta duplicada não fica igual, fica parecida.';

revoke execute on function public.ocupacao_assento_fixo(uuid, date) from public, anon;
grant execute on function public.ocupacao_assento_fixo(uuid, date) to authenticated;


-- ------------------------------------------------------------
-- 4. Validar o assento passa a ler a conta de cima
-- ------------------------------------------------------------
-- Reescrita fiel de `20260908120000` (§10). As recusas e as mensagens são
-- as mesmas; muda de onde vem o número.
--
-- Uma diferença de comportamento, de propósito: a ocupação era medida em
-- `current_date` e as reservas numa janela de 7 dias; agora as duas são
-- medidas **na próxima ocorrência da turma**. É a data em que o assento
-- começa a valer, então um assento que termina hoje deixa de bloquear o
-- lugar da semana que vem — antes bloqueava.
create or replace function public.validar_assento_fixo(p_turma uuid, p_data date default null)
returns void
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  t record;
  mod record;
  oc record;
begin
  select * into t from public.turmas where id = p_turma;
  if not found or not t.ativa then
    raise exception 'turma inexistente ou inativa';
  end if;

  -- Elegibilidade (2.3.6). Turma sem `modalidade_id` é turma antiga do
  -- esboço da grade; recusar é melhor que deixar passar um Pole sem
  -- vínculo de modalidade.
  if t.modalidade_id is null then
    raise exception
      'a turma % não tem modalidade cadastrada — não dá para saber se aceita turma fixa',
      t.modalidade;
  end if;

  select * into mod from public.modalidades where id = t.modalidade_id;
  if not coalesce(mod.elegivel_turma_fixa, false) then
    raise exception
      '% não aceita Mensalidade por Turma Fixa (regulamento 2.3.6)', mod.nome;
  end if;

  -- Vaga (2.3.3 + 6.3/6.5 "sujeita a existência de vaga").
  select * into oc from public.ocupacao_assento_fixo(p_turma, p_data);
  if oc.vagas <= 0 then
    raise exception
      'a turma % (%h) está sem vaga: % de % lugares ocupados',
      t.modalidade, to_char(t.horario, 'HH24:MI'), oc.ocupadas, oc.capacidade;
  end if;
end;
$function$;

comment on function public.validar_assento_fixo(uuid, date) is
  'Recusa turma inexistente, modalidade não elegível (2.3.6) e turma sem vaga na próxima ocorrência. A contagem vem de ocupacao_assento_fixo().';


-- ------------------------------------------------------------
-- 5. A grade com vaga de assento fixo, para escolher
-- ------------------------------------------------------------
-- O aluno não pode ler `turmas` (RLS é `is_socia()`), e não deveria: o
-- que ele precisa ver é modalidade, dia, hora, professora e se cabe. Esta
-- função é a mesma grade de `vw_grade_publica` com três colunas a mais —
-- vaga, elegibilidade e "você já tem assento aqui".
--
-- **Turma bloqueada aparece, não desaparece.** Esconder metade da grade
-- faria o aluno achar que o estúdio não tem Pole às segundas; mostrar com
-- o motivo ensina a regra (2.3.6: Pole, Flexibilidade e Treino Livre não
-- aceitam turma fixa). O mesmo critério que a tela da equipe já usava.
create or replace function public.turmas_para_assento_fixo(
  p_cliente uuid default null,
  p_de date default null
)
returns table (
  turma_id uuid,
  modalidade text,
  dia_semana integer,
  horario time,
  duracao_minutos integer,
  professora_nome text,
  sala_nome text,
  categoria_cor text,
  dia date,
  capacidade integer,
  ocupadas integer,
  vagas integer,
  elegivel boolean,
  ja_contratada boolean,
  motivo text
)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  alvo uuid;
begin
  if auth.uid() is null then
    raise exception 'requer sessão autenticada';
  end if;

  -- O aluno só pergunta por si. A equipe pergunta por quem está
  -- atendendo; sem `p_cliente`, por ninguém (a coluna `ja_contratada`
  -- vem falsa, que é o certo para um balcão vazio).
  if public.is_cliente() and not public.is_socia() then
    alvo := public.cliente_atual();
    if p_cliente is not null and p_cliente <> alvo then
      raise exception 'acesso restrito';
    end if;
  elsif public.is_socia() then
    alvo := p_cliente;
  else
    raise exception 'acesso restrito';
  end if;

  return query
  select
    t.id,
    t.modalidade,
    t.dia_semana,
    t.horario,
    t.duracao_minutos,
    pf.nome,
    sl.nome,
    cat.cor,
    oc.dia,
    oc.capacidade,
    oc.ocupadas,
    oc.vagas,
    coalesce(m.elegivel_turma_fixa, false) and t.modalidade_id is not null,
    case when alvo is null then false
         else public.tem_assento_fixo(alvo, t.id, oc.dia) end,
    case
      when t.modalidade_id is null then 'turma sem modalidade cadastrada'
      when not coalesce(m.elegivel_turma_fixa, false)
        then 'não aceita turma fixa (regulamento 2.3.6)'
      when alvo is not null and public.tem_assento_fixo(alvo, t.id, oc.dia)
        then 'você já tem assento nesta turma'
      when oc.vagas <= 0 then 'sem vaga'
      else null
    end
  from public.turmas t
    join public.professoras pf on pf.id = t.professora_id
    left join public.modalidades m on m.id = t.modalidade_id
    left join public.categorias_modalidade cat on cat.id = m.categoria_id
    left join public.salas sl on sl.id = t.sala_id
    join lateral public.ocupacao_assento_fixo(t.id, p_de) oc on true
  where t.ativa
  order by t.dia_semana, t.horario, t.modalidade;
end;
$function$;

comment on function public.turmas_para_assento_fixo(uuid, date) is
  'A grade como quem vai assinar um assento precisa vê-la: dia, hora, professora, vaga na próxima ocorrência e o motivo quando não dá. Turma bloqueada aparece com o motivo em vez de desaparecer.';

revoke execute on function public.turmas_para_assento_fixo(uuid, date) from public, anon;
grant execute on function public.turmas_para_assento_fixo(uuid, date) to authenticated;


-- ------------------------------------------------------------
-- 6. Como se escreve uma turma
-- ------------------------------------------------------------
-- "Calistenia" não identifica nada: há três turmas de Calistenia na
-- semana e contratar uma não dá acesso às outras (2.3.4). Toda vez que
-- uma turma é citada — e-mail, tela de aprovação, contrato — ela vem com
-- dia e hora.
create or replace function public.rotulo_turma(p_turma uuid)
returns text
language sql
stable security definer
set search_path to ''
as $function$
  select t.modalidade || ' · '
       || (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[t.dia_semana + 1]
       || ' ' || to_char(t.horario, 'HH24:MI')
       || coalesce(' · ' || s.nome, '')
  from public.turmas t
  left join public.salas s on s.id = t.sala_id
  where t.id = p_turma;
$function$;

revoke execute on function public.rotulo_turma(uuid) from public, anon;
grant execute on function public.rotulo_turma(uuid) to authenticated;


-- ------------------------------------------------------------
-- 7. Avisar a gestão de que há pedido esperando
-- ------------------------------------------------------------
-- Sem isto o fluxo não fecha: o aluno pede, o pedido fica na fila e
-- **ninguém sabe**. A tela de aprovações existe, mas depende de alguém
-- abrir a tela — e o pedido de turma fixa é justamente o que trava a
-- pessoa (ela não pode pagar nem agendar enquanto espera).
--
-- Vai para quem pode decidir (`emails_gestao()`, mesma lista do pedido de
-- cancelamento). O `ref` leva o destinatário, senão o primeiro e-mail
-- enviado desligaria os outros pela trava de idempotência.
--
-- ⚠️ Preferência por sócia ainda não existe (bloco 12 do pedido: "não
-- presuma que TODOS os administradores precisam receber TODOS os
-- e-mails"). Enquanto não existir, este aviso vai para as três — é o
-- único canal que garante que alguém veja, e pedido de vaga parado é
-- aluno sem resposta.
create or replace function public.avisar_gestao_contratacao(p_solicitacao uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
  pr record;
  c record;
  dados jsonb;
  destino text;
begin
  select * into s from public.solicitacoes_contratacao where id = p_solicitacao;
  if not found then
    return;
  end if;
  select * into pr from public.produtos where id = s.produto_id;
  select * into c from public.clientes where id = s.cliente_id;

  dados := jsonb_build_object(
    'nome', c.nome,
    'telefone', c.telefone,
    'email', c.email,
    'produto', pr.nome,
    'valor_centavos', s.preco_centavos,
    'turmas_fixas', coalesce(pr.turmas_fixas, 0),
    'turmas', (select coalesce(jsonb_agg(public.rotulo_turma(x) order by x), '[]'::jsonb)
                 from unnest(s.turmas) as x),
    'origem', s.origem,
    'solicitada_em', to_char(s.solicitada_em at time zone 'America/Sao_Paulo',
                             'DD/MM/YYYY "às" HH24:MI')
  );

  for destino in select public.emails_gestao() loop
    perform public.enfileirar_email(
      'contratacao_para_aprovar', destino, dados,
      'contratacao-aprovar:' || p_solicitacao || ':' || destino);
  end loop;
end;
$function$;

revoke execute on function public.avisar_gestao_contratacao(uuid) from public, anon;
grant execute on function public.avisar_gestao_contratacao(uuid) to authenticated;


-- ------------------------------------------------------------
-- 8. O aluno passa a poder pedir turma fixa
-- ------------------------------------------------------------
-- Reescrita fiel de `20261003160000` (§4). Três mudanças:
--
--   1. cai o `raise exception 'mensalidade por turma fixa é contratada
--      com a equipe'` — o aluno escolhe as turmas e pede;
--   2. entra a guarda de que turma fixa NUNCA segue pelo caminho
--      automático (cinto e suspensório com a constraint do item 1: a
--      constraint impede o dado errado, isto impede a cobrança mesmo se
--      a constraint for removida um dia);
--   3. pedido que fica esperando decisão agora AVISA a gestão.
create or replace function public.solicitar_contratacao(
  p_cliente uuid,
  p_produto uuid,
  p_turmas uuid[] default '{}',
  p_justificativa text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  pr record;
  imp record;
  eh_cliente boolean;
  eh_gestao boolean;
  just text := nullif(btrim(coalesce(p_justificativa, '')), '');
  s_id uuid;
  n integer;
  distintas uuid[];
  t uuid;
  dados jsonb;
begin
  if auth.uid() is null then
    raise exception 'requer sessão autenticada';
  end if;

  eh_cliente := public.is_cliente();
  eh_gestao := public.is_gestao();

  if eh_cliente then
    if p_cliente <> public.cliente_atual() then
      raise exception 'aluno só pode contratar para si mesmo';
    end if;
  elsif not public.is_socia() then
    raise exception 'acesso restrito à equipe ou ao próprio aluno';
  end if;

  select * into pr from public.produtos where id = p_produto and ativo;
  if not found then
    raise exception 'produto inexistente ou inativo';
  end if;
  if eh_cliente and not pr.visivel_no_catalogo then
    raise exception 'produto inexistente ou inativo';
  end if;
  if pr.status = 'interno' and not eh_gestao then
    raise exception
      '“%” é um plano interno da equipe — só a gestão pode conceder', pr.nome;
  end if;

  if coalesce(pr.turmas_fixas, 0) > 0 then
    -- A vaga sai da capacidade da sala (regulamento 2.3.1), então este
    -- pedido não pode virar cobrança sozinho. A constraint
    -- `turma_fixa_exige_aprovacao` garante o dado; isto garante o fluxo.
    if pr.politica_contratacao <> 'aprovacao_previa' then
      raise exception
        '% é turma fixa e está configurado como contratação automática — a vaga tem de ser confirmada antes de qualquer cobrança',
        pr.nome;
    end if;

    select count(distinct x) into n from unnest(p_turmas) as x;
    if n <> pr.turmas_fixas then
      raise exception '% exige % turma(s) distinta(s); vieram %',
        pr.nome, pr.turmas_fixas, n;
    end if;
    select array_agg(distinct x) into distintas from unnest(p_turmas) as x;
    foreach t in array distintas loop
      perform public.validar_assento_fixo(t, null);
    end loop;
  elsif array_length(p_turmas, 1) > 0 then
    raise exception '% não é uma Mensalidade por Turma Fixa', pr.nome;
  end if;

  select * into imp from public.impedimento_para_contratar(p_cliente, p_produto);
  if imp.motivo is not null then
    if not imp.excepcionavel or eh_cliente or not eh_gestao then
      raise exception '%', imp.motivo;
    end if;
    if just is null then
      raise exception
        '% — para vender assim mesmo, informe a justificativa (ela fica registrada)',
        imp.motivo;
    end if;
  end if;

  if exists (
    select 1 from public.solicitacoes_contratacao
    where cliente_id = p_cliente and produto_id = p_produto
      and status in ('aguardando_aprovacao', 'aguardando_pagamento')
  ) then
    raise exception
      'já existe um pedido em aberto deste produto para este aluno — conclua ou cancele o anterior';
  end if;

  insert into public.solicitacoes_contratacao
    (cliente_id, produto_id, turmas, origem, preco_centavos,
     justificativa, solicitada_por)
  values
    (p_cliente, p_produto, coalesce(distintas, '{}'),
     case when eh_cliente then 'portal' else 'equipe' end,
     pr.preco_centavos, just, auth.uid())
  returning id into s_id;

  -- ---- o desfecho ----
  -- Produto de política automática não espera aprovação de ninguém: vai
  -- direto para "aguardando pagamento", e o próximo passo do aluno é
  -- aceitar o contrato e pagar.
  if pr.politica_contratacao = 'automatica' then
    update public.solicitacoes_contratacao
    set status = 'aguardando_pagamento',
        decidida_em = now(),
        motivo_decisao = 'liberado automaticamente pela política do produto'
    where id = s_id;

    -- Cortesia (preço zero) não tem o que cobrar nem o que aceitar.
    if pr.preco_centavos <= 0 then
      perform public.confirmar_pagamento_contratacao(s_id, 'cortesia', now());
    end if;

  elsif eh_gestao then
    -- Quem já é gestão aprova no mesmo passo, com nome e data gravados.
    -- A vaga foi conferida no `validar_assento_fixo` acima.
    perform public.aprovar_contratacao(s_id, null);
  else
    -- Fica esperando decisão: o aluno recebe o comprovante do pedido e a
    -- gestão recebe o aviso. Sem o segundo, o pedido dorme na fila.
    dados := jsonb_build_object(
      'produto', pr.nome,
      'valor_centavos', pr.preco_centavos,
      'turmas', (select coalesce(jsonb_agg(public.rotulo_turma(x) order by x), '[]'::jsonb)
                   from unnest(coalesce(distintas, '{}'::uuid[])) as x),
      'solicitada_em', to_char(now() at time zone 'America/Sao_Paulo',
                               'DD/MM/YYYY "às" HH24:MI'));

    perform public.avisar_aluno_contratacao(
      p_cliente, 'contratacao_aguardando_aprovacao', dados, s_id);
    perform public.avisar_gestao_contratacao(s_id);
  end if;

  return s_id;
end;
$function$;

revoke execute on function public.solicitar_contratacao(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.solicitar_contratacao(uuid, uuid, uuid[], text) to authenticated;


-- ------------------------------------------------------------
-- 9. Aprovar confere a vaga de novo
-- ------------------------------------------------------------
-- Reescrita fiel de `20260924120000` (§5). Duas adições:
--
--   * revalida o assento. Entre o pedido e a aprovação pode ter entrado
--     outra pessoa — e aprovar aqui é o que autoriza a cobrança. Melhor a
--     gestão ler "a vaga foi ocupada" do que o aluno pagar e descobrir
--     depois. (`confirmar_pagamento_contratacao` também revalida; esta é a
--     checagem que ainda dá para contornar escolhendo outra turma.)
--   * o e-mail de aprovação leva as turmas confirmadas e o próximo passo.
create or replace function public.aprovar_contratacao(
  p_solicitacao uuid,
  p_motivo text default null
) returns public.status_solicitacao
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
  t uuid;
begin
  if not public.is_gestao() then
    raise exception 'só a gestão aprova contratação';
  end if;

  select * into s from public.solicitacoes_contratacao
  where id = p_solicitacao for update;
  if not found then
    raise exception 'solicitação não encontrada';
  end if;
  if s.status <> 'aguardando_aprovacao' then
    raise exception 'esta solicitação já foi decidida (%)', s.status;
  end if;

  if array_length(s.turmas, 1) > 0 then
    foreach t in array s.turmas loop
      perform public.validar_assento_fixo(t, null);
    end loop;
  end if;

  update public.solicitacoes_contratacao
  set status = 'aguardando_pagamento',
      decidida_por = auth.uid(),
      decidida_em = now(),
      motivo_decisao = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = p_solicitacao;

  -- Cortesia não tem o que cobrar: aprovar já conclui. Passa pelo
  -- mesmo caminho do pagamento para não existir uma segunda rota que
  -- cria matrícula — uma só, e o histórico fica igual.
  if s.preco_centavos <= 0 then
    perform public.confirmar_pagamento_contratacao(p_solicitacao, 'cortesia', now());
    return 'concluida';
  end if;

  perform public.avisar_aluno_contratacao(
    s.cliente_id, 'contratacao_aprovada',
    jsonb_build_object(
      'produto', (select nome from public.produtos where id = s.produto_id),
      'valor_centavos', s.preco_centavos,
      'turmas', (select coalesce(jsonb_agg(public.rotulo_turma(x) order by x), '[]'::jsonb)
                   from unnest(s.turmas) as x)),
    p_solicitacao);

  return 'aguardando_pagamento';
end;
$function$;

revoke execute on function public.aprovar_contratacao(uuid, text) from public, anon;
grant execute on function public.aprovar_contratacao(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 10. A fila ganha o que falta para a tela decidir
-- ------------------------------------------------------------
-- Reescrita fiel de `20260926120000`, com quatro colunas:
--
--   `contrato_aceito`  — sem ele não existe cobrança (a trava está em
--                        `registrar_cobranca`). Sem esta coluna, "Meu
--                        plano" dizia ao aluno aprovado "estamos gerando
--                        o link" para um link que nunca sairia, porque o
--                        que faltava era o aceite dele.
--   `turmas_rotulo`    — as turmas escritas por extenso; a tela de
--                        aprovação mostrava um array de uuid.
--   `turmas_fixas` / `politica_contratacao` — o que distingue o pedido
--                        que espera vaga do que espera só pagamento.
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
  cb.vencimento as cobranca_vencimento,
  -- ---- as quatro colunas novas ----
  -- No FIM da lista, e não ao lado do que elas explicam: `create or
  -- replace view` não aceita inserir coluna no meio ("cannot change name
  -- of view column"), e dropar a view obrigaria a recriar junto tudo o
  -- que depende dela. Ordem de coluna é estética; derrubar uma view que
  -- três telas leem, não.
  p.turmas_fixas,
  p.politica_contratacao,
  (select coalesce(array_agg(public.rotulo_turma(x) order by x), '{}')
     from unnest(s.turmas) as x) as turmas_rotulo,
  exists (select 1 from public.contratos ct where ct.solicitacao_id = s.id) as contrato_aceito
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
-- 11. O aviso ao aluno leva o nome dele
-- ------------------------------------------------------------
-- Reescrita fiel de `20260924120000` (§3.5) com uma linha: o nome entra
-- no `dados`. Quem monta o e-mail lê `dados.nome` para o cumprimento, e
-- nenhum dos quatro avisos de contratação mandava esse campo — o
-- cumprimento sairia "Oi, Olá!".
--
-- Só é preenchido quando falta, para o chamador poder sobrescrever.
create or replace function public.avisar_aluno_contratacao(
  p_cliente uuid,
  p_tipo text,
  p_dados jsonb,
  p_ref uuid
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c record;
  dados jsonb := coalesce(p_dados, '{}'::jsonb);
begin
  select nome, nullif(btrim(coalesce(email, '')), '') as email
    into c from public.clientes where id = p_cliente;
  if c.email is null then
    return;
  end if;
  -- O nome entra ANTES: concatenação de jsonb deixa a direita ganhar, então
  -- um chamador que mande o próprio 'nome' continua mandando.
  dados := jsonb_build_object('nome', c.nome) || dados;
  perform public.enfileirar_email(p_tipo, c.email, dados, p_tipo || ':' || p_ref::text);
end;
$function$;

revoke execute on function public.avisar_aluno_contratacao(uuid, text, jsonb, uuid)
  from public, anon;
grant execute on function public.avisar_aluno_contratacao(uuid, text, jsonb, uuid)
  to authenticated;
