-- ============================================================
-- Repara o seed de 20260818120000, que entrou pela metade na
-- PRODUÇÃO.
--
-- O que aconteceu: aquela migration cria cada custo fixo com
--   insert into despesas_recorrentes ... select ... from categorias_saida
--   where nome = 'Aluguel'
-- e a produção estava com categorias_saida VAZIA — as categorias base
-- semeadas em 20260719140000 tinham sido apagadas em algum momento,
-- embora a migration conste no ledger. Sem linha no SELECT, o INSERT
-- não insere nada e o deploy passa em silêncio: dos 9 custos fixos,
-- só entraram "Taxa de água" e "Juliana" (as duas cujas categorias a
-- própria 20260818120000 criava com INSERT ... VALUES).
--
-- Além dos custos, a ausência das categorias tinha um efeito pior e
-- invisível: `sync_folha_financeiro()` procura a categoria
-- 'Professoras' (`where nome = 'Professoras'`) e, quando não acha,
-- desiste sem erro — ou seja, aprovar um fechamento NÃO gerava a saída
-- do pagamento das professoras. Restaurar as categorias conserta isso
-- junto.
--
-- Idempotente de propósito: é o mesmo arquivo nos dois ambientes
-- (CLAUDE.md §14.4) e o DEV já tem as 14 categorias e as 9
-- recorrentes. Lá esta migration não muda nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Categorias base — a lista de 20260719140000, restaurada.
--    `nome` é unique, então `on conflict do nothing` basta e não
--    duplica no DEV.
-- ------------------------------------------------------------
insert into public.categorias_saida (nome, tipo) values
  ('Aluguel', 'fixa'),
  ('Internet', 'fixa'),
  ('DAS-MEI', 'fixa'),
  ('Google Workspace', 'fixa'),
  ('Domínio', 'fixa'),
  ('App de agendamento', 'fixa'),
  ('Marketing', 'fixa'),
  ('Social media', 'fixa'),
  ('Professoras', 'variavel'),
  ('Energia', 'variavel'),
  ('Materiais', 'variavel'),
  ('Manutenção', 'variavel'),
  ('Limpeza', 'variavel'),
  ('Compras', 'variavel')
on conflict (nome) do nothing;

-- ------------------------------------------------------------
-- 2) Custos fixos que faltaram.
--
--    Guardado por `not exists` sobre a descrição: se a recorrente já
--    existe (DEV, ou produção depois de alguém cadastrar pela tela),
--    não cria uma segunda. Sem isso, repetir o erro de origem seria
--    fácil — só que agora duplicando em vez de faltando.
--
--    A guarda ignora `ativa` de propósito: recorrente encerrada pela
--    equipe não deve ressuscitar por causa desta migration.
--
--    Valores e dias vêm de 20260818120000 (o dia é estimativa
--    editável na tela; o DAS-MEI dia 20 é data oficial da Receita).
-- ------------------------------------------------------------
insert into public.despesas_recorrentes (descricao, valor_centavos, categoria_id, dia_vencimento)
select novo.descricao, novo.valor_centavos, cat.id, novo.dia
from (values
  ('Aluguel',          150000, 'Aluguel',               5),
  ('Internet',          15000, 'Internet',             10),
  ('Marketing',         30000, 'Marketing',             1),
  ('DAS-MEI',            8800, 'DAS-MEI',              20),
  ('FitbyWix',           4990, 'App de agendamento',    5),
  ('Conta Google',       3920, 'Google Workspace',      5),
  ('Luz (estimativa)',  20000, 'Energia',              15)
) as novo(descricao, valor_centavos, categoria, dia)
join public.categorias_saida cat on cat.nome = novo.categoria
where not exists (
  select 1 from public.despesas_recorrentes d
  where d.descricao = novo.descricao
);

-- ------------------------------------------------------------
-- 3) Rede de segurança: se ainda faltar algum, falha alto.
--
--    O defeito original passou justamente por ser silencioso. Aqui,
--    se a categoria não existir por qualquer motivo, o deploy para e
--    aparece — em vez de deixar a tela de Saídas incompleta de novo.
-- ------------------------------------------------------------
do $$
declare
  v_faltando text;
begin
  select string_agg(d.descricao, ', ')
    into v_faltando
  from (values
    ('Aluguel'), ('Internet'), ('Marketing'), ('DAS-MEI'),
    ('FitbyWix'), ('Conta Google'), ('Luz (estimativa)'),
    ('Taxa de água'), ('Juliana')
  ) as d(descricao)
  where not exists (
    select 1 from public.despesas_recorrentes r where r.descricao = d.descricao
  );

  if v_faltando is not null then
    raise exception 'Custos fixos nao criados: %', v_faltando;
  end if;
end;
$$;
