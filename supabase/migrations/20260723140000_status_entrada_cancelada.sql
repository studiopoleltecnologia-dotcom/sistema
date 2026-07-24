-- Entrada agora pode ser cancelada (ex.: recebimento previsto que não vai
-- se concretizar). Antes só existia prevista/recebida. "Atrasada" continua
-- sendo derivada na aplicação (prevista + data_prevista vencida), não é um
-- valor do enum.
alter type public.status_entrada add value if not exists 'cancelada';
