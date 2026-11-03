-- ============================================================
-- Uma parcela por dívida por mês
-- ============================================================
-- Programar parcelas sempre INSERE, nunca confere se já existe cronograma
-- para aqueles meses — e a tela não mostra o que já foi programado. Quem
-- programa duas vezes (o que é natural quando a primeira parece não ter
-- funcionado) fica com dois cronogramas, e nada no banco impede.
--
-- Aconteceu em produção: o parcelamento do Mercado Pago tem DUAS parcelas
-- de R$ 777,13 em cada mês de 11/2026 a 10/2027. São 24 onde deveriam ser
-- 12, somando R$ 18.651,12 de "a pagar" para um parcelamento de
-- R$ 9.325,56. Novembro aparece com R$ 1.554,26 no lugar de R$ 777,13.
--
-- O conserto é em duas partes, e a ordem importa: primeiro tira a
-- duplicata, senão o índice não pode nascer.
--
-- ⚠️ Esta migration APAGA lançamento financeiro. Só as cópias: de cada
-- grupo (dívida, mês) sobra a linha mais antiga, que é a do cronograma
-- original. Nenhuma parcela paga é tocada — o filtro é `prevista`, e
-- dinheiro que já saiu não é cronograma, é fato.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Tira as cópias
-- ------------------------------------------------------------
delete from public.saidas_financeiras s
using (
  select id,
         row_number() over (
           partition by divida_id, data_competencia
           order by criada_em, id
         ) as n
  from public.saidas_financeiras
  where divida_id is not null
    and status_saida = 'prevista'
) dup
where dup.id = s.id
  and dup.n > 1;


-- ------------------------------------------------------------
-- 2. Impede que volte
-- ------------------------------------------------------------
-- Parcial de propósito, em três recortes:
--
-- * `divida_id is not null` — saída comum não tem nada com isto.
-- * `status_saida = 'prevista'` — só o CRONOGRAMA é único por mês. Uma
--   parcela paga e um abatimento avulso no mesmo mês é caso real (a pessoa
--   adianta uma parte), e travar isso quebraria o abatimento.
-- * por `data_competencia`, que é o mês da parcela — é a coluna que a
--   tela de Saídas usa para dizer "quanto sai neste mês".
create unique index if not exists divida_uma_parcela_prevista_por_mes
  on public.saidas_financeiras (divida_id, data_competencia)
  where divida_id is not null and status_saida = 'prevista';

comment on index public.divida_uma_parcela_prevista_por_mes is
  'Cronograma de divida: uma parcela prevista por mes. Programar duas vezes passa a dar erro em vez de duplicar silenciosamente o valor que aparece em Saidas.';


-- ------------------------------------------------------------
-- 3. A guarda
-- ------------------------------------------------------------
-- O índice já garante daqui para a frente. Isto confere que a limpeza
-- fez efeito: se sobrou duplicata, o `create index` acima teria falhado —
-- mas a mensagem do Postgres fala de índice, não de dinheiro, e quem ler o
-- log do deploy merece saber o que de fato aconteceu.
do $$
declare
  n integer;
begin
  select count(*) into n from (
    select divida_id, data_competencia
    from public.saidas_financeiras
    where divida_id is not null and status_saida = 'prevista'
    group by divida_id, data_competencia
    having count(*) > 1
  ) x;
  if n > 0 then
    raise exception 'Ainda ha % meses com parcela duplicada apos a limpeza.', n;
  end if;
end $$;
