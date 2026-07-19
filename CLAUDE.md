# CLAUDE.md — Studio Pole L (ERP interno)

Guia para desenvolvimento assistido por IA neste projeto. Leia antes de codar.
Documentos de contexto: [docs/01-NEGOCIO.md](docs/01-NEGOCIO.md) (negócio) e
[docs/02-ARQUITETURA.md](docs/02-ARQUITETURA.md) (arquitetura/roadmap).

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

### 9.4 Jornada Mensalista — pacotes e créditos

- Cliente não-Wellhub enxerga a **mesma grade de aulas** que a aluna Wellhub.
- **Pacotes são cadastráveis e personalizáveis pelas administradoras** a
  qualquer momento — não é uma lista fixa no código. Dimensões variáveis de um
  pacote:
  - **Tipo:** pacote de **créditos** (N aulas para usar como quiser) ou pacote
    de **aulas semanais fixas** (ex: 2x/semana).
  - **Vigência:** mensal, trimestral ou semestral (modelar como parametrizável,
    não como enum fechado, para admitir novas vigências no futuro).
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
- Wellhub valida o IP de origem das chamadas (bloqueio 403 se IP não liberado) —
  como o backend roda em Supabase Edge Functions (IP dinâmico), validar com o
  time Wellhub se aceitam range dinâmico ou se será necessário IP fixo/proxy.

### 12.3 APIs relevantes

| API | Uso no Studio Pole L | Observação |
|---|---|---|
| **Access Control API** | Validar check-in de aluna Wellhub na hora da aula | Endpoint produção: `POST https://api.partners.gympass.com/access/v1/validate` com `gympass_id`. Essa chamada é o que gera a transação que origina o repasse. |
| **Check-in Webhook** | Receber notificação quando a aluna faz check-in pelo app Wellhub | Wellhub faz `POST` numa URL registrada pelo parceiro a cada check-in. |
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
- Relatórios de repasse ficam na aba **Financeiro** do Portal do Parceiro. Não
  há confirmação de API pública de download automático desse relatório — pode
  depender de export manual ou SFTP (usado hoje para elegibilidade/payroll, não
  necessariamente para repasse). Validar com o time Wellhub antes de prometer
  conciliação 100% automática.
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
