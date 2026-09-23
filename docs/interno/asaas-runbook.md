# Asaas — ativação passo a passo

Complementa o [backlog §11](../05-BACKLOG.md). Aqui ficam só os passos
**fora do código** — o que precisa ser feito no painel do Asaas e no
Supabase, por alguém com acesso, e que nenhuma migration pode fazer.

> ⚠️ **Nada de chave neste arquivo, nem em nenhum outro do repositório.**
> O repo é público (CLAUDE.md §3). As chaves vão para os secrets da Edge
> Function, que ficam no projeto Supabase e não no git.

## O que já está pronto no código

| Peça | Onde |
|---|---|
| Tabela `cobrancas` (agnóstica de gateway) | `20260926120000_cobrancas.sql` |
| `registrar_cobranca`, `cobranca_paga`, `cobranca_vencida`, `cobranca_cancelada` | idem |
| Emissão da cobrança | `supabase/functions/asaas-cobranca` |
| Recebimento do pagamento | `supabase/functions/asaas-webhook` |
| Botões **Cobrar no Pix** / **Assinar no cartão** | Matrículas → Contratações |
| Recorrência (cron `emitir-cobrancas`, 9h) | `20260927120000_cobranca_recorrente.sql` |
| Assinatura de cartão (`assinaturas_gateway`) | idem |

## 1. Chaves — uma por ambiente

O Asaas tem duas contas separadas, sandbox e produção, **com chaves
diferentes**. Elas não são intercambiáveis, e a base da API muda junto:

| Ambiente | Projeto Supabase | Base da API |
|---|---|---|
| DEV | `nhoircibjcxsakjimisp` | `https://api-sandbox.asaas.com/v3` |
| PROD | `fgvxhwpqsxohqrccrlfn` | `https://api.asaas.com/v3` |

É a regra do CLAUDE.md §14.4: **o que varia por ambiente não entra na
migration**, porque a migration é o mesmo arquivo nos dois lados.

### Sandbox (fazer primeiro)

No painel sandbox do Asaas: **Integrações → Chave de API → Gerar**.

```bash
supabase secrets set ASAAS_API_KEY='<a chave de sandbox>' \
  --project-ref nhoircibjcxsakjimisp

# O default do código já é a base de sandbox; explicitar não faz mal.
supabase secrets set ASAAS_API_BASE='https://api-sandbox.asaas.com/v3' \
  --project-ref nhoircibjcxsakjimisp
```

### Produção (só depois de homologar)

```bash
supabase secrets set ASAAS_API_KEY='<a chave de produção>' \
  --project-ref fgvxhwpqsxohqrccrlfn
supabase secrets set ASAAS_API_BASE='https://api.asaas.com/v3' \
  --project-ref fgvxhwpqsxohqrccrlfn
```

**Ambiente sem `ASAAS_API_KEY` não emite nada, de propósito.** A função
responde 503 com a mensagem em vez de tentar. É a mesma trava de
isolamento do Vault: o DEV fica inerte até alguém semeá-lo de caso
pensado — melhor do que descobrir que ele estava cobrando de aluno real.

## 2. Token do webhook — inventado por nós

Diferente da chave da API, **este segredo nós criamos** e informamos ao
Asaas. Ele volta em toda chamada, no header `asaas-access-token`, e é o
que prova que a requisição veio de lá.

```bash
# Gere algo longo e aleatório. Não reutilize entre ambientes.
openssl rand -hex 32

supabase secrets set ASAAS_WEBHOOK_TOKEN='<o valor gerado>' \
  --project-ref nhoircibjcxsakjimisp
```

## 3. Cadastrar o webhook no painel

**Integrações → Webhooks → Adicionar**:

| Campo | Valor |
|---|---|
| URL | `https://nhoircibjcxsakjimisp.supabase.co/functions/v1/asaas-webhook` |
| Token de autenticação | o mesmo `ASAAS_WEBHOOK_TOKEN` do passo 2 |
| Versão da API | v3 |
| Eventos | **Cobranças** e **Checkout** |

Em produção, a URL é a mesma trocando o `project-ref` por
`fgvxhwpqsxohqrccrlfn`.

⚠️ **Marcar Checkout também.** Sem esses eventos o cartão nunca ativa:
é o `CHECKOUT_PAID` que avisa que o aluno autorizou a assinatura.

### ⚠️ A armadilha dos 15 erros

O Asaas tenta entregar **15 vezes** e, se as 15 falharem, **pausa a fila
inteira da conta** — nenhum evento de nenhum aluno chega mais até alguém
reativar à mão no painel. E eventos ficam guardados só **14 dias**.

É por isso que a função responde `200` para tudo que é desfecho de
negócio (cobrança desconhecida, pagamento já processado, evento que não
nos interessa) e só devolve erro quando a falha é de infraestrutura, que
é justamente o caso em que a reentrega resolve.

**Se a fila parar:** painel → Webhooks → a fila aparece interrompida, e
há um botão para reativar. Vale conferir antes se a causa foi resolvida.

## 4. Desligar as notificações do Asaas

**Configurações → Notificações → desativar tudo.**

O Asaas cobra por pacote de e-mail/SMS e por mensagem de WhatsApp, e o
sistema já manda os próprios e-mails — deixar os dois ligados faz o
aluno receber a mesma cobrança duas vezes, com textos diferentes, e
pagando por isso.

O código já manda `notificationDisabled: true` ao criar o cliente, mas a
configuração da conta é a rede de segurança.

## 5. Deploy das funções

Entram pelo `deploy.yml` junto com as migrations. Para publicar à mão
durante a homologação:

```bash
supabase functions deploy asaas-cobranca --project-ref nhoircibjcxsakjimisp
supabase functions deploy asaas-webhook  --project-ref nhoircibjcxsakjimisp
```

## 6. Homologar no sandbox

1. Cadastre um aluno com **e-mail e CPF** (o Asaas exige CPF — ver
   abaixo).
2. Matrículas → Nova contratação → escolha um plano pago.
3. Matrículas → **Contratações** → **Cobrar no Pix** (ou **Assinar no
   cartão**, para testar a recorrência).
4. Abra o link. No sandbox dá para marcar como pago sem dinheiro real:
   painel → Cobranças → a cobrança → **Receber em dinheiro**.
5. Confira que a contratação virou **concluída** sozinha, que a matrícula
   existe e que os créditos foram liberados.
6. Para testar a recorrência do Pix sem esperar um mês: crie a entrada do
   ciclo seguinte (`select cobrar_ciclo(<matricula>, 2, current_date)`) e
   rode `select disparar_cobrancas();` — deve sair cobrança e e-mail.

Se nada acontecer, o log da função diz onde parou:

```bash
supabase functions logs asaas-webhook --project-ref nhoircibjcxsakjimisp
```

## O que o Asaas exige e o sistema não tinha

**CPF.** `POST /customers` tem `cpfCnpj` como campo obrigatório, e o
cadastro de aluno nunca coletou CPF. A coluna foi criada **nullable** de
propósito: lead que ainda não virou aluno não tem por que informar, e
exigir no cadastro colocaria barreira no começo do funil. Quem recusa é
a emissão da cobrança, dizendo o nome de quem está sem.

Na prática: **todo aluno que for pagar pelo gateway precisa ter CPF na
ficha.** Os cadastros antigos não têm.

## Como a recorrência funciona — os dois caminhos

Decisão da gestão em 23/09/2026: oferecer os dois, com o aluno
escolhendo na contratação.

| | Pix | Cartão |
|---|---|---|
| Quem gera a cobrança de cada ciclo | **nosso cron** (`emitir-cobrancas`, 9h) | **o Asaas** (assinatura) |
| Quem age todo mês | o aluno, pagando | ninguém — debita sozinho |
| Custo | R$1,99 por cobrança | ~3% |
| A equipe clica em quê | nada | nada |

Nos dois casos a equipe não faz nada depois da primeira vez. A diferença
é o **aluno** precisar pagar ativamente no Pix.

### O que impede a cobrança dupla

`vw_cobrancas_a_emitir` exclui matrícula que tem assinatura **ativa** em
`assinaturas_gateway`. Sem isso, o mesmo mês sairia duas vezes: uma pelo
nosso cron, outra pela assinatura do Asaas.

### Por que o cartão não usa o nosso cron

`POST /payments` com `creditCardToken` exige `remoteIp`, e a doc do Asaas
é explícita em que precisa ser **o IP do aparelho do aluno**, não o do
servidor. Numa cobrança mensal disparada por cron não existe aluno na
tela, logo não existe esse IP.

O checkout recorrente resolve na raiz: o aluno autoriza na página do
Asaas, e quem captura o IP é o Asaas.

⚠️ **O link do checkout expira em 24h** (`minutesToExpire`, máximo aceito
pela API). Se o aluno demorar, é só gerar outro.

## Pix Automático — não disponível nesta conta

O Pix Automático do Banco Central deixaria o aluno autorizar uma vez e os
ciclos seguintes debitarem sozinhos **ao custo fixo de Pix** — o melhor
dos dois mundos. A gestão conferiu em 23/09/2026 e **a opção não aparece
no painel** desta conta; exige CNPJ ativo há 6+ meses, conta aprovada e
CNAE compatível.

Quando liberar, ele substitui o caminho do cartão: muda o corpo enviado
em `asaas-cobranca`, e `cobrancas` / `assinaturas_gateway` / webhook
continuam iguais.

## Inadimplência — o que acontece quando não paga

| Momento | O que o sistema faz |
|---|---|
| D-`dias_antecedencia_cobranca` | emite a cobrança do ciclo seguinte e manda o link |
| Ciclo termina **sem pagamento** | `marcar_inadimplente()` — a matrícula sai de "ativa" |
| Enquanto inadimplente | **não recebe os créditos do mês novo** e `agendar_aula()` recusa |
| Paga atrasado (link, cartão ou baixa manual) | volta para "ativa" e os créditos são liberados |

Os créditos do ciclo **já pago** não são apagados — mas também não são
usáveis, porque agendar exige matrícula ativa. É essa a alavanca.

⚠️ O desbloqueio no pagamento atrasado é feito por **gatilho em
`entradas_financeiras`** (`20260928120000`), não dentro do webhook. Pagar
atrasado acontece por mais de uma porta — gateway, baixa manual no
Financeiro, acerto no banco — e resolver só no webhook deixaria as
outras com o mesmo defeito.

## Multa e juros de atraso

Existem e **nascem desligados** (`config_financeiro.multa_atraso_pct` e
`juros_mes_atraso_pct`, ambos `0`). Enquanto estiverem em zero, nada é
enviado ao Asaas e atrasar não custa dinheiro — a única consequência é o
bloqueio.

Para ligar:

```sql
update config_financeiro
set multa_atraso_pct = 2, juros_mes_atraso_pct = 1;
```

O Asaas aplica sozinho quando o aluno paga depois do vencimento.

⚠️ **Antes de ligar, isto precisa estar no regulamento que o aluno
aceitou.** Cobrar multa que ninguém combinou é problema, não automação.
Os tetos do CDC para mensalidade são 2% de multa e 1% de juros ao mês, e
há um `check` no banco que impede passar disso por erro de digitação.
