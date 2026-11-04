-- ============================================================
-- Previsão da folha das professoras
-- ============================================================
-- A folha só entrava no Financeiro quando o mês era APROVADO — ou seja,
-- depois de já ter acontecido. O custo com professoras, que é a maior
-- despesa variável do estúdio, só aparecia no retrovisor: olhar dezembro
-- em novembro mostrava aluguel, internet e DAS-MEI, e zero de professora.
--
-- Agora cada mês à frente nasce com uma SAÍDA PREVISTA por professora,
-- calculada a partir do histórico. Quando o fechamento daquele mês é
-- aprovado, o valor previsto é substituído pelo real.
--
-- ------------------------------------------------------------
-- Como a previsão é calculada, e por que assim
-- ------------------------------------------------------------
-- Média ponderada dos até 3 últimos meses fechados, com o mais recente
-- pesando 3, o anterior 2 e o terceiro 1.
--
-- Não é um palpite de modelo de linguagem, e isso é decisão, não atalho:
-- previsão de dinheiro precisa ser REPRODUZÍVEL e explicável — a tela
-- mostra quais meses entraram na conta e quanto eles variam. Um número
-- que ninguém consegue refazer não serve para decidir gasto.
--
-- A ponderação existe porque o histórico real é volátil: medido na
-- produção em 11/2026, as professoras com 4 meses de folha variam ~29%
-- entre o maior e o menor mês. Média simples trataria um mês atípico
-- (professora que deu uma aula só) como se fosse a realidade de hoje.
--
-- A previsão também carrega a própria confiança, porque metade do quadro
-- tem UM mês de histórico. Dizer "R$ X" com a mesma cara para quem tem 4
-- meses estáveis e para quem tem 1 mês seria esconder a diferença que
-- mais importa na hora de usar o número.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Marcar o que é previsão
-- ------------------------------------------------------------
-- Sem esta coluna não há como regerar previsões sem risco: a rotina
-- precisa saber quais linhas são dela (pode reescrever) e quais são
-- lançamento de verdade (não toca).
alter table public.saidas_financeiras
  add column if not exists previsao_automatica boolean not null default false;

comment on column public.saidas_financeiras.previsao_automatica is
  'true = linha criada pela previsao de folha, e que a propria rotina pode reescrever. Vira false quando o fechamento e aprovado e o valor passa a ser real.';


-- ------------------------------------------------------------
-- 2. A base de cálculo, à vista
-- ------------------------------------------------------------
-- View própria para a tela poder MOSTRAR a conta: quais meses entraram,
-- quanto variam, e o quanto se pode confiar. É o que diferencia uma
-- previsão de um número que apareceu do nada.
create or replace view public.vw_previsao_folha_professora
with (security_invoker = true) as
with historico as (
  select
    f.professora_id,
    f.competencia,
    f.bruto_centavos + coalesce((
      select sum(a.valor_centavos) from public.fechamento_ajustes a
      where a.fechamento_id = f.id
    ), 0) as total_centavos,
    row_number() over (partition by f.professora_id order by f.competencia desc) as recencia
  from public.fechamentos_professora f
  where f.status = 'aprovado'
    and f.bruto_centavos is not null
),
recentes as (
  -- Os 3 mais novos, com peso decrescente: 3, 2, 1.
  select professora_id, competencia, total_centavos, (4 - recencia) as peso
  from historico
  where recencia <= 3
),
ponderada as (
  select
    professora_id,
    round(sum(total_centavos::numeric * peso) / nullif(sum(peso), 0))::bigint as previsto_centavos,
    count(*)::integer as meses_considerados,
    min(competencia) as desde,
    max(competencia) as ate
  from recentes
  group by professora_id
),
dispersao as (
  -- Variação sobre TODO o histórico, não só os 3 usados: é o que diz se
  -- o valor desta professora costuma oscilar.
  select
    professora_id,
    count(*)::integer as meses_no_historico,
    case when avg(total_centavos) > 0
      then round((stddev_pop(total_centavos) / avg(total_centavos) * 100)::numeric, 1)
      else 0 end as variacao_pct
  from historico
  group by professora_id
)
select
  p.id as professora_id,
  p.nome,
  pond.previsto_centavos,
  pond.meses_considerados,
  pond.desde,
  pond.ate,
  d.meses_no_historico,
  d.variacao_pct,
  case
    when d.meses_no_historico >= 3 and d.variacao_pct < 15 then 'alta'
    when d.meses_no_historico >= 2 then 'media'
    else 'baixa'
  end::text as confianca
from public.professoras p
join ponderada pond on pond.professora_id = p.id
join dispersao d on d.professora_id = p.id
where p.ativa;

comment on view public.vw_previsao_folha_professora is
  'Previsao do pagamento de cada professora ativa: media ponderada dos ate 3 ultimos meses aprovados (pesos 3/2/1), com a base da conta e a confianca a vista.';


-- ------------------------------------------------------------
-- 3. A rotina que lança as previsões
-- ------------------------------------------------------------
-- Gera, para os próximos `p_meses` meses (a partir do mês corrente), uma
-- saída prevista por professora com previsão.
--
-- O vínculo é o `fechamento_id`, e é ele que faz o ajuste acontecer
-- sozinho: `sync_folha_financeiro()` já grava a saída da folha com
-- `on conflict (fechamento_id) do update`. Aprovar o mês, portanto,
-- SOBRESCREVE a mesma linha com o valor real — não existe caminho em que
-- previsão e folha real convivam como duas saídas.
create or replace function public.prever_folha_professoras(p_meses integer default 3)
returns integer
-- definer: o cron roda sem sessão de usuário, e as duas tabelas são
-- gestao-only por RLS. O portão é o `is_gestao()` logo abaixo, mais o
-- grant restrito a `authenticated` no fim do arquivo.
security definer
language plpgsql
set search_path = public
as $$
declare
  v_categoria uuid;
  v_mes date;
  v_competencia text;
  v_fechamento uuid;
  v_venc date;
  r record;
  v_processadas integer := 0;
begin
  -- Chamada por gente: só gestão. Chamada pelo cron: não há auth.uid(),
  -- e a função não é exposta a anon (ver revoke/grant no fim).
  if auth.uid() is not null and not is_gestao() then
    raise exception 'Apenas a gestao pode gerar previsoes de folha.';
  end if;

  select id into v_categoria from public.categorias_saida where nome = 'Professoras' limit 1;
  if v_categoria is null then
    raise exception 'Categoria "Professoras" nao existe.';
  end if;

  for i in 0 .. greatest(coalesce(p_meses, 3), 1) - 1 loop
    v_mes := (date_trunc('month', current_date::timestamp) + make_interval(months => i))::date;
    v_competencia := to_char(v_mes, 'YYYY-MM');
    -- Dia 15 do mês seguinte, a mesma regra de pagamento da folha real.
    v_venc := (v_mes + interval '1 month' + interval '14 days')::date;

    for r in select * from public.vw_previsao_folha_professora loop
      -- Mês já aprovado tem valor real: a previsão não tem o que dizer.
      select id into v_fechamento
        from public.fechamentos_professora
       where professora_id = r.professora_id and competencia = v_competencia;

      if v_fechamento is not null
         and (select status from public.fechamentos_professora where id = v_fechamento) = 'aprovado' then
        continue;
      end if;

      if v_fechamento is null then
        insert into public.fechamentos_professora (professora_id, competencia)
        values (r.professora_id, v_competencia)
        returning id into v_fechamento;
      end if;

      insert into public.saidas_financeiras
        (descricao, valor_centavos, categoria_id, data_caixa, data_competencia,
         data_prevista, status_saida, fechamento_id, previsao_automatica)
      values
        (format('Pagamento %s (%s) · previsão', r.nome, v_competencia),
         r.previsto_centavos, v_categoria, v_venc, v_mes, v_venc,
         'prevista', v_fechamento, true)
      on conflict (fechamento_id) where fechamento_id is not null
      do update set
        valor_centavos = excluded.valor_centavos,
        descricao = excluded.descricao,
        data_caixa = excluded.data_caixa,
        data_prevista = excluded.data_prevista,
        data_competencia = excluded.data_competencia,
        atualizada_em = now()
      -- ⚠️ Só reescreve o que é dela. Linha que já virou valor real (ou que
      -- a gestão editou à mão em Saídas) não é tocada por regeração.
      where saidas_financeiras.previsao_automatica;

      v_processadas := v_processadas + 1;
    end loop;
  end loop;

  return v_processadas;
end;
$$;

comment on function public.prever_folha_professoras(integer) is
  'Lanca/atualiza a saida prevista da folha de cada professora ativa nos proximos N meses. Idempotente: so reescreve linhas marcadas como previsao_automatica.';

revoke all on function public.prever_folha_professoras(integer) from public, anon;
grant execute on function public.prever_folha_professoras(integer) to authenticated;


-- ------------------------------------------------------------
-- 4. Aprovar o mês apaga a marca de previsão
-- ------------------------------------------------------------
-- Mesma função de antes, com uma linha a mais: ao gravar o valor real, a
-- linha deixa de ser previsão e a rotina para de poder reescrevê-la.
create or replace function public.sync_folha_financeiro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_cat uuid;
  v_nome text;
  v_venc date;
  v_competencia date;
  v_status public.status_saida;
begin
  if tg_op = 'UPDATE'
     and old.status = 'aprovado'
     and new.status is distinct from 'aprovado' then
    delete from public.saidas_financeiras where fechamento_id = new.id;
    return new;
  end if;

  if new.status = 'aprovado'
     and (tg_op = 'INSERT' or old.status is distinct from 'aprovado') then

    v_total := coalesce(new.bruto_centavos, 0)
      + coalesce((select sum(valor_centavos) from public.fechamento_ajustes
                  where fechamento_id = new.id), 0);

    select id into v_cat from public.categorias_saida where nome = 'Professoras' limit 1;
    select nome into v_nome from public.professoras where id = new.professora_id;

    v_competencia := to_date(new.competencia || '-01', 'YYYY-MM-DD');
    v_venc := (v_competencia + interval '1 month' + interval '14 days')::date;
    v_status := case when v_venc > current_date then 'prevista' else 'paga' end;

    if v_cat is not null then
      insert into public.saidas_financeiras
        (descricao, valor_centavos, categoria_id, data_caixa,
         data_competencia, data_prevista, status_saida, fechamento_id)
      values
        (format('Pagamento %s (%s)', coalesce(v_nome, 'professora'), new.competencia),
         v_total, v_cat, v_venc, v_competencia, v_venc, v_status, new.id)
      on conflict (fechamento_id) where fechamento_id is not null
      do update set
        valor_centavos = excluded.valor_centavos,
        data_caixa = excluded.data_caixa,
        data_competencia = excluded.data_competencia,
        data_prevista = excluded.data_prevista,
        status_saida = excluded.status_saida,
        descricao = excluded.descricao,
        -- O valor virou real: sai do alcance da rotina de previsão.
        previsao_automatica = false,
        atualizada_em = now();
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_folha_financeiro() from public, anon, authenticated;


-- ------------------------------------------------------------
-- 5. Todo mês, sozinho
-- ------------------------------------------------------------
-- Dia 1, 9h: a janela rola para a frente e as previsões se recalculam com
-- o mês que acabou de fechar. Não usa HTTP, então não depende do Vault
-- (§14.4) — é SQL puro chamando uma função local.
do $mig$
begin
  if exists (select 1 from cron.job where jobname = 'prever-folha-professoras') then
    perform cron.unschedule('prever-folha-professoras');
  end if;
end $mig$;

select cron.schedule(
  'prever-folha-professoras',
  '0 9 1 * *',
  $$select public.prever_folha_professoras(3)$$
);


-- ------------------------------------------------------------
-- 6. A primeira carga
-- ------------------------------------------------------------
-- Sem isto, a previsão só apareceria no dia 1º do mês que vem — e o
-- pedido era justamente enxergar o gasto dos próximos meses hoje.
select public.prever_folha_professoras(3);
