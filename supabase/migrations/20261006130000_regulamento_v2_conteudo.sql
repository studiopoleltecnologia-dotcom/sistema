-- ============================================================
-- Regulamento dinâmico v2: o conteúdo
-- 02/10/2026
-- ============================================================
-- Transcrição de
-- `DOCS OFICIAIS/Studio_Pole_L_Regulamento_Dinamico_Sistema/Regulamento_Dinamico_Aceite_Sistema_Studio_Pole_L.md`,
-- de 01/10/2026, para as cláusulas condicionais do motor de
-- `20261003120000`. As etiquetas e os parâmetros vieram em
-- `20261006120000`.
--
-- ## Uma decisão de transcrição que vale registrar
--
-- O documento humano escreve os números: "Valor: R$ 60,00", "mínimo de 2
-- alunos", "4 horas de antecedência", "pausa de até 15 dias". **Nenhum
-- deles foi copiado para o texto da cláusula.** Todos entram por
-- marcador, vindos do produto ou da configuração.
--
-- Não é preciosismo. Dois casos concretos já existem no catálogo:
--
-- * os pacotes legados do Wix ("Pacotes - 4 Aulas", R$ 190, 40 dias de
--   validade) casam com a regra da aula avulsa. Com "R$ 60,00" escrito na
--   cláusula, quem contratasse um deles aceitaria um texto **falso**;
-- * a v1 tinha "mínimo de 2 (dois) participantes" escrito na cláusula 40,
--   e o mínimo virou configurável em `20261005120000`. Os dois já teriam
--   divergido.
--
-- A regra da dona é literal: nada de valor fixo em contrato.
--
-- ## Como as condicionais do documento viraram conjuntos de etiquetas
--
-- `{{#if isMensal}}` aninhado com `{{#if isPlanoCreditos}}` é exatamente
-- `condicao = '{MENSAL,PLANO_POR_CREDITOS}'`: a cláusula entra quando
-- TODAS as etiquetas dela estão no conjunto do produto
-- (`condicao <@ etiquetas`). Onde o documento põe um item de lista
-- condicional no meio de uma lista, a transcrição quebra em duas
-- cláusulas — a geral e a específica —, porque item de lista não tem
-- condição própria no motor.
--
-- ## O aceite e a imagem não entram como cláusula
--
-- O "ACEITE OBRIGATÓRIO" do fim do documento é a caixa de seleção da
-- tela, e a autorização de imagem é preferência revogável separada
-- (`definir_autorizacao_imagem`), que **não pode bloquear a
-- contratação** — exigência da gestão. O que entra aqui é a declaração
-- que acompanha o aceite, para ficar congelada no HTML.
-- ============================================================


-- ------------------------------------------------------------
-- 1. O quadro-resumo ganha modalidade e versão do regulamento
-- ------------------------------------------------------------
-- Reescrita FIEL de `20261003120000` (§8): a lista de campos é a única
-- coisa que muda, e a função foi copiada do arquivo original.
create or replace function public.montar_contrato(
  p_solicitacao uuid,
  p_versao uuid default null,
  /**
   * Instante do aceite, para a linha de registro do fim do contrato.
   * Nulo na PRÉVIA — é a única coisa que não pode ser conhecida antes de
   * alguém aceitar. O resto do texto é idêntico nos dois momentos, e é o
   * que garante que o aluno aceite exatamente o que leu.
   */
  p_aceite_em timestamptz default null
) returns table(versao_id uuid, versao text, tags text[], resumo jsonb, corpo_html text)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v record;
  s record;
  dados jsonb;
  etiquetas text[];
  html text := '';
  c record;
  n integer := 0;
  sub integer := 0;
  campo record;
  linha text;
begin
  select * into s from public.solicitacoes_contratacao where id = p_solicitacao;
  if not found then raise exception 'contratação inexistente'; end if;

  -- Aluno só monta o contrato dele. A equipe monta o de qualquer um (é o
  -- contrato que ela precisa reler no atendimento).
  --
  -- `auth.uid() is null` é contexto de serviço (migration, cron, job de
  -- PDF) e passa — é a mesma convenção de `matricular_produto()`. Sem
  -- isso, nenhuma rotina de servidor conseguiria gerar um contrato, e os
  -- testes em SQL também não.
  if auth.uid() is not null then
    if public.is_cliente() then
      if s.cliente_id <> public.cliente_atual() then
        raise exception 'contrato de outra pessoa';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito';
    end if;
  end if;

  -- Mesma razão do alias abaixo: `versao` é parâmetro de saída, e a
  -- tabela tem coluna com esse nome.
  if p_versao is null then
    select * into v from public.contrato_versoes cv where cv.vigente;
  else
    select * into v from public.contrato_versoes cv where cv.id = p_versao;
  end if;
  if not found then
    raise exception 'nenhuma versão de contrato vigente — publique uma em Configurações';
  end if;

  etiquetas := public.contrato_tags(s.produto_id);
  dados := public.contrato_resumo(p_solicitacao);
  dados := dados || jsonb_build_object(
    'VERSAO_CONTRATO', v.versao,
    'DATA_HORA_ACEITE', case
      when p_aceite_em is null then 'no momento do aceite'
      else to_char(p_aceite_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
    end
  );

  -- Quadro-resumo primeiro, sempre (exigência do documento mestre).
  html := '<h2>Quadro-resumo da contratação</h2><table class="quadro"><tbody>';
  for campo in
    select * from (values
      ('Aluno(a)',            'ALUNO_NOME'),
      ('CPF',                 'ALUNO_CPF'),
      ('E-mail',              'ALUNO_EMAIL'),
      ('Produto contratado',  'PLANO_NOME'),
      ('Formato',             'FORMATO_PLANO'),
      ('Modalidade',          'MODALIDADE_CONTRATACAO'),
      ('Quantidade / turma',  'RESUMO_QUANTIDADE_OU_TURMA'),
      ('Valor',               'VALOR_CICLO'),
      ('Periodicidade',       'PERIODICIDADE_COBRANCA'),
      ('Forma de pagamento',  'FORMA_PAGAMENTO'),
      ('Data da contratação', 'DATA_CONTRATACAO'),
      ('Início',              'DATA_INICIO'),
      ('Próxima renovação',   'DATA_RENOVACAO'),
      ('Compromisso',         'RESUMO_COMPROMISSO'),
      ('ID da contratação',   'ID_TRANSACAO'),
      ('Versão do regulamento', 'REGULAMENTO_VERSAO'),
      ('Studio',              'STUDIO_RAZAO_SOCIAL'),
      ('CNPJ do Studio',      'STUDIO_CNPJ'),
      ('Endereço do Studio',  'STUDIO_ENDERECO')
    ) as f(rotulo, chave)
  loop
    linha := coalesce(dados->>campo.chave, '');
    if linha <> '' then
      -- O valor aparece com "R$" no rótulo, não no dado: o dado é o número,
      -- e é ele que precisa bater com a cobrança.
      if campo.chave in ('VALOR_CICLO') then linha := 'R$ ' || linha; end if;
      html := html || format('<tr><th>%s</th><td>%s</td></tr>',
                             campo.rotulo, public.html_escape(linha));
    end if;
  end loop;
  html := html || '</tbody></table>'
    || '<p class="nota">As condições específicas exibidas neste contrato correspondem '
    || 'exclusivamente ao produto descrito no quadro-resumo. Cláusulas relativas a outros '
    || 'produtos do Studio não integram esta contratação.</p>';

  -- As cláusulas aplicáveis, numeradas na ordem em que sobraram.
  -- Alias obrigatório: `versao_id` é também um parâmetro de saída desta
  -- função, e sem qualificar a coluna o Postgres recusa por ambiguidade.
  for c in
    select cla.* from public.contrato_clausulas cla
    where cla.versao_id = v.id and cla.condicao <@ etiquetas
    order by cla.ordem
  loop
    if c.nivel = 1 then
      n := n + 1;
      sub := 0;
      html := html || format('<h3>%s. %s</h3>', n, c.titulo);
    else
      sub := sub + 1;
      html := html || format('<h4>%s.%s %s</h4>', n, sub, c.titulo);
    end if;
    html := html || c.corpo_html;
  end loop;

  -- Substituição dos marcadores. Feita no fim, de uma vez, para o mesmo
  -- marcador valer igual no quadro-resumo e nas cláusulas.
  -- Escapado: ver a função acima. O valor do cadastro nunca é HTML.
  for campo in select key, value from jsonb_each_text(dados) loop
    html := replace(html, '{{' || campo.key || '}}', public.html_escape(campo.value));
  end loop;

  return query select v.id, v.versao, etiquetas, dados, html;
end;
$function$;


-- ------------------------------------------------------------
-- 2. A versão v2 e as cláusulas
-- ------------------------------------------------------------
-- Idempotência: se a v2 já existe, esta migration não faz nada. Ela é
-- semeadura de conteúdo, e reaplicar não pode duplicar cláusula.
do $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.contrato_versoes where versao = 'v2') then
    return;
  end if;

  -- Só uma vigente por vez (índice único parcial): a v1 sai antes de a v2
  -- entrar. Contrato já aceito aponta para a versão dele e não muda.
  update public.contrato_versoes set vigente = false where vigente;

  insert into public.contrato_versoes (versao, vigente_desde, vigente, notas)
  values (
    'v2',
    date '2026-10-01',
    true,
    'Regulamento Dinâmico para Aceite no Sistema, de 01/10/2026 (template_version 2026-10-01-v1). '
    'Substitui a v1, que vinha do Contrato de Adesão mestre de 30/09. Muda: cancelamento de plano '
    'passa a 10 dias, entram pausa, desistência de 7 dias, abatimento do experimental, convidado '
    'com carência de 6 meses e os prazos dos aplicativos parceiros; os seis produtos avulsos ganham '
    'bloco próprio; Studio+ sai.'
  )
  returning id into v_id;

  insert into public.contrato_clausulas (versao_id, ordem, nivel, condicao, titulo, corpo_html) values

  -- ================= abertura =================
  (v_id, 10, 1, '{}', 'Regulamento e termo de ciência',
   '<p>Este documento reúne as regras aplicáveis à contratação identificada no quadro-resumo acima, na versão <strong>{{REGULAMENTO_VERSAO}}</strong> do Regulamento do Studio Pole L.</p>
<p>Ao concluir o aceite, o aluno declara que leu e concorda com as regras aplicáveis ao produto que contratou. As condições exibidas aqui correspondem exclusivamente a esse produto: regras de outros produtos do Studio não integram esta contratação.</p>'),

  -- ================= 1. regras do produto =================
  (v_id, 20, 1, '{PLANO_POR_CREDITOS}', 'Plano por Créditos',
   '<p>Cada crédito equivale a 1 aula elegível da grade regular, conforme disponibilidade de vaga, nível e pré-requisitos da turma. O plano contratado concede <strong>{{QTD_CREDITOS}} crédito(s) por ciclo</strong>.</p>
<ul>
<li>Os créditos são pessoais e intransferíveis e não cobrem aula particular, treino livre, aulões ou workshops.</li>
<li>É permitido fazer mais de uma aula no mesmo dia, consumindo 1 crédito por aula.</li>
<li>O aluno pode manter no máximo <strong>{{MAX_AGENDAMENTOS}} aulas agendadas</strong> simultaneamente.</li>
<li>O crédito é consumido quando a reserva é confirmada. Ele precisa estar válido na data do agendamento; se não for utilizado até o fim da validade, expira.</li>
<li>Uma reserva confirmada com crédito válido permanece válida mesmo quando a data da aula ocorrer após a renovação do ciclo, desde que tenha sido feita dentro da janela de agendamento permitida.</li>
<li>Se a reserva for cancelada dentro do prazo permitido, o crédito retorna respeitando a validade original. Se essa validade já tiver terminado, o crédito não volta a ficar disponível.</li>
</ul>'),

  (v_id, 30, 1, '{TURMA_FIXA}', 'Plano Turma Fixa',
   '<p>O aluno frequenta a(s) turma(s) indicada(s) no quadro-resumo, em regra 1 vez por semana por turma, conforme o calendário do Studio. A vaga permanece reservada enquanto o plano estiver ativo, salvo durante períodos de pausa, quando poderá ser liberada.</p>
<ul>
<li>O Plano Turma Fixa não funciona por créditos e não dá acesso às demais turmas da mesma modalidade.</li>
<li>Faltas e cancelamentos feitos pelo aluno não geram reposição, desconto, crédito, reembolso ou compensação.</li>
<li>A contratação é vinculada à modalidade, ao dia e ao horário, e não a uma professora específica. Substituições de professora não caracterizam cancelamento quando a aula contratada for mantida.</li>
<li>O Plano Turma Fixa não é válido para Pole Dance e suas variações, incluindo Heels, Spin, Power, Bases e modalidades derivadas, nem para Flexibilidade.</li>
<li>Se o Studio encerrar definitivamente a turma ou alterar permanentemente o horário, o aluno poderá migrar para alternativa elegível com vaga. Se não houver alternativa compatível, o plano correspondente poderá ser encerrado sem penalidade futura.</li>
<li>Se uma aula da turma contratada for cancelada por responsabilidade do Studio, será oferecida reposição em outra turma elegível sempre que possível; na impossibilidade, poderá ser concedido crédito especial de reposição com validade de <strong>{{DIAS_VALIDADE_REPOSICAO}} dias</strong>, extensão proporcional da vigência ou compensação equivalente.</li>
</ul>'),

  (v_id, 35, 2, '{TEM_TURMA_2}', 'Segunda turma contratada',
   '<p>Esta contratação inclui duas turmas fixas, que podem ser da mesma modalidade ou de modalidades diferentes. Cada turma corresponde a uma vaga reservada e segue, individualmente, as regras deste capítulo.</p>
<p>Turma 1: <strong>{{TURMA_1}}</strong><br>Turma 2: <strong>{{TURMA_2}}</strong></p>'),

  -- ================= 2. modalidade de contratação =================
  (v_id, 40, 1, '{MENSAL}', 'Contratação mensal',
   '<ul>
<li>Cobrança recorrente mensal, sem compromisso de permanência.</li>
<li>A renovação continua automaticamente enquanto o plano estiver ativo e até que o cancelamento seja solicitado dentro do prazo previsto neste regulamento.</li>
<li>Agendamentos podem ser feitos com até <strong>{{DIAS_ANTECEDENCIA}} dias</strong> de antecedência.</li>
<li>O plano pode ser pausado por até <strong>{{DIAS_PAUSA_MENSAL}} dias</strong>, 1 vez a cada período de <strong>{{MESES_ENTRE_PAUSAS}} meses</strong>, conforme as regras de pausa.</li>
<li>Aulões e workshops: <strong>{{DESCONTO_EVENTOS}}%</strong> de desconto, quando aplicável.</li>
<li>O valor do plano pode ser reajustado mediante comunicação prévia, com aplicação em renovação posterior à comunicação.</li>
</ul>'),

  (v_id, 45, 2, '{MENSAL,PLANO_POR_CREDITOS}', 'Créditos no plano mensal',
   '<p>Créditos não utilizados <strong>expiram ao final do ciclo e não acumulam</strong> para o ciclo seguinte.</p>'),

  (v_id, 50, 1, '{SEMESTRAL}', 'Contratação semestral',
   '<ul>
<li>Compromisso de <strong>{{CICLOS_COMPROMISSO}} ciclos</strong>, com cobrança mensal durante todo o período. O plano não é cobrado integralmente à vista.</li>
<li>O valor mensal contratado permanece <strong>congelado</strong> durante o compromisso.</li>
<li>Agendamentos podem ser feitos com até <strong>{{DIAS_ANTECEDENCIA}} dias</strong> de antecedência.</li>
<li>O plano pode ser pausado por até <strong>{{DIAS_PAUSA_SEMESTRAL}} dias</strong>, 1 vez durante o compromisso. A pausa prorroga o compromisso pelo mesmo número de dias pausados.</li>
<li>Aulões e workshops: <strong>{{DESCONTO_EVENTOS}}%</strong> de desconto, quando aplicável.</li>
<li>O encerramento antes do fim do compromisso exige a devolução apenas do desconto já recebido: a diferença entre o valor mensal e o semestral, multiplicada pelos ciclos já utilizados. Não são cobradas mensalidades futuras não utilizadas.</li>
<li>Ao final do compromisso, o semestral não inicia automaticamente novos ciclos: ele passa ao plano mensal vigente do mesmo formato, salvo nova contratação semestral.</li>
</ul>'),

  (v_id, 55, 2, '{SEMESTRAL,PLANO_POR_CREDITOS}', 'Créditos no plano semestral',
   '<p>Créditos não utilizados podem acumular até o limite equivalente a <strong>{{TETO_ACUMULO_CICLOS}} ciclo(s) completo(s)</strong>. Na prática, o saldo total nunca ultrapassa o dobro da quantidade mensal contratada, e os créditos mais antigos são utilizados primeiro.</p>
<p>Ao final do compromisso, eventual saldo remanescente expira.</p>'),

  (v_id, 60, 2, '{BENEFICIO_CONVIDADO_ATIVO}', 'Benefício de convidado',
   '<p>Esta contratação inclui <strong>{{CONVIDADOS}} convidado(s) por ciclo</strong>, não cumulativo.</p>
<p>O convidado deve ser pessoa sem plano ativo que não tenha frequentado o Studio nos últimos <strong>{{MESES_SEM_TREINAR_CONVIDADO}} meses</strong>, participar da mesma aula do titular e atender aos requisitos de nível e segurança. A participação depende de vaga disponível, e a ausência do convidado após a confirmação consome o benefício do ciclo.</p>'),

  -- ================= 3. agendamento, cancelamento, faltas =================
  (v_id, 70, 1, '{}', 'Agendamento, cancelamento de aula, faltas e atraso',
   '<ul>
<li>A compra de plano, aula avulsa ou aula experimental <strong>não reserva vaga automaticamente</strong>. O agendamento pelo sistema é obrigatório. No Plano Turma Fixa, a vaga da turma contratada já fica reservada.</li>
<li>Cancelamentos e remarcações devem ser realizados com pelo menos <strong>{{HORAS_CANCELAMENTO}} horas</strong> de antecedência. Após esse prazo, a aula é considerada utilizada.</li>
<li>A tolerância de atraso é de <strong>{{MINUTOS_TOLERANCIA}} minutos</strong>. Após esse limite, o aluno poderá ser impedido de entrar por motivo de segurança, especialmente porque o aquecimento integra a preparação da atividade, e a aula será considerada utilizada.</li>
</ul>'),

  (v_id, 75, 2, '{PLANO_POR_CREDITOS}', 'Faltas sem cancelamento',
   '<p><strong>{{FALTAS_SUSPENSAO}} faltas</strong> sem cancelamento no mesmo ciclo geram suspensão de novos agendamentos por <strong>{{DIAS_SUSPENSAO}} dias</strong>. O aluno continua podendo treinar no período: a diferença é que o agendamento passa a ser no mesmo dia da aula ou pela lista de espera.</p>'),

  (v_id, 80, 2, '{TURMA_FIXA}', 'Faltas na turma fixa',
   '<p>Faltas e cancelamentos em turma fixa não geram reposição. A ausência não altera a matrícula nas semanas seguintes enquanto o plano estiver ativo, e a penalidade por faltas sem cancelamento não se aplica à vaga já contratada.</p>'),

  -- ================= 4. confirmação das turmas =================
  (v_id, 90, 1, '{}', 'Confirmação das turmas e lista de espera',
   '<ul>
<li>Turmas regulares são confirmadas com o mínimo de <strong>{{MINIMO_ALUNOS}} alunos</strong> até <strong>{{HORAS_CONFERENCIA}} horas</strong> antes do início. Se o mínimo não for atingido, o Studio poderá cancelar a aula e devolver o crédito, aula ou benefício usado na reserva.</li>
<li>A regra de mínimo <strong>não se aplica</strong> à turma que possua pelo menos 1 aluno com Plano Turma Fixa ativo: nesse caso a aula é mantida.</li>
<li>Turmas lotadas podem ter lista de espera. A vaga liberada é oferecida conforme a ordem da fila e deve ser confirmada dentro do prazo informado pelo sistema.</li>
<li>A capacidade de cada turma pode variar conforme modalidade, sala, equipamentos e critérios de segurança.</li>
</ul>'),

  -- ================= 5. pausa =================
  (v_id, 100, 1, '{PLANO_RECORRENTE}', 'Pausa do plano',
   '<ul>
<li>A pausa deve ser solicitada antes de começar e não retroage sobre período já utilizado.</li>
<li>Durante a pausa, cobrança e ciclo ficam congelados.</li>
<li>Afastamento por saúde comprovado por atestado pode gerar pausa de até <strong>{{DIAS_PAUSA_ATESTADO}} dias</strong>, sem consumir a pausa regular.</li>
<li>A suspensão por inadimplência não é considerada pausa e não gera extensão de vigência ou reposição.</li>
</ul>'),

  (v_id, 105, 2, '{PLANO_RECORRENTE,PLANO_POR_CREDITOS}', 'Créditos durante a pausa',
   '<p>Preserva-se o saldo de créditos do ciclo em andamento.</p>'),

  (v_id, 110, 2, '{PLANO_RECORRENTE,TURMA_FIXA}', 'Vaga durante a pausa',
   '<p>Preserva-se o período restante do ciclo. A vaga da turma fixa <strong>poderá ser liberada</strong> durante a pausa: no retorno, a mesma turma fica sujeita à disponibilidade e, se não houver vaga, o Studio apresentará as opções compatíveis.</p>'),

  -- ================= 6. trocas =================
  (v_id, 120, 1, '{PLANO_RECORRENTE}', 'Trocas e alterações',
   '<ul>
<li>Migrações entre Plano por Créditos e Plano Turma Fixa passam a valer na próxima renovação, mediante solicitação com pelo menos <strong>{{DIAS_ANTECEDENCIA_TROCA}} dias</strong> de antecedência. A entrada em turma fixa depende de vaga.</li>
<li>A mudança de mensal para semestral pode ser feita a qualquer momento e inicia novo período de compromisso. A mudança de semestral para mensal antes do fim segue as regras de encerramento do semestral.</li>
</ul>'),

  (v_id, 125, 2, '{PLANO_RECORRENTE,PLANO_POR_CREDITOS}', 'Mudança na quantidade de créditos',
   '<p>O <strong>aumento</strong> pode ser feito durante o ciclo, com pagamento proporcional e liberação dos créditos adicionais. A <strong>redução</strong> passa a valer na próxima renovação e deve ser solicitada com pelo menos <strong>{{DIAS_ANTECEDENCIA_TROCA}} dias</strong> de antecedência.</p>'),

  (v_id, 130, 2, '{PLANO_RECORRENTE,TURMA_FIXA}', 'Mudança de turma',
   '<p>A <strong>inclusão</strong> de uma segunda turma fixa pode ser feita durante o ciclo, mediante pagamento proporcional e existência de vaga. A <strong>redução</strong> de duas turmas para uma, ou a <strong>troca</strong> de turma, vale a partir da próxima renovação, deve ser solicitada com pelo menos <strong>{{DIAS_ANTECEDENCIA_TROCA}} dias</strong> de antecedência e depende de vaga.</p>'),

  -- ================= 7. cancelamento do plano =================
  (v_id, 140, 1, '{PLANO_RECORRENTE}', 'Cancelamento do plano',
   '<ul>
<li>O pedido deve ser feito pelo sistema ou pelo WhatsApp oficial com pelo menos <strong>{{DIAS_ANTECEDENCIA_CANCELAMENTO}} dias</strong> de antecedência da próxima renovação, e será confirmado por escrito pelo Studio.</li>
<li>Pedidos feitos com menos de {{DIAS_ANTECEDENCIA_CANCELAMENTO}} dias passam a valer para a renovação seguinte.</li>
<li>Não há reembolso ou conversão em dinheiro após o início do ciclo, ressalvadas as hipóteses previstas neste regulamento e na legislação aplicável.</li>
</ul>'),

  (v_id, 145, 2, '{PLANO_RECORRENTE,MENSAL}', 'Cancelamento no plano mensal',
   '<p>O cancelamento interrompe as próximas renovações. O ciclo já pago permanece válido até o fim, com os créditos disponíveis ou a vaga da turma fixa mantida até o encerramento do ciclo.</p>'),

  (v_id, 150, 2, '{PLANO_RECORRENTE,SEMESTRAL}', 'Cancelamento no plano semestral',
   '<p>No encerramento antes do fim do compromisso aplica-se a devolução do desconto já recebido, conforme descrito no capítulo da contratação semestral.</p>
<p>Não há cobrança de encerramento em caso de problema de saúde comprovado por atestado ou mudança de cidade, mediante análise documental pelo Studio.</p>'),

  -- ================= 8. pagamento e inadimplência =================
  (v_id, 160, 1, '{PLANO_RECORRENTE}', 'Pagamento e inadimplência',
   '<ul>
<li>Planos recorrentes dependem da aprovação do meio de pagamento cadastrado.</li>
<li>Em caso de falha de cobrança, o Studio poderá realizar novas tentativas e solicitar atualização do meio de pagamento. Enquanto houver pendência, novos agendamentos, créditos e benefícios poderão ficar suspensos.</li>
</ul>'),

  (v_id, 165, 2, '{PLANO_RECORRENTE,TURMA_FIXA}', 'A vaga durante a pendência',
   '<p>A vaga da turma fixa poderá ser mantida por até <strong>{{DIAS_VAGA_APOS_FALHA}} dias corridos</strong> após a falha de cobrança. Depois disso, poderá ser liberada, e a regularização posterior não garante a recuperação da mesma turma caso a vaga já tenha sido ocupada.</p>'),

  (v_id, 170, 2, '{PLANO_RECORRENTE,SEMESTRAL}', 'Inadimplência no semestral',
   '<p>A inadimplência não cancela automaticamente o compromisso contratado.</p>'),

  -- Desistência: cláusula GERAL, não dentro do cancelamento de plano.
  -- O direito do art. 49 do CDC vale para toda compra feita a distância,
  -- e o avulso comprado pelo site tem o mesmo prazo que a mensalidade.
  -- Na primeira versão esta regra estava dentro de "Cancelamento do
  -- plano", que só entra em produto recorrente: quem comprasse uma aula
  -- avulsa pelo site aceitaria um documento que não menciona o direito
  -- que ele tem.
  (v_id, 175, 1, '{}', 'Desistência de compra feita fora do Studio',
   '<p>Contratações realizadas fora do Studio — pelo site, WhatsApp ou telefone — podem ser desfeitas em até <strong>{{DIAS_DESISTENCIA}} dias corridos</strong> a contar da compra, conforme o art. 49 do Código de Defesa do Consumidor.</p>
<p>Se já houver aula utilizada nesse período, será descontado o valor da aula avulsa correspondente e devolvido o saldo remanescente. O pedido pode ser feito pelo WhatsApp oficial do Studio: {{STUDIO_WHATSAPP}}.</p>'),

  -- ================= 9. calendário, segurança, convivência =================
  (v_id, 180, 1, '{}', 'Calendário, segurança e convivência',
   '<ul>
<li>O Studio segue calendário próprio, que poderá incluir feriados, recessos, manutenções e eventos previamente comunicados. Suspensões já previstas no calendário não geram automaticamente reposição ou crédito.</li>
<li>O aluno deve preencher a ficha de saúde antes da primeira aula e manter atualizadas as informações relevantes para a prática. Menores de 18 anos dependem de autorização do responsável.</li>
<li>Algumas turmas têm pré-requisitos técnicos, físicos ou de experiência. O Studio e seus professores podem orientar mudança ou permanência de nível por segurança.</li>
<li>Planos, créditos, logins, matrículas e benefícios são pessoais e intransferíveis, exceto o benefício de convidado expressamente previsto.</li>
<li>Não são tolerados assédio, discriminação, agressão, ameaças, intimidação, comentários ofensivos, danos intencionais ou descumprimento reiterado de orientações de segurança. Situações graves podem levar à interrupção da aula e ao encerramento do vínculo.</li>
<li>O Studio não se responsabiliza por objetos pessoais deixados nas dependências.</li>
</ul>'),

  -- ================= 10. aplicativos parceiros =================
  (v_id, 190, 1, '{}', 'Wellhub e TotalPass',
   '<ul>
<li>Reservas, cancelamentos e remarcações de Wellhub e TotalPass devem ser realizados <strong>exclusivamente no aplicativo parceiro</strong>.</li>
<li>A agenda dos aplicativos abre a partir de <strong>{{HORAS_ABERTURA_APP}} horas</strong> antes da aula.</li>
<li>Cancelamentos e remarcações devem ser realizados com no mínimo <strong>{{HORAS_CANCELAMENTO_APP}} horas</strong> de antecedência, observadas as regras do aplicativo parceiro.</li>
<li>As vagas disponibilizadas aos aplicativos são as remanescentes após as matrículas de turma fixa. Entre alunos por créditos e aplicativos, a ocupação ocorre por ordem de reserva.</li>
</ul>'),

  -- ================= 11. dados, imagem, comunicações =================
  (v_id, 200, 1, '{}', 'Dados, imagem e comunicações',
   '<ul>
<li>A autorização de uso de imagem é coletada <strong>separadamente</strong> deste aceite e pode ser recusada sem prejuízo da matrícula ou da participação nas aulas.</li>
<li>Os dados pessoais são utilizados para matrícula, pagamento, comunicação, segurança e cumprimento de obrigações aplicáveis. O aluno deve manter os dados de contato atualizados.</li>
<li>Comunicações oficiais podem ser enviadas pelo sistema, e-mail, WhatsApp ou outros canais oficiais do Studio.</li>
<li>Os valores podem ser reajustados periodicamente mediante comunicação prévia. Alterações destas regras não modificam condições já contratadas durante o ciclo ou compromisso em andamento, salvo quando necessárias por lei, segurança ou funcionamento de serviço terceiro.</li>
</ul>'),

  -- ================= produtos avulsos =================
  -- Os valores vêm do PRODUTO, não do texto do documento: ver o cabeçalho.
  (v_id, 210, 1, '{EXPERIMENTAL_1}', 'Aula experimental',
   '<ul>
<li>Valor: <strong>R$ {{VALOR_COMPRA_PONTUAL}}</strong>, disponível uma vez por pessoa para quem nunca treinou no Studio.</li>
<li>A compra não reserva vaga: é obrigatório agendar a aula pelo sistema.</li>
<li>Se o aluno contratar qualquer plano em até <strong>{{DIAS_ABATIMENTO_EXPERIMENTAL}} dias</strong> após a experiência, o valor pago é abatido da contratação. O abatimento não se soma a outros.</li>
<li>Aplicam-se as regras gerais de agendamento, cancelamento, atraso e falta.</li>
</ul>'),

  (v_id, 220, 1, '{EXPERIMENTAL_2}', 'Pacote de aulas experimentais',
   '<ul>
<li>Valor: <strong>R$ {{VALOR_COMPRA_PONTUAL}}</strong> por <strong>{{QTD_CREDITOS}} aulas</strong>, a utilizar em até <strong>{{VALIDADE_DIAS}} dias</strong>.</li>
<li>A compra não reserva vaga: cada aula deve ser agendada pelo sistema.</li>
<li>Se o aluno contratar qualquer plano em até <strong>{{DIAS_ABATIMENTO_EXPERIMENTAL}} dias</strong> após a experiência, o valor pago é abatido da contratação. O abatimento não se soma a outros.</li>
<li>Aplicam-se as regras gerais de agendamento, cancelamento, atraso e falta.</li>
</ul>'),

  (v_id, 230, 1, '{AULA_AVULSA}', 'Aula avulsa',
   '<ul>
<li>Valor: <strong>R$ {{VALOR_COMPRA_PONTUAL}}</strong>. Validade: <strong>{{VALIDADE_DIAS}} dias</strong> a partir da compra.</li>
<li>A compra não reserva vaga: é obrigatório agendar pelo sistema.</li>
<li>Aplicam-se as regras gerais de agendamento, cancelamento, atraso e falta.</li>
</ul>'),

  (v_id, 240, 1, '{CREDITO_EXTRA}', 'Crédito extra',
   '<ul>
<li>Valor: <strong>R$ {{VALOR_COMPRA_PONTUAL}}</strong>, disponível apenas para quem tem Plano por Créditos ativo.</li>
<li>Validade de <strong>{{VALIDADE_DIAS}} dias</strong>, limitada ao ciclo vigente do plano. Não acumula para o ciclo seguinte.</li>
<li>A compra não reserva vaga: é obrigatório agendar pelo sistema.</li>
</ul>'),

  (v_id, 250, 1, '{AULA_PARTICULAR}', 'Aula particular',
   '<ul>
<li>Valor de referência: <strong>R$ {{VALOR_COMPRA_PONTUAL}}</strong>.</li>
<li>Horário sujeito à disponibilidade de sala e professora. Não é coberta por planos.</li>
</ul>'),

  (v_id, 260, 1, '{TREINO_LIVRE}', 'Treino livre',
   '<ul>
<li>Valor de referência: <strong>R$ {{VALOR_COMPRA_PONTUAL}}</strong>.</li>
<li>Uso da sala sem acompanhamento de professora, conforme disponibilidade, com limite de 2 pessoas na sala.</li>
</ul>'),

  -- ================= declaração do aceite =================
  (v_id, 900, 1, '{}', 'Declaração de aceite',
   '<p>Declaro que li o Regulamento do Studio Pole L, conferi os dados e as condições da minha contratação no quadro-resumo acima e concordo com as regras aplicáveis ao produto contratado.</p>
<p>Estou ciente de que este aceite fica registrado com a versão do regulamento vigente no momento da contratação, e que a autorização de uso de imagem é tratada em preferência separada, que posso alterar a qualquer momento pelos canais oficiais sem prejuízo desta contratação.</p>
<p class="nota">Aceito em {{DATA_HORA_ACEITE}} · versão {{VERSAO_CONTRATO}} do regulamento · contratação {{ID_TRANSACAO}}. Dúvidas pelo WhatsApp oficial do Studio: {{STUDIO_WHATSAPP}}.</p>');
end $$;
