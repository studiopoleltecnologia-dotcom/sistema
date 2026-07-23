# 06 — WhatsApp para o atendimento (estudo CO1)

Estudo de decisão feito em **22/07/2026** para o item CO1 do backlog: a
secretária (e mais pessoas) precisam **responder o WhatsApp** do estúdio, e
queremos que isso, no futuro, converse com o sistema (histórico do cliente,
lembretes de aula, cobrança). Este documento decide **qual caminho seguir,
quanto custa e o que precisa ser feito** — ainda não é implementação.

Fontes de preço/regra ao final. ⚠️ A Meta muda a tabela em **ago e out/2026** e
o faturamento no Brasil ainda é em **USD até o 2º semestre/2026** — reconferir
antes de assinar qualquer coisa.

---

## 1. O insight que muda a conta

O caso de uso principal aqui é **responder** quem chama o estúdio. Na régua de
preço da Meta (modelo por mensagem desde jul/2025), isso é uma **mensagem de
serviço / atendimento** (o cliente inicia, você responde dentro de 24h) — e
essa categoria é **grátis**.

> **Responder cliente não custa nada de mensagem.** O custo real de um sistema
> de WhatsApp para o estúdio **não são as mensagens** — é o **software de caixa
> de entrada** (a ferramenta onde várias pessoas atendem o mesmo número com
> organização). É aí que está a decisão.

O que **custa** mensagem é você **iniciar** conversa (lembrete, promoção,
cobrança fora da janela de 24h) — e mesmo assim é centavos (ver §4).

---

## 2. O problema real: várias pessoas, um número, com organização

O WhatsApp comum não foi feito para um time atender junto. As opções, do mais
simples ao mais completo:

| Caminho | O que é | Multi-atendente de verdade? | Integra ao ERP? | Custo/mês |
|---|---|---|---|---|
| **1. App Business + dispositivos** | O WhatsApp Business normal, com o celular principal + até 4 aparelhos vinculados (5 pessoas) | ❌ Todos veem tudo, sem atribuição, sem "quem respondeu" | ❌ Nenhuma | **Grátis** (10 aparelhos com Meta Verified, pago) |
| **2. Plataforma terceira (BSP)** | Uma ferramenta de caixa compartilhada (SocialHub, Blip, Zenvia, 360dialog…) montada sobre a API oficial | ✅ Papéis, fila, atribuição, relatórios | ⚠️ Só se a plataforma tiver API/webhook p/ sincronizar | **R$200–1.200** + mensagens |
| **3. Caixa dentro do próprio ERP** | Consumir a **Cloud API** da Meta (webhook + Edge Function) e ter o atendimento **dentro do sistema** | ✅ A gente modela papéis/atribuição como quisermos | ✅ **Nativo** — mensagem vira interação do cliente, lembrete sai da Agenda | **Sem mensalidade de SaaS**, só mensagens (~centavos) + dev |

**Por que o App grátis (caminho 1) incomoda rápido:** sem atribuição, duas
pessoas respondem a mesma cliente sem saber; ninguém vê quem respondeu o quê; e
se o celular principal ficar 14 dias offline, os vinculados caem. Serve como
**ponte imediata**, não como solução.

---

## 3. O que a Meta exige para a API (caminhos 2 e 3)

Pré-requisitos (uma vez, feitos por você / pela equipe — não é código):

1. **Conta no Meta Business** (Business Manager) e **verificação do negócio**
   (usa o CNPJ do Studio Pole L LTDA — o mesmo do contrato).
2. Uma **conta WhatsApp Business (WABA)**.
3. Um **número de telefone dedicado** — **não pode** estar ativo num WhatsApp
   comum. Ou um chip novo, ou migrar o número atual (perde o WhatsApp comum
   nele). Decisão de negócio a tomar.
4. **Nome de exibição aprovado** pela Meta (ex.: "Studio Pole L").
5. Via **Cloud API** (caminho 3) isso é **self-service e sem mensalidade** da
   Meta; via **BSP** (caminho 2) a plataforma guia esse cadastro.

Mesma regra da [CLAUDE.md §3](../CLAUDE.md): tokens/segredos só na Edge Function
(o repo é público). O padrão é idêntico ao do Wellhub.

---

## 4. Custos, sem susto (Brasil, 2026)

| Tipo de mensagem | Quando acontece | Preço |
|---|---|---|
| **Atendimento** (cliente inicia, resposta em 24h) | O dia a dia da secretária | **Grátis** |
| **Utilitário** (lembrete de aula, aviso, recibo) | Você inicia, mas é serviço | **~R$0,04–0,05** |
| **Autenticação** (código/OTP) | Não usamos por ora | ~R$0,15–0,19 |
| **Marketing** (promoção, reengajamento) | Campanhas | ~R$0,31–0,38 |

Simulação realista do estúdio: atendimento (grátis) + ~300 lembretes
utilitários/mês ≈ **R$12–15/mês** de mensagens. Ou seja: **o que pesa no
orçamento é a mensalidade da plataforma (caminho 2), não a Meta.**

---

## 5. Onde está o valor: integração com o sistema (independe do caminho)

O motivo de trazer o WhatsApp pra perto do ERP (idealmente caminho 3):

- **Histórico do cliente** — o tipo de interação `whatsapp` **já existe** no
  CRM (visto na ficha 360°, item C1). Cada conversa vira registro na ficha.
- **Lembrete de aula** — "sua aula é amanhã 19h" sai automático da **Agenda**
  (utilitário, centavos). Reduz falta.
- **Créditos/renovação** — "seus créditos acabam em 3 dias" / "mensalidade
  vence dia X" sai do **Planos/Financeiro** (liga com inadimplência).
- **Lista de espera** — hoje avisa por e-mail (A6); WhatsApp teria entrega
  muito melhor. Mesma fila já construída.

Nada disso o caminho 1 (app grátis) entrega, e o caminho 2 (plataforma) só
entrega com trabalho de sincronização.

---

## 6. Recomendação

**Faseado, gastando pouco e sem travar:**

1. **Agora (grátis):** App WhatsApp Business + **dispositivos vinculados** — a
   secretária e as sócias já dividem o atendimento sem custo. Aceita o caos de
   "todos veem tudo" como estágio de ponte. Zero dev, zero mensalidade.
2. **Quando quiser automação e histórico:** decidir entre
   - **Construir no ERP (caminho 3)** — mais aderente à filosofia do projeto
     ("a integração é o principal valor"), **sem mensalidade de SaaS**, mas
     precisa de dev (Edge Function + webhook + módulo de atendimento) e do
     número dedicado. É o que eu recomendo se a ideia é o WhatsApp virar parte
     do sistema.
   - **Contratar uma plataforma (caminho 2)** — se você quer caixa
     multi-atendente **pronta já**, sem esperar dev, topando R$200–1.200/mês e
     um sistema à parte.

**A pergunta que decide o próximo passo:** o atendimento deve viver **dentro do
sistema** (a gente constrói) ou você prefere uma **ferramenta pronta separada**
(contrata)? E, antes de qualquer API: **qual número** o estúdio vai dedicar?

---

## 7. Pendências e riscos

- ⚠️ **Preço muda em ago e out/2026** — a Meta anunciou reajuste de serviço e
  utilitário; a categoria "atendimento grátis" pode ser revista. Reconferir
  antes de comprometer.
- ⚠️ **Número dedicado** — ativar a API "queima" o número para o WhatsApp
  comum. Definir chip novo × migrar o atual.
- Verificação do negócio na Meta pode levar alguns dias.
- Caminho 3 depende de a infra de Edge Functions/segredos estar de pé — o
  mesmo pré-requisito do Wellhub (T4/W1 no backlog).

---

**Fontes:** developers.facebook.com (Pricing on the WhatsApp Business
Platform); blueticks.co (WhatsApp Business API Pricing 2026; App Limitations
2026); socialhub.pro (Preço WhatsApp API 2026 Brasil); sinch.com (WhatsApp
Business for Multiple Users). Consultadas em 22/07/2026.
