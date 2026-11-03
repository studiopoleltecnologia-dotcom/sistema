-- ============================================================
-- Contrato de Adesão — versão v1 (conteúdo)
-- 30/09/2026
-- ============================================================
-- Transcrição fiel de `Contrato_Adesao_Dinamico_Studio_Pole_L.docx`
-- (documento mestre entregue pela gestão em 30/09/2026), com os marcadores
-- `[EXIBIR SE: ...]` traduzidos para `contrato_clausulas.condicao`.
--
-- Está numa migration, e não numa tela, porque a v1 precisa existir para o
-- fluxo funcionar. As versões seguintes a gestão publica pela tela — o
-- modelo (`20261003120000`) foi feito para isso.
--
-- ## Duas coisas que NÃO foram transcritas, de propósito
--
-- 1. **Os blocos internos.** O mestre tem "DOCUMENTO MESTRE — NÃO EXIBIR
--    INTEGRALMENTE AO ALUNO", a seção 1 (lógica de montagem), a 2 (campos
--    dinâmicos), a 3 (pontos a validar) e o apêndice de renderização. São
--    instruções para nós. Nenhuma virou cláusula, então não existe filtro
--    que alguém possa esquecer de aplicar.
-- 2. **Os números das cláusulas.** O texto vai sem "9." ou "10.2": a
--    numeração é gerada na montagem, porque cláusula condicional deixaria
--    buracos na sequência. Ver o cabeçalho da `20261003120000`.
--
-- ## Onde o texto do mestre foi ajustado
--
-- Duas frases citavam valor fixo, contra o item 11 do pedido ("nada de
-- valor hardcoded"): a tolerância de atraso e o mínimo de participantes
-- continuam literais (são regra da casa, iguais para todo produto, e estão
-- no regulamento), mas o **número de faltas** e os **dias de suspensão**
-- passaram a marcador, porque vivem em `config_agendamento` e a gestão os
-- edita pela tela. Se o contrato repetisse "2 faltas" e alguém mudasse a
-- configuração, o contrato mentiria no dia seguinte.
-- ============================================================

do $$
declare
  v_id uuid;
begin
  -- Idempotência: se a v1 já existe, esta migration não faz nada. Ela é
  -- semeadura de conteúdo, e reaplicar não pode duplicar cláusula.
  if exists (select 1 from public.contrato_versoes where versao = 'v1') then
    return;
  end if;

  insert into public.contrato_versoes (versao, vigente_desde, vigente, notas)
  values (
    'v1',
    (now() at time zone 'America/Sao_Paulo')::date,
    true,
    'Primeira versão, transcrita do documento mestre Contrato_Adesao_Dinamico_Studio_Pole_L.docx (30/09/2026), alinhada ao Regulamento versão 3.'
  )
  returning id into v_id;

  insert into public.contrato_clausulas (versao_id, ordem, nivel, condicao, titulo, corpo_html) values

  -- ---------------- cláusulas gerais (BASE) ----------------
  (v_id, 10, 1, '{}', 'Partes e objeto',
   '<p>Este contrato é celebrado entre <strong>{{STUDIO_RAZAO_SOCIAL}}</strong>, inscrita no CNPJ sob nº {{STUDIO_CNPJ}}, com endereço em {{STUDIO_ENDERECO}}, doravante “Studio”, e o(a) aluno(a) identificado(a) no quadro-resumo, doravante “Aluno”.</p>
<p>O objeto é a prestação dos serviços de atividade física, dança e/ou treinamento correspondentes ao produto efetivamente contratado, conforme quadro-resumo e módulos específicos que integram este instrumento.</p>'),

  (v_id, 20, 1, '{}', 'Aceite eletrônico e documentos da contratação',
   '<p>O aceite eletrônico deste contrato, realizado no ambiente autenticado do sistema, registra a concordância do Aluno com as condições apresentadas antes da conclusão da compra.</p>
<p>Integram a relação contratual: este contrato individual, o quadro-resumo da contratação, o PAR-Q e Termo de Responsabilidade aplicáveis, as regras de segurança e as informações do produto exibidas no momento da compra.</p>
<p>O Studio manterá registro da versão aceita, data e hora do aceite e dados necessários à rastreabilidade da contratação.</p>'),

  (v_id, 30, 1, '{}', 'Agendamento, cancelamento de aula e pontualidade',
   '<p>Quando a forma de contratação exigir agendamento, as reservas são realizadas pelo sistema do Studio e estão sujeitas à disponibilidade de vagas e aos pré-requisitos técnicos da turma.</p>
<p>Cancelamentos ou remarcações realizados com pelo menos <strong>{{HORAS_CANCELAMENTO}} horas</strong> de antecedência seguem a regra de devolução aplicável ao produto contratado. Após esse prazo, a aula poderá ser considerada utilizada, conforme o módulo específico da contratação.</p>
<p>A tolerância de atraso é de <strong>{{MINUTOS_TOLERANCIA}} minutos</strong>. Após esse período, o ingresso na aula poderá ser impedido por motivo de segurança, especialmente porque o aquecimento integra a preparação da atividade.</p>'),

  (v_id, 40, 1, '{}', 'Confirmação das aulas e cancelamento pelo Studio',
   '<p>As aulas regulares poderão depender do mínimo de 2 (dois) participantes confirmados até {{HORAS_CANCELAMENTO}} horas antes do início, ressalvada a exceção das turmas que possuam ao menos um aluno com Mensalidade por Turma Fixa ativa.</p>
<p>Se o Studio cancelar uma aula, será aplicada a forma de restituição, reposição ou compensação correspondente ao produto contratado.</p>
<p>Os alunos afetados serão comunicados pelos canais de contato cadastrados, incluindo e-mail, WhatsApp, notificação do sistema ou outro canal oficial.</p>'),

  (v_id, 50, 1, '{}', 'Calendário, capacidade e lista de espera',
   '<p>Cada turma possui capacidade máxima definida pelo Studio conforme modalidade, sala, equipamentos e critérios de segurança. A capacidade poderá variar entre turmas.</p>
<p>Quando uma turma estiver lotada, o sistema poderá disponibilizar lista de espera. A vaga liberada será oferecida de acordo com a ordem e o prazo de confirmação informados pelo Studio.</p>
<p>O Studio poderá adotar calendário próprio com feriados, recessos, manutenções e eventos previamente divulgados. Alterações relevantes serão comunicadas pelos canais oficiais sempre que possível.</p>'),

  (v_id, 60, 1, '{}', 'Segurança, nível técnico e conduta',
   '<p>Algumas atividades possuem pré-requisitos técnicos, físicos ou de experiência. A existência de vaga não garante participação quando a equipe identificar que o nível da turma não é adequado à segurança do Aluno.</p>
<p>Professores e equipe poderão orientar permanência, progressão ou mudança de nível, bem como impedir a realização de movimentos ou atividades que apresentem risco ao próprio Aluno ou a terceiros.</p>
<p>Não serão tolerados assédio, discriminação, agressão física ou verbal, ameaças, intimidação, comentários ofensivos ou constrangedores, danos intencionais ao espaço ou equipamentos ou descumprimento reiterado de orientações de segurança. Situações graves poderão resultar na interrupção da aula e no encerramento do vínculo, observadas as circunstâncias do caso e a legislação aplicável.</p>
<p>Planos, créditos, matrículas, logins, reservas e benefícios são pessoais e intransferíveis, salvo quando houver benefício de convidado expressamente previsto. Não é permitido compartilhar acesso à conta nem permitir que outra pessoa utilize créditos ou benefícios vinculados ao cadastro do Aluno.</p>
<p>O Studio não se responsabiliza por objetos deixados nas salas, banheiros ou áreas comuns.</p>'),

  (v_id, 70, 1, '{}', 'Saúde, PAR-Q e responsabilidade pelas informações',
   '<p>Antes da primeira prática, o Aluno deverá preencher o Questionário de Prontidão para Atividade Física (PAR-Q) e o respectivo Termo de Responsabilidade exigidos para o estabelecimento, mantendo as informações atualizadas.</p>
<p>O Aluno se compromete a informar alterações relevantes de saúde, lesões, cirurgias, gestação, uso de medicamentos ou outras condições que possam afetar a prática segura.</p>
<p>Quando a legislação ou a resposta ao PAR-Q exigir avaliação ou documento médico, a participação poderá ficar condicionada à apresentação e validação desse documento.</p>
<p>Menores de 18 anos deverão cumprir os requisitos de autorização e aceite pelo responsável legal.</p>'),

  (v_id, 80, 1, '{}', 'Dados pessoais, comunicações e imagem',
   '<p>Os dados pessoais serão tratados para cadastro, gestão de matrícula e planos, agendamentos, cobrança, comunicação, segurança da prática, cumprimento de obrigações legais e exercício regular de direitos.</p>
<p>É responsabilidade do Aluno manter seus dados de contato atualizados. Comunicações contratuais poderão ser enviadas pelos canais cadastrados e pelo próprio sistema.</p>
<p>A preferência do Aluno sobre uso de imagem em fotos e vídeos de divulgação será registrada separadamente no sistema e poderá ser alterada a qualquer momento, sem necessidade de justificativa e <strong>sem interferir na contratação</strong>.</p>'),

  -- ---------------- Plano por Créditos ----------------
  (v_id, 90, 1, '{PLANO_POR_CREDITOS}', 'Condições específicas — Plano por Créditos',
   '<p>Cada crédito corresponde a 1 (uma) aula da grade regular elegível e é consumido no momento da reserva. Créditos e benefícios são pessoais e intransferíveis.</p>
<p>O Aluno poderá fazer mais de uma aula no mesmo dia, utilizando um crédito por aula, e poderá manter no máximo {{MAX_AGENDAMENTOS}} aulas agendadas simultaneamente.</p>
<p>Cancelamento ou remarcação com pelo menos {{HORAS_CANCELAMENTO}} horas de antecedência devolve o crédito ao saldo. Cancelamento fora do prazo, falta ou atraso superior à tolerância implica consumo do crédito.</p>
<p>A partir de {{FALTAS_SUSPENSAO}} faltas sem cancelamento dentro do mesmo ciclo, o acesso a novos agendamentos poderá ser suspenso por {{DIAS_SUSPENSAO}} dias.</p>
<p>Créditos do plano não abrangem aula particular, treino livre, aulões ou workshops, salvo oferta expressa em sentido contrário.</p>'),

  (v_id, 100, 2, '{PLANO_POR_CREDITOS,MENSAL}', 'Plano por Créditos — Mensal',
   '<p>O plano disponibiliza <strong>{{QTD_CREDITOS}} créditos</strong> por ciclo mensal e renova automaticamente na data indicada no quadro-resumo enquanto permanecer ativo.</p>
<p>Créditos não utilizados <strong>expiram ao final do ciclo</strong> e não são convertidos em dinheiro, desconto ou aula futura.</p>
<p>O Aluno poderá agendar aulas com até {{DIAS_ANTECEDENCIA}} dias de antecedência.</p>
<p>O plano poderá ser pausado uma vez a cada 6 (seis) meses por até 15 (quinze) dias, conforme procedimento do Studio.</p>
<p>O plano inclui {{DESCONTO_EVENTOS}}% de desconto em aulões e workshops elegíveis, conforme condições da oferta.</p>'),

  (v_id, 110, 2, '{PLANO_POR_CREDITOS,SEMESTRAL}', 'Plano por Créditos — Semestral',
   '<p>O plano disponibiliza <strong>{{QTD_CREDITOS}} créditos</strong> por ciclo mensal durante {{CICLOS_COMPROMISSO}} ciclos de compromisso. O valor mensal permanece fixo durante esses ciclos.</p>
<p>Créditos não utilizados podem ser acumulados para o ciclo seguinte até o limite equivalente a 1 (um) ciclo do plano. O saldo total nunca poderá ultrapassar o equivalente a dois ciclos, observadas as regras de validade dos créditos de cortesia ou reposição.</p>
<p>Os créditos mais antigos são consumidos primeiro e qualquer saldo remanescente expira ao final do último ciclo do compromisso.</p>
<p>O Aluno poderá agendar aulas com até {{DIAS_ANTECEDENCIA}} dias de antecedência.</p>
<p>O plano poderá ser pausado uma vez durante o período semestral por até 30 (trinta) dias; o período de compromisso é estendido pelo mesmo número de dias pausados.</p>
<p>O plano inclui, por ciclo, {{CONVIDADOS}} benefício de convidado não cumulativo e {{DESCONTO_EVENTOS}}% de desconto em aulões e workshops elegíveis, conforme regras do Studio.</p>
<p><strong>Encerramento antecipado:</strong> o Aluno restitui apenas o desconto usufruído nos ciclos já utilizados, calculado pela diferença entre o valor Mensal e o valor Semestral da mesma faixa multiplicada pelos ciclos utilizados, sem cobrança de ciclos futuros não utilizados.</p>
<p>Ao final do compromisso, o Semestral não se renova por um novo período: ele passa ao formato Mensal equivalente, pelo valor Mensal vigente, até que haja nova contratação ou cancelamento.</p>'),

  -- ---------------- Mensalidade por Turma Fixa ----------------
  (v_id, 120, 1, '{TURMA_FIXA}', 'Condições específicas — Mensalidade por Turma Fixa',
   '<p>A contratação está vinculada à(s) turma(s) indicada(s) no quadro-resumo, identificada(s) por modalidade, dia e horário. Cada turma fixa corresponde à frequência de 1 (uma) aula por semana naquela turma específica.</p>
<p>A vaga fica reservada durante a vigência do plano. A contratação <strong>não dá acesso</strong> às demais turmas, dias ou horários da mesma modalidade e <strong>não gera saldo de créditos</strong>.</p>
<p>A Mensalidade por Turma Fixa não está disponível para Pole Dance e suas variações, incluindo Heels, Spin, Power, Bases e demais modalidades derivadas, nem para Flexibilidade.</p>
<p>Faltas, cancelamentos ou aulas não frequentadas pelo Aluno não geram desconto, reposição, crédito, reembolso ou compensação. O cancelamento de uma aula específica não cancela a matrícula na turma fixa.</p>
<p>A existência de pelo menos um aluno com Mensalidade por Turma Fixa ativa garante a realização da aula, ainda que o número de participantes seja inferior ao mínimo geral.</p>
<p>Se o Studio cancelar uma aula por motivo de sua responsabilidade, será oferecida reposição em turma elegível da mesma modalidade quando possível; na impossibilidade, poderá ser oferecido crédito especial de reposição com validade informada, extensão proporcional da vigência ou compensação equivalente. A reposição não altera a modalidade contratada e não transforma a Mensalidade por Turma Fixa em Plano por Créditos.</p>
<p>A contratação é vinculada à modalidade, dia e horário, e <strong>não a uma professora específica</strong>. Substituições de professora, mantendo-se a aula e a modalidade, não caracterizam cancelamento.</p>
<p>Se houver mudança permanente de dia/horário ou encerramento definitivo da turma, o Studio oferecerá migração para alternativa elegível com vaga. Não existindo alternativa compatível ou não sendo possível ao Aluno frequentá-la, o plano correspondente poderá ser encerrado sem penalidade relativa ao período futuro não utilizado.</p>
<p>O atraso além da tolerância implica perda daquela aula, sem reposição ou compensação.</p>'),

  (v_id, 130, 2, '{TURMA_FIXA,MENSAL}', 'Turma Fixa — Mensal',
   '<p>O plano abrange <strong>{{QTD_TURMAS_FIXAS}} turma(s)</strong> e renova automaticamente a cada ciclo mensal enquanto permanecer ativo.</p>
<p>O plano poderá ser pausado uma vez a cada 6 (seis) meses por até 15 (quinze) dias. Durante a pausa, o período restante do ciclo é preservado e a renovação é adiada pelo mesmo número de dias.</p>
<p>O plano inclui {{DESCONTO_EVENTOS}}% de desconto em aulões e workshops elegíveis, conforme condições da oferta.</p>'),

  (v_id, 140, 2, '{TURMA_FIXA,SEMESTRAL}', 'Turma Fixa — Semestral',
   '<p>O plano abrange <strong>{{QTD_TURMAS_FIXAS}} turma(s)</strong> durante {{CICLOS_COMPROMISSO}} ciclos de compromisso. O valor mensal permanece fixo durante esses ciclos.</p>
<p>O plano poderá ser pausado uma vez durante o período semestral por até 30 (trinta) dias. A pausa preserva o período restante e estende o compromisso pelo mesmo número de dias.</p>
<p>O plano inclui, por ciclo, {{CONVIDADOS}} benefício de convidado não cumulativo e {{DESCONTO_EVENTOS}}% de desconto em aulões e workshops elegíveis, conforme regras do Studio.</p>
<p><strong>Encerramento antecipado:</strong> o Aluno restitui apenas o desconto usufruído nos ciclos já utilizados, calculado pela diferença entre o valor Mensal e o valor Semestral do mesmo formato multiplicada pelos ciclos utilizados, sem cobrança de ciclos futuros não utilizados.</p>
<p>Ao final do compromisso, o Semestral passa ao formato Mensal equivalente, pelo valor Mensal vigente, até nova contratação ou cancelamento.</p>'),

  -- ---------------- cobrança e alterações (só recorrente) ----------------
  (v_id, 150, 1, '{PLANO_RECORRENTE}', 'Cobrança, inadimplência, pausa e alterações',
   '<p>A cobrança recorrente será realizada no meio de pagamento escolhido e cadastrado pelo Aluno. O valor, periodicidade e próxima data de renovação constam do quadro-resumo.</p>
<p>Se a cobrança não for aprovada, o Studio poderá realizar novas tentativas e solicitar atualização do meio de pagamento. Enquanto houver pendência, novos agendamentos, créditos e benefícios poderão ficar suspensos.</p>
<p>Na Mensalidade por Turma Fixa, a vaga poderá permanecer reservada por até 5 (cinco) dias corridos após a falha de cobrança. Sem regularização, o plano poderá ser suspenso e a vaga liberada; a regularização posterior não garante recuperação da mesma turma se ela tiver sido ocupada.</p>
<p>A suspensão por falta de pagamento não é considerada pausa e não gera extensão automática da vigência ou reposição de aulas.</p>
<p>Pausa por motivo de saúde comprovado por atestado poderá ser concedida por até 90 (noventa) dias, sem consumir o limite ordinário de pausa. A solicitação deve ocorrer antes do início da pausa, não sendo aplicada retroativamente a ciclo já cobrado.</p>'),

  (v_id, 160, 2, '{PLANO_POR_CREDITOS,PLANO_RECORRENTE}', 'Alterações do Plano por Créditos',
   '<p><strong>Aumento de faixa:</strong> poderá ser realizado durante o ciclo, mediante pagamento da diferença proporcional, com disponibilização dos créditos adicionais.</p>
<p><strong>Redução de faixa:</strong> passa a valer na renovação seguinte, quando solicitada com pelo menos 5 (cinco) dias de antecedência.</p>
<p><strong>Migração de Mensal para Semestral:</strong> poderá ocorrer a qualquer momento, iniciando novo compromisso de 6 (seis) ciclos.</p>'),

  (v_id, 170, 2, '{TURMA_FIXA,PLANO_RECORRENTE}', 'Alterações da Mensalidade por Turma Fixa',
   '<p><strong>Inclusão de segunda turma fixa:</strong> poderá ocorrer durante o ciclo, mediante pagamento proporcional e disponibilidade de vaga.</p>
<p><strong>Redução de duas turmas para uma ou troca de turma:</strong> passa a valer na renovação seguinte, quando solicitada com pelo menos 5 (cinco) dias de antecedência e, no caso de troca, sujeita à disponibilidade de vaga.</p>
<p>Mudança de dia ou horário é considerada troca de turma, mesmo quando a modalidade permanece a mesma.</p>
<p><strong>Migração de Mensal para Semestral:</strong> poderá ocorrer a qualquer momento, iniciando novo compromisso de 6 (seis) ciclos.</p>'),

  (v_id, 180, 1, '{PLANO_RECORRENTE}', 'Cancelamento do plano',
   '<p>O cancelamento poderá ser solicitado pelo sistema ou pelo WhatsApp oficial do Studio, com pelo menos {{DIAS_ANTECEDENCIA_CANCELAMENTO}} dias de antecedência da data de renovação. O pedido será confirmado por escrito. Pedidos feitos com menos antecedência valem para a renovação seguinte.</p>
<p>No plano Mensal, o cancelamento interrompe renovações futuras e o ciclo já pago permanece utilizável até o seu término, conforme as regras do produto.</p>
<p>No plano Semestral, o encerramento antes do fim do compromisso segue a regra de restituição do desconto descrita no módulo específico da contratação.</p>
<p>Não será aplicada cobrança de encerramento em caso de problema de saúde comprovado por atestado ou mudança de cidade, conforme procedimento de comprovação do Studio.</p>
<p>Nas contratações realizadas fora do estabelecimento comercial, o direito de arrependimento será observado nos termos da legislação aplicável.</p>'),

  -- ---------------- Studio+ ----------------
  (v_id, 190, 1, '{STUDIO_PLUS}', 'Condições específicas — Studio+',
   '<p>O Studio+ é um pacote adicional destinado a aluno com Wellhub ativo na unidade e <strong>não substitui</strong> a utilização do Wellhub.</p>
<p>O pacote contratado inclui <strong>{{QTD_CREDITOS_STUDIO_PLUS}} créditos</strong> adicionais, com validade de {{VALIDADE_STUDIO_PLUS}}, pelo valor indicado no quadro-resumo.</p>
<p>Para contratar e renovar o Studio+, o aluno deve possuir Wellhub ativo na unidade e ter realizado, no mínimo, 4 (quatro) check-ins pelo Wellhub nos 30 (trinta) dias anteriores à verificação de elegibilidade.</p>
<p>Os créditos Studio+ são pessoais, intransferíveis, não cumulativos e expiram ao fim da validade. Agendamentos desses créditos são realizados no sistema do Studio e seguem as regras de cancelamento e falta aplicáveis aos créditos do Studio.</p>
<p>Os agendamentos feitos com Wellhub permanecem sujeitos às regras e ao aplicativo do próprio parceiro. É permitido realizar até 2 (duas) aulas no mesmo dia, usando 1 check-in do Wellhub e 1 crédito do Studio+.</p>
<p>A renovação do Studio+ depende da confirmação dos requisitos de elegibilidade no momento da renovação.</p>'),

  -- ---------------- compra pontual ----------------
  (v_id, 200, 1, '{COMPRA_PONTUAL}', 'Condições específicas — compra pontual',
   '<p>O produto comprado é <strong>{{PRODUTO_PONTUAL}}</strong>, pelo valor de R$ {{VALOR_COMPRA_PONTUAL}}, com validade de {{VALIDADE_COMPRA_PONTUAL}}.</p>
<p>A compra pontual <strong>não gera renovação automática</strong>, salvo se isso estiver expressamente indicado no quadro-resumo.</p>
<p>Aulas experimentais, aulas avulsas, crédito extra, aula particular e treino livre seguem as condições e limitações apresentadas no checkout, além das regras gerais de agendamento, cancelamento, pontualidade e segurança aplicáveis.</p>
<p>Quando houver benefício de abatimento da aula experimental na contratação de plano, serão aplicadas as condições informadas na oferta vigente.</p>'),

  -- ---------------- convidado ----------------
  (v_id, 210, 1, '{BENEFICIO_CONVIDADO_ATIVO}', 'Benefício de convidado',
   '<p>O benefício dá direito a {{CONVIDADOS}} convidado por ciclo e não acumula para ciclos seguintes.</p>
<p>O convidado não poderá possuir plano ativo no Studio nem ter frequentado o Studio nos últimos 6 (seis) meses, deverá participar da mesma aula do titular e estará sujeito à disponibilidade de vaga e aos pré-requisitos técnicos da modalidade.</p>
<p>Se a participação do convidado for confirmada e ele não comparecer sem cancelar dentro do prazo aplicável, o benefício será considerado utilizado naquele ciclo.</p>'),

  -- ---------------- finais ----------------
  (v_id, 220, 1, '{}', 'Disposições finais',
   '<p>Planos, créditos, matrículas, logins, reservas e benefícios são pessoais e intransferíveis, salvo quando houver benefício de convidado expressamente previsto.</p>
<p>Os valores de planos e serviços poderão ser reajustados. Em planos Mensais recorrentes, eventual novo valor será comunicado antes de sua aplicação em renovação futura. Em planos Semestrais, o valor contratado permanece fixo durante os ciclos do compromisso.</p>
<p>Alterações gerais das regras serão comunicadas previamente e não deverão alterar retroativamente as condições econômicas já contratadas para o ciclo ou período de compromisso em curso.</p>
<p>Dúvidas e solicitações poderão ser encaminhadas pelo WhatsApp oficial do Studio ({{STUDIO_WHATSAPP}}) ou pelos canais indicados no sistema.</p>'),

  (v_id, 230, 1, '{}', 'Aceite eletrônico',
   '<p><strong>DECLARAÇÃO DE ACEITE.</strong> Ao marcar a opção de aceite e concluir a contratação, declaro que li o quadro-resumo e as cláusulas aplicáveis ao produto contratado, que tive acesso às informações essenciais antes da compra e que concordo com as condições apresentadas. Confirmo também que fornecerei informações verdadeiras no PAR-Q e cumprirei as orientações de segurança do Studio.</p>
<p class="registro">Registro: {{ALUNO_NOME}} • {{ALUNO_CPF}} • {{DATA_HORA_ACEITE}} • versão {{VERSAO_CONTRATO}} • contratação {{ID_TRANSACAO}}</p>');

end $$;
