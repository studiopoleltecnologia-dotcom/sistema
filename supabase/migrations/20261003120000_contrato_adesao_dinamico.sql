-- ============================================================
-- Contrato de Adesão dinâmico
-- 30/09/2026
-- ============================================================
-- Fonte: `Contrato_Adesao_Dinamico_Studio_Pole_L.docx` (documento mestre) e
-- `REGULAMENTO VERSÃO 3 - OFICIAL 30.09.docx`, entregues pela gestão.
--
-- O contrato **não é um texto único igual para todos**. O documento mestre
-- traz cláusulas marcadas `[EXIBIR SE: ...]`, e o sistema monta o contrato
-- individual com **apenas** as que se aplicam ao produto contratado. Quem
-- compra Plano por Créditos não pode receber cláusula de Turma Fixa, e o
-- Studio+ não aparece no contrato de aluno comum.
--
-- ## O modelo: template → versão → documento gerado → aceite imutável
--
--   contrato_versoes    uma versão do contrato-mestre (v1, v2…)
--   contrato_clausulas  as cláusulas dessa versão, cada uma com a CONDIÇÃO
--                       de exibição (`condicao text[]`)
--   contratos           o documento individual, com o HTML **congelado**,
--                       o quadro-resumo em jsonb, o hash, e o aceite
--
-- Alterar o contrato amanhã não muda o que alguém aceitou hoje: o HTML
-- aceito está gravado na linha, com `hash_corpo`. A versão nova é outra
-- linha de `contrato_versoes`, e os contratos antigos continuam apontando
-- para a versão deles.
--
-- ## Por que `condicao` é um array de etiquetas, e não um `case` no código
--
-- Uma cláusula entra quando **todas** as suas etiquetas estão no conjunto
-- derivado do produto. `{}` = sempre (o BASE do documento mestre);
-- `{PLANO_POR_CREDITOS, SEMESTRAL}` = o módulo 9.2. Assim:
--
-- · a gestão inclui ou reescreve cláusula sem migration;
-- · produto novo com regra própria ganha etiqueta nova, não `if`;
-- · e a regra de montagem fica **num lugar só** — `contrato_tags()`.
--
-- ## Nenhum valor no texto
--
-- Item 11 do pedido: nada de preço, número de créditos ou horário escrito
-- na cláusula. O texto tem `{{VALOR_CICLO}}`, `{{QTD_CREDITOS}}`,
-- `{{TURMA_1}}`, e o valor vem da **contratação real** — de
-- `solicitacoes_contratacao.preco_centavos`, que já é o retrato congelado
-- do preço no momento do pedido. Reajustar um plano não reescreve contrato.
--
-- ## A numeração é gerada, não escrita
--
-- As cláusulas não carregam número. Se carregassem, um contrato de créditos
-- sairia "1, 2, … 9, 9.1, 11, 11.1, 12, 16" — com buracos onde estavam os
-- módulos de Turma Fixa e Studio+. O documento mestre não tem referência
-- cruzada por número (ele diz "o módulo específico da contratação"), então
-- numerar na renderização é seguro e o contrato sai limpo.
--
-- ## O que NÃO entra aqui
--
-- O regulamento tem blocos `INTERNO` (custo por aula, argumentos de venda,
-- tabela de devolução do desconto). Eles não existem neste modelo: o
-- contrato é montado a partir de `contrato_clausulas`, e nenhuma cláusula
-- interna foi semeada. Não é um filtro que alguém pode esquecer de aplicar
-- — é ausência de dado.
--
-- ⚠️ **Não liga sozinho.** `config_cadastro.exigir_contrato` nasce `false`,
-- e `aceitar_contrato()` recusa enquanto `config_estudio` não tiver CNPJ,
-- razão social e endereço: contrato sem a parte identificada não vale nada.
-- Preencher é passo de runbook.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Identificação do estúdio
-- ------------------------------------------------------------
-- O contrato precisa nomear as duas partes. Esses dados não existiam em
-- lugar nenhum do banco — `config_financeiro` tem limite do MEI e metas,
-- não a qualificação da empresa.
create table if not exists public.config_estudio (
  id boolean primary key default true check (id),
  razao_social text,
  cnpj text,
  endereco text,
  /** WhatsApp oficial citado no regulamento (7.1, 13.3) e no contrato. */
  whatsapp text,
  atualizada_em timestamptz not null default now()
);

comment on table public.config_estudio is
  'Qualificação do estúdio para documentos legais. Nasce vazia: aceitar_contrato() recusa até estar completa, porque contrato sem a parte identificada não vale.';

insert into public.config_estudio (id) values (true) on conflict (id) do nothing;

alter table public.config_estudio enable row level security;

drop policy if exists "equipe le config estudio" on public.config_estudio;
create policy "equipe le config estudio" on public.config_estudio
  for select to authenticated using (public.is_socia());

drop policy if exists "gestao edita config estudio" on public.config_estudio;
create policy "gestao edita config estudio" on public.config_estudio
  for update to authenticated
  using (public.is_gestao()) with check (public.is_gestao());


-- ------------------------------------------------------------
-- 2. Versões do contrato-mestre
-- ------------------------------------------------------------
create table if not exists public.contrato_versoes (
  id uuid primary key default gen_random_uuid(),

  /** Rótulo que aparece no contrato e no histórico: 'v1', 'v1.1'. */
  versao text not null unique,
  vigente_desde date not null,
  vigente boolean not null default false,

  /** Por que esta versão existe — para a gestão saber o que mudou. */
  notas text,

  criada_em timestamptz not null default now(),
  criada_por uuid references public.socias(id)
);

comment on table public.contrato_versoes is
  'Versões do Contrato de Adesão mestre. Contrato já aceito aponta para a versão dele e nunca muda quando uma nova é publicada.';

-- Uma vigente por vez: duas significaria que ninguém sabe qual texto vale.
create unique index if not exists contrato_versao_vigente_unica
  on public.contrato_versoes (vigente) where vigente;

alter table public.contrato_versoes enable row level security;

drop policy if exists "gestao gerencia versoes de contrato" on public.contrato_versoes;
create policy "gestao gerencia versoes de contrato" on public.contrato_versoes
  for all to authenticated
  using (public.is_gestao()) with check (public.is_gestao());

drop policy if exists "todos leem versao vigente" on public.contrato_versoes;
create policy "todos leem versao vigente" on public.contrato_versoes
  for select to authenticated using (vigente or public.is_socia());


-- ------------------------------------------------------------
-- 3. As cláusulas, com a condição de exibição
-- ------------------------------------------------------------
create table if not exists public.contrato_clausulas (
  id uuid primary key default gen_random_uuid(),
  versao_id uuid not null references public.contrato_versoes(id) on delete cascade,

  ordem integer not null,
  /** Sem número: a numeração é gerada na montagem (ver cabeçalho). */
  titulo text not null,
  /** HTML simples (p, ul, li, strong) com os marcadores {{...}}. */
  corpo_html text not null,

  /**
   * Etiquetas que precisam TODAS estar presentes para a cláusula entrar.
   * `{}` = cláusula geral. Ver `contrato_tags()` para o vocabulário.
   */
  condicao text[] not null default '{}',

  /** Nível 1 = seção numerada; 2 = subseção (9.1, 10.2 do mestre). */
  nivel smallint not null default 1 check (nivel in (1, 2)),

  criada_em timestamptz not null default now(),

  unique (versao_id, ordem)
);

comment on table public.contrato_clausulas is
  'Cláusulas de uma versão do contrato. `condicao` é a lógica [EXIBIR SE:] do documento mestre: a cláusula entra quando todas as etiquetas dela estão no conjunto do produto contratado.';

comment on column public.contrato_clausulas.condicao is
  'Etiquetas exigidas (AND). Vazio = sempre. Vocabulário em contrato_tags(): PLANO_POR_CREDITOS, TURMA_FIXA, MENSAL, SEMESTRAL, PLANO_RECORRENTE, STUDIO_PLUS, COMPRA_PONTUAL, BENEFICIO_CONVIDADO_ATIVO.';

create index if not exists clausula_por_versao on public.contrato_clausulas (versao_id, ordem);

alter table public.contrato_clausulas enable row level security;

drop policy if exists "gestao gerencia clausulas" on public.contrato_clausulas;
create policy "gestao gerencia clausulas" on public.contrato_clausulas
  for all to authenticated
  using (public.is_gestao()) with check (public.is_gestao());

-- O aluno não lê a tabela: ele lê o contrato MONTADO, por RPC. Ler as
-- cláusulas cruas mostraria os módulos de produtos que ele não contratou —
-- exatamente o que este modelo existe para evitar.


-- ------------------------------------------------------------
-- 4. O contrato individual, congelado
-- ------------------------------------------------------------
create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),

  cliente_id uuid not null references public.clientes(id) on delete cascade,
  /** A contratação que este contrato documenta. */
  solicitacao_id uuid not null references public.solicitacoes_contratacao(id) on delete cascade,
  /** Preenchida quando o pagamento conclui e a matrícula nasce. */
  matricula_id uuid references public.matriculas(id) on delete set null,

  produto_id uuid not null references public.produtos(id),
  versao_id uuid not null references public.contrato_versoes(id),
  /** Retrato do rótulo: sobrevive a qualquer edição da linha da versão. */
  versao text not null,

  /** As etiquetas que montaram ESTE contrato — a prova da lógica aplicada. */
  tags text[] not null,

  /** O documento exato que o aluno leu e aceitou. Nunca é reescrito. */
  corpo_html text not null,
  hash_corpo text not null,
  /** O quadro-resumo em dado estruturado, para consulta sem reparsear HTML. */
  resumo jsonb not null,

  /** Valor efetivamente contratado, congelado junto com o texto. */
  valor_centavos bigint not null,

  aceito_em timestamptz not null default now(),
  ip text,
  user_agent text,

  /** Rastreabilidade do pagamento — conhecida DEPOIS do aceite. */
  forma_pagamento text,
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  provider_ref text,

  criado_em timestamptz not null default now()
);

comment on table public.contratos is
  'Contrato de Adesão individual, com o HTML congelado no aceite. Editar o modelo não muda contrato já aceito. `tags` registra qual lógica condicional foi aplicada.';

comment on column public.contratos.corpo_html is
  'O texto exato apresentado no aceite. É a prova: hash_corpo é o md5 dele, então adulteração da linha fica visível.';

-- Um contrato por contratação. Reaceitar não cria segunda linha.
create unique index if not exists contrato_por_solicitacao
  on public.contratos (solicitacao_id);

create index if not exists contrato_por_cliente on public.contratos (cliente_id, aceito_em desc);
create index if not exists contrato_por_matricula on public.contratos (matricula_id);

alter table public.contratos enable row level security;

drop policy if exists "aluno le os proprios contratos" on public.contratos;
create policy "aluno le os proprios contratos" on public.contratos
  for select to authenticated using (cliente_id = public.cliente_atual());

drop policy if exists "equipe le contratos" on public.contratos;
create policy "equipe le contratos" on public.contratos
  for select to authenticated using (public.is_socia());

-- Sem policy de insert/update/delete: contrato aceito é imutável, e quem
-- escreve é só a RPC (security definer). Nem a gestão reescreve.


-- ------------------------------------------------------------
-- 5. As etiquetas de um produto
-- ------------------------------------------------------------
-- A regra de montagem, num lugar só. Derivada das COLUNAS do produto e
-- nunca do nome: produto novo cai no módulo certo sozinho.
create or replace function public.contrato_tags(p_produto uuid)
returns text[]
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  pr record;
  t text[] := '{}';
begin
  select * into pr from public.produtos where id = p_produto;
  if not found then
    raise exception 'produto inexistente';
  end if;

  -- Formato. Turma fixa antes de crédito: o plano de turma fixa tem
  -- `gera_credito = false`, mas a ordem explícita evita que uma
  -- configuração estranha caia nos dois módulos.
  if coalesce(pr.turmas_fixas, 0) > 0 then
    t := t || 'TURMA_FIXA'::text;
  elsif pr.gera_credito and pr.renova_automaticamente then
    t := t || 'PLANO_POR_CREDITOS'::text;
  end if;

  -- Studio+ é reconhecido pelo REQUISITO, não pelo nome: é o único
  -- produto que exige check-ins do Wellhub (regulamento 10.2).
  if exists (
    select 1 from public.produto_requisitos
    where produto_id = p_produto and tipo = 'checkins_wellhub'
  ) then
    t := t || 'STUDIO_PLUS'::text;
  end if;

  -- Recorrência.
  if pr.renova_automaticamente then
    t := t || 'PLANO_RECORRENTE'::text;
    if coalesce(pr.ciclos_compromisso, 1) > 1 then
      t := t || 'SEMESTRAL'::text;
    else
      t := t || 'MENSAL'::text;
    end if;
  elsif not ('STUDIO_PLUS' = any(t)) then
    -- O Studio+ é compra sem recorrência, mas NÃO leva o módulo de compra
    -- pontual: o apêndice do contrato mestre o trata como produto próprio
    -- ("BASE + STUDIO_PLUS"), e o módulo 13 já descreve validade, valor e
    -- elegibilidade. Com os dois, o contrato diria a mesma coisa duas
    -- vezes, em redações diferentes.
    t := t || 'COMPRA_PONTUAL'::text;
  end if;

  if coalesce(pr.convidados_por_ciclo, 0) > 0 then
    t := t || 'BENEFICIO_CONVIDADO_ATIVO'::text;
  end if;

  return t;
end;
$function$;

comment on function public.contrato_tags(uuid) is
  'Etiquetas de montagem do contrato para um produto, derivadas das colunas (nunca do nome). É a regra [EXIBIR SE:] do documento mestre, num lugar só.';

revoke execute on function public.contrato_tags(uuid) from public, anon;
grant execute on function public.contrato_tags(uuid) to authenticated;


-- ------------------------------------------------------------
-- 6. O quadro-resumo, a partir dos dados reais
-- ------------------------------------------------------------
create or replace function public.contrato_resumo(p_solicitacao uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  s record;
  cl record;
  pr record;
  es record;
  cfg record;
  tags text[];
  turmas_txt text[] := '{}';
  t record;
  inicio date;
  renovacao date;
  dias_pt text[] := array['domingo','segunda-feira','terça-feira','quarta-feira',
                          'quinta-feira','sexta-feira','sábado'];
  quantidade text;
  compromisso text;
  periodicidade text;
begin
  select * into s from public.solicitacoes_contratacao where id = p_solicitacao;
  if not found then raise exception 'contratação inexistente'; end if;

  select * into cl from public.clientes where id = s.cliente_id;
  select * into pr from public.produtos where id = s.produto_id;
  select * into es from public.config_estudio where id;
  select * into cfg from public.config_agendamento where id;
  tags := public.contrato_tags(s.produto_id);

  inicio := (now() at time zone 'America/Sao_Paulo')::date;
  renovacao := case
    when pr.renova_automaticamente
      then public.data_renovacao(inicio, 1, extract(day from inicio)::integer,
                                 pr.periodicidade_meses, pr.periodicidade_dias)
    else null
  end;

  if 'TURMA_FIXA' = any(tags) then
    for t in
      select coalesce(m.nome, tu.modalidade) as modalidade, tu.dia_semana, tu.horario
      from unnest(s.turmas) as x(id)
      join public.turmas tu on tu.id = x.id
      left join public.modalidades m on m.id = tu.modalidade_id
      order by tu.dia_semana, tu.horario
    loop
      turmas_txt := turmas_txt || format('%s — %s, %s',
        t.modalidade, dias_pt[t.dia_semana + 1], to_char(t.horario, 'HH24:MI'));
    end loop;
  end if;

  quantidade := case
    when 'TURMA_FIXA' = any(tags) then
      format('%s turma(s) fixa(s): %s', pr.turmas_fixas,
             coalesce(array_to_string(turmas_txt, ' · '), 'a definir'))
    -- "por ciclo" só em produto que renova. Numa compra pontual não
    -- existe ciclo seguinte, e a frase mandaria o aluno esperar uma
    -- recarga que nunca vem.
    when pr.gera_credito and pr.creditos_por_ciclo > 0 and pr.renova_automaticamente then
      format('%s crédito(s) por ciclo', pr.creditos_por_ciclo)
    when pr.gera_credito and pr.creditos_por_ciclo > 0 then
      format('%s crédito(s)', pr.creditos_por_ciclo)
    else pr.nome
  end;

  compromisso := case
    when coalesce(pr.ciclos_compromisso, 1) > 1
      then format('%s ciclos de permanência mínima', pr.ciclos_compromisso)
    when pr.renova_automaticamente then 'sem permanência mínima'
    else 'compra única, sem recorrência'
  end;

  periodicidade := case
    when not pr.renova_automaticamente then 'pagamento único'
    when coalesce(pr.periodicidade_meses, 1) = 1 then 'mês'
    else format('%s meses', pr.periodicidade_meses)
  end;

  return jsonb_build_object(
    'ALUNO_NOME', coalesce(cl.nome, ''),
    'ALUNO_CPF', coalesce(cl.cpf, case when cl.estrangeiro then 'estrangeiro, sem CPF' else '' end),
    'ALUNO_EMAIL', coalesce(cl.email, ''),
    'ALUNO_NASCIMENTO', coalesce(to_char(cl.data_nascimento, 'DD/MM/YYYY'), ''),
    'PLANO_NOME', pr.nome,
    'FORMATO_PLANO', case
      when 'TURMA_FIXA' = any(tags) then 'Mensalidade por Turma Fixa'
      when 'STUDIO_PLUS' = any(tags) then 'Studio+ (pacote adicional)'
      when 'PLANO_POR_CREDITOS' = any(tags) then 'Plano por Créditos'
      else 'Compra pontual'
    end,
    'PERIODICIDADE_COBRANCA', periodicidade,
    'RESUMO_QUANTIDADE_OU_TURMA', quantidade,
    'QTD_CREDITOS', coalesce(pr.creditos_por_ciclo, 0)::text,
    'QTD_TURMAS_FIXAS', coalesce(pr.turmas_fixas, 0)::text,
    'TURMA_1', coalesce(turmas_txt[1], ''),
    'TURMA_2', coalesce(turmas_txt[2], ''),
    'VALOR_CICLO', to_char(s.preco_centavos / 100.0, 'FM999G999G990D00'),
    'FORMA_PAGAMENTO', coalesce(s.forma_pagamento, 'a definir no pagamento'),
    'DATA_CONTRATACAO', to_char(inicio, 'DD/MM/YYYY'),
    'DATA_INICIO', to_char(inicio, 'DD/MM/YYYY'),
    'DATA_RENOVACAO', coalesce(to_char(renovacao, 'DD/MM/YYYY'), 'não se aplica'),
    'RESUMO_COMPROMISSO', compromisso,
    'VIGENCIA_COMPROMISSO', case
      when coalesce(pr.ciclos_compromisso, 1) > 1
        then format('%s ciclos a partir de %s', pr.ciclos_compromisso, to_char(inicio, 'DD/MM/YYYY'))
      else 'não se aplica' end,
    'CICLOS_COMPROMISSO', coalesce(pr.ciclos_compromisso, 1)::text,
    'ID_TRANSACAO', upper(left(p_solicitacao::text, 8)),
    'QTD_CREDITOS_STUDIO_PLUS', coalesce(pr.creditos_por_ciclo, 0)::text,
    'VALIDADE_STUDIO_PLUS', coalesce(pr.validade_creditos_dias, pr.periodicidade_dias)::text || ' dias',
    'PRODUTO_PONTUAL', pr.nome,
    'VALOR_COMPRA_PONTUAL', to_char(s.preco_centavos / 100.0, 'FM999G999G990D00'),
    'VALIDADE_COMPRA_PONTUAL',
      coalesce(pr.validade_creditos_dias, pr.periodicidade_dias)::text || ' dias',
    -- Do produto: o que varia entre planos e a gestão edita no catálogo.
    'MAX_AGENDAMENTOS', coalesce(pr.max_agendamentos_simultaneos, 8)::text,
    'DIAS_ANTECEDENCIA', coalesce(pr.dias_antecedencia_agendamento, 14)::text,
    'DESCONTO_EVENTOS', trim(to_char(coalesce(pr.desconto_eventos_pct, 0), 'FM990D99')),
    'CONVIDADOS', coalesce(pr.convidados_por_ciclo, 0)::text,
    -- Da configuração de agendamento: regra da casa, igual para todo produto.
    'HORAS_CANCELAMENTO',
      coalesce(pr.horas_cancelamento, cfg.horas_cancelamento, 4)::text,
    'MINUTOS_TOLERANCIA', coalesce(cfg.minutos_tolerancia_atraso, 15)::text,
    'FALTAS_SUSPENSAO', coalesce(cfg.faltas_para_suspensao, 2)::text,
    'DIAS_SUSPENSAO', coalesce(cfg.dias_suspensao_faltas, 20)::text,
    'DIAS_ANTECEDENCIA_CANCELAMENTO',
      coalesce(cfg.dias_antecedencia_cancelamento_plano, 5)::text,
    'STUDIO_RAZAO_SOCIAL', coalesce(es.razao_social, ''),
    'STUDIO_CNPJ', coalesce(es.cnpj, ''),
    'STUDIO_ENDERECO', coalesce(es.endereco, ''),
    'STUDIO_WHATSAPP', coalesce(es.whatsapp, 'WhatsApp oficial do Studio')
  );
end;
$function$;

comment on function public.contrato_resumo(uuid) is
  'Quadro-resumo da contratação, só com dado real (preço congelado na solicitação, renovação por data_renovacao). Alimenta os marcadores {{...}} das cláusulas.';

revoke execute on function public.contrato_resumo(uuid) from public, anon;
grant execute on function public.contrato_resumo(uuid) to authenticated;


-- ------------------------------------------------------------
-- 7. Escapar o que vem do cadastro
-- ------------------------------------------------------------
-- O contrato é HTML, e os valores substituídos vêm do CADASTRO — nome,
-- e-mail, nome da modalidade. Um aluno que se chame
-- `<script>...</script>` injetaria script na página que mostra o
-- contrato dele (e no do atendimento, que a equipe abre).
--
-- As cláusulas são HTML nosso e NÃO passam por aqui; só os valores.
create or replace function public.html_escape(p text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select replace(replace(replace(replace(coalesce(p, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$function$;

revoke execute on function public.html_escape(text) from public, anon;
grant execute on function public.html_escape(text) to authenticated;


-- ------------------------------------------------------------
-- 8. Montar o contrato
-- ------------------------------------------------------------
create or replace function public.montar_contrato(
  p_solicitacao uuid,
  p_versao uuid default null,
  /**
   * Instante do aceite, para a linha de registro do fim do contrato.
   * Nulo na PRÉVIA — é a única coisa que não pode ser conhecida antes de
   * alguém aceitar. O resto do texto é idêntico nos dois momentos, e é o
   * que garante que o aluno aceite exatamente o que leu.
   */
  p_aceite_em timestamptz default null
) returns table(versao_id uuid, versao text, tags text[], resumo jsonb, corpo_html text)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v record;
  s record;
  dados jsonb;
  etiquetas text[];
  html text := '';
  c record;
  n integer := 0;
  sub integer := 0;
  campo record;
  linha text;
begin
  select * into s from public.solicitacoes_contratacao where id = p_solicitacao;
  if not found then raise exception 'contratação inexistente'; end if;

  -- Aluno só monta o contrato dele. A equipe monta o de qualquer um (é o
  -- contrato que ela precisa reler no atendimento).
  --
  -- `auth.uid() is null` é contexto de serviço (migration, cron, job de
  -- PDF) e passa — é a mesma convenção de `matricular_produto()`. Sem
  -- isso, nenhuma rotina de servidor conseguiria gerar um contrato, e os
  -- testes em SQL também não.
  if auth.uid() is not null then
    if public.is_cliente() then
      if s.cliente_id <> public.cliente_atual() then
        raise exception 'contrato de outra pessoa';
      end if;
    elsif not public.is_socia() then
      raise exception 'acesso restrito';
    end if;
  end if;

  -- Mesma razão do alias abaixo: `versao` é parâmetro de saída, e a
  -- tabela tem coluna com esse nome.
  if p_versao is null then
    select * into v from public.contrato_versoes cv where cv.vigente;
  else
    select * into v from public.contrato_versoes cv where cv.id = p_versao;
  end if;
  if not found then
    raise exception 'nenhuma versão de contrato vigente — publique uma em Configurações';
  end if;

  etiquetas := public.contrato_tags(s.produto_id);
  dados := public.contrato_resumo(p_solicitacao);
  dados := dados || jsonb_build_object(
    'VERSAO_CONTRATO', v.versao,
    'DATA_HORA_ACEITE', case
      when p_aceite_em is null then 'no momento do aceite'
      else to_char(p_aceite_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
    end
  );

  -- Quadro-resumo primeiro, sempre (exigência do documento mestre).
  html := '<h2>Quadro-resumo da contratação</h2><table class="quadro"><tbody>';
  for campo in
    select * from (values
      ('Aluno(a)',            'ALUNO_NOME'),
      ('CPF',                 'ALUNO_CPF'),
      ('E-mail',              'ALUNO_EMAIL'),
      ('Produto contratado',  'PLANO_NOME'),
      ('Formato',             'FORMATO_PLANO'),
      ('Quantidade / turma',  'RESUMO_QUANTIDADE_OU_TURMA'),
      ('Valor',               'VALOR_CICLO'),
      ('Periodicidade',       'PERIODICIDADE_COBRANCA'),
      ('Forma de pagamento',  'FORMA_PAGAMENTO'),
      ('Data da contratação', 'DATA_CONTRATACAO'),
      ('Início',              'DATA_INICIO'),
      ('Próxima renovação',   'DATA_RENOVACAO'),
      ('Compromisso',         'RESUMO_COMPROMISSO'),
      ('ID da contratação',   'ID_TRANSACAO')
    ) as f(rotulo, chave)
  loop
    linha := coalesce(dados->>campo.chave, '');
    if linha <> '' then
      -- O valor aparece com "R$" no rótulo, não no dado: o dado é o número,
      -- e é ele que precisa bater com a cobrança.
      if campo.chave in ('VALOR_CICLO') then linha := 'R$ ' || linha; end if;
      html := html || format('<tr><th>%s</th><td>%s</td></tr>',
                             campo.rotulo, public.html_escape(linha));
    end if;
  end loop;
  html := html || '</tbody></table>'
    || '<p class="nota">As condições específicas exibidas neste contrato correspondem '
    || 'exclusivamente ao produto descrito no quadro-resumo. Cláusulas relativas a outros '
    || 'produtos do Studio não integram esta contratação.</p>';

  -- As cláusulas aplicáveis, numeradas na ordem em que sobraram.
  -- Alias obrigatório: `versao_id` é também um parâmetro de saída desta
  -- função, e sem qualificar a coluna o Postgres recusa por ambiguidade.
  for c in
    select cla.* from public.contrato_clausulas cla
    where cla.versao_id = v.id and cla.condicao <@ etiquetas
    order by cla.ordem
  loop
    if c.nivel = 1 then
      n := n + 1;
      sub := 0;
      html := html || format('<h3>%s. %s</h3>', n, c.titulo);
    else
      sub := sub + 1;
      html := html || format('<h4>%s.%s %s</h4>', n, sub, c.titulo);
    end if;
    html := html || c.corpo_html;
  end loop;

  -- Substituição dos marcadores. Feita no fim, de uma vez, para o mesmo
  -- marcador valer igual no quadro-resumo e nas cláusulas.
  -- Escapado: ver a função acima. O valor do cadastro nunca é HTML.
  for campo in select key, value from jsonb_each_text(dados) loop
    html := replace(html, '{{' || campo.key || '}}', public.html_escape(campo.value));
  end loop;

  return query select v.id, v.versao, etiquetas, dados, html;
end;
$function$;

comment on function public.montar_contrato(uuid, uuid, timestamptz) is
  'Monta o contrato individual: quadro-resumo + só as cláusulas cujas etiquetas cabem no produto. Determinística — a prévia que o aluno lê é o texto que ele aceita.';

revoke execute on function public.montar_contrato(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.montar_contrato(uuid, uuid, timestamptz) to authenticated;


-- ------------------------------------------------------------
-- 8. Aceitar
-- ------------------------------------------------------------
create or replace function public.aceitar_contrato(
  p_solicitacao uuid,
  p_versao uuid,
  p_forma_pagamento text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s record;
  es record;
  m record;
  headers json;
  agora timestamptz;
  id_novo uuid;
begin
  select * into s from public.solicitacoes_contratacao where id = p_solicitacao;
  if not found then raise exception 'contratação inexistente'; end if;

  -- O aceite é um ato pessoal: a equipe não aceita contrato por ninguém.
  if not public.is_cliente() or s.cliente_id <> public.cliente_atual() then
    raise exception 'o aceite do contrato é do próprio aluno';
  end if;

  if s.status not in ('aguardando_aprovacao', 'aguardando_pagamento') then
    raise exception 'esta contratação já foi encerrada';
  end if;

  select * into es from public.config_estudio where id;
  if nullif(btrim(coalesce(es.razao_social, '')), '') is null
     or nullif(btrim(coalesce(es.cnpj, '')), '') is null
     or nullif(btrim(coalesce(es.endereco, '')), '') is null then
    raise exception 'o Contrato de Adesão ainda não está configurado (faltam os dados do estúdio) — fale com a recepção';
  end if;

  -- A versão que o aluno LEU tem que ser a vigente. Se a gestão publicou
  -- outra entre a leitura e o clique, ele precisa reler — aceitar texto
  -- diferente do que apareceu na tela é exatamente o que este modelo
  -- existe para impedir.
  if not exists (select 1 from public.contrato_versoes where id = p_versao and vigente) then
    raise exception 'o contrato foi atualizado enquanto você lia — abra novamente para conferir e aceitar';
  end if;

  if p_forma_pagamento is not null then
    update public.solicitacoes_contratacao
    set forma_pagamento = p_forma_pagamento, atualizada_em = now()
    where id = p_solicitacao;
  end if;

  agora := now();
  select * into m from public.montar_contrato(p_solicitacao, p_versao, agora);

  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    headers := null;
  end;

  insert into public.contratos (
    cliente_id, solicitacao_id, produto_id, versao_id, versao, tags,
    corpo_html, hash_corpo, resumo, valor_centavos, aceito_em,
    ip, user_agent, forma_pagamento
  ) values (
    s.cliente_id, p_solicitacao, s.produto_id, m.versao_id, m.versao, m.tags,
    m.corpo_html, md5(m.corpo_html), m.resumo, s.preco_centavos, agora,
    -- x-forwarded-for pode vir como lista ("cliente, proxy"); o 1º é dele.
    split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1),
    left(coalesce(headers->>'user-agent', ''), 400),
    p_forma_pagamento
  )
  on conflict (solicitacao_id) do nothing
  returning id into id_novo;

  if id_novo is null then
    select id into id_novo from public.contratos where solicitacao_id = p_solicitacao;
  end if;

  return id_novo;
end;
$function$;

comment on function public.aceitar_contrato(uuid, uuid, text) is
  'Congela o contrato montado e registra o aceite do aluno, com hash, IP e user-agent dos headers. Idempotente por contratação. Recusa versão que deixou de ser a vigente.';

revoke execute on function public.aceitar_contrato(uuid, uuid, text) from public, anon;
grant execute on function public.aceitar_contrato(uuid, uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 9. Amarrar o contrato ao pagamento e à matrícula
-- ------------------------------------------------------------
-- Forma de pagamento e id da transação só existem DEPOIS do aceite (o
-- aluno aceita e então paga). Por isso não estão no HTML congelado: entram
-- como dado ao lado dele, quando o pagamento confirma.
create or replace function public.vincular_contrato_ao_pagamento(
  p_solicitacao uuid,
  p_matricula uuid,
  p_cobranca uuid,
  p_forma text,
  p_provider_ref text
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.contratos
  set matricula_id = coalesce(p_matricula, matricula_id),
      cobranca_id = coalesce(p_cobranca, cobranca_id),
      forma_pagamento = coalesce(p_forma, forma_pagamento),
      provider_ref = coalesce(p_provider_ref, provider_ref)
  where solicitacao_id = p_solicitacao;
  return found;
end;
$function$;

comment on function public.vincular_contrato_ao_pagamento(uuid, uuid, uuid, text, text) is
  'Liga o contrato aceito à matrícula, à cobrança e ao provider_ref do gateway. Não toca no HTML congelado.';

revoke execute on function public.vincular_contrato_ao_pagamento(uuid, uuid, uuid, text, text)
  from public, anon;
grant execute on function public.vincular_contrato_ao_pagamento(uuid, uuid, uuid, text, text)
  to authenticated;


-- ------------------------------------------------------------
-- 10. Histórico do aluno
-- ------------------------------------------------------------
-- Lista sem o corpo: o HTML de um contrato tem dezenas de KB, e "Meus
-- documentos" precisa de uma linha por contrato, não do texto inteiro.
create or replace function public.meus_contratos()
returns table(
  id uuid,
  produto text,
  formato text,
  versao text,
  valor_centavos bigint,
  aceito_em timestamptz,
  matricula_id uuid,
  status_matricula text
)
language sql
stable security definer
set search_path to ''
as $function$
  select
    c.id,
    c.resumo->>'PLANO_NOME',
    c.resumo->>'FORMATO_PLANO',
    c.versao,
    c.valor_centavos,
    c.aceito_em,
    c.matricula_id,
    m.status::text
  from public.contratos c
  left join public.matriculas m on m.id = c.matricula_id
  where c.cliente_id = public.cliente_atual()
  order by c.aceito_em desc;
$function$;

revoke execute on function public.meus_contratos() from public, anon;
grant execute on function public.meus_contratos() to authenticated;


-- ------------------------------------------------------------
-- 11. Configuração
-- ------------------------------------------------------------
alter table public.config_cadastro
  add column if not exists exigir_contrato boolean not null default false;

comment on column public.config_cadastro.exigir_contrato is
  'Liga a exigência de aceite do Contrato de Adesão na contratação. Nasce FALSE: só pode ir a true depois de config_estudio preenchida e de uma versão de contrato publicada.';
