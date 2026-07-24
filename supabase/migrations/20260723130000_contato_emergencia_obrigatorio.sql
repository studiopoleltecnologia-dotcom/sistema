-- Contato de emergência obrigatório no autocadastro do portal do aluno.
-- A validação vive na função (SECURITY DEFINER), não só na tela — o front
-- não é fonte de verdade. Como a assinatura ganha 2 parâmetros, isto cria
-- uma nova sobrecarga; a versão antiga (6 args) é derrubada para não deixar
-- um caminho que crie conta sem o contato.
create or replace function public.criar_conta_aluna(
  p_nome text,
  p_telefone text,
  p_email text,
  p_data_nascimento date,
  p_aceite_lgpd boolean,
  p_contato_emergencia_nome text default null,
  p_contato_emergencia_telefone text default null,
  p_versao_termo text default 'v1'::text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c_id uuid;
  candidatos integer;
begin
  if auth.uid() is null then
    raise exception 'requer sessão autenticada';
  end if;
  if public.is_socia() then
    raise exception 'conta da equipe não pode virar conta de aluna';
  end if;
  if exists (select 1 from public.contas_aluna where auth_user_id = auth.uid()) then
    raise exception 'esta conta já está vinculada a uma cliente';
  end if;
  if not p_aceite_lgpd then
    raise exception 'aceite dos termos é obrigatório para criar a conta';
  end if;
  if p_contato_emergencia_nome is null or length(trim(p_contato_emergencia_nome)) = 0
     or p_contato_emergencia_telefone is null or length(trim(p_contato_emergencia_telefone)) = 0 then
    raise exception 'contato de emergência (nome e telefone) é obrigatório';
  end if;

  if p_telefone is not null and length(trim(p_telefone)) > 0 then
    select count(*) into candidatos from public.clientes where telefone = p_telefone;
    if candidatos = 1 then
      select id into c_id from public.clientes where telefone = p_telefone;
    end if;
  end if;

  if c_id is null and p_email is not null and length(trim(p_email)) > 0 then
    select count(*) into candidatos from public.clientes
    where lower(email) = lower(p_email);
    if candidatos = 1 then
      select id into c_id from public.clientes where lower(email) = lower(p_email);
    end if;
  end if;

  if c_id is null then
    insert into public.clientes
      (nome, telefone, email, data_nascimento, origem,
       contato_emergencia_nome, contato_emergencia_telefone)
    values
      (p_nome, p_telefone, p_email, p_data_nascimento, 'portal_aluna',
       p_contato_emergencia_nome, p_contato_emergencia_telefone)
    returning id into c_id;
  else
    update public.clientes
    set email = coalesce(email, p_email),
        telefone = coalesce(telefone, p_telefone),
        data_nascimento = coalesce(data_nascimento, p_data_nascimento),
        contato_emergencia_nome = coalesce(contato_emergencia_nome, p_contato_emergencia_nome),
        contato_emergencia_telefone = coalesce(contato_emergencia_telefone, p_contato_emergencia_telefone)
    where id = c_id;
  end if;

  insert into public.contas_aluna (auth_user_id, cliente_id, aceite_lgpd_em, versao_termo)
  values (auth.uid(), c_id, now(), p_versao_termo);

  return c_id;
end;
$function$;

-- Derruba a assinatura antiga (bypass) e estreita o grant da nova ao mesmo
-- nível da original (sem anon/public — o signup já exige sessão autenticada).
drop function if exists public.criar_conta_aluna(text, text, text, date, boolean, text);

revoke execute on function
  public.criar_conta_aluna(text, text, text, date, boolean, text, text, text)
  from public, anon;
