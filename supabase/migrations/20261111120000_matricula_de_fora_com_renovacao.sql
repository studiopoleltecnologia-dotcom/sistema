-- ============================================================
-- A matricula importada precisa dizer que renova
-- ============================================================
-- `matricular_aluno_de_fora()` (20261110120000) resolve a cobranca e
-- a data, mas a importacao de verdade bate numa parede que so apareceu ao
-- olhar os dados: **os planos do Wix estao no catalogo como `legado`
-- com `renova_automaticamente = false`**.
--
-- Isso esta certo para o que eles sao — um registro do que foi vendido,
-- nao uma assinatura viva. Mas `matricular_produto()` copia essa
-- coluna para a matricula, e `vw_previsao_mensalidades` so projeta
-- matricula que renova. Resultado: a importacao criaria 30 matriculas e
-- uma previsao VAZIA, que e exatamente o numero que a gestao pediu.
--
-- Trocar os produtos legado para `renova_automaticamente = true`
-- seria o caminho curto e errado: eles tambem descrevem matriculas
-- historicas, encerradas. Quem renova e a MATRICULA, nao o produto — e
-- `matriculas` ja tem a coluna justamente por isso.
--
-- O segundo parametro, `p_preco_centavos`, vem do mesmo exame: ha
-- coluna de cupom no relatorio e aluno pagando abaixo da tabela. Sem
-- override, a previsao dele sairia errada para cima todo mes.
--
-- Nao da para acrescentar parametro com default a uma funcao existente:
-- a chamada com 6 argumentos ficaria ambigua entre as duas assinaturas
-- ("function is not unique"). Por isso `drop` + `create`, e
-- nao `create or replace`.
-- ============================================================

drop function if exists public.matricular_aluno_de_fora(uuid, uuid, date, uuid[], boolean, text);

create or replace function public.matricular_aluno_de_fora(
  p_cliente uuid,
  p_plano uuid,
  p_data_inicio date,
  p_turmas uuid[] default null,
  p_cobranca_externa boolean default true,
  p_justificativa text default null,
  /**
   * Este aluno renova? `null` = o que o produto disser.
   *
   * Existe porque os planos do Wix estao no catalogo como `legado`
   * com `renova_automaticamente = false` — eles descrevem o que foi
   * vendido, nao uma assinatura viva. Mas o aluno RENOVA todo mes, e e
   * isso que a previsao precisa saber: `vw_previsao_mensalidades` so
   * projeta matricula que renova. Sem este parametro a importacao criaria
   * 30 matriculas e uma previsao vazia.
   */
  p_renova boolean default null,
  /** Preco que ESTE aluno paga, quando difere do produto (cupom). */
  p_preco_centavos bigint default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  pr record;
  m_id uuid;
  dia smallint;
  fim date;
  v_validade date;
begin
  if auth.uid() is not null and not public.is_gestao() then
    raise exception 'apenas a gestão pode cadastrar matrícula com cobrança fora do sistema';
  end if;

  if p_data_inicio is null then
    raise exception 'informe a data de início do ciclo atual do aluno';
  end if;

  select * into pr from public.produtos where id = p_plano and ativo;
  if not found then
    raise exception 'produto inexistente ou inativo';
  end if;

  dia := extract(day from p_data_inicio)::smallint;
  fim := public.data_renovacao(p_data_inicio, 1, dia,
                               pr.periodicidade_meses, pr.periodicidade_dias) - 1;

  -- A data tem de ser a do ciclo VIGENTE. Uma data mais antiga criaria
  -- uma matrícula já vencida, e `processar_assinaturas()` renovaria um
  -- ciclo por dia até alcançar o presente — cobrando e creditando ciclos
  -- que nunca existiram. Barrar aqui é mais honesto que limpar depois.
  if fim < current_date then
    raise exception
      'a data de início precisa ser a do ciclo que está correndo agora: com % o ciclo terminaria em %, que já passou',
      to_char(p_data_inicio, 'DD/MM/YYYY'), to_char(fim, 'DD/MM/YYYY');
  end if;

  -- Uma porta por tipo de produto, as mesmas do resto do sistema: a
  -- trava de "turma fixa exige assento" continua sendo delas.
  if coalesce(pr.turmas_fixas, 0) > 0 then
    if p_turmas is null or array_length(p_turmas, 1) is null then
      raise exception '% é uma Mensalidade por Turma Fixa: escolha a(s) turma(s) da grade', pr.nome;
    end if;
    m_id := public.matricular_turma_fixa(p_cliente, p_plano, p_turmas, p_justificativa);
  else
    if p_turmas is not null and array_length(p_turmas, 1) is not null then
      raise exception '% não é uma Mensalidade por Turma Fixa', pr.nome;
    end if;
    m_id := public.matricular(p_cliente, p_plano, p_justificativa);
  end if;

  if p_preco_centavos is not null and p_preco_centavos <= 0 then
    raise exception
      'preco zero nao e desconto, e cortesia: use um produto de cortesia em vez de forcar o valor';
  end if;

  update public.matriculas
  set data_inicio = p_data_inicio,
      data_fim = fim,
      dia_renovacao = dia,
      cobranca_externa = coalesce(p_cobranca_externa, true),
      renova_automaticamente = coalesce(p_renova, renova_automaticamente),
      preco_contratado_centavos = coalesce(p_preco_centavos, preco_contratado_centavos)
  where id = m_id;

  -- O crédito do ciclo 1 vale até o fim do ciclo reancorado (ou os dias
  -- próprios do produto contados da data real, não da de cadastro).
  if pr.gera_credito and coalesce(pr.creditos_por_ciclo, 0) > 0 then
    v_validade := case
      when pr.validade_creditos_dias is not null then p_data_inicio + pr.validade_creditos_dias
      else fim
    end;
    update public.creditos_lotes
    set validade = v_validade
    where matricula_id = m_id and ciclo = 1 and origem = 'compra';
  end if;

  -- A previsão do ciclo 1 vence no dia em que o aluno paga de fato. É
  -- esta linha que a gestão dá baixa quando o dinheiro entra.
  -- `cobrar_ciclo()` ja criou esta linha com o preco do PRODUTO,
  -- dentro de matricular_produto(). Com override, o valor dela muda
  -- junto — senao a previsao do 1o ciclo discordaria dos seguintes.
  update public.entradas_financeiras
  set data_competencia = p_data_inicio,
      data_prevista = p_data_inicio,
      valor_centavos = coalesce(p_preco_centavos, valor_centavos)
  where matricula_id = m_id and ciclo = 1 and status = 'prevista';

  insert into public.auditoria (tabela, registro_id, acao, depois, motivo)
  values ('matriculas', m_id, 'matricula_de_aluno_anterior_ao_sistema',
          jsonb_build_object('produto', pr.nome,
                             'cliente_id', p_cliente,
                             'data_inicio', p_data_inicio,
                             'cobranca_externa', coalesce(p_cobranca_externa, true),
                             'renova', p_renova,
                             'preco_centavos', p_preco_centavos),
          nullif(btrim(coalesce(p_justificativa, '')), ''));

  return m_id;
end;
$fn$;


comment on function public.matricular_aluno_de_fora(uuid, uuid, date, uuid[], boolean, text, boolean, bigint) is
  'Matricula aluno que ja pagava antes do sistema: delega para matricular()/matricular_turma_fixa() '
  'e reancora o ciclo na data real. p_renova diz se a matricula renova (o produto legado diz que nao, '
  'mas o aluno renova — sem isso a previsao sai vazia) e p_preco_centavos honra desconto de cupom. '
  'Com cobranca_externa, o emissor nao cobra e processar_assinaturas() nao marca inadimplencia. Gestao apenas.';

revoke execute on function public.matricular_aluno_de_fora(uuid, uuid, date, uuid[], boolean, text, boolean, bigint) from public, anon;
grant execute on function public.matricular_aluno_de_fora(uuid, uuid, date, uuid[], boolean, text, boolean, bigint) to authenticated;


-- ------------------------------------------------------------
-- A guarda
-- ------------------------------------------------------------
do $$
declare
  v_assinaturas integer;
  v_def text;
begin
  -- Uma assinatura so: a antiga precisa ter saido, senao a chamada do
  -- front fica ambigua e o PostgREST erra em tempo de execucao.
  select count(*) into v_assinaturas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'matricular_aluno_de_fora';

  if v_assinaturas <> 1 then
    raise exception 'matricular_aluno_de_fora tem % assinaturas — deveria ter exatamente 1', v_assinaturas;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'matricular_aluno_de_fora';

  if position('renova_automaticamente = coalesce(p_renova' in v_def) = 0 then
    raise exception 'a funcao nao esta gravando a renovacao — a previsao sairia vazia';
  end if;
  if position('valor_centavos = coalesce(p_preco_centavos' in v_def) = 0 then
    raise exception 'o override de preco nao chegou na previsao do 1o ciclo';
  end if;

  -- O motivo de existir desta migration, provado: os planos do Wix
  -- realmente estao no catalogo como nao-renovaveis.
  if not exists (
    select 1 from public.produtos
    where ativo and status = 'legado' and tipo_produto = 'plano'
      and not renova_automaticamente
  ) then
    raise warning 'nenhum produto legado nao-renovavel — confira se a premissa ainda vale';
  end if;
end $$;
