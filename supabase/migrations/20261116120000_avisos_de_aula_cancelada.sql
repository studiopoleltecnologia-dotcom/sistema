-- ============================================================
-- OS AVISOS DA AULA CANCELADA, ATÉ O FIM
-- ============================================================
-- `20260921210000` entregou o cancelamento de aula e avisou **o aluno**:
-- quem estava agendado, quem tem turma fixa, quem estava na fila e quem
-- reservou pelo app. Três buracos ficaram abertos desde então, e os três
-- têm o mesmo sintoma — alguém descobre pela porta do estúdio:
--
-- 1. **A professora nunca foi avisada.** `cancelar_aulas()` percorre fila,
--    agendamentos e assentos fixos; a professora da turma não aparece em
--    lugar nenhum do caminho. Ela é justamente quem sai de casa para dar
--    uma aula que não vai acontecer. Vale também para o cancelamento
--    automático por quórum, que é o que mais a afeta: ele roda 4h antes,
--    sozinho, e até agora só avisava a gestão.
-- 2. **Reabrir não avisava ninguém.** `reabrir_aula()` liberava a vaga e
--    pronto. O aluno que recebeu "aula cancelada" seguia achando que não
--    tem aula, e a vaga reaberta ficava oferecida para quem não sabia que
--    ela existia.
-- 3. **Cancelamento manual não acendia o sino.** Só o de quórum entrava
--    no catálogo (`20261014120000`). Feriado marcado pela secretária, ou
--    imprevisto da professora, não chegava à gestão de nenhuma forma.
--
-- ## Como ficou
--
-- | Evento | Aluno | Professora | Gestão |
-- |---|---|---|---|
-- | equipe cancela | `aula_cancelada` (já existia) | `aula_cancelada_professora` | `aula_cancelada_equipe` (sino) |
-- | quórum cancela | `aula_cancelada` (já existia) | `aula_cancelada_professora` | `aula_cancelada_quorum` (já existia) |
-- | equipe reabre | `aula_reaberta` | `aula_reaberta_professora` | `aula_reaberta_equipe` (sino) |
--
-- ## Duas decisões que valem o comentário
--
-- **O aviso é por chamada, não por aula.** No feriado a equipe marca o dia
-- inteiro — seis aulas de uma vez. Seis e-mails para a mesma professora e
-- seis sinos para a mesma sócia transformariam o aviso em ruído, que é o
-- jeito mais rápido de alguém parar de ler. Então `cancelar_aulas()`
-- acumula as aulas da chamada e manda **um** e-mail por pessoa, com a
-- lista dentro. O `ref` de dedup é o id do primeiro cancelamento da
-- chamada: estável, e sem inventar uma chave que não existe.
--
-- **Quem reabre é a `emails_fila` que responde.** Para avisar "a aula
-- voltou" é preciso saber a quem foi dito "a aula caiu" — e isso não dá
-- para re-derivar: o agendamento já foi cancelado, a fila já foi
-- encerrada e o assento fixo pode ter mudado de aluno no meio. A lista
-- exata está no `ref` dos e-mails que `avisar_aula_cancelada()` gravou
-- (`aula-cancelada:<cancelamento>:<cliente>`), com a `situacao` de cada um
-- no `dados`. A fila de e-mails não tem expurgo, e reabrir só é possível
-- em aula futura, então o retrato está sempre lá.
--
-- ⚠️ **O aviso à professora nasce sem destinatário.** Nenhuma das 11
-- professoras tem e-mail cadastrado (backlog G1), e `enfileirar_email()`
-- descarta destinatário vazio em silêncio. O caminho fica pronto e começa
-- a funcionar sozinho no dia em que o cadastro for completado — não é
-- preciso voltar aqui.
-- ============================================================


-- ------------------------------------------------------------
-- 1. O catálogo ganha os dois avisos de equipe
-- ------------------------------------------------------------
-- Tipo listado aqui deixa de ser só e-mail e passa a acender o sino, com
-- a preferência de cada sócia por canal (`20261014120000`).
insert into public.tipos_notificacao (tipo, rotulo, descricao, link, ordem) values
  ('aula_cancelada_equipe', 'Aula cancelada pela equipe',
   'Alguém cancelou aula no sistema. Os alunos tiveram o crédito devolvido e já foram avisados.',
   '#/agenda?aba=canceladas', 55),
  ('aula_reaberta_equipe', 'Aula reaberta',
   'Uma aula cancelada voltou a acontecer. Quem tinha agendado precisa agendar de novo.',
   '#/agenda?aba=canceladas', 56)
on conflict (tipo) do update
set rotulo = excluded.rotulo,
    descricao = excluded.descricao,
    link = excluded.link,
    ordem = excluded.ordem;


-- ------------------------------------------------------------
-- 2. Avisar a professora (interno)
-- ------------------------------------------------------------
-- Mesma forma de `avisar_aula_cancelada()`: a função resolve o
-- destinatário e o `ref`, para o chamador não ter que saber disso.
create or replace function public.avisar_professora_aula(
  p_tipo text, p_professora uuid, p_dados jsonb, p_ref text
) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare pf record;
begin
  select nome, email into pf from public.professoras where id = p_professora;
  if not found then return; end if;
  -- Sem e-mail não há aviso, e isso não é erro: `enfileirar_email()` já
  -- descarta destinatário vazio. Ver G1.
  perform public.enfileirar_email(
    p_tipo, pf.email, p_dados || jsonb_build_object('nome', pf.nome), p_ref);
end;
$fn$;

comment on function public.avisar_professora_aula(text, uuid, jsonb, text) is
  'Avisa a professora sobre uma aula dela (cancelada ou reaberta). Professora sem e-mail cadastrado nao recebe nada e isso nao e erro (backlog G1).';


-- ------------------------------------------------------------
-- 3. cancelar_aulas avisa a professora e a gestão
-- ------------------------------------------------------------
-- Reescrita de `20261005120000` (§4), que por sua vez era a reescrita de
-- `20260921210000` (§8). O corpo veio copiado do arquivo anterior; o que
-- é novo está marcado nos blocos 4, 5 e 6.
create or replace function public.cancelar_aulas(
  p_turmas uuid[],
  p_data date,
  p_motivo public.motivo_cancelamento_aula,
  p_mensagem text default null,
  p_repor_turma_fixa boolean default true
) returns integer
language plpgsql security definer set search_path = ''
as $fn$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  msg text := nullif(left(btrim(coalesce(p_mensagem, '')), 500), '');
  rotulo text := public.rotulo_motivo_cancelamento_aula(p_motivo);
  cfg record;
  t record;
  ag record;
  fx record;
  fl record;
  ac_id uuid;
  lote_origem uuid;
  lote uuid;
  devolveu boolean;
  validade date;
  detalhe text;
  base jsonb;
  n_aulas integer := 0;
  n_ag integer;
  n_dev integer;
  n_rep integer;
  n_fila integer;
  n_app integer;
  -- Acúmulo da CHAMADA, para o aviso sair uma vez por pessoa, e não uma
  -- por aula (ver cabeçalho).
  primeiro_ac uuid;
  por_professora jsonb := '{}'::jsonb;
  resumo jsonb := '[]'::jsonb;
  tot_ag integer := 0;
  tot_dev integer := 0;
  tot_rep integer := 0;
  tot_fila integer := 0;
  tot_app integer := 0;
  autor record;
  pr record;
  destino text;
  -- Professora sem e-mail cadastrado não recebe aviso (G1). O que não dá
  -- é a gestão não saber disso: o aviso dela leva o nome de quem ficou de
  -- fora, para alguém mandar mensagem à mão.
  sem_email jsonb := '[]'::jsonb;
begin
  -- Operação, não financeiro: a secretária é quem fica sabendo primeiro
  -- que a professora não vem. Devolver crédito não mexe em dinheiro.
  --
  -- `auth.uid() is null` passa: é a convenção da casa para contexto de
  -- serviço (migration, cron, webhook), e é o que permite a conferência de
  -- quórum cancelar sozinha. Antes a guarda recusava, e era o único motivo
  -- pelo qual o cron não podia reusar esta função — a alternativa seria
  -- duplicar o cancelamento inteiro num segundo lugar.
  if auth.uid() is not null and not public.is_operacional() then
    raise exception 'acesso restrito à equipe';
  end if;
  if p_data < hoje then
    raise exception 'não dá para cancelar aula de uma data que já passou';
  end if;
  if coalesce(array_length(p_turmas, 1), 0) = 0 then
    raise exception 'escolha pelo menos uma aula';
  end if;
  if p_motivo = 'outro' and msg is null then
    raise exception 'escreva o motivo — ele vai no aviso aos alunos';
  end if;

  select * into cfg from public.config_agendamento;

  -- Quem cancelou não precisa de sino do que ela mesma acabou de fazer.
  -- No cron do quórum `auth.uid()` é nulo, não há autor, e a lista da
  -- gestão sai inteira.
  select s.nome, s.email into autor from public.socias s where s.id = auth.uid();

  for t in select * from public.turmas where id = any (p_turmas) order by horario loop
    if not t.ativa then
      raise exception 'a turma % (%) está inativa', t.modalidade, to_char(t.horario, 'HH24:MI');
    end if;
    if t.dia_semana <> extract(dow from p_data)::int then
      raise exception 'a turma % (%) não acontece em %',
        t.modalidade, to_char(t.horario, 'HH24:MI'), to_char(p_data, 'DD/MM');
    end if;
    -- Já cancelada: não é erro — no feriado a equipe marca o dia inteiro,
    -- mesmo que uma das aulas já tivesse sido cancelada antes.
    if exists (
      select 1 from public.aulas_canceladas ac
      where ac.turma_id = t.id and ac.data = p_data and ac.reaberta_em is null
    ) then
      continue;
    end if;

    insert into public.aulas_canceladas
      (turma_id, data, motivo, mensagem, repor_turma_fixa, cancelada_por)
    values (t.id, p_data, p_motivo, msg, p_repor_turma_fixa, auth.uid())
    returning id into ac_id;
    primeiro_ac := coalesce(primeiro_ac, ac_id);

    n_ag := 0; n_dev := 0; n_rep := 0; n_fila := 0; n_app := 0;
    base := jsonb_build_object(
      'modalidade', t.modalidade, 'data', p_data, 'horario', t.horario,
      'motivo', rotulo, 'mensagem', msg
    );

    -- ---- 1) Fila primeiro (ver cabeçalho) ----
    for fl in
      update public.lista_espera le
      set status = 'cancelada'
      where le.turma_id = t.id and le.data = p_data and le.status in ('aguardando', 'notificada')
      returning le.cliente_id
    loop
      n_fila := n_fila + 1;
      perform public.avisar_aula_cancelada(ac_id, fl.cliente_id,
        base || jsonb_build_object('situacao', 'fila'));
    end loop;

    -- ---- 2) Agendamentos: crédito volta sempre ----
    for ag in
      select * from public.agendamentos a
      where a.turma_id = t.id and a.data = p_data and a.status = 'agendado'
      for update
    loop
      update public.agendamentos
      set status = 'cancelado', cancelado_em = now(), origem_cancelamento = 'socia'
      where id = ag.id;
      n_ag := n_ag + 1;

      devolveu := false;
      if ag.matricula_id is not null then
        select ce.lote_id into lote_origem from public.creditos_eventos ce
        where ce.agendamento_id = ag.id and ce.motivo = 'agendamento'
        order by ce.criado_em limit 1;
        -- Sem evento de consumo não há o que devolver: chamar mesmo assim
        -- criaria um crédito do nada.
        if lote_origem is not null then
          devolveu := public.devolver_credito(ag.matricula_id, lote_origem, 'cancelamento', ag.id) is not null;
        end if;
      end if;
      if devolveu then n_dev := n_dev + 1; end if;
      if ag.canal in ('wellhub', 'classpass') then n_app := n_app + 1; end if;

      insert into public.agendamentos_eventos (agendamento_id, evento, detalhe, criado_por)
      values (ag.id, 'cancelado',
              'aula cancelada pelo estúdio (' || rotulo || ')'
                || case when devolveu then ' — crédito devolvido' else '' end,
              auth.uid());

      perform public.avisar_aula_cancelada(ac_id, ag.cliente_id,
        base || jsonb_build_object(
          'situacao', case when ag.canal in ('wellhub', 'classpass') then 'app' else 'agendada' end,
          'credito_devolvido', devolveu));
    end loop;

    -- ---- 3) Turma fixa: reposição (2.3.10) ----
    for fx in
      select m.id as matricula_id, m.cliente_id, m.data_fim, m.ciclo_atual
      from public.matricula_turmas mt
      join public.matriculas m on m.id = mt.matricula_id
      where mt.turma_id = t.id
        and mt.inicio <= p_data
        and (mt.fim is null or mt.fim >= p_data)
        and m.status <> 'cancelada'
        and (m.cancelamento_efetivo_em is null or m.cancelamento_efetivo_em >= p_data)
    loop
      lote := null;
      validade := null;
      if p_repor_turma_fixa then
        validade := greatest(fx.data_fim, p_data + cfg.dias_validade_credito_aula_cancelada);
        detalhe := 'Reposição: ' || t.modalidade || ' de ' || to_char(p_data, 'DD/MM')
                   || ' cancelada pelo estúdio (' || rotulo || ')';
        insert into public.creditos_lotes
          (matricula_id, ciclo, quantidade, validade, origem, detalhe, aula_cancelada_id)
        values (fx.matricula_id, fx.ciclo_atual, 1, validade, 'reposicao', detalhe, ac_id)
        returning id into lote;
        insert into public.creditos_eventos
          (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
        values (fx.matricula_id, lote, 1, 'reposicao', detalhe, auth.uid());
        n_rep := n_rep + 1;
      end if;

      perform public.avisar_aula_cancelada(ac_id, fx.cliente_id,
        base || jsonb_build_object(
          'situacao', 'turma_fixa',
          'reposicao', lote is not null,
          'validade_reposicao', validade));
    end loop;

    update public.aulas_canceladas
    set agendamentos_cancelados = n_ag,
        creditos_devolvidos = n_dev,
        reposicoes_concedidas = n_rep,
        fila_encerrada = n_fila,
        agendamentos_app = n_app
    where id = ac_id;

    -- ---- 4) Guardar a aula para os avisos da chamada ----
    resumo := resumo || jsonb_build_object(
      'turma', public.rotulo_turma(t.id), 'modalidade', t.modalidade,
      'horario', t.horario, 'agendados', n_ag, 'turma_fixa', n_rep,
      'fila', n_fila, 'app', n_app);
    por_professora := jsonb_set(
      por_professora, array[t.professora_id::text],
      coalesce(por_professora -> t.professora_id::text, '[]'::jsonb)
        || jsonb_build_object(
             'modalidade', t.modalidade, 'horario', t.horario,
             'alunos', n_ag + n_rep));
    tot_ag := tot_ag + n_ag;
    tot_dev := tot_dev + n_dev;
    tot_rep := tot_rep + n_rep;
    tot_fila := tot_fila + n_fila;
    tot_app := tot_app + n_app;

    n_aulas := n_aulas + 1;
  end loop;

  -- ---- 5) A professora: um e-mail, com as aulas dela dentro ----
  -- Vale também para o quórum: é o cancelamento que mais a afeta, porque
  -- acontece sozinho, 4h antes, e ela não pediu.
  for pr in
    select (k.key)::uuid as professora_id, k.value as aulas, pf.nome, pf.email
    from jsonb_each(por_professora) k
    join public.professoras pf on pf.id = (k.key)::uuid
  loop
    perform public.avisar_professora_aula(
      'aula_cancelada_professora', pr.professora_id,
      jsonb_build_object(
        'data', p_data, 'motivo', rotulo, 'mensagem', msg, 'aulas', pr.aulas),
      'aula-cancelada-prof:' || primeiro_ac || ':' || pr.professora_id);
    if coalesce(btrim(pr.email), '') = '' then
      sem_email := sem_email || to_jsonb(pr.nome);
    end if;
  end loop;

  -- ---- 6) O sino da gestão ----
  -- `quorum` fica de fora: ali quem cancelou foi o cron, e ele já manda o
  -- `aula_cancelada_quorum`, que leva a conta de alunos e o caminho para
  -- reabrir. Dois avisos do mesmo fato é o começo do ruído.
  if n_aulas > 0 and p_motivo <> 'quorum' then
    for destino in select public.emails_gestao() loop
      if autor.email is null or lower(destino) <> lower(autor.email) then
        perform public.enfileirar_email(
          'aula_cancelada_equipe', destino,
          jsonb_build_object(
            'nome', autor.nome,
            'turma', case when n_aulas = 1 then resumo -> 0 ->> 'turma'
                          else n_aulas || ' aulas' end,
            'data', p_data, 'motivo', rotulo, 'mensagem', msg,
            'total_aulas', n_aulas, 'aulas', resumo,
            'agendamentos', tot_ag, 'creditos', tot_dev,
            'reposicoes', tot_rep, 'fila', tot_fila, 'app', tot_app,
            'professoras_sem_email', sem_email),
          'aula-cancelada-equipe:' || primeiro_ac || ':' || destino);
      end if;
    end loop;
  end if;

  return n_aulas;
end;
$fn$;

comment on function public.cancelar_aulas(uuid[], date, public.motivo_cancelamento_aula, text, boolean) is
  'Estudio cancela uma ou mais aulas de um dia (professora, estudio, cidade, feriado, quorum). Encerra a fila antes dos agendamentos (senao a fila seria chamada), devolve o credito de todo agendamento sem olhar o prazo de 4h, da reposicao a quem tem turma fixa (2.3.10) e avisa cada aluno por e-mail. Avisa tambem a professora de cada turma e, quando o motivo nao e quorum, a gestao pelo sino — um aviso por pessoa por chamada, nao um por aula. Aula ja cancelada e pulada, nao e erro.';


-- ------------------------------------------------------------
-- 4. Reabrir a aula passa a avisar
-- ------------------------------------------------------------
-- Reescrita de `20260921210000` (§9). O corpo antigo está inteiro aqui —
-- guardas, trava e o `update` —, e o que vem depois é novo.
create or replace function public.reabrir_aula(p_cancelamento uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  ac record;
  t record;
  av record;
  c record;
  autor record;
  destino text;
  base jsonb;
  n_avisados integer := 0;
  prof_sem_email text;
begin
  if auth.uid() is null or not public.is_operacional() then
    raise exception 'acesso restrito à equipe';
  end if;

  select * into ac from public.aulas_canceladas where id = p_cancelamento for update;
  if not found or ac.reaberta_em is not null then
    raise exception 'cancelamento inexistente ou já reaberto';
  end if;
  if ac.data < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'a aula já passou';
  end if;

  -- Só reabre a vaga. Os alunos já foram avisados e tiveram o crédito
  -- devolvido; reagendam se quiserem. A reposição dada à turma fixa fica
  -- com o aluno — tirar crédito de alguém depois de avisar seria pior.
  update public.aulas_canceladas
  set reaberta_em = now(), reaberta_por = auth.uid()
  where id = p_cancelamento;

  select * into t from public.turmas where id = ac.turma_id;
  select s.nome, s.email into autor from public.socias s where s.id = auth.uid();

  base := jsonb_build_object(
    'modalidade', t.modalidade, 'data', ac.data, 'horario', t.horario,
    'turma', public.rotulo_turma(t.id));

  -- ---- 1) Quem foi avisado do cancelamento ----
  -- A lista sai do `ref` dos e-mails de cancelamento (ver cabeçalho): é o
  -- único lugar onde ela ainda existe depois de a fila ter sido encerrada
  -- e os agendamentos cancelados. O `ref` do aviso de reabertura repete a
  -- forma do outro, então reabrir duas vezes não manda dois e-mails.
  for av in
    select (split_part(ef.ref, ':', 3))::uuid as cliente_id,
           ef.dados ->> 'situacao' as situacao
    from public.emails_fila ef
    where ef.tipo = 'aula_cancelada'
      and ef.ref like 'aula-cancelada:' || p_cancelamento::text || ':%'
  loop
    select nome, email into c from public.clientes where id = av.cliente_id;
    if found then
      perform public.enfileirar_email(
        'aula_reaberta', c.email,
        base || jsonb_build_object(
          'nome', c.nome, 'situacao', coalesce(av.situacao, 'agendada')),
        'aula-reaberta:' || p_cancelamento || ':' || av.cliente_id);
      n_avisados := n_avisados + 1;
    end if;
  end loop;

  -- ---- 2) A professora ----
  perform public.avisar_professora_aula(
    'aula_reaberta_professora', t.professora_id,
    base || jsonb_build_object('avisados', n_avisados),
    'aula-reaberta-prof:' || p_cancelamento);

  select pf.nome into prof_sem_email from public.professoras pf
   where pf.id = t.professora_id and coalesce(btrim(pf.email), '') = '';

  -- ---- 3) O sino da gestão ----
  for destino in select public.emails_gestao() loop
    if autor.email is null or lower(destino) <> lower(autor.email) then
      perform public.enfileirar_email(
        'aula_reaberta_equipe', destino,
        base || jsonb_build_object(
          'nome', autor.nome, 'avisados', n_avisados,
          'motivo', public.rotulo_motivo_cancelamento_aula(ac.motivo),
          'professoras_sem_email',
            case when prof_sem_email is null then '[]'::jsonb
                 else jsonb_build_array(prof_sem_email) end),
        'aula-reaberta-equipe:' || p_cancelamento || ':' || destino);
    end if;
  end loop;
end;
$fn$;

comment on function public.reabrir_aula(uuid) is
  'Reabre a vaga de uma aula cancelada e avisa de volta todo mundo que soube do cancelamento: os alunos (pela lista gravada no ref dos e-mails), a professora e a gestao. Nao restaura agendamento nem recolhe a reposicao da turma fixa.';


-- ------------------------------------------------------------
-- 5. Permissões
-- ------------------------------------------------------------
revoke execute on function public.avisar_professora_aula(text, uuid, jsonb, text)
  from public, anon, authenticated;

revoke execute on function public.cancelar_aulas(uuid[], date, public.motivo_cancelamento_aula, text, boolean)
  from public, anon;
grant  execute on function public.cancelar_aulas(uuid[], date, public.motivo_cancelamento_aula, text, boolean)
  to authenticated;

revoke execute on function public.reabrir_aula(uuid) from public, anon;
grant  execute on function public.reabrir_aula(uuid) to authenticated;
