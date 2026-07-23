-- Refina o acesso dentro de dois módulos operacionais (M8, funções internas).
-- Antes, tudo que era is_socia() liberava gestão E secretária igualmente.
-- Aqui separamos "operar" de "mudar a regra / o catálogo":
--
--   • Agenda → Config: só a GESTÃO altera as regras de agendamento
--     (horas de cancelamento, máximo de reposições, valor do check-in
--     Wellhub). A secretária continua operando a agenda (dia/grade), mas
--     não mexe na política. Leitura da config segue liberada (o portal da
--     aluna depende dela via is_cliente(), e ler a regra não é sensível).
--
--   • Planos: a operação VÊ os planos e as matrículas, mas só a GESTÃO
--     cria, edita ou desativa plano. A antiga policy ALL de is_socia() é
--     dividida em leitura (is_operacional) + escrita (is_gestao).
--
-- As RPCs de matrícula (matricular / renovar_ciclo / marcar_inadimplente)
-- são SECURITY DEFINER e compartilhadas com o portal do aluno (auto-compra),
-- então NÃO são travadas aqui — o endurecimento delas entra junto da
-- migração is_socia()→is_operacional() (ver docs/05-BACKLOG.md). Hoje não há
-- conta secretária/social criada, então não há vazamento em aberto; a UI já
-- esconde essas ações para quem não é gestão.

alter policy "socias ajustam config agendamento" on public.config_agendamento
  using (is_gestao()) with check (is_gestao());

drop policy "socias gerenciam planos" on public.planos;

create policy "operacao ve planos"
  on public.planos for select
  using (is_operacional());

create policy "gestao gerencia planos"
  on public.planos for all
  using (is_gestao()) with check (is_gestao());
