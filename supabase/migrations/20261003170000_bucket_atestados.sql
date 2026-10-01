-- ============================================================
-- Bucket privado dos atestados médicos
-- 01/10/2026
-- ============================================================
-- `parq_documentos.arquivo_path` aponta para cá. O arquivo é **documento
-- de saúde** (LGPD art. 11), então o bucket é privado e o acesso é por
-- URL assinada, nunca por link público.
--
-- ## O caminho carrega o dono
--
-- O path é `<cliente_id>/<timestamp>.<ext>`. A policy recorta por
-- `storage.foldername(name)[1] = cliente_atual()::text`, que resolve a
-- autorização **sem consultar `parq_documentos`** — e portanto sem
-- precisar que a linha já exista no momento do upload. O upload acontece
-- antes do insert (é o arquivo que gera o path), e uma policy que
-- dependesse da linha recusaria o primeiro passo.
--
-- ## Quem lê
--
-- O aluno, o que é dele. A **gestão**, tudo — e não `is_operacional()`,
-- pelo mesmo motivo de `parq_respostas`: a secretaria faz o trabalho dela
-- sem abrir atestado de ninguém.
--
-- A professora não aparece em policy nenhuma: ela não vê.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atestados', 'atestados', false,
  -- 10 MB: foto de atestado tirada no celular cabe com folga, e o limite
  -- evita que alguém use o bucket como armazenamento de vídeo.
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ------------------------------------------------------------
-- O aluno envia o dele
-- ------------------------------------------------------------
drop policy if exists "aluno envia atestado" on storage.objects;
create policy "aluno envia atestado" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = public.cliente_atual()::text
  );

drop policy if exists "aluno le o proprio atestado" on storage.objects;
create policy "aluno le o proprio atestado" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'atestados'
    and (storage.foldername(name))[1] = public.cliente_atual()::text
  );

-- Sem update nem delete para o aluno: atestado enviado é registro, e
-- `parq_documentos` preserva os anteriores de propósito (exigência do
-- apêndice do PAR-Q). Trocar o arquivo seria apagar prova.


-- ------------------------------------------------------------
-- A gestão lê e, se preciso, remove
-- ------------------------------------------------------------
drop policy if exists "gestao le atestados do bucket" on storage.objects;
create policy "gestao le atestados do bucket" on storage.objects
  for select to authenticated
  using (bucket_id = 'atestados' and public.is_gestao());

-- O delete existe para o direito de exclusão da LGPD (art. 18, VI), que o
-- regulamento 11.7 promete ("para acessar, corrigir ou excluir seus
-- dados, fale com a equipe"). Não é operação de rotina.
drop policy if exists "gestao remove atestado" on storage.objects;
create policy "gestao remove atestado" on storage.objects
  for delete to authenticated
  using (bucket_id = 'atestados' and public.is_gestao());


-- ------------------------------------------------------------
-- A equipe anexa o atestado de papel
-- ------------------------------------------------------------
-- O aluno aparece na recepção com o papel na mão e a secretária
-- fotografa. `enviar_atestado_parq()` já aceita `is_socia()`, e sem esta
-- policy o upload falharia antes de chegar na RPC.
drop policy if exists "equipe envia atestado" on storage.objects;
create policy "equipe envia atestado" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'atestados' and public.is_socia());
