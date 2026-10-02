-- ============================================================
-- contrato_resumo: o limite de 100 argumentos do Postgres
-- 02/10/2026
-- ============================================================
-- `jsonb_build_object` aceita **no máximo 100 argumentos**. A versão de
-- `20261006120000` passa 57 chaves, ou seja 114 argumentos, e o Postgres
-- recusa:
--
--     ERROR: 54023: cannot pass more than 100 arguments to a function
--
-- O erro **não apareceu ao aplicar a migration**: o corpo de uma função
-- plpgsql não é validado na criação, só na primeira execução. A migration
-- entrou limpa no `db push`, o ledger ficou 1:1, e a função quebrava em
-- toda chamada.
--
-- O que isso significava em produção: `montar_contrato` chama
-- `contrato_resumo`, e o portal chama `montar_contrato` no passo do
-- contrato. **Nenhum aluno conseguiria contratar um plano** — nem com
-- `exigir_contrato` desligado, porque a tela monta o documento de
-- qualquer jeito para o aluno ler antes de aceitar.
--
-- Pego ao renderizar um contrato de verdade no DEV. Nenhuma conferência
-- estática acharia: o SQL está sintaticamente correto, os 35 marcadores
-- resolvem, as aspas batem. Só executar mostra.
--
-- ## A correção
--
-- Os mesmos 57 pares, em blocos de 14, concatenados com `||`. O conteúdo
-- é idêntico — este arquivo foi **gerado** a partir do anterior, extraindo
-- os pares, justamente para nenhum valor mudar no caminho.
--
-- Fica com folga: cada bloco usa 28 dos 100 argumentos, então ainda cabem
-- mais marcadores sem repensar nada.
-- ============================================================

create or replace function public.contrato_resumo(p_solicitacao uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  dados jsonb;
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

  dados := jsonb_build_object(

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
    'TURMA_1', coalesce(turmas_txt[1], '')
  );

  dados := dados || jsonb_build_object(
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
    'VALIDADE_DIAS', coalesce(pr.validade_creditos_dias, pr.periodicidade_dias, 30)::text
    -- Do produto: o que varia entre planos e a gestão edita no catálogo.
  );

  dados := dados || jsonb_build_object(
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
    'DIAS_PAUSA_MENSAL', coalesce(cfg.dias_pausa_mensal, 15)::text
  );

  dados := dados || jsonb_build_object(
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

  return dados;
end;
$function$;

comment on function public.contrato_resumo(uuid) is
  'Os valores do quadro-resumo e dos marcadores do texto, todos vindos do dado real da contratação. Montado em blocos porque jsonb_build_object aceita no máximo 100 argumentos e são 57 pares.';

revoke execute on function public.contrato_resumo(uuid) from public, anon;
grant execute on function public.contrato_resumo(uuid) to authenticated;


-- ------------------------------------------------------------
-- 2. Uma menção a turma fixa que não cabia no contrato do avulso
-- ------------------------------------------------------------
-- A cláusula geral de agendamento terminava com *"No Plano Turma Fixa, a
-- vaga da turma contratada já fica reservada"*. A frase vem do item 4.1
-- do regulamento oficial, mas num contrato de **aula avulsa** ela é só
-- contraste: fala de um produto que a pessoa não comprou.
--
-- Achado ao renderizar o contrato da aula avulsa e procurar onde o texto
-- dizia "Turma Fixa". A instrução da gestão é literal — plano de crédito
-- não recebe cláusula de turma fixa —, e a frase não acrescentava nada:
-- quem contrata turma fixa já lê "a vaga permanece reservada enquanto o
-- plano estiver ativo" no bloco dele.
--
-- A outra menção, na confirmação de turmas, **fica**: a exceção do mínimo
-- de alunos é o que explica ao aluno avulso por que a aula dele pode
-- acontecer com pouca gente, e ele precisa saber disso.
--
-- O arquivo `20261006130000` também foi corrigido na origem, para banco
-- novo nascer certo; este update é para onde a v2 já existe (a semeadura
-- lá é guardada por "se a v2 existe, não faz nada").
update public.contrato_clausulas c
set corpo_html = replace(
      c.corpo_html,
      'O agendamento pelo sistema é obrigatório. No Plano Turma Fixa, a vaga da turma contratada já fica reservada.',
      'O agendamento pelo sistema é obrigatório.')
from public.contrato_versoes v
where v.id = c.versao_id
  and v.versao = 'v2'
  and c.corpo_html like '%No Plano Turma Fixa, a vaga da turma contratada já fica reservada.%';
