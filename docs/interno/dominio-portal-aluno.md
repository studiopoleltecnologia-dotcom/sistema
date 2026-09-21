# Domínio próprio do portal do aluno — `aluno.studiopolel.com.br`

Runbook de ativação. O **código já está pronto** (PR de 21/09/2026); o que
falta aqui é configuração feita no navegador: GitHub, Registro.br e Supabase.
Custo: **R$ 0**.

---

## 1. Por que existe

Até aqui o aluno agendava em `sistema.studiopolel.com.br/agendamentos/`. Duas
coisas davam errado com isso:

1. O endereço diz **"sistema"** — palavra de gestão, não de aluno.
2. Bastava apagar o fim da URL (ou salvar o favorito errado) para cair na tela
   de login da equipe, que respondia *"peça para a gestão liberar o seu e-mail
   em Equipe & Acessos"*. Quem lia isso concluía que o acesso tinha quebrado e
   ligava para o estúdio.

Com o domínio próprio, **no endereço do aluno o ERP não existe** — nem
digitando o caminho na mão. Qualquer caminho em `aluno.studiopolel.com.br`
abre o portal do aluno.

A professora continua em `sistema.studiopolel.com.br/portalequipe/`. São 11
pessoas, que recebem o link direto da gestão; o aluno são ~150 e o link
circula sozinho no WhatsApp. O problema não é o mesmo.

## 2. Por que precisa de um segundo repositório

O GitHub Pages aceita **um domínio customizado por repositório** — é o que o
arquivo `public/CNAME` guarda (hoje `sistema.studiopolel.com.br`). Não existe
como pendurar um segundo domínio no mesmo repo.

Então o domínio do aluno mora num repositório separado que **não tem código
nenhum**: é só hospedagem. Quem publica lá é o próprio `deploy.yml` deste
repo, com o mesmo bundle e o mesmo commit, **depois** das migrations. Isso é
de propósito — um pipeline independente no outro repo poderia publicar um
front que espera um schema que ainda não subiu.

---

## 3. Passo a passo

### 3.1 Criar o repositório de hospedagem

GitHub → organização `studiopoleltecnologia-dotcom` → **New repository**

| Campo | Valor |
|---|---|
| Nome | `portal-aluno` |
| Visibilidade | **Public** (Pages de graça exige repo público) |
| README / .gitignore / licença | **não marcar nada** — o repo tem que nascer vazio |

### 3.2 Criar o token que deixa o deploy escrever nesse repo

GitHub → foto do perfil → **Settings** → **Developer settings** → **Personal
access tokens** → **Fine-grained tokens** → **Generate new token**

| Campo | Valor |
|---|---|
| Token name | `deploy-portal-aluno` |
| Resource owner | `studiopoleltecnologia-dotcom` |
| Expiration | 1 ano (anote a data — ver 3.7) |
| Repository access | **Only select repositories** → `portal-aluno` |
| Permissions → Repository permissions → **Contents** | **Read and write** |

Gere e **copie o token agora** — o GitHub só mostra uma vez.

### 3.3 Guardar o token como secret deste repo

Repositório `sistema` (este) → **Settings** → **Environments** → **Production**
→ **Add environment secret**

| Campo | Valor |
|---|---|
| Name | `PAGES_PORTAL_ALUNO_TOKEN` |
| Value | o token copiado no passo anterior |

⚠️ O nome tem que ser **exatamente** esse — é o que o `deploy.yml` procura.
Tem que ser secret **do ambiente Production**, não do repositório, porque é
nesse ambiente que o job de build roda.

### 3.4 Rodar o deploy uma vez

Actions → **Deploy PRODUÇÃO (Supabase + GitHub Pages)** → **Run workflow** na
branch `main`. (Ou simplesmente deixe acontecer no próximo merge
`develop` → `main`.)

Isso cria a branch `gh-pages` no repositório novo. No fim do log deve aparecer
*"Portal do aluno publicado em https://aluno.studiopolel.com.br"*.

### 3.5 Ligar o Pages no repositório novo

Repositório `portal-aluno` → **Settings** → **Pages**

| Campo | Valor |
|---|---|
| Source | **Deploy from a branch** |
| Branch | `gh-pages` / `(root)` → **Save** |
| Custom domain | `aluno.studiopolel.com.br` → **Save** |

O campo do domínio deve aparecer já preenchido (o deploy grava o arquivo
`CNAME` junto do site). **Enforce HTTPS** só fica clicável depois que o
certificado sai — pode levar de alguns minutos a algumas horas.

### 3.6 Criar o registro de DNS no Registro.br

[registro.br](https://registro.br) → login → domínio `studiopolel.com.br` →
**Editar zona / DNS**

| Campo | Valor |
|---|---|
| Nome | `aluno` |
| Tipo | `CNAME` |
| Valor | `studiopoleltecnologia-dotcom.github.io.` (com o ponto final) |

Salvar. A propagação leva de minutos a algumas horas. Nada do que já existe é
tocado: o site da Wix (`www`) e o `sistema` continuam nos registros deles.

### 3.7 Liberar o endereço novo no Supabase Auth

Supabase → projeto **sistema** (`fgvxhwpqsxohqrccrlfn`) → **Authentication** →
**URL Configuration** → **Redirect URLs** → **Add URL**:

```
https://aluno.studiopolel.com.br/**
```

Sem isso, o link de *"esqueci minha senha"* e o de confirmação de e-mail
voltam para o domínio antigo — o aluno redefine a senha e reaparece na tela
da gestão, que é exatamente o que este trabalho todo evita.

---

## 4. Como conferir que deu certo

| Teste | Esperado |
|---|---|
| `https://aluno.studiopolel.com.br` | tela de login do **aluno** |
| `https://aluno.studiopolel.com.br/qualquercoisa` | a **mesma** tela (não um 404 do GitHub) |
| `https://sistema.studiopolel.com.br/agendamentos/` | continua funcionando |
| Entrar com conta de **aluno** em `https://sistema.studiopolel.com.br` | é levado para o portal do aluno sozinho |
| "Esqueci minha senha" feito no domínio novo | o link do e-mail volta para `aluno.studiopolel.com.br` |

O endereço antigo **não tem prazo para sair**. Ele é o link que já está salvo
no celular das alunas; vai continuar valendo e levando para o lugar certo.

## 5. Se precisar desfazer

Apague o secret `PAGES_PORTAL_ALUNO_TOKEN`. O deploy volta a publicar só o
site da gestão, com um aviso no log, **sem falhar**. Depois, se quiser, apague
o registro de DNS e o repositório. Nada do que funcionava antes depende disso.

## 6. Manutenção

- **O token vence.** Quando vencer, o passo de publicar o portal do aluno é
  **pulado com aviso** — a produção não quebra, mas o site do aluno para de
  receber atualização (fica no ar com a última versão publicada). Renovar =
  repetir 3.2 e 3.3.
- **Mudou de domínio?** O nome do host está escrito em dois lugares e os dois
  precisam mudar juntos: `HOSTS_DO_ALUNO` em [src/App.tsx](../../src/App.tsx)
  e `DOMINIO_ALUNO` em
  [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml).
