-- ============================================================
-- Regulamento dinâmico v2: etiquetas e parâmetros
-- 02/10/2026
-- ============================================================
-- A gestão entregou em 01/10 um conjunto novo de documentos oficiais, e
-- apontou qual deles entra no sistema:
--
--   DOCS OFICIAIS/Studio_Pole_L_Regulamento_Dinamico_Sistema/
--     Regulamento_Dinamico_Aceite_Sistema_Studio_Pole_L.md
--     Mapa_Campos_Regulamento_Dinamico_Studio_Pole_L.json
--
-- O documento é "REGULAMENTO DINÂMICO PARA ACEITE NO SISTEMA": quadro de
-- identificação + regras condicionais por produto + aceite + autorização
-- de imagem separada. Os outros três (Regulamento do Aluno, Manual
-- Interno, Contrato em papel) são a fonte das regras, não o que o aluno
-- aceita na tela.
--
-- ## Nada precisou ser refeito
--
-- O motor de `20261003120000` é exatamente isto: versões, cláusulas com
-- conjunto de etiquetas (`condicao <@ etiquetas`), quadro-resumo
-- preenchido do dado real, HTML congelado no aceite com hash. O documento
-- novo usa `{{#if flag}}`, que é a mesma ideia com outra sintaxe.
--
-- Esta migration faz a metade estrutural: as **etiquetas novas** e os
-- **parâmetros** que o texto cita. O conteúdo vem em `20261006130000`.
--
-- ## As onze condicionais do documento
--
-- | flag do documento | etiqueta | de onde sai |
-- |---|---|---|
-- | isPlanoCreditos  | `PLANO_POR_CREDITOS` | gera crédito, renova, sem turma fixa |
-- | isTurmaFixa      | `TURMA_FIXA`         | `turmas_fixas > 0` |
-- | temTurma2        | `TEM_TURMA_2`        | `turmas_fixas >= 2` |
-- | isMensal         | `MENSAL`             | renova, `ciclos_compromisso <= 1` |
-- | isSemestral      | `SEMESTRAL`          | renova, `ciclos_compromisso > 1` |
-- | isExperimental1  | `EXPERIMENTAL_1`     | requisito `nunca_treinou` + 1 crédito |
-- | isExperimental2  | `EXPERIMENTAL_2`     | requisito `nunca_treinou` + 2 ou mais |
-- | isCreditoExtra   | `CREDITO_EXTRA`      | requisito `plano_ativo` |
-- | isAulaAvulsa     | `AULA_AVULSA`        | pacote de crédito sem requisito |
-- | isAulaParticular | `AULA_PARTICULAR`    | `etiqueta_contrato` |
-- | isTreinoLivre    | `TREINO_LIVRE`       | `etiqueta_contrato` |
--
-- ## A regra "nunca pelo nome do produto" sobreviveu
--
-- Eu ia criar uma coluna de etiqueta para os seis avulsos, porque "Aula
-- avulsa" e "Crédito extra" têm colunas IDÊNTICAS (1 crédito, 30 dias de
-- validade) e o regulamento dá blocos diferentes a cada um.
--
-- A gestão explicou a diferença real: *"crédito extra é a aula avulsa
-- para quem tem plano ativo; aula avulsa é para quem não tem vínculo
-- nenhum."* Isso **é** coluna — `produto_requisitos.tipo = 'plano_ativo'`,
-- que o Crédito Extra já tem e a Avulsa não. Mesmo caminho pelo qual o
-- Studio+ era reconhecido pelo requisito de check-ins Wellhub.
--
-- Sobra um par que as colunas não distinguem: **Aula particular** e
-- **Treino livre** (ambos `servico`, 0 créditos, sem requisito). Só por
-- causa deles existe `produtos.etiqueta_contrato`, como exceção
-- declarada, com vocabulário fechado por constraint — não como porta
-- aberta para voltar a decidir por nome.
--
-- ## Os parâmetros que o texto cita e o sistema ainda não executa
--
-- O regulamento novo tem números em regras que **não existem em código**:
-- pausa (15/30/90 dias), desistência de 7 dias, abatimento do
-- experimental, vaga da turma fixa após falha de cobrança, convidado sem
-- treinar há 6 meses, e os prazos dos aplicativos parceiros.
--
-- Eles entram como configuração, e não como número escrito na cláusula,
-- por um motivo só: **contrato não pode ter valor fixo no texto.** Se a
-- gestão mudar a pausa de 15 para 20 dias, o texto do próximo aceite tem
-- de acompanhar sem alguém reescrever cláusula.
--
-- ⚠️ Cada um desses parâmetros carrega no comentário o aviso de que
-- **hoje ele só aparece no texto** — nenhum mecanismo o lê. Os mecanismos
-- estão no backlog como A23 a A27.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A exceção declarada: etiqueta explícita do produto
-- ------------------------------------------------------------
alter table public.produtos
  add column if not exists etiqueta_contrato text;

do $$
begin
  alter table public.produtos
    add constraint etiqueta_contrato_conhecida check (
      etiqueta_contrato is null
      or etiqueta_contrato in ('AULA_PARTICULAR', 'TREINO_LIVRE')
    );
exception when duplicate_object then null;
end $$;

comment on column public.produtos.etiqueta_contrato is
  'Exceção para o par que as colunas não distinguem (Aula particular x Treino livre: ambos serviço, 0 créditos, sem requisito). Vocabulário FECHADO por constraint de propósito — contrato_tags() decide por coluna, e esta é a única porta, não um atalho para voltar a decidir por nome de produto.';

-- Semeadura pelo que distingue de verdade: o preço de referência da
-- tabela oficial. Feito por valor, não por texto do nome, e só onde a
-- etiqueta ainda não existe.
update public.produtos
set etiqueta_contrato = 'AULA_PARTICULAR'
where tipo_produto = 'servico'
  and coalesce(creditos_por_ciclo, 0) = 0
  and preco_centavos = 15000
  and etiqueta_contrato is null;

update public.produtos
set etiqueta_contrato = 'TREINO_LIVRE'
where tipo_produto = 'servico'
  and coalesce(creditos_por_ciclo, 0) = 0
  and preco_centavos = 5000
  and etiqueta_contrato is null;


-- ------------------------------------------------------------
-- 2. Os parâmetros do texto
-- ------------------------------------------------------------
-- Moram em `config_agendamento` porque ela já é, de fato, a tabela das
-- regras do regulamento: o prazo de cancelamento de plano, o aviso de fim
-- de compromisso e a validade do crédito de reposição estão lá.
alter table public.config_agendamento
  add column if not exists dias_pausa_mensal integer not null default 15,
  add column if not exists dias_pausa_semestral integer not null default 30,
  add column if not exists dias_pausa_atestado integer not null default 90,
  add column if not exists meses_entre_pausas integer not null default 6,
  add column if not exists dias_antecedencia_troca_plano integer not null default 5,
  add column if not exists dias_desistencia_fora_estudio integer not null default 7,
  add column if not exists dias_abatimento_experimental integer not null default 7,
  add column if not exists dias_vaga_apos_falha_cobranca integer not null default 5,
  add column if not exists meses_sem_treinar_convidado integer not null default 6,
  add column if not exists horas_abertura_app integer not null default 48,
  add column if not exists horas_cancelamento_app integer not null default 8;

do $$
begin
  alter table public.config_agendamento
    add constraint parametros_do_regulamento_positivos check (
      dias_pausa_mensal > 0
      and dias_pausa_semestral > 0
      and dias_pausa_atestado > 0
      and meses_entre_pausas > 0
      and dias_antecedencia_troca_plano > 0
      and dias_desistencia_fora_estudio > 0
      and dias_abatimento_experimental > 0
      and dias_vaga_apos_falha_cobranca >= 0
      and meses_sem_treinar_convidado >= 0
      and horas_abertura_app > 0
      and horas_cancelamento_app > 0
    );
exception when duplicate_object then null;
end $$;

comment on column public.config_agendamento.dias_pausa_mensal is
  'Regulamento 7.1: dias de pausa do plano mensal. ⚠️ HOJE SÓ APARECE NO TEXTO — não existe mecanismo de pausa (backlog A23).';
comment on column public.config_agendamento.dias_pausa_semestral is
  'Regulamento 7.1: dias de pausa no semestral, uma vez nos 6 ciclos. ⚠️ Só no texto (A23).';
comment on column public.config_agendamento.dias_pausa_atestado is
  'Regulamento 7.2: afastamento de saúde com atestado, fora do limite regular. ⚠️ Só no texto (A23).';
comment on column public.config_agendamento.meses_entre_pausas is
  'Regulamento 7.1: intervalo entre pausas do mensal. ⚠️ Só no texto (A23).';
comment on column public.config_agendamento.dias_antecedencia_troca_plano is
  'Regulamento 8.2/8.4/8.5: antecedência para pedir redução de créditos, troca de turma ou migração entre formatos. Número DIFERENTE do prazo de cancelamento de plano (9.1), de propósito: 5 contra 10. ⚠️ Hoje só aparece no texto.';
comment on column public.config_agendamento.dias_desistencia_fora_estudio is
  'Regulamento 9.7 / CDC art. 49: prazo para desfazer contratação feita fora do estúdio. ⚠️ Só no texto — a gestão precisa do botão (backlog A26).';
comment on column public.config_agendamento.dias_abatimento_experimental is
  'Regulamento 10.1: prazo para o valor do experimental ser abatido da contratação. ⚠️ Só no texto (backlog A25).';
comment on column public.config_agendamento.dias_vaga_apos_falha_cobranca is
  'Regulamento 13.3: por quantos dias a vaga da turma fixa é segurada depois de a cobrança falhar. ⚠️ Só no texto, POR DECISÃO DA GESTÃO: a liberação é manual, o sistema só avisa que a cobrança falhou (backlog A27).';
comment on column public.config_agendamento.meses_sem_treinar_convidado is
  'Regulamento 11.1: o convidado não pode ter treinado no estúdio nos últimos N meses. ⚠️ Só no texto (backlog A24).';
comment on column public.config_agendamento.horas_abertura_app is
  'Regulamento 12.2: quantas horas antes a agenda abre nos aplicativos parceiros. ⚠️ Informativo: quem controla é o parceiro.';
comment on column public.config_agendamento.horas_cancelamento_app is
  'Regulamento 12.3: antecedência de cancelamento no aplicativo parceiro. ⚠️ Informativo: quem controla é o parceiro.';


-- ------------------------------------------------------------
-- 3. As etiquetas do produto
-- ------------------------------------------------------------
-- Reescrita de `20261003180000` (que tirou o Studio+). O que entra são as
-- sete etiquetas novas; o Studio+ continua fora.
create or replace function public.contrato_tags(p_produto uuid)
returns text[]
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  pr record;
  nunca_treinou boolean;
  exige_plano boolean;
  t text[] := '{}';
begin
  select * into pr from public.produtos where id = p_produto;
  if not found then
    raise exception 'produto inexistente';
  end if;

  select
    bool_or(tipo = 'nunca_treinou'),
    bool_or(tipo = 'plano_ativo')
  into nunca_treinou, exige_plano
  from public.produto_requisitos where produto_id = p_produto;

  nunca_treinou := coalesce(nunca_treinou, false);
  exige_plano := coalesce(exige_plano, false);

  -- ---- formato ----
  -- Turma fixa antes de crédito: o plano de turma fixa tem
  -- `gera_credito = false`, mas a ordem explícita evita que uma
  -- configuração estranha caia nos dois módulos.
  if coalesce(pr.turmas_fixas, 0) > 0 then
    t := t || 'TURMA_FIXA'::text;
    -- O documento tem um bloco só para a segunda turma (`temTurma2`).
    if pr.turmas_fixas >= 2 then
      t := t || 'TEM_TURMA_2'::text;
    end if;
  elsif pr.gera_credito and pr.renova_automaticamente then
    t := t || 'PLANO_POR_CREDITOS'::text;
  end if;

  -- ---- recorrência ----
  if pr.renova_automaticamente then
    t := t || 'PLANO_RECORRENTE'::text;
    if coalesce(pr.ciclos_compromisso, 1) > 1 then
      t := t || 'SEMESTRAL'::text;
    else
      t := t || 'MENSAL'::text;
    end if;
  else
    t := t || 'COMPRA_PONTUAL'::text;
  end if;

  -- ---- os seis avulsos, por coluna ----
  -- A ordem é de dentro para fora: o requisito é o que distingue, e só
  -- quem não tem requisito nenhum é "aula avulsa".
  --
  -- `status <> 'interno'` não é detalhe: sem ele o **Plano Equipe** (30
  -- créditos de cortesia, preço zero, sem recorrência) casava com a
  -- regra da aula avulsa e receberia a cláusula "R$ 60,00, validade de 30
  -- dias" — texto falso num documento que alguém aceita. Pego ao
  -- conferir as etiquetas dos 20 produtos do catálogo, não por raciocínio.
  -- Produto interno fica só com o bloco geral de compra pontual.
  if pr.status = 'interno' then
    null;
  elsif nunca_treinou then
    -- Um crédito = a experimental solta; dois ou mais = o pacote, que tem
    -- validade própria e preço próprio.
    if coalesce(pr.creditos_por_ciclo, 0) >= 2 then
      t := t || 'EXPERIMENTAL_2'::text;
    else
      t := t || 'EXPERIMENTAL_1'::text;
    end if;
  elsif exige_plano then
    -- "Crédito extra é a aula avulsa para quem tem plano ativo" — e é
    -- exatamente o requisito que diz isso.
    t := t || 'CREDITO_EXTRA'::text;
  elsif pr.gera_credito
        and coalesce(pr.creditos_por_ciclo, 0) > 0
        and not pr.renova_automaticamente then
    t := t || 'AULA_AVULSA'::text;
  end if;

  -- ---- a exceção declarada ----
  if pr.etiqueta_contrato is not null then
    t := t || pr.etiqueta_contrato::text;
  end if;

  -- ---- benefício ----
  if coalesce(pr.convidados_por_ciclo, 0) > 0 then
    t := t || 'BENEFICIO_CONVIDADO_ATIVO'::text;
  end if;

  return t;
end;
$function$;

comment on function public.contrato_tags(uuid) is
  'As etiquetas do produto contratado, derivadas das COLUNAS e dos REQUISITOS — nunca do nome. Vocabulário: TURMA_FIXA, TEM_TURMA_2, PLANO_POR_CREDITOS, PLANO_RECORRENTE, MENSAL, SEMESTRAL, COMPRA_PONTUAL, EXPERIMENTAL_1, EXPERIMENTAL_2, CREDITO_EXTRA, AULA_AVULSA, AULA_PARTICULAR, TREINO_LIVRE, BENEFICIO_CONVIDADO_ATIVO.';

revoke execute on function public.contrato_tags(uuid) from public, anon;
grant execute on function public.contrato_tags(uuid) to authenticated;

comment on column public.contrato_clausulas.condicao is
  'Etiquetas exigidas (AND). Vazio = sempre. Vocabulário em contrato_tags(): TURMA_FIXA, TEM_TURMA_2, PLANO_POR_CREDITOS, PLANO_RECORRENTE, MENSAL, SEMESTRAL, COMPRA_PONTUAL, EXPERIMENTAL_1, EXPERIMENTAL_2, CREDITO_EXTRA, AULA_AVULSA, AULA_PARTICULAR, TREINO_LIVRE, BENEFICIO_CONVIDADO_ATIVO.';


-- ------------------------------------------------------------
-- 4. O quadro-resumo ganha o que o Mapa_Campos pede
-- ------------------------------------------------------------
-- Reescrita fiel de `20261003120000` (§7). O corpo é o mesmo; entram os
-- marcadores que o documento novo cita e que não existiam:
--
--   REGULAMENTO_VERSAO   `{{regulamento.versao}}` do Mapa_Campos
--   MINIMO_ALUNOS        o "mínimo de 2 alunos" do item 5.1
--   HORAS_CONFERENCIA    as "4 horas antes" do mesmo item
--   os dez parâmetros do item 2 desta migration
--
-- O `{{MINIMO_ALUNOS}}` corrige um vício da v1: a cláusula 40 dizia
-- "mínimo de 2 (dois) participantes" com o número **escrito no texto**,
-- que é exatamente o que este motor existe para evitar.
create or replace function public.contrato_resumo(p_solicitacao uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  s record;
  cl record;
  pr record;
  es record;
  cfg record;
  versao text;
  tags text[];
  turmas_txt text[] := '{}';
  t record;
  inicio date;
  renovacao date;
  dias_pt text[] := array['domingo','segunda-feira','terça-feira','quarta-feira',
                          'quinta-feira','sexta-feira','sábado'];
  quantidade text;
  compromisso text;
  periodicidade text;
begin
  select * into s from public.solicitacoes_contratacao where id = p_solicitacao;
  if not found then raise exception 'contratação inexistente'; end if;

  select * into cl from public.clientes where id = s.cliente_id;
  select * into pr from public.produtos where id = s.produto_id;
  select * into es from public.config_estudio where id;
  select * into cfg from public.config_agendamento where id;
  tags := public.contrato_tags(s.produto_id);

  select v.versao into versao
  from public.contrato_versoes v where v.vigente
  order by v.vigente_desde desc limit 1;

  inicio := (now() at time zone 'America/Sao_Paulo')::date;
  renovacao := case
    when pr.renova_automaticamente
      then public.data_renovacao(inicio, 1, extract(day from inicio)::integer,
                                 pr.periodicidade_meses, pr.periodicidade_dias)
    else null
  end;

  if 'TURMA_FIXA' = any(tags) then
    for t in
      select coalesce(m.nome, tu.modalidade) as modalidade, tu.dia_semana, tu.horario
      from unnest(s.turmas) as x(id)
      join public.turmas tu on tu.id = x.id
      left join public.modalidades m on m.id = tu.modalidade_id
      order by tu.dia_semana, tu.horario
    loop
      turmas_txt := turmas_txt || format('%s — %s, %s',
        t.modalidade, dias_pt[t.dia_semana + 1], to_char(t.horario, 'HH24:MI'));
    end loop;
  end if;

  quantidade := case
    when 'TURMA_FIXA' = any(tags) then
      format('%s turma(s) fixa(s): %s', pr.turmas_fixas,
             coalesce(array_to_string(turmas_txt, ' · '), 'a definir'))
    when pr.gera_credito and pr.creditos_por_ciclo > 0 and pr.renova_automaticamente then
      format('%s crédito(s) por ciclo', pr.creditos_por_ciclo)
    when pr.gera_credito and pr.creditos_por_ciclo > 0 then
      format('%s crédito(s)', pr.creditos_por_ciclo)
    else pr.nome
  end;

  compromisso := case
    when coalesce(pr.ciclos_compromisso, 1) > 1
      then format('%s ciclos de permanência mínima', pr.ciclos_compromisso)
    when pr.renova_automaticamente then 'sem permanência mínima'
    else 'compra única, sem recorrência'
  end;

  periodicidade := case
    when not pr.renova_automaticamente then 'pagamento único'
    when coalesce(pr.periodicidade_meses, 1) = 1 then 'mês'
    else format('%s meses', pr.periodicidade_meses)
  end;

  return jsonb_build_object(
    'ALUNO_NOME', coalesce(cl.nome, ''),
    'ALUNO_CPF', coalesce(cl.cpf, case when cl.estrangeiro then 'estrangeiro, sem CPF' else '' end),
    'ALUNO_EMAIL', coalesce(cl.email, ''),
    'ALUNO_NASCIMENTO', coalesce(to_char(cl.data_nascimento, 'DD/MM/YYYY'), ''),
    'REGULAMENTO_VERSAO', coalesce(versao, ''),
    'PLANO_NOME', pr.nome,
    'FORMATO_PLANO', case
      when 'TURMA_FIXA' = any(tags) then 'Plano Turma Fixa'
      when 'PLANO_POR_CREDITOS' = any(tags) then 'Plano por Créditos'
      when 'EXPERIMENTAL_2' = any(tags) then 'Pacote de 2 aulas experimentais'
      when 'EXPERIMENTAL_1' = any(tags) then 'Aula experimental'
      when 'CREDITO_EXTRA' = any(tags) then 'Crédito extra'
      when 'AULA_AVULSA' = any(tags) then 'Aula avulsa'
      when 'AULA_PARTICULAR' = any(tags) then 'Aula particular'
      when 'TREINO_LIVRE' = any(tags) then 'Treino livre'
      else 'Compra pontual'
    end,
    'MODALIDADE_CONTRATACAO', case
      when 'SEMESTRAL' = any(tags) then 'Semestral (6 ciclos)'
      when 'MENSAL' = any(tags) then 'Mensal'
      else 'sem recorrência'
    end,
    'PERIODICIDADE_COBRANCA', periodicidade,
    'RESUMO_QUANTIDADE_OU_TURMA', quantidade,
    'QTD_CREDITOS', coalesce(pr.creditos_por_ciclo, 0)::text,
    'QTD_TURMAS_FIXAS', coalesce(pr.turmas_fixas, 0)::text,
    'TURMA_1', coalesce(turmas_txt[1], ''),
    'TURMA_2', coalesce(turmas_txt[2], ''),
    'VALOR_CICLO', to_char(s.preco_centavos / 100.0, 'FM999G999G990D00'),
    'FORMA_PAGAMENTO', coalesce(s.forma_pagamento, 'a definir no pagamento'),
    'DATA_CONTRATACAO', to_char(inicio, 'DD/MM/YYYY'),
    'DATA_INICIO', to_char(inicio, 'DD/MM/YYYY'),
    'DATA_RENOVACAO', coalesce(to_char(renovacao, 'DD/MM/YYYY'), 'não se aplica'),
    'RESUMO_COMPROMISSO', compromisso,
    'VIGENCIA_COMPROMISSO', case
      when coalesce(pr.ciclos_compromisso, 1) > 1
        then format('%s ciclos a partir de %s', pr.ciclos_compromisso, to_char(inicio, 'DD/MM/YYYY'))
      else 'não se aplica' end,
    'CICLOS_COMPROMISSO', coalesce(pr.ciclos_compromisso, 1)::text,
    'ID_TRANSACAO', upper(left(p_solicitacao::text, 8)),
    'PRODUTO_PONTUAL', pr.nome,
    'VALOR_COMPRA_PONTUAL', to_char(s.preco_centavos / 100.0, 'FM999G999G990D00'),
    'VALIDADE_COMPRA_PONTUAL',
      coalesce(pr.validade_creditos_dias, pr.periodicidade_dias)::text || ' dias',
    'VALIDADE_DIAS', coalesce(pr.validade_creditos_dias, pr.periodicidade_dias, 30)::text,
    -- Do produto: o que varia entre planos e a gestão edita no catálogo.
    'MAX_AGENDAMENTOS', coalesce(pr.max_agendamentos_simultaneos, 8)::text,
    'DIAS_ANTECEDENCIA', coalesce(pr.dias_antecedencia_agendamento, 14)::text,
    'DESCONTO_EVENTOS', trim(to_char(coalesce(pr.desconto_eventos_pct, 0), 'FM990D99')),
    'CONVIDADOS', coalesce(pr.convidados_por_ciclo, 0)::text,
    'TETO_ACUMULO_CICLOS', coalesce(pr.teto_acumulo_ciclos, 1)::text,
    -- Da configuração: regra da casa, igual para todo produto.
    'HORAS_CANCELAMENTO',
      coalesce(pr.horas_cancelamento, cfg.horas_cancelamento, 4)::text,
    'MINUTOS_TOLERANCIA', coalesce(cfg.minutos_tolerancia_atraso, 15)::text,
    'FALTAS_SUSPENSAO', coalesce(cfg.faltas_para_suspensao, 2)::text,
    'DIAS_SUSPENSAO', coalesce(cfg.dias_suspensao_faltas, 20)::text,
    'DIAS_ANTECEDENCIA_CANCELAMENTO',
      coalesce(cfg.dias_antecedencia_cancelamento_plano, 10)::text,
    'MINIMO_ALUNOS', coalesce(cfg.minimo_alunos_turma, 2)::text,
    'HORAS_CONFERENCIA', public.horas_em_texto(cfg.horas_conferencia_quorum),
    'DIAS_VALIDADE_REPOSICAO', coalesce(cfg.dias_validade_credito_aula_cancelada, 30)::text,
    'DIAS_PAUSA_MENSAL', coalesce(cfg.dias_pausa_mensal, 15)::text,
    'DIAS_PAUSA_SEMESTRAL', coalesce(cfg.dias_pausa_semestral, 30)::text,
    'DIAS_PAUSA_ATESTADO', coalesce(cfg.dias_pausa_atestado, 90)::text,
    'MESES_ENTRE_PAUSAS', coalesce(cfg.meses_entre_pausas, 6)::text,
    'DIAS_ANTECEDENCIA_TROCA', coalesce(cfg.dias_antecedencia_troca_plano, 5)::text,
    'DIAS_DESISTENCIA', coalesce(cfg.dias_desistencia_fora_estudio, 7)::text,
    'DIAS_ABATIMENTO_EXPERIMENTAL', coalesce(cfg.dias_abatimento_experimental, 7)::text,
    'DIAS_VAGA_APOS_FALHA', coalesce(cfg.dias_vaga_apos_falha_cobranca, 5)::text,
    'MESES_SEM_TREINAR_CONVIDADO', coalesce(cfg.meses_sem_treinar_convidado, 6)::text,
    'HORAS_ABERTURA_APP', coalesce(cfg.horas_abertura_app, 48)::text,
    'HORAS_CANCELAMENTO_APP', coalesce(cfg.horas_cancelamento_app, 8)::text,
    'STUDIO_RAZAO_SOCIAL', coalesce(es.razao_social, ''),
    'STUDIO_CNPJ', coalesce(es.cnpj, ''),
    'STUDIO_ENDERECO', coalesce(es.endereco, ''),
    'STUDIO_WHATSAPP', coalesce(es.whatsapp, 'WhatsApp oficial do Studio')
  );
end;
$function$;

comment on function public.contrato_resumo(uuid) is
  'Os valores do quadro-resumo e dos marcadores do texto, todos vindos do dado real da contratação. Cobre o Mapa_Campos do regulamento dinâmico de 01/10/2026. Nenhum número do regulamento é escrito na cláusula: tudo entra por aqui.';

revoke execute on function public.contrato_resumo(uuid) from public, anon;
grant execute on function public.contrato_resumo(uuid) to authenticated;
