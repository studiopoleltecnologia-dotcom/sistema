# CLAUDE.md — Studio Pole L (ERP interno)

Guia para desenvolvimento assistido por IA neste projeto. Leia antes de codar.
Documentos de contexto: [docs/01-NEGOCIO.md](docs/01-NEGOCIO.md) (negócio),
[docs/02-ARQUITETURA.md](docs/02-ARQUITETURA.md) (arquitetura/roadmap),
[docs/04-PORTAL-ALUNA.md](docs/04-PORTAL-ALUNA.md) (especificação do módulo
Portal da Aluna) e [docs/05-BACKLOG.md](docs/05-BACKLOG.md) (**tudo que está
pendente** — ler antes de decidir o que fazer a seguir).

---

## 1. O que é o projeto

ERP web interno para um estúdio de Pole Dance (MEI), usado por **3 sócias**.
Objetivo: substituir planilhas e centralizar a gestão. Filosofia: **simples,
organizado, poucos cliques, automações, escalável**. Cada módulo conversa com os
outros — a integração é o principal valor.

**Papel esperado da IA:** agir como arquiteto de software **e** consultor de gestão
para pequenas empresas. Antes de codar um módulo, questione o processo e proponha
o caminho mais simples e escalável.

---

## 2. Stack

- **Front:** React + TypeScript + Vite + Tailwind CSS
- **Dados/estado:** TanStack Query + `@supabase/supabase-js`
- **Backend:** Supabase (Postgres, Auth, RLS, Storage, Edge Functions, pg_cron)
- **Hospedagem:** GitHub Pages (repo **público**) via GitHub Actions
- **Versionamento:** GitHub

---

## 3. Regras invioláveis de segurança

O repositório é **público**. Portanto:

1. **NUNCA** commitar segredos. Apenas a `anon key` do Supabase vai ao front
   (é pública por design). A `service_role key` jamais entra no repo/front.
2. **Toda tabela nasce com RLS habilitado** e políticas explícitas. Sem RLS = bug
   de segurança, não "detalhe".
3. Segredos de build vêm de **GitHub Actions secrets** (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`), nunca hardcoded.
4. Regras de negócio sensíveis (totais financeiros, faturamento MEI, permissões)
   validadas **no banco** (constraints, funções, RLS), não só no front.

---

## 4. Princípios de produto (design)

- Interface **minimalista**: poucas cores, muito espaço em branco, ícones discretos.
- **Poucos cliques** para tarefas frequentes. Produtividade acima de enfeite.
- Nada poluído. Se uma tela parece cheia, está errada.
- Preferir **defaults inteligentes** e automação a formulários longos.
- Usar **feature flags** para módulos futuros (ex: Pró-labore, ClassPass) — ficam
  ocultos até serem ligados.

---

## 5. Arquitetura de módulos

Camadas (detalhe em [docs/02-ARQUITETURA.md](docs/02-ARQUITETURA.md)):

- **Cadastros:** Clientes/CRM, Professoras, Planos & Produtos, Sócias/Usuárias
- **Operação:** Agenda & Turmas, Presença/Check-in, Matrículas
- **Relacionamento:** Funil CRM, Follow-up automático
- **Financeiro:** Entradas, Saídas, Fluxo de Caixa, Reserva, MEI, Pró-labore 🔒
- **Gestão & Conteúdo:** Conteúdo, Social Media, Tarefas, Investimentos
- **Visão:** Dashboard Executivo

### 5.1 Os três portais e os papéis de acesso

Um único projeto Vite e um único Supabase servem **três jornadas separadas**,
escolhidas pelo hash da URL em [src/App.tsx](src/App.tsx) (cada uma com router e
porteiro próprios):

| Portal | Rota | Papel | Vínculo com `auth.users` | Função de RLS |
|---|---|---|---|---|
| Interno (equipe) | `#/` | equipe | `socias` | `is_socia()` |
| Aluna | `#/portal` | cliente | `contas_aluna` | `is_cliente()` / `cliente_atual()` |
| Professora | `#/prof` | professora | `contas_professora` | `is_professora()` / `professora_atual()` |

- `#/prof` e não `#/professoras`: o admin já usa `/professoras` para o módulo de
  gestão. O teste de rota é por **segmento exato**, senão `#/professoras` cairia
  no portal da professora.
- **Aluna e professora são mutuamente exclusivas** (trigger
  `validar_papel_exclusivo`). Equipe + professora é permitido de propósito —
  sócia que também dá aula é caso real.
- **Nenhum papel se concede sozinho.** `handle_new_user()` só cria vínculo de
  professora, e só quando o e-mail do signup casa com um e-mail já cadastrado em
  `professoras` pela equipe (é isso que faz o "convite"). Equipe entra apenas por
  `promover_a_equipe()`, chamada por quem já é equipe. Metadata do signUp
  (`raw_user_meta_data`) é escolhida por quem cria a conta e **nunca** decide
  privilégio.
- ⚠️ **Pré-requisito de deploy:** confirmação de e-mail ATIVA no Supabase Auth.
  Sem ela, quem souber o e-mail de uma professora cria a conta dela.
### 5.2 Funções dentro da equipe interna (M8, 21/07/2026)

A equipe interna **não é um bloco único**. `socias.funcao` (enum
`funcao_interna`) define o recorte de cada conta:

| Função | Quem | Vê |
|---|---|---|
| **gestao** | Carol + 3 sócias | tudo, inclusive Financeiro, saldos, MEI, pagamento de professoras |
| **secretaria** | secretária | operação inteira (Agenda, CRM, Follow-up, Matrículas) **sem nenhum valor financeiro** |
| **social** | conteúdo | só o módulo Conteúdo (papel definido; conta ainda não criada) |

- **Financeiro trancado no banco por `is_gestao()`** — não é menu escondido, é o
  Postgres recusando. Tabelas `entradas/saidas/reserva/config_financeiro/
  categorias_saida/despesas_recorrentes`. As views financeiras são
  `security_invoker`, então param de devolver dado para não-gestão sozinhas.
- **`professoras` virou gestão-only** (esconde `valor_por_aluna_centavos`). A
  operação (Agenda) lê o nome pela view `vw_professoras_nomes` (só id/nome/ativa).
- Funções de papel: `is_gestao()`, `is_operacional()` (gestao|secretaria),
  `minha_funcao()`. No front, `useMinhaFuncao()` filtra o menu e o painel;
  `RotaFuncao` barra a URL direta.
- **MFA** (`aal2`) continua uma ideia de reforço **extra** sobre o Financeiro da
  gestão — opcional, não bloqueia, não implementado.
- ⚠️ **Pendência:** as policies operacionais ainda usam `is_socia()`. Antes de
  criar a 1ª conta `social`, migrar para `is_operacional()` (senão social herda
  a operação). Sem conta social, não há vazamento hoje. Ver docs/05-BACKLOG.md.

**Regras de integração que todo módulo respeita:**
- Um **check-in** alimenta: pagamento da professora, ocupação da turma, "última
  aula" da cliente e receita Wellhub a reconciliar.
- Uma **entrada financeira** atualiza: faturamento MEI, fluxo de caixa e reserva.
- Mudança de estágio no funil / inatividade pode **disparar follow-up**.
- Um **agendamento** (mensalista ou Wellhub) consome a **mesma vaga** da turma,
  qualquer que seja o canal; cancelamento libera a vaga imediatamente. Ver
  detalhamento das jornadas de agendamento na seção 9.

---

## 6. Roadmap (ordem de implementação)

1. **Fase 0 — Fundação:** repo, Supabase, Auth, deploy Actions→Pages, design system, flags
2. **Fase 1 — Clientes + CRM** ⭐ *(em andamento / próximo)*
3. **Fase 2 — Financeiro + MEI**
4. **Fase 3 — Follow-up**
5. **Fase 4 — Agenda & Presença + Professoras** (regras de negócio na seção 9)
6. **Fase 5 — Dashboard Executivo**
7. **Fase 6 — Conteúdo + Social + Tarefas + Investimentos**

Implementar **um módulo por vez**. Não avançar de fase sem o módulo anterior
funcionando e validado pelas sócias.

---

## 7. Convenções de código

- **Estrutura por módulo (feature-based):** `src/modules/<modulo>/` com
  `components/`, `hooks/`, `api/`, `types.ts`, `routes.tsx`.
- **Banco:** migrations versionadas em `supabase/migrations/`. Nada de alterar o
  schema pela UI do Supabase sem gerar migration.
- **Nomenclatura SQL:** tabelas no plural em `snake_case` (ex: `clientes`,
  `entradas_financeiras`); colunas em `snake_case`.
- **Tipos:** gerar tipos TypeScript do schema Supabase; não digitar tipos de tabela à mão.
- **Datas/dinheiro:** valores monetários como inteiros em centavos ou `numeric` no
  banco — nunca float. Datas em ISO/`timestamptz`.
- **Idioma:** UI, dados e nomes de domínio em **português**; código/identificadores
  técnicos podem ser em inglês quando for convenção (ex: hooks, libs).

---

## 8. Regras de domínio a lembrar

- **MEI:** limite anual **R$ 81.000** (parametrizável). Alertas em **70%, 85%, 95%**.
  Faturamento por **regime de caixa** (conta quando o dinheiro entra).
- **Wellhub/ClassPass:** receita por **check-in**, paga em lote com **atraso** →
  tratar como "a reconciliar", diferente de mensalista.
- **Professoras:** pagas **por aluna presente** por aula → derivado da Presença.
- **Reserva de caixa:** política sugerida 10–15% da receita, meta 3 meses de despesa.
- **Categorias financeiras:** Entradas (Mensalistas, Wellhub, ClassPass, Avulsa,
  Workshop, Eventos, Outros); Saídas Fixas x Variáveis.

---

## 9. Regras de negócio — Agendamento & Turmas (Wellhub e Mensalista)

Complementa a seção 5 (Agenda & Turmas é módulo central) e a seção 12
(integração técnica Wellhub). Aqui ficam as regras de **negócio** da jornada de
agendamento, relevantes para a Fase 2 (pacotes/créditos, ligado ao Financeiro) e
a Fase 4 (Agenda & Presença + Professoras) do roadmap. Inspirado no racional de
sistemas de mercado como **Tecnofit** (agendamento por crédito + integração com
plataformas parceiras) — referência de comparação, não de cópia de interface.

### 9.1 Regra central: vaga é um recurso único e compartilhado

- Toda turma tem uma **capacidade total de vagas**. Não existe pool separado por
  canal — mensalista e aluna Wellhub disputam a **mesma vaga**.
- Qualquer agendamento confirmado (mensalista ou Wellhub) **decrementa** a vaga
  disponível da turma; cancelamento **libera** a vaga imediatamente para outra
  aluna poder agendar.
- Essa contagem precisa ser **transparente para o sistema do Wellhub** — a vaga
  disponível vista pela Booking API (seção 12.3) e a vaga vista internamente
  nunca podem divergir. Modelagem recomendada: uma única tabela de
  agendamentos com coluna de origem (`mensalista` | `wellhub` | `avulsa`...); a
  vaga disponível é sempre `capacidade - count(agendamentos ativos)`.

### 9.2 Auditoria e histórico de interações

- Cada agendamento mantém um **histórico de estados com timestamp** (auditoria),
  não só o estado atual. No mínimo: `agendado_em`, `confirmado_em` (se houve
  confirmação pelo sistema/plataforma), `cancelado_em`, `origem_cancelamento`
  (aluna, sistema, professora).
- Vale tanto para Wellhub (rastrear se o agendamento feito no app foi
  confirmado pelo sistema ou não, e quando/se cancelou) quanto para mensalista.
- Modelagem recomendada: tabela `agendamentos` (estado atual) + tabela
  `agendamentos_eventos` (log append-only de cada transição) — permite
  reconstruir "o que aconteceu com a vaga da aluna X hoje" sem depender de
  campos mutáveis.

### 9.3 Cancelamento — prazos diferentes por canal

- **Wellhub:** prazo de cancelamento é definido **pela própria plataforma
  Wellhub**, não pelo estúdio — o sistema não aplica regra própria de
  antecedência para esse canal. (Relaciona-se à Booking API, seção 12.3: janela
  de 15 min para confirmar/recusar booking recebido via webhook.)
- **Mensalista:** prazo de cancelamento é em **horas de antecedência**,
  **parametrizável a qualquer momento pelas administradoras** (sócias) — é
  configuração de sistema, não constante de código.
  **Valor vigente: 3h** (definido em 21/07/2026, em `config_agendamento.horas_cancelamento`).
  Dentro do prazo o crédito volta e ela pode remarcar; fora, o crédito é
  consumido.

### 9.4 Jornada Mensalista — pacotes e créditos

- Cliente não-Wellhub enxerga a **mesma grade de aulas** que a aluna Wellhub.
- **Pacotes são cadastráveis e personalizáveis pelas administradoras** a
  qualquer momento — não é uma lista fixa no código.
- **Todo plano é por crédito** (decisão de 21/07/2026 — o tipo "aulas por
  semana" foi abandonado e há `check (tipo = 'creditos')` na tabela). O que
  varia é só:
  - **Quantos créditos por mês:** 4, 8, 12…
  - **Quantos ciclos de compromisso:** `ciclos = 1` (mensal, sem compromisso)
    ou `ciclos = 6` (semestral). O semestral é a **mesma mensalidade cobrada 6
    vezes**, não um pagamento à vista.
- **Ciclos, não um balde único.** `planos.preco_centavos` é o preço de UM
  ciclo e `matriculas.data_inicio/data_fim` delimitam o **ciclo corrente**.
  Cada pagamento confirmado chama `renovar_ciclo()`, que libera os créditos do
  mês seguinte. Um semestral **nunca** entrega os 6 meses de crédito de uma vez
  — senão a aluna queima tudo no primeiro mês e o bloqueio por falta de
  pagamento perde o sentido.
- **Crédito não usado expira no fim do ciclo** (registrado no livro-razão com
  motivo `expiracao`, para a aluna conseguir ver o que houve com o saldo).
- **Inadimplência:** ciclo não pago → `marcar_inadimplente()` → a matrícula sai
  de `ativa` e `agendar_aula()` recusa com mensagem própria. Não apaga crédito
  nem cancela a matrícula: os créditos do ciclo já pago valem até expirarem.
- Fluxo: cliente adquire o pacote (app) → créditos/aulas liberados no perfil →
  cliente agenda o horário → agendamento consome 1 crédito (regra 9.1).
- **Cancelamento dentro do prazo configurado (9.3):** crédito **volta** para o
  perfil e pode ser reutilizado.
- **No-show (agendou e não compareceu):** crédito é **consumido/perdido** —
  contabilizado como aula utilizada.
- Todas as regras de crédito (quantidade, validade, o que acontece em cada
  cenário) precisam ser **manipuláveis pelas administradoras**, não fixas em
  código.
- **Reposição de aulas:** regra própria (quando/quantas aulas podem ser
  repostas fora do ciclo normal), também **configurável pelas
  administradoras** — tratar como política separada da regra de cancelamento.
- **Duas aulas no mesmo dia:** permitido, consumindo dois créditos (decisão de
  21/07/2026). O banco nunca restringiu isso — é para continuar assim.
- **Lista de espera:** quando a aula lota, a aluna entra na fila (FIFO). Ao
  vagar, o sistema avisa **só a primeira** por e-mail e **segura a vaga para
  ela** por `config_agendamento.minutos_reserva_espera` (30 min); passado o
  prazo, chama a próxima. A reserva é enforçada em
  `validar_vaga_agendamento()` — conta como vaga ocupada para as demais —,
  não só escondida na tela, senão outra aluna passaria na frente.

### 9.5 Contas de acesso

- Cliente mensalista precisa criar um **perfil simples** para acessar o sistema
  e agendar.
- Cliente Wellhub **não precisa** de perfil próprio para a jornada básica
  (agendar/check-in via Wellhub) — só cria perfil se quiser **também** adquirir
  algum pacote do estúdio (uso híbrido).

### 9.6 Módulo Professoras — permissões (Fase 4)

Acesso restrito e específico, sem acesso ao restante do sistema:

- Ver quem está **agendado** na aula (lista de alunas esperadas).
- **Marcar presença/ausência** de cada aluna agendada.
- **Incluir aluna presente na aula que não estava agendada** (chegou por fora
  do sistema) — precisa entrar no cômputo de vaga/presença retroativamente.
- **Nenhum outro acesso** (sem financeiro, sem CRM, sem outras turmas, sem
  configurações). Modelar como policy de RLS própria por `professora_id` +
  `turma_id` do dia, não como variação de permissão de admin.

**Implementado** em `20260721110000_portal_professora.sql` (portal em `#/prof`,
ver 5.1). Como ficou, para não reimplementar por engano:
- Incluir aluna que chegou sem agendar **não cria agendamento retroativo** — é
  uma presença com `agendamento_id null` (caso já previsto no comentário da
  tabela `presencas`). Se criasse agendamento, o trigger de capacidade recusaria
  justamente a aluna que já está fisicamente na sala.
- O nome da aluna chega pela view `vw_alunas_da_aula`, que é *definer* e se
  autofiltra no `WHERE` — expõe só o nome, nunca telefone ou funil. Para buscar
  quem incluir, `buscar_aluna()` devolve apenas `id` + `nome`.
- Presença de aula futura é recusada no banco, não só escondida na tela.
- Ela vê o próprio `valor_por_aluna_centavos` e a própria linha de
  `vw_pagamento_professoras` (aulas dadas + valor previsto) — nunca o das colegas.

---

## 10. Skills do projeto (a criar conforme padrões surgem)

- **`novo-modulo`** — scaffold: migration+RLS → tipos → página React + rota + menu
- **`supabase-migration`** — migration versionada com convenções de RLS
- **`regras-financeiras`** — domínio financeiro (MEI, Wellhub, reserva)
- **`seed-dados`** — popular banco com dados de exemplo realistas
- **`deploy`** — build + validações + publish no GitHub Pages
- **`design-system`** — consistência visual minimalista

---

## 11. Como trabalhar (fluxo por módulo)

1. Reler a seção do módulo em [docs/01-NEGOCIO.md](docs/01-NEGOCIO.md).
2. Propor modelo de dados (tabelas + RLS) e validar com a usuária.
3. Migration → tipos → API/hooks → UI → integração com outros módulos.
4. Popular com dados de exemplo e testar o fluxo real (não só compilar).
5. Validar com as sócias antes de seguir para o próximo módulo.

---

## 12. Integração Wellhub (Gympass) — requisitos técnicos

Contexto de negócio já registrado na seção 8: receita Wellhub é por check-in,
reconciliada com atraso. Requisitos levantados na documentação oficial
([developers.wellhub.com](https://developers.wellhub.com/),
[helpcenter.gympass.com](https://helpcenter.gympass.com/)) para quando os módulos
Financeiro (Fase 2) e Agenda & Presença (Fase 4) chegarem a essa integração.

### 12.1 Onboarding comercial (pré-requisito, fora do código)

- Cadastro gratuito como parceiro em wellhub.com/partners (país, nome legal da
  empresa, e-mail comercial + código de verificação).
- Perfil completo no Portal do Parceiro (fotos, horários, comodidades) — impacta
  a descoberta do estúdio pelas alunas Wellhub.
- Credenciais de API (`client_id`/`client_secret`) são obtidas com o time
  Techsales/Account Manager Wellhub (`integrations@gympass.com`) — não é
  self-service; precisa solicitar formalmente antes de codar a integração.

### 12.2 Autenticação e segredos

- OAuth 2.0 *client credentials flow*: `client_id` + `client_secret` → token de
  acesso de curta duração → `Bearer` token em cada chamada às APIs.
- Credenciais são geradas em "Wellhub for Companies" (Portal do Parceiro) →
  Settings → OAuth credentials. O `client_secret` só é exibido **uma vez** na
  criação.
- **Mesma regra da seção 3:** `client_secret` da Wellhub nunca vai para o repo
  nem para o front. Guardar como secret de Edge Function do Supabase
  (`supabase secrets set`), chamada feita **server-side**.
- **IP fixo NÃO é necessário** (confirmado pelo time Wellhub, jul/2026) — o
  backend em Supabase Edge Functions (IP dinâmico) atende sem allowlist de IP.
- **Assinatura do webhook:** a Wellhub assina cada requisição no header
  `X-Gympass-Signature`, validado com um **secret gerado pelo parceiro** e
  informado à Wellhub na ativação (não é um segredo que a Wellhub fornece). Fluxo
  de ativação: desenvolve local → Wellhub envia o **Bearer token** de acesso às
  APIs deles → o parceiro responde com a(s) URL(s) de webhook + o secret do
  `X-Gympass-Signature`. Recomendação da Wellhub: **uma única URL** para todos os
  eventos (checkin + booking).
- **Sandbox disponível** (jul/2026): `gym_id` 548 + `api_key` (Bearer de teste)
  recebidos por e-mail. Guardar como secret do Supabase (`supabase secrets set`),
  **nunca** no repo/front — repo é público (seção 3). Docs Postman de sandbox:
  Access Control API e Booking API (links no e-mail do Techsales).

### 12.3 APIs relevantes

| API | Uso no Studio Pole L | Observação |
|---|---|---|
| **Access Control API** | Validar check-in de aluna Wellhub na hora da aula | Endpoint produção: `POST https://api.partners.gympass.com/access/v1/validate` com `gympass_id`. Essa chamada é o que gera a transação que origina o repasse. |
| **Check-in Webhook** | Receber notificação quando a aluna faz check-in pelo app Wellhub | Wellhub faz `POST` na URL registrada pelo parceiro a cada check-in (assinado em `X-Gympass-Signature`). Fluxo esperado: recebe webhook → pré-registra a usuária → chama `validate` p/ confirmar ticket válido no dia → se positivo, libera. |
| **Booking API** (opcional/futuro) | Sincronizar a agenda de turmas para reserva direta pelo app Wellhub | Evento de booking/cancelamento chega por webhook; parceiro tem **15 min** para responder com `PATCH` confirmando/recusando, senão é auto-rejeitado. Só faz sentido junto com Agenda & Turmas (Fase 4) — não é pré-requisito do check-in. |

### 12.4 Modelo de implementação recomendado

Existem 3 modelos possíveis de acionar a Access Control API: *Gate System
Trigger* (catraca física), *Attendance Trigger* (marca presença manualmente
como um check-in comum) e *Automated Trigger* (consome o webhook de check-in e
chama a Access Control API sozinho, sem intervenção humana). Studio Pole L não
tem catraca — **Automated Trigger é o mais aderente**: aluna mostra o check-in
no app, o sistema recebe o webhook e valida sozinho, sem clique manual
(alinhado ao princípio de "poucos cliques" da seção 4).

### 12.5 Impacto no modelo de dados

- Check-in precisa de campo de origem (`mensalista` | `wellhub` | `classpass` |
  `avulsa`) e do `gympass_id` da aluna quando aplicável, para casar com o
  webhook recebido.
- Cada check-in Wellhub confirmado gera lançamento **"a reconciliar"** na
  tabela financeira (não uma entrada confirmada) até bater com o repasse
  mensal real — já é a regra registrada na seção 8.
- Valor por check-in pode ser **R$ 0** (primeira visita grátis da aluna ou teto
  de pagamento por visitante atingido no mês) — é caso de negócio válido, não
  pode travar o check-in nem ser tratado como erro.

### 12.6 Conciliação financeira (Fase 2)

- Wellhub paga por check-ins validados; transferência todo dia **15** de cada
  mês, referente ao mês anterior (regime de caixa — compatível com a regra MEI
  da seção 8).
- **A Wellhub NÃO expõe dados financeiros/repasse por API** (confirmado pelo
  time Wellhub, jul/2026). O repasse é consultado no Portal do Parceiro (aba
  **Financeiro**) e importado manualmente para o sistema — não há conciliação
  100% automática. Isso valida o MVP já implementado (`conciliar_wellhub`).
- MVP realista: import manual/CSV do relatório do Portal + comparação contra os
  check-ins "a reconciliar" já registrados via Access Control API.

### 12.7 Quando implementar

Não bloqueia a Fase 1 (Clientes + CRM). Entra em:
- **Fase 2 (Financeiro):** modelagem de "a reconciliar" + import do relatório de repasse.
- **Fase 4 (Agenda & Presença):** Access Control API / Check-in Webhook (Automated Trigger) e, opcionalmente, Booking API.

---

## 13. Servidores MCP configurados

- **Supabase MCP** — instalado em **escopo de projeto** (fica no config do
  repositório, disponível para qualquer sócia/dev que abrir este projeto).
- **GitHub MCP** — instalado em **escopo local** (config da máquina/usuário
  atual; não é compartilhado via repo nem versionado).

Ao propor automações que dependam de MCP (migrations via `mcp__supabase__*`,
PRs/issues via `mcp__github__*`), lembrar que a disponibilidade do GitHub MCP
depende da máquina local de quem está rodando a sessão — não assumir que está
disponível em outro ambiente ou em CI.
