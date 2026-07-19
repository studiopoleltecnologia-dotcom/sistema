-- Fix: CASE de texto não converte implicitamente para o enum
-- tipo_evento_agendamento dentro do INSERT (erro 42804).
create or replace function public.registrar_presenca(
  p_turma uuid, p_data date, p_cliente uuid, p_presente boolean,
  p_canal public.canal_aula default 'avulsa'
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  ag record;
  prof uuid;
  canal_final public.canal_aula;
  pr_id uuid;
begin
  if auth.uid() is not null and not public.is_socia() then
    raise exception 'acesso restrito às sócias';
  end if;

  select professora_id into prof from public.turmas where id = p_turma;
  if prof is null then
    raise exception 'turma inexistente';
  end if;

  select * into ag from public.agendamentos
  where turma_id = p_turma and data = p_data and cliente_id = p_cliente
    and status = 'agendado';

  canal_final := coalesce(ag.canal, p_canal);

  insert into public.presencas
    (agendamento_id, turma_id, cliente_id, professora_id, data_aula, canal, presente)
  values (ag.id, p_turma, p_cliente, prof, p_data, canal_final, p_presente)
  on conflict (turma_id, data_aula, cliente_id)
  do update set presente = excluded.presente
  returning id into pr_id;

  if ag.id is not null then
    insert into public.agendamentos_eventos (agendamento_id, evento, criado_por)
    values (ag.id,
      (case when p_presente then 'presenca' else 'falta' end)::public.tipo_evento_agendamento,
      auth.uid());
  end if;

  return pr_id;
end;
$$;
