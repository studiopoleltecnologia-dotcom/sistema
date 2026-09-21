# 05 — Backlog & Visão Geral

Levantamento único de tudo que está pendente no sistema. Revisão de
**21/09/2026**, feita contra o estado real: repositório, banco de produção
(`fgvxhwpqsxohqrccrlfn`), logs das Edge Functions e o site no ar — não de
memória. A revisão anterior (22/08) tinha envelhecido a ponto de induzir a erro.

Legenda de prioridade:
🔴 **bloqueia** o go-live · 🟡 **próximo** · ⚪ **depois**

Legenda de natureza — quem resolve muda tudo:
💻 **código** · 📋 **cadastro/dado** · 🔀 **decisão de negócio** · ⚙️ **painel/config externa**

---

## 1. Onde o sistema está hoje

| Bloco | Estado |
|---|---|
| Fase 0 — Fundação (repo, Auth, deploy Actions→Pages, design system, flags) | ✅ pronto |
| Fase 1 — Clientes + CRM | ✅ pronto |
| Fase 2 — Financeiro + MEI | ✅ pronto |
| Fase 3 — Follow-up (`pg_cron` diário rodando) | ✅ pronto |
| Fase 4 — Agenda & Presença + Professoras + Produtos | ✅ pronto |
| Fase 5 — Dashboard Executivo | ✅ pronto |
| Análises (BI) + Inteligência de Clientes | ✅ pronto |
| Fechamento de professoras (folha) | ✅ pronto |
| Portal do Aluno — MVP | ✅ pronto, **nunca usado por aluno real** |
| Portal da Professora (`/portalequipe`) | ✅ pronto, **nunca usado em aula real** |
| Fase 6 — Conteúdo, Social, Investimentos | ❌ placeholder |
| Wellhub | ⚠️ publicado, **parado por falta de secrets** |
| Reservas e grade | ⚠️ **ainda rodando no Wix** |

**O sistema já está no ar.** `sistema.studiopolel.com.br` responde, `develop` e
`main` estão iguais, não há PR aberto, o build passa limpo e os 7 crons rodam.
O que falta não é software: é a operação real entrar nele.

### 1.1 As URLs de produção

A jornada é decidida em `jornadaAtual()` (`src/App.tsx`), nesta ordem:
**hostname → caminho → hash**. Cada caminho tem `index.html` próprio no build
(`deploy.yml`), porque o GitHub Pages não faz rewrite de SPA. O hash antigo
(`#/portal`, `#/prof`) só continua reconhecido para não quebrar favorito
salvo; `/portal` hoje dá **404**.

| Portal | URL |
|---|---|
| Interno (equipe) | `sistema.studiopolel.com.br/` |
| Aluno | `aluno.studiopolel.com.br/` — **qualquer caminho** |
| Aluno (endereço antigo, segue valendo) | `sistema.studiopolel.com.br/agendamentos/` |
| Professora | `sistema.studiopolel.com.br/portalequipe/` |

O aluno ganhou **domínio próprio** em 21/09: no host dele o ERP não existe,
nem digitando a URL. Quem chegar na tela da equipe com conta de aluno ou
professora é levado para o portal certo em vez de ver "peça para a gestão
liberar o seu e-mail". O endereço antigo não tem prazo para sair — é o que
está salvo no celular das alunas.

⚠️ **Pendente de configuração** (código pronto, PR mergeada): criar o repo de
hospedagem, o token, o registro de DNS no Registro.br e liberar o endereço no
Supabase Auth. Passo a passo em
[docs/interno/dominio-portal-aluno.md](interno/dominio-portal-aluno.md).
Enquanto não for feito, o deploy publica só o site da gestão, com aviso no
log, e tudo segue funcionando no endereço antigo.

### 1.2 Dados em produção (depois da limpeza de 21/09)

A pedido da gestão, todo o dado operacional de teste foi apagado em 21/09 —
clientes, CRM, funil, agendamentos, presenças, créditos, matrículas, turmas,
lista de espera, suspensões e inscrições de evento. **Backup em JSON foi tirado
antes** (fora do repo, que é público).

| Preservado | Zerado |
|---|---|
| Financeiro inteiro (entradas, saídas, dívidas, recorrentes, config) | Clientes, CRM, funil, follow-ups |
| 19 produtos com os **preços reais** de set/2026 | Agendamentos, presenças, matrículas, créditos |
| 9 professoras, 2 salas, 13 modalidades | Turmas (serão substituídas pela grade do Wix) |
| 4 contas de equipe + configurações | Inscrições de evento |

---

## 2. Bloqueadores do go-live

| # | Tarefa | Nat. | Nota |
|---|---|---|---|
| G1 | **Completar o cadastro das professoras** | 📋 | Nenhuma das 11 tem e-mail — sem isso ninguém cria acesso, e o convite é o e-mail do signup casar com o cadastro. **Joanne Vênus e Leticia Lemos** entraram em 21/09 pela migration, a pedido da gestão, **sem contato de emergência e com remuneração zerada**: as duas aparecem como pendência na tela e precisam ser completadas antes do primeiro fechamento de folha. |
| G2 | **Dar acesso aos alunos** | 📋💻 | `contas_aluna` = 0. Depende do import do Wix (§3) para existir quem convidar. |
| G3 | **Cutover do Wix** | 💻📋 | A operação continua lá. Capítulo próprio em §3. |
| G4 | ~~Prazo de cancelamento divergente~~ | ✅ | **Feito em 21/09.** Produção estava em 3h e o Wix em 240 min. Agora os dois em **4h**, valor confirmado pela gestão. DEV já estava em 4h. |
| G5 | **Secrets do Wellhub em produção** | ⚙️ | Em andamento. Detalhe em §4 (W2) — hoje falha todo dia às 06:00. |
| G6 | **Ativar o domínio `aluno.studiopolel.com.br`** | ⚙️ | **Código já em produção (21/09); falta só configuração no navegador**, e a gestão pediu para deixar para depois. São 7 passos: repo `portal-aluno`, token, secret `PAGES_PORTAL_ALUNO_TOKEN` no ambiente Production, rodar o deploy, ligar o Pages, CNAME no Registro.br e Redirect URL no Supabase Auth. Passo a passo com os valores exatos em [interno/dominio-portal-aluno.md](interno/dominio-portal-aluno.md). Enquanto não for feito, o deploy pula o passo com aviso e tudo segue em `/agendamentos/`. O passo mais fácil de esquecer é o do Supabase: sem ele o link de "esqueci minha senha" devolve o aluno para o domínio da gestão. |

---

## 3. Cutover do Wix — o trabalho de verdade

Hoje a grade, as reservas, os planos e o check-in vivem no **Wix Bookings**.
O ERP tem tudo isso implementado, mas vazio. Este capítulo é novo nesta revisão
e não existia como plano escrito em lugar nenhum.

**Decisão de 21/09:** o Wix continua operando por enquanto. O ERP é populado a
partir dele, num caminho só, até a virada.

| # | Tarefa | Pri | Nat. | Nota |
|---|---|---|---|---|
| X1 | **Gerar uma API key do Wix** | 🔴 | ⚙️ | `manage.wix.com` → Configurações → **Chaves de API** → criar chave com permissão de leitura em **Bookings**, **Pricing Plans**, **Contatos** e **Membros**. Guardar a chave + o **Account ID** fora do repo (o repo é público). Sem ela, todo import é manual. |
| X2 | ~~Script de import~~ | ✅ | 💻 | **Feito em 21/09.** `scripts/importar-wix-alunos.mjs` (CSV de import) e `scripts/relatorio-wix-planos.mjs` (relatório para a gestão conferir e falar com cada aluno). Levantados: 147 pessoas com plano ativo — 80 Wellhub, 34 TotalPass, 47 mensalistas. |
| X3 | ~~Grade de 2 salas~~ | ✅ | 💻 | **Feito em 21/09** (`20260921140000` + `20260921160000`): 45 aulas com sala, capacidade e professora. A sala **não vem do Wix** (endereço único, sem campo de sala) — é a regra por modalidade da gestão, verificada contra a grade inteira sem nenhuma sobreposição. 35 na Sala 1 · Pole, 10 na Sala 2 · Multi. |
| X4 | ~~Conciliar o catálogo~~ | ✅ | 🔀 | **Resolvido em 21/09.** Os 13 planos do Wix com gente ativa viraram produto legado (`20260921130000`): fora do catálogo do aluno, renovação preservada, preço herdado por matrícula. Dança do Ventre e Hatha Yoga entram como **turma fixa**, não crédito. Trimestral 2x/3x/4x e pacotes de 5/8/10 aulas não têm ninguém ativo e não foram criados. |
| X5 | **TotalPass como canal próprio** | 🟡 | 💻 | **Decidido em 21/09.** Há planos TotalPass ativos no Wix e o ERP só conhece `wellhub`/`classpass`. Migration nova no enum de canal/origem + categoria financeira + receita "a reconciliar", no mesmo molde do Wellhub. |
| X6 | **Plano da virada** | 🟡 | 🔀 | Data do corte, o que fazer com reservas já feitas no Wix para depois da data, e o aviso aos alunos. Enquanto os dois coexistirem, **mudança de horário tem que ser feita nos dois lugares**. |
| X7 | Desligar o Wix Bookings e redirecionar os links | ⚪ | ⚙️ | Só depois de X6 validado. |
| X8 | **Importar o preço REAL, não o de tabela** | 🔴 | 💻 | Descoberto em 21/09 ao responder a gestão. O Wix tem **cupom por pedido**: `planPrice` é o preço de tabela e `pricing.prices[0].price.total` é o que a pessoa paga. Hoje **4 pedidos ativos divergem** — um Trimestral 1x pagando **R$128** com o cupom `promo1` (tabela R$160), dois `Pacotes - 4 Aulas` zerados pelo `casinha100` e uma Aula Avulsa zerada. `matriculas.preco_contratado_centavos` tem que receber o valor **pago**; herdar o de tabela cobraria a mais de quem tem desconto. O relatório já foi corrigido (colunas **Valor que paga** / **Valor de tabela** / **Cupom**); falta o `importar-wix-alunos.mjs`. |
| X9 | **Preço do compromisso vale até o fim do compromisso** | 🔴 | 📋💻 | Quem está em plano **Trimestral/Semestral** contratou a mensalidade N vezes — o preço antigo vale até o último ciclo, mesmo que o reajuste entre no meio. O modelo já suporta (`preco_contratado_centavos` é congelado e `renovar_ciclo()` nunca relê `produtos.preco_centavos`); o que falta é **importar com a data certa**. Hoje são 5 pessoas: 2 Semestrais 1x (R$155, ciclo 6/6, terminam 09/10 e 11/10), 1 Semestral 2x (R$280, ciclo 5/6, termina 06/11), 2 Trimestrais 1x (uma no ciclo 1/3 até 28/11, outra no 3/3 até 09/10 pagando R$128). **Três delas acabam em outubro** — decidir antes se renovam no preço novo. |

---

## 4. Wellhub

Contexto técnico em [CLAUDE.md §12](../CLAUDE.md#12-integração-wellhub-gympass--requisitos-técnicos).
Código pronto e publicado; o que falta é configuração e certificação.

| # | Tarefa | Pri | Nat. | Nota |
|---|---|---|---|---|
| W1 | ~~Publicar a Edge Function~~ | ✅ | | No ar. `GET` devolve 405, `POST` sem assinatura devolve 401. |
| W2 | **Secrets em produção** | 🔴 | ⚙️ | Em andamento. **Falha medida:** `wellhub-publicar-grade` devolve **HTTP 500 todo dia às 06:00** desde que entrou no ar — é a guarda de `WELLHUB_API_TOKEN`/`GYM_ID`/`DEFAULT_PRODUCT_ID` ausentes. 0 slots publicados. Passo a passo em [docs/interno/runbook-producao-wellhub.md](interno/runbook-producao-wellhub.md) §2. |
| W3 | ~~Access Control API (`validate`)~~ | ✅ | | Implementado e testado no sandbox. |
| W4 | ~~E2E no sandbox (gym 548)~~ | ✅ | | Verde em 25/07. |
| W5 | **Informar URL do webhook + secret à Wellhub** | 🟡 | ⚙️ | Em andamento. Recomendação deles: **uma única URL** para check-in e booking. |
| W6 | **Import do relatório de repasse** | 🟡 | 💻 | Em andamento. A Wellhub **não** expõe financeiro por API — é CSV do Portal do Parceiro contra os check-ins "a reconciliar". |
| W7 | **Booking API** (Class/Slot) | 🟡 | 💻 | Código escrito (`20260823100000` + `wellhub-publicar-grade`), parado junto com W2. É o fim estrutural da ambiguidade de turma (§9.7 do CLAUDE.md). Depende de X3: sem grade em `turmas`, não há o que publicar. |
| W8 | **Catalogar o aluno que vem pelo Wellhub** | 🟡 | 💻 | Em andamento. O webhook deve criar/enriquecer o `cliente` com `origem='wellhub'` + `gympass_id`. |
| W9 | **Attendance Trigger** | 🔴 | 💻 | Em andamento. A Wellhub exige **dois** modelos e um deles obrigatoriamente o Automated; temos só o Automated. O Attendance encaixa onde já existe marcação de presença (`resolver_checkin_pendente` e o portal da professora), chamando o `validate`. **É pré-requisito de certificação, não melhoria.** |

---

## 5. Segurança & acesso

| # | Tarefa | Pri | Nat. | Nota |
|---|---|---|---|---|
| S1 | ~~Confirmação de e-mail no Auth~~ | ✅ | | Os 5 logins de produção foram confirmados 1–2 min depois de criados, o que só acontece com a confirmação ligada. Vale um olhar no painel antes de convidar professora. |
| S2 | **Ligar proteção contra senha vazada** | 🟡 | ⚙️ | Único item de Auth que o Advisor ainda aponta. Painel do Supabase → **Authentication** → **Policies** (ou *Sign In / Providers* → Email) → ligar **Leaked password protection** (checa o HaveIBeenPwned no cadastro e na troca de senha). É toggle, não tem código. |
| S3 | ~~Trava do Financeiro só para a gestão~~ | ✅ | | M8, 21/07. `is_gestao()` no banco. |
| S3b | **Policies operacionais em `is_operacional()`** | 🔴 *(quando criar conta `social`)* | 💻 | Hoje a operação usa `is_socia()` — correto enquanto só existem gestao/secretaria. Uma conta `social` herdaria a operação inteira. **Junto disto:** as RPCs `matricular`/`renovar_ciclo`/`marcar_inadimplente` precisam de guarda `is_gestao()` interna — hoje travadas só na UI. |
| S4 | ~~Tela de acessos internos~~ | ✅ | | M9, 21/07. **Equipe & Acessos**. |
| S5 | ~~`auth_users_exposed` em `vw_equipe`~~ | ✅ | | 22/08. |
| S6 | ~~Acesso dentro de Agenda→Config e Produtos~~ | ✅ | | 22/07. |
| S7 | ~~Escalação de privilégio via `UPDATE` em `socias`~~ | ✅ | | 22/08. |
| S8 | Trocar `"socias veem socias"` de `is_socia()` para `is_gestao()` | ⚪ | 💻 | Risco residual aceito: qualquer conta interna que consultar `socias` direto vê o e-mail de toda a equipe. Fechar exige auditar quem lê `socias` fora de `vw_equipe`. |
| S9 | Converter as 6 views `security_definer_view` em funções | ⚪ | 💻 | É o único jeito de zerar esse lint (o Advisor varre views, não funções). ~1–2 dias. Todas as 6 estão documentadas em `comment on view` explicando por que são *definer* — inclusive `vw_matricula_turmas`, que entrou depois. Não é dívida escondida, é decisão registrada. |
| S10 | ~~Funções de trigger publicadas como RPC~~ | ✅ | 💻 | **Feito em 21/09**, em duas tentativas. A `20260921120000` revogava de `anon, authenticated` e **não fez nada**: quem tinha o privilégio era `PUBLIC` (padrão do Postgres para toda função nova), e revogar de quem nunca teve é no-op silencioso — o Advisor continuou com os 4 achados. A `20260921170000` revoga de PUBLIC nas 15 funções de gatilho, que é onde o privilégio estava. As RPCs reais têm grant explícito e não foram tocadas. ⚠️ A próxima função de gatilho vai nascer com o mesmo grant: a trava definitiva (`alter default privileges`) pegaria também as RPCs novas, que parariam de funcionar caladas. |
| S11 | `pg_net` instalado no schema `public` | ⚪ | 💻 | Aviso do Advisor. Mover extensão de schema é operação de risco com o `pg_cron` em produção chamando `net.http_post`. Aceito por ora. |
| S12 | **MFA (`aal2`) sobre o Financeiro** | ⚪ | 💻 | Sempre foi reforço **extra** sobre a trava de S3, não a trava em si. Não implementado, não bloqueia. |

---

## 6. Portal do Aluno

Especificação das fases em [04-PORTAL-ALUNA.md §12](04-PORTAL-ALUNA.md).

| # | Tarefa | Pri | Nat. | Nota |
|---|---|---|---|---|
| A1 | **Validar o MVP em uso real** | 🔴 | 📋 | Nunca saiu de teste. Depende de G2. |
| A2 | **Abrir a conta no gateway (Asaas)** | 🟡 | 🔀⚙️ | **Decidido em 21/09: vamos configurar.** Passo a passo em §11. |
| A3 | **Cobrança online no sistema** | 🟡 | 💻 | Depende de A2. Desenho em §11.2. |
| A4 | ~~Domínio próprio~~ | ✅ | | `studiopolel.com.br`. |
| A5 | ~~Resend + DNS~~ | ✅ | | Remetente `contato@studiopolel.com.br`. |
| A6 | ~~Edge Function de envio + cron~~ | ✅ | | `enviar-emails`, roda a cada 2 min, HTTP 200. |
| A7 | **E-mails faltantes** | 🟡 | 💻 | Em andamento. Prontos: `vaga_liberada`, `confirmacao_agendamento`, `lembrete_aula`, `vencimento`. Faltam **boas-vindas** e **cobrança recusada** (este só faz sentido depois de A3). |
| A8 | **Central de Comunicados** | 🟡 | 💻 | **Decidido em 21/09: criar.** Especificação em §12. |
| A9 | PWA instalável + push | ⚪ | 💻 | V3. |
| A10 | **Desconto da experimental na 1ª mensalidade** | 🟡 | 💻 | **Não existe no sistema hoje** — levantado pela gestão em 21/09. A regra é: quem comprou a experimental e fecha plano em até 7 dias abate o valor dela na primeira mensalidade. O modelo atual não expressa isso: `matriculas.preco_contratado_centavos` é **um** valor usado em **todos** os ciclos (`gerar_cobranca_prevista` não sabe diferenciar o ciclo 1). Desenho em §6.1. |

### 6.1 Desconto da experimental na 1ª mensalidade (A10)

**Regra do negócio:** quem compra a aula experimental e fecha plano em até
7 dias abate o valor dela na primeira mensalidade.

**Por que não dá para fazer sem mexer no banco.** `matriculas.preco_
contratado_centavos` é **um** valor, congelado na contratação, e
`gerar_cobranca_prevista()` usa o mesmo em **todos** os ciclos. Não existe
onde escrever "o primeiro ciclo custa menos". Baixar o preço contratado
resolveria o mês 1 e daria desconto **para sempre** — o oposto do combinado.

**Desenho proposto** (3 peças, nenhuma delas grande):

1. **`regras_desconto`** — tabela configurável pela gestão, no espírito do
   §9.4 do CLAUDE.md ("regras manipuláveis pelas administradoras, não fixas
   em código"): produto de origem (a experimental), produto de destino (nulo
   = qualquer plano), `janela_dias`, e o tipo do abatimento — *o que ela
   pagou na origem*, valor fixo ou percentual. Muda a promoção sem migration.
2. **`matriculas.desconto_primeiro_ciclo_centavos`** (+ a compra que o
   originou, para auditoria). `matricular()` resolve a regra na hora da
   contratação e **congela** o valor ali — mesma filosofia do preço
   contratado: promoção que mudar depois não altera matrícula já feita, e a
   fatura consegue dizer *por que* saiu mais barata.
3. **`gerar_cobranca_prevista()`** desconta quando `p_ciclo = 1`, com piso em
   zero.

**Decisões que faltam** — são de negócio, não de código:

- **Os 7 dias contam da COMPRA ou da AULA feita?** Recomendação: da **aula**.
  A pessoa pode comprar numa segunda e treinar no sábado; o gatilho comercial
  é ter experimentado, e o funil já registra `fez_experimental`.
- **Vale para "2 aulas experimentais" (R$70)?** Se valer, o abatimento é o que
  ela pagou de fato, não um valor fixo.
- **Experimental de cortesia (R$0)** abate zero — sem efeito, e é o correto.
- **Num plano semestral**, o abatimento é só na 1ª das 6 mensalidades.
- **Cancelou no 1º ciclo:** o desconto foi usado, não volta.

⚠️ **Isto não é um caso isolado.** O Wix já opera com cupom (`promo1`,
`casinha100` — ver X8), então o sistema vai precisar de um conceito de
desconto de qualquer forma. Vale construir A10 como *a primeira regra* de um
mecanismo geral, e não como um `if` de experimental.

---

## 7. Portal da Professora

| # | Tarefa | Pri | Nat. | Nota |
|---|---|---|---|---|
| P1 | **E-mail das professoras** | 🔴 | 📋 | Mesmo item que G1. |
| P2 | **Testar a chamada numa aula real** | 🟡 | 📋 | Marcar presença, marcar falta, incluir aluno que chegou sem agendar. |
| P3 | **Conferir o valor previsto contra o acerto real** | 🟡 | 📋 | A view calcula por aluno presente e pelo modelo de remuneração de cada uma. |
| P4 | Professora editar o próprio cadastro | ⚪ | 💻 | Hoje é só leitura. |

---

## 8. Módulos ainda não construídos

| # | Módulo | Pri | Nota |
|---|---|---|---|
| M2 | Planejamento de Conteúdo | ⚪ | Placeholder. **Stand by** (21/09). |
| M3 | Social Media | ⚪ | Placeholder. **Stand by** (21/09). |
| M5 | Investimentos | ⚪ | Placeholder. **Stand by** (21/09). |
| M6 | Pró-labore | ⚪ | Atrás da flag `prolabore: false`. |
| M7 | ClassPass | ⚪ | Flag `classpass`. Enum e categoria financeira já existem. |
| — | Dashboard, Tarefas, Análises, Fechamento, Dívidas | ✅ | Todos entregues entre 07 e 08/2026. |

---

## 9. Dívidas técnicas

| # | Item | Pri | Nota |
|---|---|---|---|
| T1 | **Sem suíte de testes** | 🟡 | Existe só `npm run test:smoke` (fuma o bundle real no CI). As regras críticas — vaga, crédito, RLS por papel — continuam validadas à mão. Playwright está instalado e sem suíte. |
| T2 | **Sem lint** | 🟡 | Não há script `lint` nem ESLint. |
| T3 | ~~Ledger de migrations divergente~~ | ✅ | Reconciliado em 13/08. |
| T4 | ~~Supabase CLI não linkado~~ | ✅ | O CI faz `supabase link` + `db push` + `functions deploy` nos dois ambientes. Linkar localmente continua opcional. |
| T5 | **Bundle único, agora 1,31 MB (356 kB gzip)** | 🟡 | Era 970 kB / 271 kB em julho. Os três portais no mesmo JS; quem paga é o aluno abrindo no 4G. Code-splitting por jornada resolve. |
| T6 | ~~Dados de teste misturados com reais~~ | ✅ | Limpeza de 21/09 (§1.2). |
| T7 | **DEV e PROD com configurações de negócio diferentes** | 🟡 | `faltas_para_suspensao` 3 no DEV × 2 na PROD; `valor_checkin_wellhub_centavos` R$15 × R$27. Homologar regra de falta no DEV dá resultado diferente do que produção fará. |
| T8 | ~~CLAUDE.md §5.1 desatualizado~~ | ✅ | **Corrigido em 21/09.** A §5.1 agora descreve a ordem real (hostname → caminho → hash), o domínio do aluno e o motivo de cada endereço. |
| T9 | **O smoke test não cobre as rotas de produção** | 🟡 | `scripts/smoke.mjs` sobe `''`, `#/`, `#/portal` e `#/prof`. Os dois últimos só funcionam por compatibilidade; o que o aluno e a professora abrem de verdade é `/agendamentos/` e `/portalequipe/`, que têm `index.html` próprio no build. Uma quebra ali passa pelo CI sem ninguém ver. |

---

## 10. Decisões de produto

### Fechadas (21/07 a 21/09/2026)

| Decisão | Como ficou |
|---|---|
| Duas aulas no mesmo dia | Permitido, consome dois créditos |
| Tipo de plano | **Sempre por crédito** |
| Mensal × semestral | Mesma mensalidade; semestral = 6 ciclos mês a mês |
| Crédito não usado | **Expira no fim do ciclo** |
| Inadimplência | Ciclo não pago bloqueia novos agendamentos na hora |
| Lista de espera | Avisa o 1º por e-mail e segura a vaga 30 min |
| **Prazo de cancelamento** | **4h** (21/09) — igual ao Wix, os dois têm que andar juntos |
| **Preços dos planos** | Tabela real de set/2026 já em produção, 19 produtos |
| **Gateway** | **Asaas** — vamos configurar (21/09) |
| **WhatsApp** | Construir no ERP, e **iniciar agora** (21/09) |
| **TotalPass** | Vira **canal próprio** no sistema (21/09) |
| **Comunicados** | **Criar** (21/09) |
| **Conteúdo, Social, Investimentos** | **Stand by** (21/09) |

### Ainda em aberto

1. **Bonificações do semestral** — o que o aluno ganha por assinar 6 meses.
2. **Catálogo do Wix × catálogo do ERP** (X4): trimestral e pacotes de 4/6 aulas.
3. **Data da virada do Wix** (X6).
4. **A segunda sala já entra na grade** ou só quando abrir de fato (X3).

---

## 11. Gateway de pagamento — passo a passo

### 11.0 Por que Asaas e não InfinitePay (21/09/2026)

A InfinitePay foi avaliada a pedido da gestão (conta já existente, PIX a 0%) e
**não atende o requisito**: a cobrança precisa ser automática. A recorrência
dela existe só dentro do painel — a API pública é o *Checkout Integrado*
(`POST api.checkout.infinitepay.io/links`), que cria cobrança **avulsa**. Daria
para gerar um link por ciclo, mas o aluno teria que pagar ativamente todo mês,
e usar a assinatura do painel deles deixaria o ERP sem saber do pagamento —
baixa manual, que é justamente o que o sistema existe para eliminar.

**O que muda em relação ao plano original:** o Asaas hoje suporta **Pix
Automático** (o do Banco Central) na API, com `paymentCreationMode:
SUBSCRIPTION`. O aluno autoriza **uma vez** (Jornada 3: o QR Code da primeira
cobrança já carrega a autorização dos ciclos seguintes) e os débitos passam a
acontecer sozinhos, sem nova confirmação. Isso é cobrança automática de verdade
ao custo de PIX (R$1,99 fixo) em vez dos ~3% do cartão — com 47 mensalistas a
R$250, é ~R$94/mês contra ~R$374/mês.

⚠️ Verificar elegibilidade antes de prometer: o Pix Automático exige CNPJ ativo
há pelo menos 6 meses, conta aprovada e CNAE compatível. O cartão recorrente
tokenizado continua como alternativa para quem não puder usá-lo.

### 11.1 A conta

Pesquisa comercial de 21/07 confirmada: conta **gratuita**, sem mensalidade,
R$50 de crédito na abertura.

| Forma | Taxa | Numa mensalidade de R$300 |
|---|---|---|
| PIX | R$ 1,99 fixo | R$ 1,99 — **0,7%** |
| Boleto | R$ 1,99 fixo | R$ 1,99 — 0,7% |
| Cartão (assinatura) | R$ 0,49 + 2,99% | R$ 9,46 — **3,2%** |

**A conta que decide:** com 50 alunos a R$300, cartão custa ~R$473/mês em taxas
e PIX ~R$100. O cartão cobra sozinho; o PIX exige o aluno pagar ativamente.
Recomendação: oferecer os dois, com **PIX como padrão visível**.

### 11.2 Fora do código (gestão)

1. Abrir conta em `asaas.com` com o **CNPJ do MEI** — precisa de CPF do titular,
   endereço, telefone e selfie com documento. Análise em até 2 dias úteis.
2. Ligar as formas: **PIX** (chave do MEI) e **cartão recorrente**.
3. **Não ligar** as notificações do próprio Asaas (R$0,99 por pacote de
   e-mail/SMS, R$0,55 por WhatsApp) — o sistema já manda os e-mails dele.
4. Gerar a **API key de sandbox** e, depois de homologar, a de produção.
   Guardar as duas fora do repo (`supabase secrets set`).

### 11.3 No sistema (código)

5. Migration: `formas_pagamento` (cartão tokenizado — **nunca** o número) e
   `cobrancas` (`provider`, `provider_ref`, status, valor, vencimento). A
   arquitetura já é agnóstica de provedor.
6. Edge Function `asaas-cobranca` (server-side, cria assinatura/cobrança) e
   `asaas-webhook` (recebe o retorno). Segredo só na função.
7. Ligar os eventos às RPCs que **já existem**:
   `PAYMENT_CONFIRMED/RECEIVED` → `renovar_ciclo()`;
   `PAYMENT_OVERDUE`/recusado → `marcar_inadimplente()`;
   assinatura cancelada → encerra no fim do ciclo pago.
8. `matricular()` passa a rodar **depois** da confirmação, não na hora do
   clique (hoje os créditos liberam na hora e a cobrança é combinada fora).
9. Telas: Checkout no portal + Pagamentos (histórico e cartões).
10. E-mail de **cobrança recusada** (A7) passa a fazer sentido aqui.
11. Semestral = a mesma assinatura mensal limitada a 6 cobranças.

---

## 12. WhatsApp — passo a passo

Estudo completo em [06-WHATSAPP.md](06-WHATSAPP.md). Decisão de 22/07,
reafirmada em 21/09: **construir no ERP** via Cloud API (caminho 3). Responder
cliente é grátis na Meta; o que se paga em plataforma terceira é o software de
caixa de entrada.

### 12.1 Fora do código (gestão)

1. **Número dedicado.** Um número que **não** esteja em uso no app WhatsApp
   Business — migrar um número para a Cloud API tira ele do aplicativo. Chip
   novo é o caminho menos traumático.
2. Conta no **Meta Business Manager** + criar o **WABA** (WhatsApp Business
   Account), verificar a empresa (CNPJ) e registrar o número.
3. Gerar um **token permanente** por *system user* (o token de teste expira em
   24h e não serve para produção).
4. Cadastrar os **templates** de mensagem que partem de nós (lembrete de aula,
   cobrança) — a Meta aprova cada um. Fora da janela de 24h, só template.

### 12.2 No sistema (código)

5. Migration `wa_conversas` + `wa_mensagens` (com `cliente_id`, para o histórico
   cair na ficha 360°), RLS operacional (`is_operacional()`).
6. Edge Function `whatsapp-webhook` (recebe, valida o `verify_token` e a
   assinatura) + `whatsapp-enviar`.
7. Caixa de entrada na tela: lista de conversas, quem está respondendo,
   histórico do cliente ao lado.
8. Só então ligar os lembretes da Agenda no canal WhatsApp.

⚠️ O preço da Meta muda entre ago e out/2026 — reconferir antes de escalar.

---

## 13. Central de Comunicados — especificação

Decidido em 21/09. Hoje não existe nada: as tabelas `comunicados` e
`comunicados_leitura` nunca foram criadas.

1. **Migration.** `comunicados` (título, corpo, público-alvo, publicado_em,
   expira_em, autor) + `comunicados_leitura` (comunicado, cliente, lido_em).
   RLS: escrita por `is_operacional()`, leitura pelo aluno só do que está
   publicado e dentro da validade.
2. **Público-alvo.** No mínimo: todos, só matriculados ativos, só inadimplentes,
   só quem faz determinada modalidade. É o que evita mandar recado de mensalista
   para aluno Wellhub.
3. ⚠️ **Regra que vale lembrar:** comunicado para aluno Wellhub **não pode**
   conter desconto, aula grátis ou incentivo de migração.
4. **Telas.** Admin: criar/editar/publicar + quem já leu. Portal: aviso no topo
   do painel e lista completa, marcando lido.
5. **E-mail opcional** por comunicado — reaproveita `emails_fila` e a
   `enviar-emails`, sem infraestrutura nova.

---

## 14. Ordem sugerida

Não é obrigação — é a sequência que destrava mais coisa com menos esforço.

1. **G1** (e-mail das professoras) — destrava o portal delas, que está pronto e parado.
2. **X1 → X2 → X3** (API key, script de import, grade de 2 salas) — sem isso o
   ERP fica vazio e o Wellhub (W7) não tem o que publicar.
3. **W2 + W9** (secrets e Attendance Trigger) — um está falhando todo dia às
   06:00, o outro é pré-requisito de certificação.
4. **G2 + A1** (acesso dos alunos e validação real do portal).
5. **A2/A3** (Asaas) e **X5** (TotalPass).
6. **A8** (Comunicados) e o **WhatsApp** (§12).
7. **S3b** — só quando for criar a primeira conta `social`.
8. **T1/T2/T5** — quando o fluxo real estiver de pé e valer a pena congelar
   comportamento em teste.
