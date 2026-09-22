-- ============================================================
-- Turma Fixa: modalidades elegíveis (2.3.6) e fila × assento fixo
-- 22/09/2026
--
-- Duas correções achadas ao conferir o sistema contra o Regulamento
-- Interno de outubro/2026. Nenhuma das duas cria regra nova: as duas
-- fazem o banco obedecer o que já está escrito.
--
-- ------------------------------------------------------------
-- 1) 2.3.6 — Pole e derivadas não aceitam Mensalidade por Turma Fixa
-- ------------------------------------------------------------
-- "A Mensalidade por Turma Fixa não está disponível para Pole Dance e
--  suas variações, incluindo Heels, Spin, Power, Bases e demais
--  modalidades derivadas, nem para Flexibilidade."
--
-- `validar_assento_fixo()` já recusa matrícula em modalidade não
-- elegível — o MECANISMO está certo desde `20260908120000`. O que
-- estava errado era o DADO: 7 modalidades de Pole marcadas como
-- elegíveis, somando 23 turmas ativas em que o sistema aceitaria
-- vender o que o regulamento proíbe.
--
-- A lista sai do 2.3.6 mais a decisão da gestão de 22/09 sobre os três
-- casos que o texto não resolve sozinho:
--   · Bases de Inversão  → NÃO (o 2.3.6 cita "Bases");
--   · Stiletto           → SIM (é aula de salto, não Pole on Heels);
--   · Floorwork          → SIM.
--
-- Produção com 0 matrículas em 22/09: a correção não remaneja ninguém.
-- Depois do cutover do Wix, o mesmo acerto exigiria conversar com aluno.
--
-- ------------------------------------------------------------
-- 2) 4.15 — a fila não enxergava o assento fixo
-- ------------------------------------------------------------
-- `entrar_lista_espera()` comparava `count(agendamentos)` com
-- `turmas.capacidade` e recusava a entrada na fila dizendo "ainda há
-- vaga — agende direto". Só que `validar_vaga_agendamento()` conta
-- agendamentos + assentos fixos + vagas seguradas da fila. As duas
-- contas divergiam, e a divergência é exatamente o tamanho da Turma
-- Fixa naquela turma.
--
-- Efeito: numa turma de 8 lugares com 5 assentos fixos e 3
-- agendamentos, a aluna era mandada agendar (3 < 8) e o gatilho
-- recusava o agendamento (3+5 >= 8). Ela não conseguia nem reservar
-- nem entrar na fila — duas mensagens contraditórias e nenhum caminho.
--
-- Nunca apareceu em produção porque nunca existiu assento fixo em
-- produção. Apareceria no primeiro dia de uso real.
--
-- O 4.15 também diz que a fila é para "alunos que não possuem vaga
-- fixa naquela turma" — quem já tem assento fixo passa a ser recusado
-- com mensagem própria, em vez de entrar numa fila que não lhe serve.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Elegibilidade de modalidade para Turma Fixa (2.3.6)
-- ------------------------------------------------------------

update public.modalidades
set elegivel_turma_fixa = false
where nome in (
  'Pole 1',
  'Pole 1 e 2',
  'Pole 2',
  'Pole Silk',
  'Pole Spin 1',
  'Pole Spin 1 e 2',
  'Bases de Inversão'
);

comment on column public.modalidades.elegivel_turma_fixa is
  'Regulamento 2.3.6: Pole Dance e derivadas (Heels, Spin, Power, Bases) '
  'e Flexibilidade não aceitam Mensalidade por Turma Fixa. Conferido pela '
  'RPC validar_assento_fixo() na contratação e na troca de turma.';


-- ------------------------------------------------------------
-- 2) entrar_lista_espera(): contar o que o agendamento conta
-- ------------------------------------------------------------

create or replace function public.entrar_lista_espera(p_turma uuid, p_data date)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  cli uuid;
  t record;
  ocupadas integer;
  le_id uuid;
begin
  if public.is_cliente() then
    cli := public.cliente_atual();
  elsif public.is_socia() then
    raise exception 'use a versão com cliente explícito para inscrever alguém pela equipe';
  else
    raise exception 'acesso restrito à aluna';
  end if;

  select * into t from public.turmas where id = p_turma and ativa;
  if not found then
    raise exception 'turma inexistente';
  end if;
  if p_data < current_date then
    raise exception 'não dá para entrar na fila de uma aula que já passou';
  end if;

  -- 4.15: a fila é para quem NÃO tem vaga reservada naquela turma. Quem
  -- tem assento fixo já vai entrar na aula; a fila não lhe serve, e
  -- deixá-lo entrar tiraria a vez de quem precisa dela.
  if public.tem_assento_fixo(cli, p_turma, p_data) then
    raise exception
      'você tem vaga fixa nesta turma — sua presença já está garantida, não precisa entrar na fila';
  end if;

  if exists (
    select 1 from public.agendamentos
    where turma_id = p_turma and data = p_data
      and cliente_id = cli and status = 'agendado'
  ) then
    raise exception 'você já tem reserva nesta aula';
  end if;

  -- A MESMA conta de validar_vaga_agendamento(): agendamentos ativos,
  -- assentos fixos (4.3/4.4 — as vagas restantes são o que sobra depois
  -- deles) e as vagas seguradas para outras alunas da fila ainda dentro
  -- do prazo. Divergir daquela conta é o que fazia a aluna ser mandada
  -- agendar numa turma que o gatilho recusaria.
  select
    (select count(*) from public.agendamentos a
      where a.turma_id = p_turma and a.data = p_data and a.status = 'agendado')
    + public.assentos_fixos_ocupados(p_turma, p_data)
    + (select count(*) from public.lista_espera le
       cross join public.config_agendamento cfg
       where le.turma_id = p_turma
         and le.data = p_data
         and le.status = 'notificada'
         and le.cliente_id <> cli
         and le.notificada_em > now() - make_interval(mins => cfg.minutos_reserva_espera))
  into ocupadas;

  if ocupadas < t.capacidade then
    raise exception 'ainda há vaga nesta aula — agende direto';
  end if;

  insert into public.lista_espera (turma_id, data, cliente_id)
  values (p_turma, p_data, cli)
  returning id into le_id;

  return le_id;
end;
$$;

comment on function public.entrar_lista_espera(uuid, date) is
  'Regulamento 4.15: fila para quem não tem vaga reservada na turma. A '
  'lotação é contada igual a validar_vaga_agendamento() — agendamentos + '
  'assentos fixos + vagas seguradas —, senão a aluna é mandada agendar '
  'numa turma que o gatilho de capacidade recusa.';

revoke execute on function public.entrar_lista_espera(uuid, date) from public, anon;
grant execute on function public.entrar_lista_espera(uuid, date) to authenticated;
