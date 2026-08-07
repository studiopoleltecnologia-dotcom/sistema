-- Fase A do redesenho financeiro (competência × caixa) — fecha a lacuna em
-- saidas_financeiras, que hoje só tem data_caixa. Decisões da proposta
-- aprovada em 05/08/2026: mensalidade não muda (entradas_financeiras já usa
-- competência correta — aluna paga na hora); despesa fixa comum não pede
-- competência distinta (usa o mês de data_caixa por padrão); lançamento
-- manual de saída continua nascendo como 'paga', sem novo clique.
--
-- Só a folha de professora (sync_folha_financeiro) tem competência real
-- diferente do pagamento — mês trabalhado ≠ dia 15 do mês seguinte.

create type public.status_saida as enum ('prevista', 'paga', 'cancelada');

alter table public.saidas_financeiras
  add column data_competencia date,
  add column data_prevista date,
  add column status_saida public.status_saida not null default 'paga';

-- Preenche data_competencia sozinha quando quem lança não informa: mês de
-- data_caixa (ou de data_prevista, para o dia em que 'prevista' passar a ser
-- lançada sem data_caixa ainda). Quem já sabe a competência real (folha)
-- continua informando explicitamente e a trigger não sobrescreve.
create or replace function public.preencher_competencia_saida()
returns trigger
language plpgsql
as $$
begin
  if new.data_competencia is null then
    new.data_competencia := date_trunc(
      'month', coalesce(new.data_caixa, new.data_prevista, current_date)
    )::date;
  end if;
  return new;
end;
$$;

create trigger saidas_preencher_competencia
  before insert on public.saidas_financeiras
  for each row execute function public.preencher_competencia_saida();

-- Backfill antes do NOT NULL. A trigger acima é BEFORE INSERT: ela não
-- alcança linha que já existe. Sem este update, a migration só passa se a
-- tabela estiver vazia no momento em que rodar — o que é verdade na
-- produção hoje, mas deixaria a migration refém do estado do banco. Uma
-- única saída lançada antes da promoção travaria o deploy.
update public.saidas_financeiras
   set data_competencia = date_trunc(
         'month', coalesce(data_caixa, data_prevista, current_date)
       )::date
 where data_competencia is null;

alter table public.saidas_financeiras
  alter column data_competencia set not null;

alter table public.saidas_financeiras
  add constraint saida_paga_tem_data_caixa
    check (status_saida <> 'paga' or data_caixa is not null);

create index saidas_data_competencia_idx on public.saidas_financeiras (data_competencia);
create index saidas_status_idx on public.saidas_financeiras (status_saida);

-- sync_folha_financeiro passa a gravar a competência real (mês trabalhado)
-- e o vencimento (data_prevista = dia 15 do mês seguinte), sem mudar nada
-- observável hoje: continua status_saida='paga' por padrão e data_caixa no
-- vencimento, exatamente como antes desta migration.
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
begin
  -- Saiu de 'aprovado' (reabertura): remove a saída gerada.
  if tg_op = 'UPDATE'
     and old.status = 'aprovado'
     and new.status is distinct from 'aprovado' then
    delete from public.saidas_financeiras where fechamento_id = new.id;
    return new;
  end if;

  -- Entrou em 'aprovado' agora: cria (ou atualiza) a saída.
  if new.status = 'aprovado'
     and (tg_op = 'INSERT' or old.status is distinct from 'aprovado') then

    v_total := coalesce(new.bruto_centavos, 0)
      + coalesce((select sum(valor_centavos) from public.fechamento_ajustes
                  where fechamento_id = new.id), 0);

    select id into v_cat from public.categorias_saida where nome = 'Professoras' limit 1;
    select nome into v_nome from public.professoras where id = new.professora_id;

    v_competencia := to_date(new.competencia || '-01', 'YYYY-MM-DD');
    -- Dia 15 do mês seguinte à competência ('YYYY-MM').
    v_venc := (v_competencia + interval '1 month' + interval '14 days')::date;

    if v_cat is not null then
      insert into public.saidas_financeiras
        (descricao, valor_centavos, categoria_id, data_caixa,
         data_competencia, data_prevista, fechamento_id)
      values
        (format('Pagamento %s (%s)', coalesce(v_nome, 'professora'), new.competencia),
         v_total, v_cat, v_venc, v_competencia, v_venc, new.id)
      on conflict (fechamento_id) where fechamento_id is not null
      do update set
        valor_centavos = excluded.valor_centavos,
        data_caixa = excluded.data_caixa,
        data_competencia = excluded.data_competencia,
        data_prevista = excluded.data_prevista,
        descricao = excluded.descricao,
        atualizada_em = now();
    end if;
  end if;

  return new;
end;
$$;

-- É função de gatilho: não deve ser chamável direto pela API (PostgREST).
revoke all on function public.sync_folha_financeiro() from public, anon, authenticated;
