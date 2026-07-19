# Documentação Funcional de Negócio — Studio Pole L

> Documento de entendimento de negócio. Não descreve telas nem código — descreve
> **como a empresa funciona** e como o sistema deve apoiar a gestão.
> Público: as 3 sócias. Objetivo: substituir planilhas e centralizar a gestão.

---

## 1. O negócio em uma frase

Estúdio de Pole Dance (MEI) que vende **acesso a aulas** por vários canais
(mensalidade, Wellhub, ClassPass, avulsa, workshops, eventos) e precisa de um
**ERP simples** para controlar dinheiro, alunas e operação em um só lugar.

Regra de ouro do negócio hoje: **todo o dinheiro retorna para a empresa**
(sem pró-labore, sem distribuição de lucro) — o foco é *organizar para crescer*.

---

## 2. Modelo de receita (como a empresa ganha dinheiro)

| Canal | Como funciona | Característica financeira |
|---|---|---|
| **Mensalistas** | Aluna paga plano mensal recorrente | Receita **previsível e recorrente** → base de contas a receber |
| **Wellhub (Gympass)** | Plataforma paga por check-in da aluna | Receita **variável**, paga em lote com **atraso** (repasse mensal) |
| **ClassPass** (futuro) | Igual Wellhub, outra plataforma | Idem — reconciliação por check-in |
| **Aula avulsa** | Pagamento único por aula | Receita pontual |
| **Workshop** | Evento pago, inscrição | Receita pontual, pode ter data futura |
| **Eventos** | Locação/eventos especiais | Receita pontual |
| **Outros** | Diversos | — |

> **Insight de gestão:** essas fontes têm *naturezas diferentes* e não podem ser
> tratadas igual. Mensalista é **contrato recorrente** (gera "a receber");
> Wellhub/ClassPass é **repasse por presença** (gera receita só depois da aula e
> com atraso). Isso muda o Fluxo de Caixa e o controle do MEI (regime de caixa).

---

## 3. Estrutura de custos

**Fixos (todo mês, valor estável):** aluguel, internet, DAS-MEI, Google Workspace,
domínio, app de agendamento, marketing, social media.

**Variáveis (dependem da operação):** **professoras** (por aluna presente),
energia, materiais, manutenção, limpeza, compras.

> **Insight:** o maior custo variável — **professoras** — é função direta da
> **presença nas aulas**. Ou seja, *o mesmo dado (check-in da aluna) alimenta ao
> mesmo tempo*: pagamento de professora, ocupação de turma, receita Wellhub,
> "última aula" da cliente e o gatilho de follow-up de inatividade. Esse dado é o
> **coração operacional do sistema**.

---

## 4. Jornada da cliente (CRM)

```
Lead → Pediu informações → Agendou experimental → Fez experimental →
Virou aluna (ativa) → Parou de frequentar → Em retorno → Ex-aluna
```

Cada cliente tem histórico, responsável (sócia) e origem (WhatsApp, Instagram,
Wellhub, indicação…). O funil precisa ser **visual** e cada transição de estágio
pode **disparar um follow-up automático** (ver seção 6).

Campos essenciais: nome, telefone, Instagram, origem, modalidade, primeiro
contato, última aula, data da última conversa, responsável, observações.

---

## 5. Operação (o que descobrimos que faltava)

O `definicoes.txt` cita "registro das aulas" e "quantidade de alunas" dentro de
Professoras — mas isso na verdade é um **módulo operacional próprio e central**:

- **Grade de horários / Turmas:** modalidade, professora, dia, horário, capacidade.
- **Presença / Check-in:** quem esteve em cada aula.

Esse módulo é a **fonte de verdade** que alimenta quase todo o resto. Sem ele,
Professoras, Ocupação, Receita Wellhub e Follow-up de inatividade viram digitação
manual e repetida. **Recomendação: tratá-lo como módulo de 1ª classe.**

---

## 6. Relacionamento e retenção (Follow-up)

Fluxos inteligentes sugeridos (todos disparados por dados que o sistema já terá):

| Gatilho | Regra | Ação |
|---|---|---|
| Lead sumiu | Sem resposta há X dias | Lembrete para o responsável |
| Experimental sem retorno | Fez experimental, não virou aluna em X dias | Lembrete + oferta |
| Cliente inativa | Sem check-in há X dias (ex: 15/30) | Lembrete de reengajamento |
| Aniversário | Data de nascimento = hoje | Mensagem de parabéns |
| Cliente VIP | Marcada como VIP | Cadência personalizada |
| Vencimento de plano | Mensalidade vence em X dias | Lembrete de cobrança |

> **Insight:** follow-up bom é **automático e baseado em dados reais** (presença,
> vencimento, estágio do funil), não em lembrete manual. É aqui que o sistema
> "trabalha sozinho" pela retenção.

---

## 7. Gestão financeira profissional (visão de contador)

### 7.1 Fluxo de caixa
Estrutura recomendada: **saldo atual → entradas previstas → saídas previstas →
saldo projetado**, com histórico. Entradas previstas vêm de: mensalidades a
receber + repasses Wellhub esperados. Saídas previstas vêm de: custos fixos
recorrentes + professoras estimadas + despesas agendadas.

### 7.2 Reserva de caixa (política sugerida)
Hoje praticamente não há caixa. Boa prática para pequena empresa:

1. **Reservar 10–15% de toda receita** automaticamente até formar colchão.
2. **Meta inicial: 3 meses de despesas fixas** (evoluir para 6 meses).
3. **Separar a reserva do tributo** (guardar o DAS-MEI à parte).
4. Acompanhar a evolução da reserva no dashboard.

### 7.3 Controle do MEI (crítico)
Limite atual de faturamento MEI: **R$ 81.000/ano** (parametrizável — há projetos
de aumento). O sistema deve mostrar:

- Faturamento acumulado no ano (regime de caixa)
- Média mensal e **projeção até dezembro**
- Quanto falta para o limite / previsão de desenquadramento
- **Alertas automáticos em 70%, 85% e 95%** do limite

> **Insight:** desenquadrar do MEI sem preparo gera multa e susto tributário.
> A projeção antecipada permite decidir com calma (virar ME, segurar receita etc.).

### 7.4 Pró-labore (preparado, mas desativado)
Estrutura pronta para quando o negócio permitir: pró-labore das sócias +
distribuição de lucro. Fica **oculto/desativado** por padrão via *feature flag*.

---

## 8. Gestão de conteúdo e marketing

- **Planejamento de conteúdo:** quadro estilo Trello (Ideia → Roteiro → Gravando →
  Editando → Aprovando → Publicado) + calendário mensal. Campos: título, objetivo,
  plataforma (Instagram/TikTok — Stories/Reels/Feed), responsável, prazo, data.
- **Gestão das social medias:** quem faz cada conteúdo, pendências, correções,
  aprovações, entrega. (É a "visão de time" do mesmo dado do planejamento.)

---

## 9. Planejamento e tarefas

- **Tarefas:** título, descrição, categoria, responsável, prazo, prioridade,
  status, checklist, anexos, comentários, notificações.
- **Investimentos:** planejar melhorias do estúdio (poles, espelhos, ar,
  reforma…) com valor estimado, prioridade, impacto, status. Visões: planejados,
  realizados, total previsto. **Conecta ao financeiro** (reserva/fluxo futuro).

---

## 10. Resumo das melhorias propostas (consultoria)

1. **Elevar "Agenda & Presença" a módulo central** — é a fonte de verdade da operação.
2. **Separar receita por natureza** (recorrente vs. repasse por presença) para
   fluxo de caixa e MEI corretos.
3. **Catálogo de Planos & Produtos** — preços num só lugar; base para automação
   financeira e matrículas.
4. **Matrículas/contratos recorrentes** — geram "contas a receber" e lembretes de
   vencimento automaticamente.
5. **Política de reserva de caixa** formalizada (10–15% / meta 3 meses).
6. **Follow-up dirigido por dados**, não por memória.
7. **Feature flags** para preparar o futuro (pró-labore, ClassPass) sem poluir hoje.
