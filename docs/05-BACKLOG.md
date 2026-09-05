# 05 — Backlog & Visão Geral

Levantamento único de tudo que está pendente no sistema, feito em **21/07/2026**
a partir do código, das migrations aplicadas e do estado real do projeto
Supabase (`fgvxhwpqsxohqrccrlfn`) — não de memória.

Legenda de prioridade:
🔴 **bloqueia** algo (segurança ou outra tarefa) · 🟡 **próximo** · ⚪ **depois**

---

## 1. Onde o sistema está hoje

| Bloco | Estado |
|---|---|
| Fase 0 — Fundação (repo, Auth, deploy Actions→Pages, design system, flags) | ✅ pronto |
| Fase 1 — Clientes + CRM | ✅ pronto |
| Fase 2 — Financeiro + MEI | ✅ pronto |
| Fase 3 — Follow-up (com `pg_cron` diário rodando) | ✅ pronto |
| Fase 4 — Agenda & Presença + Professoras + Planos | ✅ pronto |
| Portal da Aluna — MVP (agendar, cancelar, autocompra sem gateway) | ✅ pronto |
| Portal da Professora (`#/prof`) | ✅ pronto, **nunca usado em aula real** |
| Fase 5 — Dashboard Executivo | ❌ placeholder |
| Fase 6 — Conteúdo, Social, Tarefas, Investimentos | ❌ placeholder |
| Wellhub | ⚠️ código escrito, **nada publicado** |

Dados no banco hoje: **zero.** Banco resetado em 29/07/2026 a pedido (ver M8) —
todo o dado de teste (clientes, turmas, professoras, planos, financeiro, funil)
foi apagado, inclusive o catálogo-seed de modalidades/salas. Mantidos só a
conta de gestão (`socias`) e as configurações do sistema. Cadastro (grade,
professoras, planos) precisa ser refeito do zero antes de operar.

---

## 2. Segurança & acesso

| # | Tarefa | Pri | Nota |
|---|---|---|---|
| S1 | **Ativar confirmação de e-mail** no Supabase Auth | 🔴 | O convite da professora depende disso: sem confirmação, quem souber o e-mail dela cria a conta dela. Toggle no painel, não é código. |
| S2 | **Ligar proteção contra senha vazada** (HaveIBeenPwned) | 🟡 | Apontado pelo linter do Supabase. Também é toggle. |
| S3 | ~~Trava do Financeiro só para a gestão~~ | ✅ | **Feito em 21/07/2026 (M8).** Funções internas gestao/secretaria/social; Financeiro trancado no banco por `is_gestao()`; painel e menu escondem dinheiro de não-gestão; `professoras` gestão-only. MFA vira reforço opcional, não bloqueia. |
| S3b | **Migrar policies operacionais para `is_operacional()`** antes de criar conta `social` | 🔴 (quando for criar social) | Hoje operação usa `is_socia()` (qualquer conta interna). Correto enquanto só há gestao/secretaria. Uma conta social herdaria a operação — migrar antes. Sem conta social, sem vazamento. **Junto disto:** as RPCs `matricular`/`renovar_ciclo`/`marcar_inadimplente` (SECURITY DEFINER, compartilhadas com o portal do aluno) precisam de guarda `is_gestao()` interna — hoje travadas só na UI (ver S6). |
| S4 | ~~Tela para provisionar acessos internos~~ | ✅ | **Feito em 21/07/2026 (M9).** Tela **Equipe & Acessos** (gestão): convida por e-mail + função, muda função, remove. `convidar_equipe` promove na hora se já existe login, senão deixa convite que o signup consome. Protege a última gestão de se auto-remover. Falta a equipe real ser cadastrada (dado, não código). |
| S5 | ~~Revisar as views *definer* apontadas pelo linter~~ | ✅ | **Feito em 22/08/2026.** Eram 6 achados ERROR do Advisor: `auth_users_exposed` em `vw_equipe` (**corrigido de verdade** — a view parou de `join auth.users`, passou a ler `socias.email`, nova coluna sincronizada por `convidar_equipe()`/`handle_new_user()`/trigger) + 5× `security_definer_view` (`vw_equipe`, `vw_professoras_nomes`, `vw_grade_publica`, `vw_vagas_turma`, `vw_alunas_da_aula`). Os 5 ficam **deliberadamente como estão** — documentado via `comment on view` em cada uma e no cabeçalho de `20260822120000_seguranca_vw_equipe_e_socias.sql`: gestão/secretaria/cliente/professora compartilham o mesmo role Postgres `authenticated`, então só SECURITY DEFINER + `WHERE` reproduz o recorte por papel; RLS/GRANT não conseguem. Verificado em produção via `get_advisors`: 6 → 5. |
| S6 | ~~Agenda→Config e Planos: refinar acesso dentro do módulo~~ | ✅ | **Feito em 22/07/2026.** Aba **Config** da Agenda só gestão (UI + RLS em `config_agendamento`). **Planos**: operação vê, só gestão cria/edita/matricula/renova/inadimple (UI + escrita de `planos` por `is_gestao()`). As ações de matrícula ficam travadas **só na UI** — reforço no banco depende de S3b. |
| S7 | ~~Escalação de privilégio via `UPDATE` em `socias`~~ | ✅ | **Feito em 22/08/2026,** achado durante a revisão de segurança (fora do Advisor). A policy `"socia atualiza o proprio perfil"` liberava `UPDATE` de qualquer coluna da própria linha — sem trava por coluna, qualquer conta interna (inclusive secretaria) conseguia `PATCH funcao='gestao'` direto no PostgREST, contornando `definir_funcao()` e a trava do Financeiro (S3). Fechado: `revoke update on socias from authenticated, anon` + `grant update (nome)`. |
| S8 | Trocar a policy `"socias veem socias"` de `is_socia()` para `is_gestao()` | ⚪ | Risco residual aceito na correção de S5/S7 (22/08/2026): com `socias.email` novo, qualquer conta interna que consultar `socias` direto (fora de `vw_equipe`) vê o e-mail de toda a equipe, não só a gestão. Avaliado como aceitável por ora (secretária é pessoa de confiança), mas é decisão consciente — fechar exige auditar quem lê `socias` direto antes de trocar a policy. |
| S9 | Converter as 5 views `security_definer_view` aceitas em funções `security definer` | ⚪ | Decisão de produto, não urgente — é o único jeito de zerar os 6→5 achados do Advisor por completo (ele varre `information_schema.views`, não funções). Custo estimado ~1–2 dias: 5 call-sites `.from()` → `.rpc()` (3 encadeiam `.order()/.gte()/.lte()` do PostgREST, viram SQL dentro da função), mais `vw_ocupacao_professora_modalidade` que faz join com `vw_professoras_nomes`, mais regenerar `database.types.ts`. Ordem sugerida por custo crescente: `vw_equipe` → `vw_professoras_nomes` → `vw_alunas_da_aula` → `vw_grade_publica`/`vw_vagas_turma`. |

---

## 3. Wellhub

Contexto técnico completo em [CLAUDE.md §12](../CLAUDE.md#12-integração-wellhub-gympass--requisitos-técnicos).
O que existe: a Edge Function `wellhub-webhook` escrita no repo e a RPC
`conciliar_wellhub` funcionando. O que **não** existe: qualquer coisa publicada.

| # | Tarefa | Pri | Nota |
|---|---|---|---|
| W1 | **Publicar a Edge Function** `wellhub-webhook` | ✅ | **Feito em 25/07** (via MCP, `verify_jwt` off). No ar e blindada: rejeita POST sem/assinatura errada com 401 e GET com 405. Assinatura HMAC-SHA1 confirmada em teste real (`200 ok (ticket não validado)` = assinatura passou, validate recusou id de exemplo). |
| W2 | Cadastrar os secrets no Supabase | 🔴 | Via `supabase secrets set`, nunca no repo (é público). Sandbox: `WELLHUB_WEBHOOK_SECRET` (gerado por nós, valida o `X-Gympass-Signature`), `WELLHUB_API_TOKEN` (o `api_key` do e-mail), `WELLHUB_GYM_ID=548`. Produção troca o token por OAuth (`WELLHUB_CLIENT_ID/SECRET`) e `WELLHUB_API_BASE=https://api.partners.gympass.com`. |
| W3 | Implementar a chamada à **Access Control API** (`POST /access/v1/validate`) | ✅ | **Feito em 25/07.** Webhook reescrito: valida assinatura HMAC-SHA1 do corpo (`X-Gympass-Signature`, hex maiúsculo) → roteia evento → chama `validate` (`X-Gym-Id` + Bearer) → só com ticket válido registra presença. Booking roteado sem processar (W7). Assinatura conferida contra referência openssl. Falta só publicar (W1) + secrets (W2). |
| W4 | Testar ponta a ponta no **sandbox** (`gym_id` 548) | ✅ | **Feito em 25/07.** E2E verde pelo webhook publicado: `simulate/checkins` (user 1000000000001 + product **1095**) → webhook com corpo **assinado** → `validate` positivo → gravou **cliente** (`origem=wellhub`), **presença** (`canal=wellhub`) e **entrada "a reconciliar"** (R$15, competência 25/07, prevista 15/08). Turma e dados de teste removidos, banco no baseline. Produtos do gym 548: `GET /setup/v1/gyms/548/products` → 1095 Outdoor / 1096 Virtual. |
| W5 | Informar à Wellhub a URL do webhook + o secret | 🟡 | Recomendação deles: **uma única URL** para check-in e booking. |
| W6 | Import do relatório de repasse do Portal do Parceiro | 🟡 | A Wellhub **não expõe financeiro por API** (confirmado). Conciliação é import manual/CSV contra os check-ins "a reconciliar". |
| W7 | **Booking API** (aluna reserva pelo app Wellhub) | ⚪ | Opcional. Janela de 15 min para confirmar/recusar por `PATCH`. Só faz sentido com a Agenda madura. |
| W8 | **Catalogar a aluna que vem pelo Wellhub** (nome, telefone, histórico) | 🟡 | A aluna Wellhub já é modelável como um `cliente` com `origem='wellhub'` + `gympass_id` (campo existe). Falta: o webhook de check-in **criar/enriquecer** esse registro e a ficha do cliente mostrar o histórico de check-ins. Casado com C1 (ficha 360°). |

---

## 4. Portal da Aluna

MVP funciona. As fases seguintes estão especificadas em
[04-PORTAL-ALUNA.md §12](04-PORTAL-ALUNA.md).

| # | Tarefa | Pri | Nota |
|---|---|---|---|
| A1 | Validar o MVP em uso real com alunas de verdade | 🟡 | Nunca foi usado fora de teste. Antes de construir V1. |
| A2 | Escolher o **gateway de pagamento** | 🟡 | Recomendação técnica: Asaas (PIX + cartão recorrente + boleto, BR-first, MEI simples). Falta confirmar taxa comercialmente. Arquitetura é agnóstica (`provider` + `provider_ref`). |
| A3 | Cobrança online: `formas_pagamento`, `cobrancas`, `iniciar_pagamento`, webhook | ⚪ | Hoje a aluna contrata e os créditos liberam na hora; o pagamento é combinado fora do app. Com gateway, `matricular()` passa a rodar **depois** da confirmação. |
| A4 | ~~Registrar um domínio próprio~~ | ✅ | **Feito.** `studiopolel.com.br`. |
| A5 | ~~Conta no Resend + 3 registros de DNS + chave de API~~ | ✅ | **Feito.** `RESEND_API_KEY` no cofre do Supabase; remetente `contato@studiopolel.com.br`. |
| A6 | ~~Edge Function de envio + varredura da fila~~ | ✅ | **Feito.** Function `enviar-emails` (ACTIVE, v6) varre `emails_fila` (status `pendente`) e envia pela Resend; `pg_cron` chama a function periodicamente via `net.http_post` (`20260724120000_cron_disparo_emails.sql`). Reenvio com backoff até 5 tentativas, depois marca `erro`. |
| A7 | Demais e-mails: boas-vindas, cobrança recusada, lembrete de aula | 🟡 | **Parcial.** `render()` em `enviar-emails/index.ts` já cobre `vaga_liberada`, `confirmacao_agendamento`, `lembrete_aula` e `vencimento`. Faltam `boas-vindas` e `cobrança recusada` (este último só faz sentido depois do gateway, A2/A3). |
| A8 | Central de comunicados | ⚪ | Tabelas `comunicados` / `comunicados_leitura` não existem. |
| A9 | PWA instalável + push | ⚪ | V3. |

**Já pronto:** modelo de ciclos, expiração de crédito, inadimplência bloqueando
agendamento, lista de espera inteira no banco (fila FIFO, reserva de 30 min
enforçada em `validar_vaga_agendamento()`, tela no portal) **e o pipeline de
e-mail transacional no ar** (domínio, Resend, Edge Function, cron) — vaga
liberada, confirmação de agendamento, lembrete de aula e vencimento de plano
já saem sozinhos. Falta só ampliar os tipos de e-mail (A7) e ligar o gateway
(A2/A3) para cobrança recusada fazer sentido.

---

## 10. Asaas — pesquisa comercial (21/07/2026)

Conta **gratuita**: sem mensalidade, sem adesão, R$50 de crédito na abertura.
MEI é atendido; precisa de CNPJ, CPF, endereço, telefone e selfie com
documento. Análise em até 2 dias úteis.

| Forma | Taxa | Numa mensalidade de R$200 |
|---|---|---|
| PIX | R$ 1,99 fixo | R$ 1,99 — **1,0%** |
| Boleto | R$ 1,99 fixo | R$ 1,99 — 1,0% |
| Cartão (assinatura) | R$ 0,49 + 2,99% | R$ 6,47 — **3,2%** |

Promoção de 3 meses para novos cadastros (boleto a R$0,99).

**A conta que decide:** com 50 alunas a R$200, cartão custa ~R$323/mês em taxas
e PIX ~R$100 — **R$2.700/ano** de diferença. O trade-off é que o cartão cobra
sozinho e o PIX exige a aluna pagar ativamente (mais trabalho de cobrança).
Sugestão: oferecer os dois com **PIX como padrão visível**.

**Não ligar** as notificações do próprio Asaas (R$0,99 por pacote de e-mail/SMS,
R$0,55 por WhatsApp) — o sistema manda os e-mails dele.

**Desenho da integração** (quando for implementar): assinatura mensal no Asaas
(semestral = a mesma assinatura limitada a 6 cobranças), cartão tokenizado lá
— nunca guardamos número de cartão. Tudo reativo a webhook:
`pagamento confirmado` → `renovar_ciclo()`; `vencido/recusado` →
`marcar_inadimplente()`; `assinatura cancelada` → encerra no fim do ciclo pago.
Segredo só na Edge Function (o repo é público).

---

## 5. Portal da Professora

Acabou de ser construído (21/07/2026) e **nunca rodou numa aula real**.

| # | Tarefa | Pri | Nota |
|---|---|---|---|
| P1 | Cadastrar e-mail das professoras reais e ativá-las | 🔴 | As 2 professoras no banco estão **`ativa = false` e sem e-mail** — nenhuma consegue criar acesso hoje. Depende de S1. |
| P2 | Testar a chamada numa aula de verdade | 🟡 | Marcar presença, marcar falta, incluir aluna que chegou sem agendar. |
| P3 | Conferir se o valor previsto bate com o que a equipe paga | 🟡 | A view calcula por aluna presente; validar contra o acerto real do mês. |
| P4 | Professora editar o próprio cadastro | ⚪ | Hoje o perfil dela é só leitura ("fale com a equipe"). |

---

## 6. Módulos ainda não construídos

| # | Módulo | Fase | Pri | Nota |
|---|---|---|---|---|
| M1 | ~~**Dashboard Executivo**~~ | 5 | ✅ | **Feito.** Rota `/` (`DashboardPage`): KPIs (faturamento do mês, teto MEI, saldo em caixa, alunos ativos — gestão; painel operacional diferente para secretária), alertas, receita por mês, ocupação da semana, resumo do funil, folha prevista, aniversariantes. Nota estava desatualizada — corrigida em 29/07. |
| M2 | Planejamento de Conteúdo | 6 | ⚪ | Placeholder. |
| M3 | Social Media | 6 | ⚪ | Placeholder. |
| M4 | ~~Tarefas~~ | 6 | ✅ | **Feito em 29/07** (antes deste levantamento). Módulo `/tarefas`: checklists de rotina (abertura/fechamento) + tarefas avulsas. |
| M5 | Investimentos | 6 | ⚪ | Placeholder. |
| M6 | Pró-labore | — | ⚪ | Atrás da flag `prolabore: false`. Ligar quando o negócio permitir. |
| M7 | ClassPass | — | ⚪ | Flag `classpass`. Enum e categoria financeira já existem. |
| M8 | **Análises (BI) v1** | — | ✅ | **Feito em 29/07/2026.** Central de Alertas + análise de horários/modalidade/professor, rota `/analises` (gestão + secretaria). Views novas (sem tabela nova): `fn_ocupacao_turma` (generaliza `vw_ocupacao_turma` para período arbitrário), `vw_ocupacao_turma_tendencia`, `vw_analise_modalidade`, `vw_analise_professora`, `vw_analise_resumo`, `vw_alertas` — tudo regra de limiar, sem ML. `tendencia='insuficiente'` evita conclusão forçada. **Extensão no mesmo dia:** `fn_evolucao_semanal` (gráfico de evolução com filtro 4/12/26/52 semanas), `acao_sugerida` em `vw_alertas`, Rankings (horários/modalidades/professoras/dias da semana, client-side) e filtro de modalidade/dia da semana em Horários. **Banco resetado a pedido (29/07):** todo o dado de teste foi apagado (`TRUNCATE` em clientes, turmas, professoras, planos, financeiro, funil etc. + as 3 contas de teste no Supabase Auth) — mantidos só `socias` e as configurações (`config_agendamento`/`config_financeiro`). Análises agora partem de zero real. Fora do escopo: Previsões (só com meses de dado real). |
| M9 | **Análises — Inteligência de Clientes** | — | ✅ | **Feito em 29/07/2026,** destravado pela ficha 360° (C1). `fn_analise_clientes_sumidos(p_dias)` (matrícula ativa/inadimplente sem aula há N dias, configurável na tela 14/20/30/45/60 — com botão "Entrar em contato" que abre `wa.me`), `vw_analise_clientes_risco` (score de limiar: queda de frequência, faltas, vencimento próximo, poucos créditos, sem interação → prioridade alta/média/baixa), `vw_analise_clientes_ranking` (maiores clientes por faturamento — **gestão-only** na UI, mesma trava `is_gestao()` das outras views financeiras). Sem tabela nova, sem ML. Fora do escopo: Previsões. |

---

## 7. Dívidas técnicas

| # | Item | Pri | Nota |
|---|---|---|---|
| T1 | **Sem nenhum teste automatizado** | 🟡 | Playwright está no `package.json` mas não há suíte nem script — foi usado para capturas de marketing. As regras críticas (vaga, crédito, RLS por papel) são validadas só à mão. |
| T2 | **Sem lint** | 🟡 | Não existe script `lint` nem ESLint configurado. |
| T3 | Histórico de migrations local ≠ remoto | 🟡 | Os arquivos em `supabase/migrations/` têm timestamps diferentes dos registrados no banco (ex.: local `20260719120000` vs remoto `20260719031136`). Funciona, mas confunde. |
| T4 | Supabase CLI não linkado | 🟡 | Sem `supabase/config.toml`. Migrations vão pelo MCP. Linkar daria `db push`, `db diff` e deploy de function pelo terminal — **pré-requisito prático do W1**. |
| T5 | Bundle único de 970 kB (271 kB gzip) | ⚪ | Os três portais vão no mesmo JS. Code-splitting por jornada resolveria; só importa quando a aluna abrir no 4G. |
| T6 | Dados de teste misturados com reais | ⚪ | Os 9 planos e 13 clientes no banco são de teste — os preços **não** são os reais. Limpar antes de operar de verdade. |

---

## 8. Decisões de produto

### Fechadas em 21/07/2026 (já implementadas)

| Decisão | Como ficou |
|---|---|
| Duas aulas no mesmo dia | Permitido, consome dois créditos |
| Tipo de plano | **Sempre por crédito** — "aulas por semana" foi abandonado |
| Mensal × semestral | Mesma mensalidade; semestral = 6 ciclos cobrados mês a mês |
| Crédito não usado | **Expira no fim do ciclo**, registrado como `expiracao` |
| Inadimplência | Ciclo não pago **bloqueia novos agendamentos na hora** |
| Cancelamento | 3h antes, com direito a remarcar |
| Lista de espera | Avisa a 1ª por e-mail e segura a vaga 30 min |
| Plano complemento Wellhub | É só um plano por crédito como os outros |

### Ainda em aberto

1. **Bonificações do semestral** — o que a aluna ganha por assinar 6 meses? Não definido.
2. **Preços reais** dos planos, para substituir os dados de teste.
3. **Asaas** — pesquisa comercial feita (ver §10); falta decidir e abrir a conta.

---

## 9. Ordem sugerida (revisada 29/07/2026)

Não é obrigação — é a sequência que destrava mais coisa com menos esforço.
A versão de 21/07 (domínio → e-mail → Dashboard) já foi cumprida por inteiro;
esta é a atualização pós-reset do banco.

1. **Recadastrar a grade real** (turmas, professoras com e-mail, salas,
   modalidades, planos com preço real) — pré-requisito prático para tudo virar
   a operar de verdade e para o módulo Análises parar de mostrar "dados
   insuficientes".
2. **S1** (confirmação de e-mail) → destrava **P1** → as professoras reais
   conseguem criar acesso e o portal delas sai do papel.
3. **W2** (cadastrar os secrets do Wellhub) → destrava **W5** → Wellhub vira
   fonte de receita rastreada de verdade (W1/W3/W4 já prontos e testados).
4. ~~**C1** → Inteligência de Clientes~~ — ✅ feito em 29/07 (ver M9).
5. **A1** (validar Portal da Aluna em uso real) → só então **A2** (decidir o
   gateway) e abrir a conta Asaas.
6. **S3b** (migrar policies operacionais para `is_operacional()`) — só quando
   for criar a primeira conta `social`.

O raciocínio: os três primeiros são pequenos e destravam trabalho **já feito
que está parado** — Wellhub pronto sobrando os secrets, professoras prontas
sobrando o e-mail. Os dois últimos dependem de decisão comercial (gateway) ou
de crescimento da equipe (conta social).

---

## 11. Frentes levantadas em 22/07/2026

| # | Frente | Pri | Estado / Nota |
|---|---|---|---|
| F1 | **Financeiro por período** (mês, trimestre, semestre, ano, faixa de/até) | — | ✅ **Feito em 22/07.** Seletor no topo do módulo; KPIs, listas (Entradas/Saídas) e gráficos agregam pelo intervalo. Saldo e MEI seguem sendo foto do "hoje"/ano-calendário. "Despesas pendentes" e o painel de recorrentes a pagar só aparecem em mês único (são ação do mês corrente). `src/modules/financeiro/periodo.ts`. |
| C1 | ~~**Clientes → ficha 360°**~~ | ✅ | **Feito.** `ClienteDetalhe` já une CRM + tempo de casa/marcos de fidelidade (24/07) + plano/créditos (`vw_saldo_creditos`) + próximas aulas (`agendamentos`+`turmas`+`vw_professoras_nomes`) — comentário no código já diz "Ficha 360°". **Completado em 29/07:** seção **Pagamentos** (últimas 10 `entradas_financeiras` do cliente, **gestão-only** — dado financeiro, mesma trava `is_gestao()`) e badge de **acesso ao portal** (existe linha em `contas_aluna`?). Terminologia no masculino e abertura padrão na Lista já estavam feitos. Só resta, se um dia fizer sentido: histórico de matrículas encerradas (hoje só mostra ativa/inadimplente) e o vínculo com a catalogação da aluna Wellhub (W8, ainda não feito). |
| CO1 | **WhatsApp Business API** — secretária + mais pessoas respondem o mesmo número | 🟡 | ✅ **Estudo feito em 22/07** ([docs/06-WHATSAPP.md](06-WHATSAPP.md)). Achado-chave: **responder cliente é grátis** na Meta; o custo é o *software de caixa de entrada*. 3 caminhos: (1) App Business + dispositivos vinculados — grátis, até 5 pessoas, sem atribuição/integração; (2) plataforma terceira — R$200–1.200/mês, multi-atendente pronto, sistema à parte; (3) construir no ERP via Cloud API — sem mensalidade, integração nativa (histórico do cliente, lembretes da Agenda), precisa dev + número dedicado. **Decisão (22/07):** construir no ERP (caminho 3). **Build pausado** a pedido — retomar quando houver conta Meta + número dedicado. Falta então: migration (wa_conversas/wa_mensagens), caixa de entrada na tela, Edge Functions webhook/send. Preço da Meta muda ago/out 2026. |
| AG1 | **Agenda: salas, modalidades e grade estilo calendário** | — | ✅ **Feito em 22/07.** Tabelas `salas` e `modalidades` (seed: Sala 1/2 e as 15 modalidades), `turmas.sala_id`/`modalidade_id` (texto mantido p/ compat). Grade nova estilo calendário (eixo hora × dia, cartões coloridos por modalidade, sala visível). Form de turma com modalidade em dropdown (+ criar nova) e sala obrigatória; ações criar/editar/duplicar/excluir. Existentes foram para a Sala 1. |
| PR1 | **Professoras: remuneração flexível** | — | ✅ **Feito em 22/07.** `professoras.modelo` (por_aluna/por_hora/fixo) + campos: `piso_uma_aluna`, `valor_dia_sem_alunas`, `valor_hora`, `valor_fixo_mes`, `valor_passagem_dia`, `percentual_passagem`. `vw_pagamento_professoras` recalcula pelo modelo (pisos, hora, fixo, passagem por dia trabalhado). UI: botão **Remuneração** por professora. Validado: 1 aluna → piso R$50 + passagem 70%. Workshop entra como ajuste manual no fechamento. PII do contrato **não** entrou no repo. |
| PR2 | **Fechamento mensal de professoras (folha)** | — | ✅ **Feito em 22/07.** Módulo **Fechamento** (gestão-only, `#/fechamento`). Tabelas `fechamentos_professora` + `fechamento_ajustes`. Folha do mês por professora (aulas, horas, alunos, bruto, ajustes, final, status) + total; painel de detalhe com ajustes manuais (bônus/desconto/falta/substituição/reposição/passagem/workshop) que recalculam o final; **Aprovar** congela o snapshot; **Reabrir**; **Lançar no Financeiro** (evita duplicar). Aba **Histórico** com filtro professora/ano. ⚠️ pendências: pagamento auto no dia 15, e o "R$75/dia cheio de falta" é por-aula (aproximação). |
