-- ============================================================
-- M4 — Novos valores de enum, isolados numa migration própria.
--
-- Postgres não deixa criar um valor de enum e usá-lo (em default,
-- constraint ou update) na mesma transação. Como a M5 precisa
-- USAR os dois valores abaixo, eles nascem aqui, separados.
-- ============================================================

-- Crédito não usado morre no fim do ciclo (decisão de 21/07/2026:
-- "4 créditos/mês" só é promessa honesta se não acumular — senão o
-- semestral vira um pacote de 24 disfarçado).
alter type public.motivo_credito add value if not exists 'expiracao';

-- Ciclo não pago bloqueia novos agendamentos na hora (decisão de
-- 21/07/2026). Não é 'cancelada': os créditos já pagos do ciclo
-- corrente continuam válidos até expirarem — ela pagou por eles.
alter type public.status_matricula add value if not exists 'inadimplente';
