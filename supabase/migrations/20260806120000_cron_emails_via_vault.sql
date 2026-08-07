-- Tira a URL e a anon key de PRODUÇÃO que estavam fixas no texto da migration
-- 20260724120000_cron_disparo_emails.sql e passa a lê-las do Vault do próprio
-- projeto.
--
-- O problema que isto corrige (medido em 05/08/2026): aquela migration é
-- aplicada em TODOS os ambientes, então o cron do DEV chamava a Edge Function
-- da PRODUÇÃO a cada 2 min — 180 chamadas com HTTP 200 em ~6h. Como
-- enviar-emails não usa `for update skip locked`, duas execuções concorrentes
-- (a da produção + a vazada do dev) podem mandar o mesmo e-mail duas vezes
-- para aluna real.
--
-- Como fica: cada projeto Supabase guarda no próprio Vault os segredos
-- `project_url` e `anon_key`. A migration é idêntica nos dois ambientes — o
-- que muda é o conteúdo do Vault, que não é versionado e nunca sai do banco.
--
-- ⚠️ Ambiente SEM os segredos não envia nada, de propósito (ver
-- disparar_emails() abaixo). Isso é a trava de isolamento: o DEV fica inerte
-- até alguém deliberadamente semear o Vault dele. Consequência direta: os
-- segredos da PRODUÇÃO precisam estar no Vault ANTES desta migration chegar
-- lá, senão o envio de e-mail para. Ver docs/interno/cicd-e-ambientes.md.

create or replace function public.disparar_emails()
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'anon_key';

  -- Silêncio proposital, não erro: é assim que o DEV (e qualquer projeto novo)
  -- deixa de disparar e-mail sem precisar de migration diferente por ambiente.
  if v_url is null or v_key is null then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/enviar-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.disparar_emails() is
  'Chama a Edge Function enviar-emails DESTE projeto, lendo project_url e '
  'anon_key do Vault local. Sem esses segredos no Vault, não faz nada — é o '
  'que mantém o DEV sem disparar e-mail real.';

-- Só o cron (postgres) chama. Ninguém pelo PostgREST.
revoke all on function public.disparar_emails() from public, anon, authenticated;

-- Recria o agendamento apontando para a função. Idempotente: na produção o job
-- antigo (com a URL fixa) ainda existe e precisa sair; no dev ele já foi
-- removido à mão em 06/08/2026 para estancar as chamadas cruzadas.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'disparar-emails') then
    perform cron.unschedule('disparar-emails');
  end if;
end
$$;

select cron.schedule(
  'disparar-emails',
  '*/2 * * * *',
  $$select public.disparar_emails();$$
);
