-- ============================================================
-- Contato de emergência da professora + grau de parentesco
--
-- O estúdio é de atividade física de risco (pole, salto, tecido). O aluno
-- já tem contato de emergência obrigatório desde
-- 20260723130000_contato_emergencia_obrigatorio.sql — a professora, que
-- passa mais horas na sala que qualquer aluno, não tinha nem a coluna.
--
-- Entra junto o grau de parentesco nos dois cadastros: "João, (21)9…" sem
-- saber quem é João faz alguém hesitar antes de ligar, e é justamente o
-- momento em que hesitar custa caro.
-- ============================================================

alter table public.professoras
  add column if not exists contato_emergencia_nome text,
  add column if not exists contato_emergencia_telefone text,
  add column if not exists contato_emergencia_parentesco text;

alter table public.clientes
  add column if not exists contato_emergencia_parentesco text;

comment on column public.professoras.contato_emergencia_nome is
  'obrigatório em cadastros novos (trigger validar_contato_emergencia_professora)';
comment on column public.clientes.contato_emergencia_parentesco is
  'quem é a pessoa (mãe, cônjuge, amiga) — opcional, mas é o que faz alguém ligar sem hesitar';

-- ------------------------------------------------------------
-- Obrigatoriedade — por trigger, não por NOT NULL nem check
--
-- Por que não `not null`: existem professoras cadastradas antes desta
-- migration, e não há como inventar o contato delas. A coluna passaria a
-- barrar toda escrita naquelas linhas.
--
-- Por que não `check ... not valid`: um check NOT VALID continua sendo
-- avaliado em UPDATE. Desativar uma professora antiga (`ativa = false`) ou
-- salvar a remuneração dela passaria a falhar com erro de constraint —
-- quebrando operação que funciona hoje para cobrar um dado histórico.
--
-- O que a trigger faz, então:
--   INSERT — exige nome e telefone. Cadastro novo nunca nasce sem.
--   UPDATE — não deixa APAGAR um contato que já existe, e não impede nada
--            além disso. Linha antiga sem contato continua editável (a
--            tela mostra a pendência e oferece o formulário para
--            preencher), em vez de travar a operação inteira.
-- ------------------------------------------------------------

create or replace function public.validar_contato_emergencia_professora()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  nome_vazio boolean := new.contato_emergencia_nome is null
                        or length(trim(new.contato_emergencia_nome)) = 0;
  tel_vazio boolean := new.contato_emergencia_telefone is null
                       or length(trim(new.contato_emergencia_telefone)) = 0;
begin
  if tg_op = 'INSERT' then
    if nome_vazio or tel_vazio then
      raise exception 'contato de emergência (nome e telefone) é obrigatório para cadastrar professora';
    end if;
    return new;
  end if;

  -- UPDATE: só protege o que já foi preenchido.
  if old.contato_emergencia_nome is not null
     and length(trim(old.contato_emergencia_nome)) > 0
     and nome_vazio then
    raise exception 'contato de emergência não pode ser apagado';
  end if;
  if old.contato_emergencia_telefone is not null
     and length(trim(old.contato_emergencia_telefone)) > 0
     and tel_vazio then
    raise exception 'contato de emergência não pode ser apagado';
  end if;

  return new;
end;
$$;

drop trigger if exists professoras_valida_contato_emergencia on public.professoras;
create trigger professoras_valida_contato_emergencia
  before insert or update on public.professoras
  for each row execute function public.validar_contato_emergencia_professora();

-- ------------------------------------------------------------
-- A mesma proteção contra apagamento no cadastro do aluno.
--
-- Lá o INSERT já é coberto: `criar_conta_aluna()` valida (autocadastro
-- pelo portal) e o formulário da equipe exige. O que faltava era impedir
-- que uma edição posterior esvaziasse o campo — o único caminho pelo qual
-- um aluno voltaria a ficar sem contato depois de ter um.
-- ------------------------------------------------------------

create or replace function public.validar_contato_emergencia_cliente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.contato_emergencia_nome is not null
     and length(trim(old.contato_emergencia_nome)) > 0
     and (new.contato_emergencia_nome is null
          or length(trim(new.contato_emergencia_nome)) = 0) then
    raise exception 'contato de emergência não pode ser apagado';
  end if;
  if old.contato_emergencia_telefone is not null
     and length(trim(old.contato_emergencia_telefone)) > 0
     and (new.contato_emergencia_telefone is null
          or length(trim(new.contato_emergencia_telefone)) = 0) then
    raise exception 'contato de emergência não pode ser apagado';
  end if;
  return new;
end;
$$;

drop trigger if exists clientes_valida_contato_emergencia on public.clientes;
create trigger clientes_valida_contato_emergencia
  before update on public.clientes
  for each row execute function public.validar_contato_emergencia_cliente();

-- ------------------------------------------------------------
-- vw_professoras_nomes segue sem nenhuma coluna nova.
--
-- É a view que a Agenda usa para a secretária ver nome de professora sem
-- ver remuneração. Contato de emergência é dado pessoal e não tem por que
-- circular pela grade — quem precisa dele abre o cadastro, que é
-- gestão-only.
-- ------------------------------------------------------------
