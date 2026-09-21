-- ============================================================
-- Joanne Vênus e Leticia Lemos entram no cadastro, e a grade fecha.
--
-- Elas dão aula na grade real (5 aulas) e não estavam em `professoras`,
-- então a migration da grade (20260921140000) descartou essas 5 linhas
-- e avisou. Aqui elas entram e as aulas completam.
--
-- ⚠️ SEM CONTATO DE EMERGÊNCIA, por decisão da gestão em 21/09 ("cadastre
-- sem, depois eu incluo"). Isso exige desligar `professoras_valida_
-- contato_emergencia` durante o insert — a trigger só barra INSERT, e é
-- para barrar mesmo: é o telefone de quem se liga quando alguém se
-- machuca na aula.
--
-- Desligar a trigger em vez de afrouxar a regra é deliberado. A regra
-- continua valendo para todo cadastro feito pela tela, que é por onde
-- professora entra normalmente; a exceção fica restrita a estas duas
-- linhas, escrita aqui, com nome e data. O estado em que elas ficam —
-- professora ativa sem contato — é o MESMO das professoras anteriores a
-- 20260819150000, e a tela já sabe mostrar essa pendência e oferecer o
-- formulário. Ou seja: não é um estado novo e inédito, é um estado que
-- o sistema já trata.
--
-- ⚠️ `valor_por_aluna_centavos = 0` também é de propósito: ninguém aqui
-- sabe quanto elas ganham. Zero aparece como R$0 na folha do Fechamento
-- — erro visível, corrigível na tela de Remuneração. Um valor chutado
-- entraria calado no pagamento.
--
-- Pendências que isto deixa abertas, de caso pensado (ver §2 do backlog):
--   1. contato de emergência das duas;
--   2. remuneração das duas;
--   3. e-mail das duas, que é o convite de acesso ao portal.
-- ============================================================

alter table public.professoras disable trigger professoras_valida_contato_emergencia;

insert into public.professoras (nome, valor_por_aluna_centavos, ativa)
select v.nome, 0, true
from (values ('Joanne Vênus'), ('Leticia Lemos')) as v(nome)
where not exists (select 1 from public.professoras p where p.nome = v.nome);

alter table public.professoras enable trigger professoras_valida_contato_emergencia;

-- As 5 aulas que faltavam. Mesmo bloco da 20260921140000, mesma guarda
-- por (dia, horário, sala) — se alguém já tiver criado a turma pela
-- tela nesse encaixe, esta migration não duplica.
insert into public.turmas (
  dia_semana, horario, duracao_minutos, capacidade,
  modalidade, modalidade_id, professora_id, sala_id, ativa)
select v.dia, v.hora::time, v.dur, v.cap,
       v.modalidade, m.id, p.id, s.id, true
from (values
  /* seg 19:00 */ (1, '19:00', 60, 8, 'Stiletto',   'Joanne Vênus',  2),
  /* seg 20:00 */ (1, '20:00', 60, 8, 'Floorwork',  'Joanne Vênus',  2),
  /* qua 19:00 */ (3, '19:00', 60, 8, 'Stiletto',   'Joanne Vênus',  2),
  /* qui 19:30 */ (4, '19:30', 60, 8, 'Jazz Funk',  'Joanne Vênus',  2),
  /* sáb 12:00 */ (6, '12:00', 60, 7, 'Pole 1 e 2', 'Leticia Lemos', 1)
) as v(dia, hora, dur, cap, modalidade, professora, sala)
join public.modalidades m on m.nome = v.modalidade
join public.professoras p on p.nome = v.professora
join public.salas s on s.nome = case v.sala when 1 then 'Sala 1 · Pole' else 'Sala 2 · Multi' end
where not exists (
  select 1 from public.turmas t
  where t.dia_semana = v.dia and t.horario = v.hora::time and t.sala_id = s.id
);

do $$
declare n int; sem_contato int;
begin
  select count(*) into n from public.turmas where ativa;
  select count(*) into sem_contato from public.professoras
   where ativa and (contato_emergencia_nome is null or contato_emergencia_telefone is null);
  raise notice 'Grade ativa: % turmas', n;
  if sem_contato > 0 then
    raise warning '% professora(s) ativa(s) sem contato de emergência — pendência de cadastro, não de código.', sem_contato;
  end if;
end $$;
