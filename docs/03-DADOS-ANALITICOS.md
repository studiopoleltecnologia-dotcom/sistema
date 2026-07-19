# Modelo de Dados Analíticos — Studio Pole L

> Objetivo: garantir que cada módulo **nasça capaz de gerar as análises de gestão
> automaticamente**, sem retrabalho depois. Este documento mapeia cada análise →
> dado necessário → tabela/coluna → módulo responsável.
>
> Complementa [02-ARQUITETURA.md](02-ARQUITETURA.md) (seção 7, modelo de dados) e
> [01-NEGOCIO.md](01-NEGOCIO.md). Não é migration — é o **contrato de dados** que
> as migrations de cada módulo devem cumprir.

---

## Como ler este documento

- **⚡ Capturar já (Fase 1):** campo barato de coletar agora que, se ficar de fora,
  **perde histórico para sempre** (datas de evento, origem, canal). Prioridade máxima.
- **🔜 Chega com o módulo:** campo que aparece naturalmente quando o módulo dono for
  construído (ex: presença na Fase 4). Só precisa ser previsto no desenho.
- **Regra de ouro:** todo *evento* (check-in, pagamento, mudança de estágio) guarda
  **quando aconteceu** com `timestamptz`. Análise de retenção, cohort e sazonalidade
  são impossíveis sem a data do evento. Dinheiro sempre em `numeric`/centavos.

---

## 1. Tabelas centrais (o núcleo analítico)

### `clientes` — dono: Clientes/CRM (Fase 1)

| Coluna | Tipo | Análises que habilita | Quando |
|---|---|---|---|
| `id` | uuid PK | — | Fase 1 |
| `nome` | text | — | Fase 1 |
| `telefone`, `instagram` | text | contato/follow-up | Fase 1 |
| `origem` | text/enum | **Origem do lead × conversão** (qual canal traz aluna que fica) | ⚡ Fase 1 |
| `data_primeiro_contato` | date | funil, tempo até virar aluna | ⚡ Fase 1 |
| `data_nascimento` | date | follow-up aniversário; perfil etário | ⚡ Fase 1 |
| `status` | enum (`lead`,`experimental`,`ativa`,`inativa`,`em_retorno`,`ex_aluna`) | churn, funil, base ativa | ⚡ Fase 1 |
| `estagio_funil` | enum | **Funil de conversão** (onde vaza) | ⚡ Fase 1 |
| `responsavel_id` | uuid → socias | performance por sócia | Fase 1 |
| `data_ultima_aula` | date (derivado da presença) | churn / inatividade | 🔜 Fase 4 (manual antes) |
| `criado_em` | timestamptz | **cohort de entrada** | ⚡ Fase 1 |

> ⚡ **Insight:** `origem`, `criado_em` e `status` são o mínimo para cohort e funil.
> Sem eles, nenhuma análise de retenção existe. Custo de capturar: um `<select>` no cadastro.

### `movimentacoes_funil` — dono: CRM (Fase 1)
Registra **cada transição de estágio** (não sobrescrever — historiar).

| Coluna | Tipo | Análises |
|---|---|---|
| `cliente_id` | uuid | — |
| `estagio_de`, `estagio_para` | enum | **Funil de conversão**, tempo em cada etapa, taxa lead→experimental→matrícula |
| `ocorreu_em` | timestamptz | velocidade do funil |
| `motivo` | text (nullable) | **motivo de perda/saída** |

> ⚡ Guardar a transição como **evento** (linha nova), não só o estado atual do cliente.
> É o que permite medir *conversão* e *tempo de ciclo*.

---

## 2. Operação — a fonte de verdade

### `presencas` (check-ins) — dono: Presença (Fase 4) 🔜
O dado mais valioso do sistema. Alimenta retenção, ocupação, professora e receita.

| Coluna | Tipo | Análises |
|---|---|---|
| `cliente_id` | uuid | **cohort de retenção**, LTV, churn |
| `turma_id` | uuid | **ocupação por turma/horário** |
| `professora_id` | uuid | **custo × retorno por professora** |
| `data_aula` | timestamptz | retenção, sazonalidade, "última aula" |
| `canal` | enum (`mensalista`,`wellhub`,`classpass`,`avulsa`) | **mix e margem por canal**, conversão Wellhub→mensalista |
| `criado_em` | timestamptz | auditoria |

> 🔜 Só na Fase 4, mas o **`canal` no check-in** é o que liga presença a receita e
> permite a análise de dependência Wellhub. Prever desde já no desenho.

### `turmas` — dono: Agenda (Fase 4) 🔜

| Coluna | Tipo | Análises |
|---|---|---|
| `modalidade`, `dia_semana`, `horario` | — | **ocupação por horário**, receita por hora |
| `capacidade` | int | ocupação = presentes ÷ capacidade |
| `professora_id` | uuid | custo por turma |

### `professoras` — dono: Cadastros (Fase 4) 🔜
| Coluna | Tipo | Análises |
|---|---|---|
| `valor_por_aluna_centavos` | numeric | **custo × retorno por professora** (custo = presenças × valor) |

---

## 3. Financeiro — regime de caixa é obrigatório

### `entradas_financeiras` — dono: Financeiro (Fase 2)

| Coluna | Tipo | Análises |
|---|---|---|
| `valor_centavos` | numeric | receita |
| `categoria` | enum (canais da seção 4 do CLAUDE.md) | **mix de receita por canal** |
| `data_competencia` | date | quando a aula/serviço ocorreu |
| `data_caixa` | date | **quando o dinheiro entrou** → base do MEI (regime de caixa) e fluxo real |
| `cliente_id` | uuid (nullable) | LTV, receita por aluna |
| `matricula_id` | uuid (nullable) | receita recorrente |
| `presenca_id` | uuid (nullable) | receita Wellhub reconciliada |
| `status_reconciliacao` | enum (`previsto`,`recebido`) | Wellhub "a reconciliar" |

> ⚡ **Insight crítico:** separar `data_competencia` de `data_caixa` é o que torna
> corretos **MEI (regime de caixa)**, **fluxo de caixa** e **margem por canal**.
> Se guardar só uma data, uma dessas análises fica errada. Barato agora, caro depois.

### `saidas_financeiras` — dono: Financeiro (Fase 2)
| Coluna | Tipo | Análises |
|---|---|---|
| `valor_centavos` | numeric | despesa |
| `tipo` | enum (`fixa`,`variavel`) | estrutura de custo, ponto de equilíbrio |
| `categoria` | text | análise de gastos |
| `data_caixa` | date | fluxo de caixa, reserva |

### `matriculas` — dono: Matrículas (Fase 4, esboço na 2) 🔜
| Coluna | Tipo | Análises |
|---|---|---|
| `cliente_id`, `plano_id` | uuid | receita recorrente |
| `data_inicio`, `data_fim` | date | **churn de mensalista**, tempo de contrato |
| `status` | enum (`ativa`,`cancelada`,`pausada`) | base ativa |
| `motivo_cancelamento` | enum/text | **por que as alunas saem** |

---

## 4. Painel de análises → dependências de dados

Resumo de "o que cada análise precisa" (para priorizar captura):

| Análise | Precisa de | Fase mínima |
|---|---|---|
| **Cohort de retenção** | `clientes.criado_em` + `presencas.data_aula` | 4 (parcial na 1 com matrícula) |
| **Churn / inatividade** | `presencas` ou `data_ultima_aula` + `status` | 1 (manual) → 4 (auto) |
| **LTV** | `entradas` por `cliente_id` | 2 |
| **Motivo de saída** | `matriculas.motivo_cancelamento` / `movimentacoes_funil.motivo` | 1–2 |
| **Mix de receita por canal** | `entradas.categoria` | 2 |
| **Margem por canal** | `entradas.categoria` + `presencas.canal` + `professoras.valor` | 4 |
| **Conversão Wellhub→mensalista** | `clientes.origem` + `matriculas` | 1–2 |
| **Ocupação por horário** | `turmas.capacidade` + `presencas` | 4 |
| **Receita por hora de aula** | ocupação + `professoras.valor` + `entradas` | 4 |
| **Projeção MEI** | `entradas.data_caixa` + `valor` | 2 |
| **Sazonalidade** | `entradas.data_caixa` | 2 |
| **Reserva de caixa** | `entradas` − `saidas` + política 10–15% | 2 |
| **Funil de conversão** | `movimentacoes_funil` + `clientes.estagio_funil` | 1 |
| **Origem × conversão** | `clientes.origem` + `status` | 1 |

---

## 5. Recomendação de captura imediata (Fase 1)

Mesmo antes de existir Financeiro e Presença, estes campos entram **agora** no
cadastro de cliente porque geram histórico irrecuperável:

1. `clientes.origem` (enum) — de onde veio a aluna.
2. `clientes.criado_em` (timestamptz, default `now()`) — âncora de cohort.
3. `clientes.status` + `estagio_funil` (enums) — funil e base ativa.
4. `clientes.data_primeiro_contato` e `data_nascimento`.
5. `movimentacoes_funil` como **tabela de eventos** (historiar transições).

> Todos com **RLS habilitado** e enums no banco (não string livre) para as análises
> agregarem sem "limpeza" depois. Enums viram `CHECK` ou tipos Postgres — decidir na
> migration da Fase 1.

---

## 6. Views de leitura para o Dashboard (Fase 5)

Quando os módulos existirem, o Dashboard não consulta tabelas cruas — consome
**views/materialized views** que encapsulam as fórmulas. Prever desde já:

- `vw_cohort_retencao` — matriz mês de entrada × meses ativos.
- `vw_mix_receita_mensal` — receita por canal por mês (regime de caixa).
- `vw_ocupacao_turmas` — ocupação média por turma/horário.
- `vw_mei_acumulado` — faturamento acumulado no ano + projeção + % do teto.
- `vw_funil_conversao` — contagem e taxa por estágio.

> Materialized view + refresh via `pg_cron` mantém o dashboard rápido sem pesar no
> front. Segue o princípio "o banco é a fonte de verdade".
