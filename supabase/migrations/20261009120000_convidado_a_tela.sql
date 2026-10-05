-- ============================================================
-- O convidado: o que faltava para a tela existir
-- 05/10/2026
-- ============================================================
-- A estrutura do convidado (20261008120000) nasceu com uma view só,
-- `vw_convidados`, servindo "as telas" no plural. Ao escrever a tela do
-- portal ficou claro que ela **não serve o aluno**, e o motivo é a
-- própria RLS funcionando como deveria:
--
--   `vw_convidados` é `security_invoker` e faz `join clientes conv on
--   conv.id = cv.convidado_cliente_id`. A policy do portal é
--   "cliente vê o próprio cadastro" — o convidado NÃO é o aluno, logo a
--   linha do convidado é invisível para ele, logo o join a elimina e a
--   view devolve **zero linhas** para o titular.
--
-- Não é algo a "consertar" na policy: o aluno não pode ler a tabela de
-- clientes de mais ninguém, e é bom que não possa. O que ele pode ver é
-- o nome e o telefone da pessoa que ELE MESMO indicou. Isso é um recorte
-- deliberado, e recorte deliberado é função `security definer` —
-- `meus_convidados()`, no mesmo desenho de `meus_planos()`.
--
-- Aproveitando, duas coisas que a tela exige e que não existiam:
--
-- * **uma conta de prazo só.** A tela precisa dizer, ANTES do clique, se
--   desistir agora devolve o benefício ou o consome. Essa conta estava
--   dentro de `cancelar_convidado`, onde a tela não alcança. Virou
--   `convite_devolve_beneficio()`, e o `cancelar_convidado` passa a
--   chamá-la em vez de recalcular — senão seriam duas versões da regra,
--   e a tela poderia prometer devolução que o banco não faz.
-- * **a vaga, na fila da gestão.** O 11.1 diz "depende de vaga", e quem
--   confirma precisa saber disso antes de clicar: hoje descobriria pelo
--   erro do gatilho de capacidade, depois de prometer ao aluno.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Desistir agora devolve o benefício?
-- ------------------------------------------------------------
-- A pergunta só faz sentido para convite em aberto; para os demais a
-- resposta é `false` por não haver o que devolver.
--
-- Pedido ainda não confirmado devolve SEMPRE: não houve reserva, não
-- houve vaga tomada, não há o que penalizar. Confirmado segue o prazo de
-- cancelamento de aula (4.5), o mesmo do crédito — não um prazo próprio,
-- de propósito: o convidado ocupa uma vaga igual à de qualquer aluno, e
-- é o aviso em cima da hora que custa a aula.
create or replace function public.convite_devolve_beneficio(p_convite uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select case
    when cv.status = 'solicitado' then true
    when cv.status <> 'confirmado' then false
    else (cv.data + t.horario) at time zone 'America/Sao_Paulo' - now()
           >= (coalesce(cfg.horas_cancelamento, 4) || ' hours')::interval
  end
  from public.convidados cv
  join public.turmas t on t.id = cv.turma_id
  cross join public.config_agendamento cfg
  where cv.id = p_convite and cfg.id;
$function$;

comment on function public.convite_devolve_beneficio(uuid) is
  'Se desistir AGORA devolve o benefício do ciclo. Uma conta só, lida pela tela antes do clique e aplicada por cancelar_convidado() — para a tela não prometer o que o banco não faz.';

revoke execute on function public.convite_devolve_beneficio(uuid) from public, anon;
grant execute on function public.convite_devolve_beneficio(uuid) to authenticated;


-- ------------------------------------------------------------
-- 2. `cancelar_convidado` passa a usar a conta única
-- ------------------------------------------------------------
-- Idêntico ao original, menos o cálculo do prazo, que sai da função
-- acima.
create or replace function public.cancelar_convidado(p_convite uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cv record;
  devolve boolean;
begin
  select * into cv from public.convidados where id = p_convite for update;
  if not found then raise exception 'convite não encontrado'; end if;

  if public.is_cliente() and not public.is_socia() then
    if cv.titular_cliente_id <> public.cliente_atual() then
      raise exception 'este convite não é seu';
    end if;
  elsif auth.uid() is not null and not public.is_operacional() then
    raise exception 'acesso restrito';
  end if;

  if cv.status not in ('solicitado', 'confirmado') then
    raise exception 'este convite já está encerrado (%)', cv.status;
  end if;

  devolve := public.convite_devolve_beneficio(p_convite);

  if cv.agendamento_id is not null then
    update public.agendamentos
    set status = 'cancelado', cancelado_em = now(),
        -- O cast é obrigatório: um `case` devolve text, e literal solto
        -- coagiria para o enum mas CASE não.
        origem_cancelamento = (case when public.is_cliente() then 'aluna' else 'socia' end)::public.origem_cancelamento
    where id = cv.agendamento_id and status = 'agendado';
  end if;

  update public.convidados
  set status = (case when devolve then 'cancelado' else 'faltou' end)::public.status_convidado,
      decidida_em = now(), decidida_por = auth.uid()
  where id = p_convite;

  return case when devolve then 'beneficio_devolvido' else 'beneficio_consumido' end;
end;
$function$;

comment on function public.cancelar_convidado(uuid) is
  'Desistência do convite. Dentro do prazo de cancelamento de aula o benefício volta (4.5); fora dele o convite vira falta e o benefício fica consumido (manual interno §11). O prazo sai de convite_devolve_beneficio().';

revoke execute on function public.cancelar_convidado(uuid) from public, anon;
grant execute on function public.cancelar_convidado(uuid) to authenticated;


-- ------------------------------------------------------------
-- 3. Os convites do titular, para o portal
-- ------------------------------------------------------------
-- O recorte: o aluno vê os convites que ELE indicou, com o nome e o
-- telefone que ELE digitou. Nada mais do cadastro do convidado — nem
-- estágio de funil, nem última aula, que são leitura interna e aparecem
-- só na fila da equipe.
--
-- Histórico inteiro, não só o aberto: num semestral são no máximo 6
-- linhas, e "quem eu já trouxe" é a pergunta que o aluno faz antes de
-- indicar de novo.
create or replace function public.meus_convidados()
returns table (
  id uuid,
  matricula_id uuid,
  plano_nome text,
  status public.status_convidado,
  data date,
  horario time,
  turma_rotulo text,
  convidado_nome text,
  convidado_telefone text,
  observacao text,
  motivo_decisao text,
  solicitada_em timestamptz,
  decidida_em timestamptz,
  pode_desistir boolean,
  devolve_beneficio boolean
)
language sql
stable security definer
set search_path to ''
as $function$
  select
    cv.id,
    cv.matricula_id,
    pr.nome,
    cv.status,
    cv.data,
    t.horario,
    public.rotulo_turma(cv.turma_id),
    conv.nome,
    conv.telefone,
    cv.observacao,
    cv.motivo_decisao,
    cv.solicitada_em,
    cv.decidida_em,
    cv.status in ('solicitado', 'confirmado')
      and (cv.data + t.horario) at time zone 'America/Sao_Paulo' > now(),
    public.convite_devolve_beneficio(cv.id)
  from public.convidados cv
  join public.turmas t on t.id = cv.turma_id
  join public.clientes conv on conv.id = cv.convidado_cliente_id
  join public.matriculas m on m.id = cv.matricula_id
  join public.produtos pr on pr.id = m.plano_id
  where cv.titular_cliente_id = public.cliente_atual()
  order by cv.solicitada_em desc;
$function$;

comment on function public.meus_convidados() is
  'Os convites do próprio aluno, para o portal. É função e não view porque vw_convidados faz join no cadastro do convidado, que a RLS do portal (com razão) esconde do titular — sob security_invoker a view devolve zero linhas para ele.';

revoke execute on function public.meus_convidados() from public, anon;
grant execute on function public.meus_convidados() to authenticated;


-- ------------------------------------------------------------
-- 4. A vaga na fila da gestão
-- ------------------------------------------------------------
-- Colunas NOVAS vão no FIM: `create or replace view` recusa inserir
-- coluna no meio ("cannot change name of view column"), e derrubar a
-- view obrigaria a recriar tudo que depende dela.
--
-- O `left join` é de propósito: `vw_vagas_turma` só tem linha para
-- turma/data com alguém ocupando vaga, então "sem linha" quer dizer aula
-- vazia — `coalesce(ocupadas, 0)` lê isso como capacidade inteira livre,
-- que é o certo. (A view enxerga 60 dias à frente; o convite nunca chega
-- lá, porque ele exige o titular já agendado e a maior janela de
-- agendamento do regulamento é de 21 dias.)
create or replace view public.vw_convidados
with (security_invoker = true) as
select
  cv.id,
  cv.matricula_id,
  cv.ciclo,
  cv.status,
  cv.data,
  cv.turma_id,
  public.rotulo_turma(cv.turma_id) as turma_rotulo,
  t.modalidade,
  t.horario,
  cv.titular_cliente_id,
  tit.nome as titular_nome,
  tit.email as titular_email,
  pr.nome as plano_nome,
  cv.convidado_cliente_id,
  conv.nome as convidado_nome,
  conv.telefone as convidado_telefone,
  conv.email as convidado_email,
  conv.ultima_aula as convidado_ultima_aula,
  conv.estagio as convidado_funil,
  cv.agendamento_id,
  cv.observacao,
  cv.motivo_decisao,
  cv.solicitada_em,
  cv.decidida_em,
  dec.nome as decisor_nome,
  -- Novas (05/10):
  t.capacidade,
  greatest(t.capacidade - coalesce(v.ocupadas, 0), 0) as vagas,
  public.convite_devolve_beneficio(cv.id) as devolve_beneficio
from public.convidados cv
join public.turmas t on t.id = cv.turma_id
join public.clientes tit on tit.id = cv.titular_cliente_id
join public.clientes conv on conv.id = cv.convidado_cliente_id
join public.matriculas m on m.id = cv.matricula_id
join public.produtos pr on pr.id = m.plano_id
left join public.socias dec on dec.id = cv.decidida_por
left join public.vw_vagas_turma v on v.turma_id = cv.turma_id and v.data = cv.data;

grant select on public.vw_convidados to authenticated;

comment on view public.vw_convidados is
  'A fila de convidados para a equipe (regulamento 11.1). Traz a vaga da aula porque "depende de vaga" é condição do benefício: sem ela, quem confirma descobriria a turma lotada pelo erro do gatilho, depois de ter prometido ao aluno.';
