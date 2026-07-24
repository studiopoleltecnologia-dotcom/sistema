-- Agendador do disparo de e-mails: a cada 2 min chama a Edge Function
-- enviar-emails, que varre a fila da lista de espera e envia o que estiver
-- pendente (lista_espera status='notificada' e email_enviado_em nulo).
--
-- Usa a chave ANON no header (é pública por design — CLAUDE.md §3; está no
-- front também). A função exige JWT válido (a anon serve) e, por dentro,
-- usa o service role do próprio ambiente para ler/gravar.
create extension if not exists pg_net;

select cron.schedule(
  'disparar-emails',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://fgvxhwpqsxohqrccrlfn.supabase.co/functions/v1/enviar-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZndnhod3Bxc3hvaHFyY2NybGZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDc1MjMsImV4cCI6MjA5OTgyMzUyM30.U0ZscLLlM-ZTo9gq3_gkha6PIhc0nVvlU-gKDVKIfKs'
    ),
    body := '{}'::jsonb
  );
  $$
);
