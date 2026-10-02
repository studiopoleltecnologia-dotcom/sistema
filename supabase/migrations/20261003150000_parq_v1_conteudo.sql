-- ============================================================
-- PAR-Q — versão v1 (conteúdo)
-- 30/09/2026
-- ============================================================
-- Transcrição **literal** de `PAR-Q_Studio_Pole_L.docx`. O apêndice do
-- documento é explícito: "Não alterar o conteúdo jurídico/médico das
-- perguntas por conta própria." Nada foi reescrito, resumido ou
-- modernizado — nem a pontuação.
--
-- Duas diferenças em relação ao PAR-Q clássico que valem registrar, porque
-- parecem erro de transcrição e não são:
--
-- · a pergunta 6 é sobre **medicação de uso contínuo em geral**, não só
--   cardíaca (a clássica é "medicamento para pressão ou coração");
-- · as 7 e 8 separam **tratamento para pressão/coração** de **tratamento
--   contínuo que possa ser prejudicado pela atividade** — no clássico isso
--   é uma pergunta só.
--
-- Os blocos internos do documento ("Apêndice interno — implementação no
-- sistema", "Texto de mensagens do fluxo", a base jurídica) não entram
-- como conteúdo do aluno: viraram comportamento nas funções e mensagens em
-- `parq_versoes`.
-- ============================================================

do $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.parq_versoes where versao = 'v1') then
    return;
  end if;

  insert into public.parq_versoes (
    versao, vigente_desde, vigente,
    aviso_html, termo_html,
    mensagem_apto, mensagem_atencao, mensagem_renovacao, mensagem_menor
  ) values (
    'v1',
    (now() at time zone 'America/Sao_Paulo')::date,
    true,
    -- O bloco "IMPORTANTE" que abre o formulário.
    '<p>Este formulário tem a finalidade de identificar a necessidade de avaliação médica antes do início ou do aumento do nível de atividade física. Responda com sinceridade. <strong>O questionário não substitui diagnóstico ou acompanhamento médico.</strong></p>',
    -- Termo de Responsabilidade + declaração de aceite eletrônico.
    '<p><strong>Termo de Responsabilidade para Prática de Atividade Física</strong></p>
<p>Declaro que estou ciente de que é recomendável conversar com um médico, antes de iniciar ou aumentar o nível de atividade física pretendido, assumindo plena responsabilidade pela realização de qualquer atividade física sem o atendimento desta recomendação.</p>
<p><strong>ACEITE ELETRÔNICO.</strong> Declaro que respondi ao PAR-Q com informações verdadeiras e completas, que me comprometo a comunicar alterações relevantes de saúde ao Studio Pole L e que li e concordo com o Termo de Responsabilidade acima.</p>',
    -- As três mensagens do "Texto de mensagens do fluxo", literais.
    'PAR-Q concluído. Seu questionário e Termo de Responsabilidade foram registrados. Se houver qualquer mudança relevante na sua saúde, atualize suas informações antes da próxima aula.',
    'Uma ou mais respostas indicam necessidade de avaliação médica antes da prática. Envie um atestado de aptidão física pelo sistema para que a equipe possa concluir sua liberação cadastral.',
    'Seu PAR-Q precisa ser renovado. Atualize suas respostas e aceite novamente o Termo de Responsabilidade para manter seu cadastro em dia.',
    'O PAR-Q, o Termo de Responsabilidade e a autorização para prática precisam ser preenchidos pelo responsável legal.'
  )
  returning id into v_id;

  insert into public.parq_perguntas (versao_id, ordem, texto) values
  (v_id, 1,  'Algum médico já disse que você possui algum problema de coração ou pressão arterial, e que somente deveria realizar atividade física supervisionado por profissionais de saúde?'),
  (v_id, 2,  'Você sente dores no peito quando pratica atividade física?'),
  (v_id, 3,  'No último mês, você sentiu dores no peito ao praticar atividade física?'),
  (v_id, 4,  'Você apresenta algum desequilíbrio devido à tontura e/ou perda momentânea da consciência?'),
  (v_id, 5,  'Você possui algum problema ósseo ou articular, que pode ser afetado ou agravado pela atividade física?'),
  (v_id, 6,  'Você toma atualmente algum tipo de medicação de uso contínuo?'),
  (v_id, 7,  'Você realiza algum tipo de tratamento médico para pressão arterial ou problemas cardíacos?'),
  (v_id, 8,  'Você realiza algum tratamento médico contínuo, que possa ser afetado ou prejudicado com a atividade física?'),
  (v_id, 9,  'Você já se submeteu a algum tipo de cirurgia, que comprometa de alguma forma a atividade física?'),
  (v_id, 10, 'Sabe de alguma outra razão pela qual a atividade física possa eventualmente comprometer sua saúde?');
end $$;
