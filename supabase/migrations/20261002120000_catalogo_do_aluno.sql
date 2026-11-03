-- ============================================================
-- O catálogo do aluno deixa de oferecer o que o banco vai recusar
-- 30/09/2026
-- ============================================================
-- `impedimento_para_contratar()` funciona: desde `20260922160000` ela
-- barra experimental de quem já treinou, crédito extra de quem não tem
-- plano por crédito, Studio+ de quem não usa Wellhub, produto legado e
-- limite por cliente. E `solicitar_contratacao()` a consulta antes de
-- gravar o pedido.
--
-- O problema é onde a trava aparece. O catálogo do portal
-- (`listarPlanos()`) faz um `select` direto em `produtos` com
-- `ativo and visivel_no_catalogo` — a RLS não filtra por elegibilidade,
-- porque elegibilidade depende de histórico de presença, não de dono da
-- linha. Resultado: quem já fez a experimental vê "Aula experimental"
-- na vitrine, escolhe, confirma, e leva uma mensagem de erro.
--
-- ## Por que isto piora com a contratação automática
--
-- Hoje o erro é feio mas inofensivo: `solicitar_contratacao()` recusa
-- antes de existir cobrança. Quando a ativação passar a ser automática
-- no pagamento, o mesmo caso vira incidente — o aluno paga, o webhook
-- chama `matricular_produto()`, a elegibilidade recusa, a função levanta
-- exceção, a Edge Function devolve 500, e **15 falhas pausam a fila
-- inteira da conta Asaas** (armadilha já registrada na spec de
-- homologação). Filtrar o catálogo é o primeiro anel de contenção.
--
-- ## A decisão: nem todo impedimento se esconde
--
-- Dois tipos de "não pode", com desfechos opostos para o aluno:
--
-- · **do produto** — "você já usou sua experimental", "crédito extra é
--   só para quem tem plano". Não há nada que ele faça hoje. **Esconde.**
-- · **do cadastro dele** — falta CPF, falta e-mail. Ele resolve em dois
--   minutos no Perfil, e esconder o catálogo inteiro faria a tela
--   parecer quebrada. **Mostra, com o caminho do conserto.**
--
-- `excepcionavel` não serve para esse corte: ela diz se a GESTÃO pode
-- passar por cima, e vale `true` tanto para CPF quanto para plano
-- legado. Daí a coluna nova.
--
-- ## Por que uma coluna em vez de outra função
--
-- A alternativa era o catálogo reimplementar a classificação. Seria
-- duplicar a regra em dois lugares — e o defeito que esta migration
-- corrige é exatamente uma divergência entre duas contas da mesma
-- coisa. Uma função, um veredito.
-- ============================================================


-- ------------------------------------------------------------
-- 1. `impedimento_para_contratar` passa a dizer QUAL impedimento
-- ------------------------------------------------------------
-- `drop` e não `create or replace`: mudar a lista de colunas de uma
-- função `returns table` é mudança de tipo de retorno, que o replace
-- recusa. Os chamadores usam `select * into <record>`, então a coluna
-- nova não quebra nenhum deles.
drop function if exists public.impedimento_para_contratar(uuid, uuid);

create function public.impedimento_para_contratar(p_cliente uuid, p_produto uuid)
returns table(motivo text, excepcionavel boolean, codigo text)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  pr record;
  eleg record;
  email_cliente text;
  cl record;
  ja_tem integer;
begin
  select * into pr from public.produtos where id = p_produto and ativo;
  if not found then
    return query select 'produto inexistente ou inativo'::text, false, 'inexistente'::text;
    return;
  end if;

  -- E-mail antes de tudo: sem ele o aluno não recebe confirmação de
  -- contratação, aviso de aula cancelada nem cobrança (4.18, 7.1), e
  -- não há justificativa que resolva — é dado que falta, não regra.
  if pr.tipo_produto = 'plano' then
    select nullif(btrim(coalesce(email, '')), '') into email_cliente
    from public.clientes where id = p_cliente;
    if email_cliente is null then
      return query select
        'este aluno está sem e-mail. Plano manda confirmação de contratação, aviso de aula cancelada e cobrança por e-mail — cadastre antes de matricular'::text,
        false, 'sem_email'::text;
      return;
    end if;

    select c.cpf, c.estrangeiro into cl from public.clientes c where c.id = p_cliente;
    if coalesce((select exigir_cpf from public.config_cadastro where id), true)
       and not cl.estrangeiro
       and not public.cpf_valido(cl.cpf) then
      return query select
        'este aluno está sem CPF válido no cadastro. O gateway de pagamento não emite cobrança sem ele — complete o cadastro antes de contratar'::text,
        true, 'sem_cpf'::text;
      return;
    end if;
  end if;

  if pr.limite_por_cliente is not null then
    select count(*) into ja_tem from public.matriculas
    where cliente_id = p_cliente and plano_id = p_produto
      and status <> 'cancelada';
    if ja_tem >= pr.limite_por_cliente then
      return query select
        format('limite de %s contratação(ões) deste produto por cliente já atingido',
               pr.limite_por_cliente)::text,
        false, 'limite'::text;
      return;
    end if;
  end if;

  if pr.status = 'legado' then
    return query select format(
      '“%s” é um plano antigo, fora de venda — quem já tem continua nele até o fim do contrato, mas ele não se contrata mais',
      pr.nome)::text, true, 'legado'::text;
    return;
  end if;

  select * into eleg from public.elegivel_para_produto(p_cliente, p_produto);
  if not eleg.ok then
    return query select eleg.motivo::text, true, 'elegibilidade'::text;
    return;
  end if;

  return;  -- nenhuma linha = pode contratar
end;
$function$;

comment on function public.impedimento_para_contratar(uuid, uuid) is
  'Por que este cliente não pode contratar este produto. Zero linhas = pode. `codigo` separa impedimento do PRODUTO (limite, legado, elegibilidade — o aluno não resolve) de pendência do CADASTRO dele (sem_email, sem_cpf — resolve no Perfil).';

revoke execute on function public.impedimento_para_contratar(uuid, uuid) from public, anon;
grant execute on function public.impedimento_para_contratar(uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- 2. O catálogo, já com o veredito de cada produto
-- ------------------------------------------------------------
-- Uma chamada em vez de uma por produto: com 20 produtos no catálogo,
-- 20 round-trips no 4G do aluno é meio segundo de tela vazia.
--
-- Devolve só `produto_id` + veredito, e não as colunas do produto, de
-- propósito: o portal já busca `produtos` (e é a RLS que decide o que
-- ele vê ali). Repetir a lista de colunas aqui obrigaria mexer nesta
-- função a cada coluna nova.
create or replace function public.catalogo_do_aluno()
returns table(produto_id uuid, motivo text, codigo text)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  cl uuid;
begin
  cl := public.cliente_atual();
  if cl is null then
    raise exception 'requer sessão de aluno';
  end if;

  -- `left join lateral ... on true`: a função devolve ZERO linhas quando
  -- o produto está liberado, e um `cross join` faria justamente os
  -- produtos contratáveis desaparecerem do resultado.
  return query
    select p.id, i.motivo, i.codigo
    from public.produtos p
    left join lateral public.impedimento_para_contratar(cl, p.id) i on true
    where p.ativo
      and p.visivel_no_catalogo
      and p.status <> 'interno';
end;
$function$;

comment on function public.catalogo_do_aluno() is
  'Um veredito por produto do catálogo, para o portal esconder o que o aluno não pode contratar em vez de oferecer e recusar depois. Mesma função de impedimento que trava a contratação — uma regra, um resultado.';

revoke execute on function public.catalogo_do_aluno() from public, anon;
grant execute on function public.catalogo_do_aluno() to authenticated;
