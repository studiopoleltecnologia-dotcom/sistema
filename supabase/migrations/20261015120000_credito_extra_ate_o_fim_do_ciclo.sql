-- ============================================================
-- Crédito extra: a validade morre com o ciclo do plano
-- 05/10/2026
-- ============================================================
-- A29. A cláusula do crédito extra diz:
--
--   "Validade de {{VALIDADE_DIAS}} dias, **limitada ao ciclo vigente do
--    plano**. Não acumula para o ciclo seguinte."
--
-- O sistema aplicava só a primeira metade: `validade_creditos_dias`
-- vira `current_date + N`, e trinta dias corridos **atravessam a
-- renovação**. Quem comprasse um crédito extra no dia 28 de um ciclo que
-- fecha no dia 30 levaria 28 dias para o ciclo seguinte — exatamente o
-- que a segunda metade da cláusula nega.
--
-- Não é um número errado: é um mecanismo que falta.
-- `validade_creditos_dias` não tem como expressar "fim do ciclo", porque
-- o ciclo é de OUTRA matrícula — a do plano que torna a pessoa elegível.
--
-- ## Como o sistema sabe que é um crédito extra
--
-- Pelo requisito, não pelo nome: é o produto que exige `plano_ativo` em
-- `produto_requisitos`. Mesma disciplina do resto do catálogo — a regra
-- sai da COLUNA, e um produto novo com o mesmo requisito já nasce certo.
--
-- E isso casa com o que a gestão explicou em 02/10, que foi o que
-- desfez a confusão entre os dois produtos parecidos: *"crédito extra é
-- a aula avulsa pra quem tem um plano ativo no studio. Aula avulsa é
-- praquela pessoa que não tem plano nenhum."* A diferença **é** a
-- coluna.
--
-- ## O que não muda
--
-- A aula avulsa comum (sem requisito) continua com a validade dela em
-- dias corridos: ela não pertence a ciclo nenhum. E o teto não cria
-- validade onde não havia — ele só encurta, nunca estica.
-- ============================================================


-- ------------------------------------------------------------
-- 1. matricular_produto, com o teto do ciclo
-- ------------------------------------------------------------
-- Gerada do arquivo de `20260924120000` (§3). A única diferença é o
-- bloco que limita a validade, logo depois do cálculo que já existia.
create or replace function public.matricular_produto(
  p_cliente uuid,
  p_plano uuid,
  p_justificativa text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  pr record;
  m_id uuid;
  lote uuid;
  autor uuid;
  eh_cliente boolean;
  dia smallint;
  fim date;
  validade date;
  fim_do_plano date;
  imp record;
  just text := nullif(btrim(coalesce(p_justificativa, '')), '');
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

  if pr.status = 'interno' and auth.uid() is not null and not public.is_gestao() then
    raise exception
      '“%” é um plano interno da equipe — só a gestão pode conceder', pr.nome;
  end if;

  select * into imp from public.impedimento_para_contratar(p_cliente, p_plano);

  -- `auth.uid() is null` é contexto de serviço (import, cron, migration,
  -- webhook de pagamento), e o resto desta função já o trata como
  -- confiável — a checagem de papel acima também é pulada nele.
  if imp.motivo is not null and auth.uid() is not null then
    if not imp.excepcionavel or eh_cliente or not public.is_gestao() then
      raise exception '%', imp.motivo;
    end if;
    if just is null then
      raise exception
        '% — para vender assim mesmo, informe a justificativa (ela fica registrada)',
        imp.motivo;
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
  -- passou por cima da regra.
  if imp.motivo is not null then
    insert into public.auditoria (tabela, registro_id, acao, depois, motivo)
    values ('matriculas', m_id,
            case when pr.status = 'legado' then 'venda_de_produto_legado'
                 else 'excecao_elegibilidade' end,
            jsonb_build_object('produto', pr.nome, 'cliente_id', p_cliente,
                               'status_produto', pr.status,
                               'requisito_nao_atendido', imp.motivo),
            just);
  end if;

  if pr.gera_credito and pr.creditos_por_ciclo > 0 then
    -- Sem validade própria, o crédito vale até o fim do ciclo.
    validade := case
      when pr.validade_creditos_dias is not null then current_date + pr.validade_creditos_dias
      else fim
    end;

    -- ---- A29: o crédito extra morre com o ciclo do plano ----
    -- Regulamento, cláusula do crédito extra: "validade de N dias,
    -- **limitada ao ciclo vigente do plano**. Não acumula para o ciclo
    -- seguinte." Os 30 dias sozinhos atravessam a renovação, e aí o
    -- crédito comprado no dia 28 sobreviveria ao ciclo que o justificou
    -- — exatamente o que a cláusula nega.
    --
    -- "Crédito extra" não é o nome do produto: é o produto que exige
    -- `plano_ativo` (`produto_requisitos`). Mesma disciplina do resto do
    -- catálogo — a regra sai da COLUNA.
    --
    -- Com mais de um plano ativo vale o que termina MAIS TARDE: enquanto
    -- qualquer um deles estiver de pé, a pessoa continua sendo "quem tem
    -- plano ativo", que é a condição que a cláusula impõe.
    if exists (
      select 1 from public.produto_requisitos r
       where r.produto_id = p_plano and r.tipo = 'plano_ativo'
    ) then
      select max(m2.data_fim) into fim_do_plano
        from public.matriculas m2
        join public.produtos p2 on p2.id = m2.plano_id
       where m2.cliente_id = p_cliente
         and m2.status = 'ativa'
         and p2.renova_automaticamente
         and m2.data_fim >= current_date;

      if fim_do_plano is not null then
        validade := least(validade, fim_do_plano);
      end if;
    end if;

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
$function$;

comment on function public.matricular_produto(uuid, uuid, text) is
  'Cria a matrícula e o primeiro lote de créditos. A validade do lote respeita o teto do ciclo quando o produto exige plano ativo (crédito extra, A29): a cláusula limita o crédito extra ao ciclo vigente, e dias corridos sozinhos atravessariam a renovação.';

revoke execute on function public.matricular_produto(uuid, uuid, text) from public, anon;
grant execute on function public.matricular_produto(uuid, uuid, text) to authenticated;
