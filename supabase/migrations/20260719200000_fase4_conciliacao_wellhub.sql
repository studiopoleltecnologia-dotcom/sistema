-- ============================================================
-- Conciliação Wellhub (CLAUDE.md 12.6, MVP manual):
-- as sócias informam o valor real do repasse do mês; o sistema
-- distribui proporcionalmente entre os check-ins "a reconciliar"
-- daquele mês de competência e os marca como recebidos na data
-- do repasse (regime de caixa → MEI correto).
-- ============================================================
create or replace function public.conciliar_wellhub(
  p_mes date,
  p_valor_total_centavos bigint,
  p_data_caixa date default null
)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  ini date := date_trunc('month', p_mes)::date;
  fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  dcaixa date := coalesce(p_data_caixa, current_date);
  n integer;
  base bigint;
  resto bigint;
  primeiro uuid;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito às sócias';
  end if;
  if p_valor_total_centavos <= 0 then
    raise exception 'valor do repasse deve ser maior que zero';
  end if;

  select count(*) into n
  from public.entradas_financeiras
  where categoria = 'wellhub' and status = 'prevista'
    and data_competencia >= ini and data_competencia < fim;

  if n = 0 then
    raise exception 'nenhum check-in a reconciliar na competência %',
      to_char(ini, 'MM/YYYY');
  end if;

  base := p_valor_total_centavos / n;
  resto := p_valor_total_centavos - base * n;
  if base = 0 then
    -- repasse menor que 1 centavo por check-in (ex: teto de visitas):
    -- caso raro — tratar manualmente para não distorcer os lançamentos
    raise exception 'valor menor que o número de check-ins (%) — concilie manualmente', n;
  end if;

  select id into primeiro
  from public.entradas_financeiras
  where categoria = 'wellhub' and status = 'prevista'
    and data_competencia >= ini and data_competencia < fim
  order by data_competencia, criada_em
  limit 1;

  update public.entradas_financeiras
  set valor_centavos = base + case when id = primeiro then resto else 0 end,
      status = 'recebida',
      data_caixa = dcaixa
  where categoria = 'wellhub' and status = 'prevista'
    and data_competencia >= ini and data_competencia < fim;

  return n;
end;
$$;

revoke execute on function public.conciliar_wellhub(date, bigint, date) from public, anon;
grant execute on function public.conciliar_wellhub(date, bigint, date) to authenticated;
