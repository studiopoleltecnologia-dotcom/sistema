-- ============================================================
-- M7 — vw_saldo_creditos passa a mostrar o ciclo
--
-- Sem isso a equipe não consegue operar o modelo de ciclos: não dá
-- para saber quem está no ciclo 3 de 6 nem quem precisa de renovação
-- olhando só o saldo. Enquanto não existir gateway, a renovação é
-- manual — e manual sem informação vira chute.
-- ============================================================

create or replace view public.vw_saldo_creditos
with (security_invoker = true) as
select
  m.id as matricula_id,
  m.cliente_id,
  m.plano_id,
  m.status,
  m.data_inicio,
  m.data_fim,
  m.creditos_total,
  m.ciclo_atual,
  m.ciclos_total,
  coalesce(sum(ce.delta), 0::bigint)::integer as saldo
from public.matriculas m
  left join public.creditos_eventos ce on ce.matricula_id = m.id
group by m.id;
