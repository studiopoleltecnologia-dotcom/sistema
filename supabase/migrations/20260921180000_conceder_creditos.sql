-- ============================================================
-- Bonificar uma aluna com créditos (A11 do backlog, §6.1)
--
-- Pedido da gestão em 21/09: "às vezes acontece de bonificarmos uma
-- aluna com x créditos ou com uma aula bônus".
--
-- O MODELO JÁ SUPORTA ISSO e não muda aqui. `creditos_lotes` tem
-- `origem` (que já inclui `ajuste` e `reposicao`), `validade` e
-- `detalhe`; `creditos_eventos` é o livro-razão que a aluna vê no
-- extrato; e `saldo_disponivel()` soma por lote válido. Um bônus já
-- nasce visível no saldo e no extrato, sem nenhuma coluna nova.
--
-- O que faltava era o CAMINHO: não existe hoje nenhuma RPC que crie
-- lote — todos os `insert into creditos_lotes` estão dentro de
-- `renovar_ciclo()`, `matricular()` e afins. Ou seja: só o sistema
-- dava crédito, nunca uma pessoa. Quem quisesse bonificar teria que
-- escrever nas duas tabelas na mão, na ordem certa, sem transação —
-- e um lote sem evento fica com saldo zero, invisível, sem erro.
--
-- Por que RPC e não deixar o front inserir nas duas tabelas:
--   1. lote + evento têm que nascer juntos ou não nascer;
--   2. o motivo tem que ser obrigatório, e isso é regra, não tela;
--   3. `criado_por` registra quem deu — bônus sem autor vira
--      discussão três meses depois.
--
-- ⚠️ Esta função NÃO é a última linha de defesa. A policy da tabela
-- (`"socias gerenciam lotes"`, de 20260821120000) continua aceitando
-- qualquer conta interna escrevendo direto por PostgREST — é a
-- pendência S3b do backlog, não uma brecha aberta aqui. A guarda
-- abaixo existe para que o caminho NOVO já nasça no recorte certo.
-- ============================================================

create or replace function public.conceder_creditos(
  p_matricula uuid,
  p_quantidade integer,
  p_motivo text,
  p_validade date default null,
  p_origem public.motivo_credito default 'ajuste'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  m record;
  validade date;
  lote uuid;
begin
  -- Mesmo recorte das outras ações desta tela (renovar, cancelar,
  -- marcar inadimplente): dar aula de graça é decisão comercial, não
  -- operação de balcão. Se um dia a secretária precisar lançar
  -- reposição sozinha, é trocar por `is_operacional()` aqui — mas é
  -- decisão de produto, não de código.
  if not public.is_gestao() then
    raise exception 'Apenas a gestão pode conceder créditos.'
      using errcode = '42501';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade de créditos precisa ser maior que zero.'
      using errcode = '22023';
  end if;

  -- Obrigatório de propósito. O extrato da aluna mostra este texto, e
  -- "+2 créditos" sem explicação é exatamente o lançamento que ninguém
  -- consegue justificar depois.
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escreva o motivo do bônus — ele aparece no extrato da aluna.'
      using errcode = '22023';
  end if;

  -- `compra` sairia no extrato como se a aluna tivesse pago, e
  -- `agendamento`/`cancelamento`/`expiracao` são movimentos que o
  -- sistema escreve sozinho. Sobram os dois que descrevem um gesto
  -- humano: cortesia (`ajuste`) e reposição (`reposicao`).
  if p_origem not in ('ajuste', 'reposicao') then
    raise exception 'Origem inválida para bônus: use ajuste (cortesia) ou reposicao.'
      using errcode = '22023';
  end if;

  select * into m from public.matriculas where id = p_matricula;
  if not found then
    raise exception 'Matrícula não encontrada.' using errcode = 'P0002';
  end if;

  -- Inadimplente PODE receber — o bônus costuma ser justamente o gesto
  -- de reaproximação. Ela só não vai conseguir agendar enquanto não
  -- regularizar, que é `agendar_aula()` fazendo o trabalho dela.
  if m.status = 'cancelada' then
    raise exception 'A assinatura está cancelada — não dá para creditar nela.'
      using errcode = '22023';
  end if;

  -- Sem validade informada, o bônus vale até o fim do ciclo corrente,
  -- que é a mesma regra do crédito comprado. Crédito sem prazo não
  -- existe no modelo: `saldo_disponivel()` filtra por `validade`.
  validade := coalesce(p_validade, m.data_fim);

  -- Ciclo já vencido é caso REAL, não erro de digitação: bonificar
  -- quem sumiu é justamente o gesto de reaproximação. Mas aí o padrão
  -- nasceria morto — um lote que vence antes de existir, invisível no
  -- saldo e sem nenhum erro. Em vez de inventar um prazo aqui (30
  -- dias? até a renovação?), que seria política de negócio escondida
  -- no banco, a função devolve a decisão para quem está concedendo.
  if p_validade is null and m.data_fim < current_date then
    raise exception 'O ciclo desta matrícula terminou em % — informe até quando o bônus vale.',
      to_char(m.data_fim, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  if validade < current_date then
    raise exception 'A validade não pode estar no passado (%).',
      to_char(validade, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  insert into public.creditos_lotes
    (matricula_id, ciclo, quantidade, validade, origem, detalhe)
  values
    (p_matricula, m.ciclo_atual, p_quantidade, validade, p_origem, btrim(p_motivo))
  returning id into lote;

  insert into public.creditos_eventos
    (matricula_id, lote_id, delta, motivo, detalhe, criado_por)
  values
    (p_matricula, lote, p_quantidade, p_origem, btrim(p_motivo), auth.uid());

  return lote;
end;
$fn$;

comment on function public.conceder_creditos(uuid, integer, text, date, public.motivo_credito) is
  'Bonifica uma matricula com creditos (cortesia ou reposicao). Cria lote + evento na mesma transacao, exige motivo e registra o autor. NAO respeita teto de acumulo de proposito: o bonus e um gesto deliberado da gestao, nao a renovacao automatica.';

-- Toda função nova nasce com EXECUTE para PUBLIC (padrão do Postgres) —
-- foi isso que gerou os achados do Advisor em 21/09 (S10 do backlog).
-- Aqui o grant é explícito: tira de PUBLIC e devolve só para quem tem
-- sessão. Quem pode de fato, a função decide sozinha, com `is_gestao()`.
revoke execute on function
  public.conceder_creditos(uuid, integer, text, date, public.motivo_credito)
  from public;
grant execute on function
  public.conceder_creditos(uuid, integer, text, date, public.motivo_credito)
  to authenticated;
