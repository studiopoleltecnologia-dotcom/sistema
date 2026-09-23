-- ============================================================
-- Pagar atrasado tem que desbloquear
-- ============================================================
-- A trava de inadimplência já existia e funciona: `processar_assinaturas`
-- só renova quem pagou, e quem não pagou vai para `inadimplente`, estado
-- em que `agendar_aula()` recusa. Os créditos do ciclo novo nunca são
-- liberados antes do pagamento.
--
-- O que faltava era a saída. `processar_assinaturas` percorre apenas
-- matrículas com status **'ativa'** — de propósito, para não renovar
-- inadimplente de graça. Consequência não intencional: quem paga com
-- atraso tem o dinheiro registrado e **continua bloqueado para sempre**,
-- porque ninguém mais passa por aquela matrícula.
--
-- É o pior desfecho possível: o aluno pagou e não consegue agendar.
--
-- ## Gatilho, e não uma linha dentro do webhook
--
-- O mesmo raciocínio da auditoria (20260925120000): pagar atrasado
-- acontece por mais de uma porta — o webhook do gateway, a baixa manual
-- da gestão no Financeiro, um acerto feito direto no banco. Resolver só
-- dentro do webhook consertaria uma delas e deixaria as outras com o
-- mesmo defeito, sem ninguém perceber.
--
-- No gatilho, é a entrada financeira virar "recebida" que desbloqueia,
-- qualquer que tenha sido o caminho.

create or replace function public.regularizar_ao_receber()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  m record;
begin
  if new.matricula_id is null or new.ciclo is null then
    return new;
  end if;

  select * into m from public.matriculas where id = new.matricula_id;
  if not found or m.status <> 'inadimplente' then
    return new;
  end if;

  -- Só o ciclo que está faltando destrava. Pagamento de outro ciclo
  -- (acerto retroativo, estorno revertido) não deve fazer a matrícula
  -- pular adiante.
  if new.ciclo <> m.ciclo_atual + 1 then
    return new;
  end if;

  -- `renovar_ciclo()` avança o ciclo, libera os créditos e devolve a
  -- matrícula para 'ativa'. É exatamente o que `processar_assinaturas`
  -- teria feito se o pagamento tivesse entrado no prazo.
  begin
    perform public.renovar_ciclo(new.matricula_id);
  exception when others then
    -- Não derruba o recebimento: o dinheiro entrou de qualquer forma, e
    -- travar a baixa por causa da renovação seria trocar um problema por
    -- outro pior. A matrícula fica para a gestão resolver na tela.
    raise warning 'pagamento recebido mas renovação falhou para %: %',
      new.matricula_id, sqlerrm;
  end;

  return new;
end;
$function$;

drop trigger if exists entradas_regulariza_matricula on public.entradas_financeiras;
create trigger entradas_regulariza_matricula
  after update on public.entradas_financeiras
  for each row
  when (new.status = 'recebida' and old.status is distinct from 'recebida')
  execute function public.regularizar_ao_receber();

comment on function public.regularizar_ao_receber() is
  'Pagamento atrasado de um ciclo devolve a matrícula para ativa. Gatilho e não código no webhook porque a baixa também acontece pela tela do Financeiro.';

-- ------------------------------------------------------------
-- Multa e juros de atraso — existem, mas nascem DESLIGADOS
-- ------------------------------------------------------------
-- O Asaas aceita `fine` (multa, % sobre o valor) e `interest` (juros ao
-- mês) em cada cobrança, e aplica sozinho quando o aluno paga depois do
-- vencimento. Nós não mandávamos nenhum dos dois, então atraso não
-- custava nada — a única consequência era o bloqueio.
--
-- Nascem em **zero** de propósito. Cobrar multa é decisão de negócio e
-- precisa estar no regulamento que o aluno aceitou; ligar por conta
-- própria seria cobrar do aluno uma coisa que ninguém combinou com ele.
--
-- Os tetos do Código de Defesa do Consumidor para mensalidade são multa
-- de 2% e juros de 1% ao mês. O `check` impede passar disso por engano
-- de digitação — não é conselho jurídico, é grade de proteção.
alter table public.config_financeiro
  add column if not exists multa_atraso_pct numeric(5,2) not null default 0,
  add column if not exists juros_mes_atraso_pct numeric(5,2) not null default 0;

do $$
begin
  alter table public.config_financeiro
    add constraint multa_e_juros_dentro_do_limite check (
      multa_atraso_pct between 0 and 2 and juros_mes_atraso_pct between 0 and 1
    );
exception when duplicate_object then null;
end $$;

comment on column public.config_financeiro.multa_atraso_pct is
  'Multa por atraso, em % do valor. 0 = desligada. Teto 2% (CDC para mensalidade). Só vale para cobrança emitida pelo gateway.';
comment on column public.config_financeiro.juros_mes_atraso_pct is
  'Juros ao mês por atraso, em %. 0 = desligado. Teto 1% (CDC).';
