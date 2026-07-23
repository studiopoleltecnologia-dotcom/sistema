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

Dados no banco hoje: 13 clientes, 9 planos, 5 turmas ativas, 5 matrículas,
22 entradas e 14 saídas financeiras, 5 follow-ups. É volume de teste, não
operação real.

---

## 2. Segurança & acesso

| # | Tarefa | Pri | Nota |
|---|---|---|---|
| S1 | **Ativar confirmação de e-mail** no Supabase Auth | 🔴 | O convite da professora depende disso: sem confirmação, quem souber o e-mail dela cria a conta dela. Toggle no painel, não é código. |
| S2 | **Ligar proteção contra senha vazada** (HaveIBeenPwned) | 🟡 | Apontado pelo linter do Supabase. Também é toggle. |
| S3 | ~~Trava do Financeiro só para a gestão~~ | ✅ | **Feito em 21/07/2026 (M8).** Funções internas gestao/secretaria/social; Financeiro trancado no banco por `is_gestao()`; painel e menu escondem dinheiro de não-gestão; `professoras` gestão-only. MFA vira reforço opcional, não bloqueia. |
| S3b | **Migrar policies operacionais para `is_operacional()`** antes de criar conta `social` | 🔴 (quando for criar social) | Hoje operação usa `is_socia()` (qualquer conta interna). Correto enquanto só há gestao/secretaria. Uma conta social herdaria a operação — migrar antes. Sem conta social, sem vazamento. **Junto disto:** as RPCs `matricular`/`renovar_ciclo`/`marcar_inadimplente` (SECURITY DEFINER, compartilhadas com o portal do aluno) precisam de guarda `is_gestao()` interna — hoje travadas só na UI (ver S6). |
| S4 | ~~Tela para provisionar acessos internos~~ | ✅ | **Feito em 21/07/2026 (M9).** Tela **Equipe & Acessos** (gestão): convida por e-mail + função, muda função, remove. `convidar_equipe` promove na hora se já existe login, senão deixa convite que o signup consome. Protege a última gestão de se auto-remover. Falta a equipe real ser cadastrada (dado, não código). |
| S5 | Revisar as 3 views *definer* apontadas pelo linter | ⚪ | `vw_grade_publica`, `vw_vagas_turma`, `vw_alunas_da_aula`. São deliberadas e autofiltradas no `WHERE` — item é documentar a exceção, não "corrigir". |
| S6 | ~~Agenda→Config e Planos: refinar acesso dentro do módulo~~ | ✅ | **Feito em 22/07/2026.** Aba **Config** da Agenda só gestão (UI + RLS em `config_agendamento`). **Planos**: operação vê, só gestão cria/edita/matricula/renova/inadimple (UI + escrita de `planos` por `is_gestao()`). As ações de matrícula ficam travadas **só na UI** — reforço no banco depende de S3b. |

---

## 3. Wellhub

Contexto técnico completo em [CLAUDE.md §12](../CLAUDE.md#12-integração-wellhub-gympass--requisitos-técnicos).
O que existe: a Edge Function `wellhub-webhook` escrita no repo e a RPC
`conciliar_wellhub` funcionando. O que **não** existe: qualquer coisa publicada.

| # | Tarefa | Pri | Nota |
|---|---|---|---|
| W1 | **Publicar a Edge Function** `wellhub-webhook` | 🔴 | `list_edge_functions` no projeto devolve **vazio**. O código nunca foi para o ar — nada do resto funciona antes disto. |
| W2 | Cadastrar os secrets: `WELLHUB_WEBHOOK_SECRET`, `WELLHUB_CLIENT_ID`, `WELLHUB_CLIENT_SECRET` | 🔴 | Via `supabase secrets set`, nunca no repo (é público). O secret do `X-Gympass-Signature` é **gerado por nós** e informado à Wellhub. |
| W3 | Implementar a chamada à **Access Control API** (`POST /access/v1/validate`) | 🔴 | É o `TODO` em [wellhub-webhook/index.ts:138](../supabase/functions/wellhub-webhook/index.ts#L138). **É essa chamada que origina o repasse** — sem ela o check-in entra no sistema mas o estúdio não recebe. Precisa de token OAuth client-credentials. |
| W4 | Testar ponta a ponta no **sandbox** (`gym_id` 548) | 🟡 | Credenciais de sandbox já recebidas por e-mail (jul/2026). |
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
| A4 | **Registrar um domínio próprio** (`registro.br`, ~R$40/ano) | 🔴 | Virou bloqueante: sem domínio não há e-mail, e sem e-mail a lista de espera não avisa ninguém. Bônus: tira o site de `github.io`. |
| A5 | Conta no Resend + 3 registros de DNS + chave de API | 🔴 | Grátis até 3.000 e-mails/mês — muito acima do uso previsto (~300). Depende de A4. |
| A6 | Edge Function de envio + varredura da fila | 🔴 | A fila já marca quem avisar (`lista_espera.email_enviado_em` nulo = pendente). Falta só enviar. Depende de A5. |
| A7 | Demais e-mails: boas-vindas, cobrança recusada, lembrete de aula | 🟡 | Mesma infra de A6. |
| A8 | Central de comunicados | ⚪ | Tabelas `comunicados` / `comunicados_leitura` não existem. |
| A9 | PWA instalável + push | ⚪ | V3. |

**Já pronto (21/07/2026):** modelo de ciclos, expiração de crédito,
inadimplência bloqueando agendamento, e a lista de espera inteira no banco
(fila FIFO, reserva de 30 min enforçada em `validar_vaga_agendamento()`, tela
no portal). Falta só o e-mail avisar — A4 a A6.

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
| M1 | **Dashboard Executivo** | 5 | 🟡 | Placeholder na rota `/`. É a primeira tela que a equipe vê ao entrar — hoje está vazia. Dados já existem (financeiro, presença, funil). |
| M2 | Planejamento de Conteúdo | 6 | ⚪ | Placeholder. |
| M3 | Social Media | 6 | ⚪ | Placeholder. |
| M4 | Tarefas | 6 | ⚪ | Placeholder. |
| M5 | Investimentos | 6 | ⚪ | Placeholder. |
| M6 | Pró-labore | — | ⚪ | Atrás da flag `prolabore: false`. Ligar quando o negócio permitir. |
| M7 | ClassPass | — | ⚪ | Flag `classpass`. Enum e categoria financeira já existem. |

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

## 9. Ordem sugerida

Não é obrigação — é a sequência que destrava mais coisa com menos esforço:

1. **A4** (registrar o domínio) → destrava **A5/A6** → a lista de espera, que já
   está construída, passa a avisar de verdade.
2. **S1** (confirmação de e-mail) → destrava **P1** → o portal da professora sai
   do papel.
3. **T4** (linkar CLI) → destrava **W1/W2/W3** → Wellhub começa a gerar receita
   rastreada.
4. **M1** (Dashboard) → a equipe passa a *ver* o sistema que já existe.
5. **S3** (MFA no Financeiro) → fecha o pedido de acesso restrito à gestão.
6. **A1** (validar Portal da Aluna em uso real) → só então abrir a conta Asaas.

O raciocínio: os três primeiros são pequenos e destravam trabalho **já feito que
está parado** — fila de espera, portal da professora e Wellhub. O quarto dá
visibilidade ao que já existe. Os dois últimos são o próximo salto de escopo.

---

## 11. Frentes levantadas em 22/07/2026

| # | Frente | Pri | Estado / Nota |
|---|---|---|---|
| F1 | **Financeiro por período** (mês, trimestre, semestre, ano, faixa de/até) | — | ✅ **Feito em 22/07.** Seletor no topo do módulo; KPIs, listas (Entradas/Saídas) e gráficos agregam pelo intervalo. Saldo e MEI seguem sendo foto do "hoje"/ano-calendário. "Despesas pendentes" e o painel de recorrentes a pagar só aparecem em mês único (são ação do mês corrente). `src/modules/financeiro/periodo.ts`. |
| C1 | **Clientes → ficha 360°** — unir plano, créditos, pagamento e próximas aulas ao CRM numa tela só | 🟡 | Hoje a mesma pessoa vive em 4 tabelas (`clientes`, `matriculas`, `agendamentos`, `contas_aluna`) e a ficha (`ClienteDetalhe`) só mostra o CRM. É o que a Carol sente como "estranho/mal estruturado". Também define onde a aluna Wellhub (W8) é catalogada. Terminologia no masculino ("aluno"). Abrir por padrão na **Lista** (roster) em vez do Funil pode ajudar. |
| CO1 | **WhatsApp Business API** — secretária + mais pessoas respondem o mesmo número | 🟡 | ✅ **Estudo feito em 22/07** ([docs/06-WHATSAPP.md](06-WHATSAPP.md)). Achado-chave: **responder cliente é grátis** na Meta; o custo é o *software de caixa de entrada*. 3 caminhos: (1) App Business + dispositivos vinculados — grátis, até 5 pessoas, sem atribuição/integração; (2) plataforma terceira — R$200–1.200/mês, multi-atendente pronto, sistema à parte; (3) construir no ERP via Cloud API — sem mensalidade, integração nativa (histórico do cliente, lembretes da Agenda), precisa dev + número dedicado. **Decisão (22/07):** construir no ERP (caminho 3). **Build pausado** a pedido — retomar quando houver conta Meta + número dedicado. Falta então: migration (wa_conversas/wa_mensagens), caixa de entrada na tela, Edge Functions webhook/send. Preço da Meta muda ago/out 2026. |
| AG1 | **Agenda: salas, modalidades e grade estilo calendário** | — | ✅ **Feito em 22/07.** Tabelas `salas` e `modalidades` (seed: Sala 1/2 e as 15 modalidades), `turmas.sala_id`/`modalidade_id` (texto mantido p/ compat). Grade nova estilo calendário (eixo hora × dia, cartões coloridos por modalidade, sala visível). Form de turma com modalidade em dropdown (+ criar nova) e sala obrigatória; ações criar/editar/duplicar/excluir. Existentes foram para a Sala 1. |
| PR1 | **Professoras: remuneração flexível** | — | ✅ **Feito em 22/07.** `professoras.modelo` (por_aluna/por_hora/fixo) + campos: `piso_uma_aluna`, `valor_dia_sem_alunas`, `valor_hora`, `valor_fixo_mes`, `valor_passagem_dia`, `percentual_passagem`. `vw_pagamento_professoras` recalcula pelo modelo (pisos, hora, fixo, passagem por dia trabalhado). UI: botão **Remuneração** por professora. Validado: 1 aluna → piso R$50 + passagem 70%. Workshop entra como ajuste manual no fechamento. PII do contrato **não** entrou no repo. |
| PR2 | **Fechamento mensal de professoras (folha)** | — | ✅ **Feito em 22/07.** Módulo **Fechamento** (gestão-only, `#/fechamento`). Tabelas `fechamentos_professora` + `fechamento_ajustes`. Folha do mês por professora (aulas, horas, alunos, bruto, ajustes, final, status) + total; painel de detalhe com ajustes manuais (bônus/desconto/falta/substituição/reposição/passagem/workshop) que recalculam o final; **Aprovar** congela o snapshot; **Reabrir**; **Lançar no Financeiro** (evita duplicar). Aba **Histórico** com filtro professora/ano. ⚠️ pendências: pagamento auto no dia 15, e o "R$75/dia cheio de falta" é por-aula (aproximação). |
