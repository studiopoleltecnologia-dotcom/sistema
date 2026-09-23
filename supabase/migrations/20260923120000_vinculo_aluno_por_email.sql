-- ============================================================
-- O vínculo entre o aluno e a conta dele é o E-MAIL — e é único
-- ============================================================
-- `criar_conta_aluna()` já procurava um cadastro existente antes de
-- criar outro. O problema é que procurava pelo que o aluno DIGITOU no
-- formulário, e nesta ordem: primeiro o telefone, depois o e-mail.
--
-- Os dois são texto livre, e o telefone vinha primeiro. Daí as duas
-- formas de nascer duplicado que a gestão encontrou:
--
--  1. a gestão cadastra "(21) 98041-9612"; o aluno digita
--     "21980419612". Mesma pessoa, comparação de string, dois
--     cadastros — e o que a gestão preencheu fica órfão, com o
--     plano, o histórico e o contato de emergência dentro dele;
--  2. o aluno erra uma letra no e-mail do formulário e nasce um
--     segundo cadastro, mesmo já existindo um com o e-mail certo.
--
-- Além disso a busca só casava quando havia EXATAMENTE um candidato
-- (`count(*) = 1`): dois cadastros com o mesmo e-mail faziam a função
-- desistir e criar um terceiro. Duplicata gerava duplicata.
--
-- A partir daqui:
--
--  · o vínculo é o e-mail AUTENTICADO — o que o Supabase Auth
--    confirmou, não o que o formulário mandou. É o mesmo mecanismo
--    que já liga a professora à conta dela em `handle_new_user()`;
--  · `clientes.email` é único, então a duplicidade deixa de ser
--    possível por qualquer caminho — portal, cadastro pela gestão
--    ou import.
--
-- É isso que fecha o fluxo "a gestão cadastra e o aluno só confirma":
-- a equipe deixa o cadastro pronto com o e-mail dele, e quando ele
-- cria o acesso com esse mesmo e-mail, cai no cadastro que já existe.

-- ------------------------------------------------------------
-- 1. E-mail único
-- ------------------------------------------------------------
-- Parcial: cadastro de balcão sem e-mail continua permitido (aluno
-- avulso, lead do funil). O que não pode é DOIS com o mesmo e-mail.
-- Normaliza no índice (`lower`/`btrim`) porque " Maria@X.com " e
-- "maria@x.com" são a mesma caixa de entrada.
create unique index if not exists clientes_email_unico
  on public.clientes (lower(btrim(email)))
  where email is not null and btrim(email) <> '';

comment on index public.clientes_email_unico is
  'O e-mail identifica o aluno: é por ele que a conta do portal acha o cadastro que a gestão deixou pronto. Dois cadastros com o mesmo e-mail quebrariam esse vínculo.';

-- ------------------------------------------------------------
-- 1b. E o e-mail é gravado já normalizado
-- ------------------------------------------------------------
-- O índice acima compara `lower(btrim(...))`, mas gravava o que veio.
-- Isso deixava " Maria@Exemplo.com " no banco: o vínculo funcionava,
-- e qualquer comparação ingênua (`email = $1`) em outro ponto do
-- sistema falhava em silêncio. Normaliza na entrada, e aí o dado
-- guardado é o mesmo que o índice enxerga.
--
-- `nullif(..., '')` para que e-mail em branco vire null de verdade —
-- senão a string vazia escapa do índice parcial e volta a permitir
-- vários cadastros "sem" e-mail que na prática colidem.
create or replace function public.normalizar_email_cliente()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.email := nullif(lower(btrim(new.email)), '');
  return new;
end;
$function$;

-- `00` no nome de propósito: os gatilhos disparam em ordem alfabética
-- e este precisa vir antes de `clientes_valida_edicao_aluna`, senão o
-- aluno que reenvia o próprio e-mail com outra caixa seria barrado
-- por "trocar" um e-mail que é o mesmo.
drop trigger if exists clientes_00_normaliza_email on public.clientes;
create trigger clientes_00_normaliza_email
  before insert or update on public.clientes
  for each row execute function public.normalizar_email_cliente();

-- Alinha o que já está gravado com a regra nova.
update public.clientes
set email = nullif(lower(btrim(email)), '')
where email is distinct from nullif(lower(btrim(email)), '');

-- ------------------------------------------------------------
-- 2. O cadastro que está esperando o aluno
-- ------------------------------------------------------------
-- Serve à tela de primeiro acesso: se a gestão já cadastrou a pessoa,
-- o formulário vem preenchido e ela só confere, em vez de redigitar
-- (e divergir) o que o estúdio já sabe.
--
-- Definer, mas não vaza: a única linha que devolve é a do e-mail da
-- PRÓPRIA sessão. Não existe parâmetro — não dá para perguntar pelo
-- cadastro de outra pessoa.
create or replace function public.meu_cadastro_previo()
returns table (
  nome text,
  telefone text,
  data_nascimento date,
  contato_emergencia_nome text,
  contato_emergencia_telefone text
)
language sql
security definer
stable
set search_path to ''
as $function$
  select c.nome, c.telefone, c.data_nascimento,
         c.contato_emergencia_nome, c.contato_emergencia_telefone
  from public.clientes c
  join auth.users u on u.id = auth.uid()
  where lower(btrim(c.email)) = lower(btrim(u.email))
  limit 1;
$function$;

revoke execute on function public.meu_cadastro_previo() from public, anon;
grant execute on function public.meu_cadastro_previo() to authenticated;

-- ------------------------------------------------------------
-- 3. criar_conta_aluna() — casa pelo e-mail da sessão
-- ------------------------------------------------------------
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
  email_conta text;
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

  -- O e-mail da SESSÃO, não o do formulário. É o único que passou pela
  -- confirmação do Auth, e é o que a gestão usa para deixar o cadastro
  -- esperando. `p_email` continua na assinatura só para não quebrar
  -- quem já chama a função — daqui para a frente ele é ignorado.
  select lower(btrim(u.email)) into email_conta
  from auth.users u where u.id = auth.uid();

  if email_conta is null or email_conta = '' then
    raise exception 'sua conta de acesso está sem e-mail confirmado';
  end if;

  select c.id into c_id
  from public.clientes c
  where lower(btrim(c.email)) = email_conta;

  if c_id is null then
    insert into public.clientes
      (nome, telefone, email, data_nascimento, origem,
       contato_emergencia_nome, contato_emergencia_telefone)
    values
      (p_nome, p_telefone, email_conta, p_data_nascimento, 'portal_aluna',
       p_contato_emergencia_nome, p_contato_emergencia_telefone)
    returning id into c_id;
  else
    -- Cadastro que a gestão deixou pronto. A tela mostrou esses dados
    -- para ele conferir, então o que volta do formulário é o valor
    -- confirmado e substitui — menos quando vem vazio, que aí é
    -- campo não preenchido, não correção.
    update public.clientes c
    set nome = coalesce(nullif(btrim(p_nome), ''), c.nome),
        telefone = coalesce(nullif(btrim(p_telefone), ''), c.telefone),
        data_nascimento = coalesce(p_data_nascimento, c.data_nascimento),
        contato_emergencia_nome =
          coalesce(nullif(btrim(p_contato_emergencia_nome), ''), c.contato_emergencia_nome),
        contato_emergencia_telefone =
          coalesce(nullif(btrim(p_contato_emergencia_telefone), ''), c.contato_emergencia_telefone)
    where c.id = c_id;
  end if;

  insert into public.contas_aluna (auth_user_id, cliente_id, aceite_lgpd_em, versao_termo)
  values (auth.uid(), c_id, now(), p_versao_termo);

  return c_id;
end;
$function$;

revoke execute on function
  public.criar_conta_aluna(text, text, text, date, boolean, text, text, text)
  from public, anon;

-- ------------------------------------------------------------
-- 4. O aluno não troca o próprio e-mail por aqui
-- ------------------------------------------------------------
-- O e-mail virou a chave do vínculo e o endereço de toda comunicação
-- transacional (4.18, 7.1). Deixar o aluno reescrevê-lo em "meus
-- dados" faria o cadastro divergir da conta de acesso em silêncio —
-- e a equipe só descobriria quando um aviso de aula cancelada não
-- chegasse. Troca de e-mail passa pelo estúdio.
create or replace function public.validar_edicao_cliente()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if public.is_cliente() and not public.is_socia() then
    if new.estagio is distinct from old.estagio
      or new.origem is distinct from old.origem
      or new.responsavel_id is distinct from old.responsavel_id
      or new.vip is distinct from old.vip
      or new.gympass_id is distinct from old.gympass_id
      or new.primeiro_contato is distinct from old.primeiro_contato
      or new.ultima_aula is distinct from old.ultima_aula
      or new.ultima_conversa is distinct from old.ultima_conversa
    then
      raise exception 'campo não editável pela própria aluna';
    end if;
    if new.email is distinct from old.email then
      raise exception
        'o e-mail é o que liga esta conta ao seu cadastro — peça a troca ao estúdio';
    end if;
  end if;
  return new;
end;
$function$;
