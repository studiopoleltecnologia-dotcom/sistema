-- Folha aprovada vira saída automática no Financeiro — "nada a esquecer".
--
-- Ao aprovar o fechamento de uma professora, o sistema lança sozinho a saída
-- na categoria "Professoras", vencendo dia 15 do mês seguinte à competência
-- (dia de pagamento, regime de caixa). Reabrir o fechamento apaga a saída.
-- Idempotente por fechamento_id: reaprovar atualiza valor/vencimento em vez de
-- duplicar. Substitui o antigo botão manual "Lançar no Financeiro".

-- Vínculo saída ↔ fechamento (rastreio + idempotência da folha automática).
alter table public.saidas_financeiras
  add column if not exists fechamento_id uuid
    references public.fechamentos_professora(id) on delete set null;

create unique index if not exists saidas_financeiras_fechamento_id_key
  on public.saidas_financeiras (fechamento_id)
  where fechamento_id is not null;

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

    -- Dia 15 do mês seguinte à competência ('YYYY-MM').
    v_venc := (to_date(new.competencia || '-01', 'YYYY-MM-DD')
               + interval '1 month' + interval '14 days')::date;

    if v_cat is not null then
      insert into public.saidas_financeiras
        (descricao, valor_centavos, categoria_id, data_caixa, fechamento_id)
      values
        (format('Pagamento %s (%s)', coalesce(v_nome, 'professora'), new.competencia),
         v_total, v_cat, v_venc, new.id)
      on conflict (fechamento_id) where fechamento_id is not null
      do update set
        valor_centavos = excluded.valor_centavos,
        data_caixa = excluded.data_caixa,
        descricao = excluded.descricao,
        atualizada_em = now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_folha_financeiro on public.fechamentos_professora;
create trigger trg_sync_folha_financeiro
  after insert or update on public.fechamentos_professora
  for each row execute function public.sync_folha_financeiro();

-- É função de gatilho: não deve ser chamável direto pela API (PostgREST).
revoke all on function public.sync_folha_financeiro() from public, anon, authenticated;
