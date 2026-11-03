# Domínio das páginas de campanha — `eventos.studiopolel.com.br`

Decisão de **28/10/2026**, ainda **não executada**. Este documento existe para
que a escolha não se perca entre a decisão e a hora de fazer.

---

## 1. A decisão

As páginas públicas de campanha (Pic Nic Day e as próximas) devem morar em
**`eventos.studiopolel.com.br`**, cada edição num caminho próprio:

```
eventos.studiopolel.com.br/picnicday/
eventos.studiopolel.com.br/<campanha>/
```

O motivo é o mesmo que tirou o aluno de `sistema.studiopolel.com.br`
([dominio-portal-aluno.md](dominio-portal-aluno.md)): **o endereço diz
"sistema", que é palavra de gestão.** Esse link circula no WhatsApp e no link
da bio do Instagram, para gente que nunca entrou no estúdio. Não é o endereço
de um ERP interno.

## 2. Por que ainda não foi feito

A migração ficou para a próxima campanha. Quem puxava a urgência era a
**Casinha de Portas Abertas**, de 07/11/2026 — e **a campanha caiu** (decisão
da gestão, 02/11/2026).

A página dela nunca chegou ao ar: ficou em `develop` e nunca foi promovida,
então `sistema.studiopolel.com.br/portasabertas/` respondia **404** o tempo
todo. Como o site não vai existir, os arquivos foram removidos junto com este
registro — não houve link circulando para quebrar.

**A decisão do domínio continua valendo** para a campanha seguinte: o que ela
espera é só o passo a passo da §4.

## 3. O que existe hoje (conferido em 28/10/2026)

| Host | Resolve? |
|---|---|
| `sistema.studiopolel.com.br` | CNAME → `studiopoleltecnologia-dotcom.github.io` |
| `aluno.studiopolel.com.br` | CNAME → `studiopoleltecnologia-dotcom.github.io` |
| `studiopolel.com.br` (raiz) | **não resolve** |
| `eventos.studiopolel.com.br` | não existe |

⚠️ O runbook `planilha-inscricoes-evento.md` (local, não versionado) falava em
`picnic.studiopolel.com.br`. **Esse host nunca existiu** — o Pic Nic Day
sempre esteve em `sistema.studiopolel.com.br/picnicday/`. A referência foi
corrigida junto com este documento.

## 4. Como fazer, quando for a hora

É **mais simples** que o portal do aluno, e a diferença importa: o portal do
aluno é o bundle do ERP, que depende do schema do Supabase, e por isso é
publicado pelo `deploy.yml` deste repo, com token, **depois** das migrations.

As páginas de campanha são **HTML estático e autônomo** — não leem o Supabase,
não têm build, não dependem de migration nenhuma. Então não precisam de token,
nem de passo no `deploy.yml`, nem de ordem de deploy. Um repositório de
hospedagem comum resolve.

### 4.1 Repositório

GitHub → organização `studiopoleltecnologia-dotcom` → **New repository**

| Campo | Valor |
|---|---|
| Nome | `eventos` |
| Visibilidade | **Public** (Pages de graça exige repo público) |
| README / .gitignore / licença | **não marcar nada** |

Subir, na branch `main` do repo novo:

```
picnicday/index.html
<campanha>/index.html          (e os assets dela: hero.jpg, logo.png…)
CNAME                          <- uma linha: eventos.studiopolel.com.br
.nojekyll                      <- arquivo vazio
```

O `.nojekyll` não é detalhe: sem ele o Pages passa o conteúdo pelo Jekyll, que
**ignora pastas começadas com `_`** e pode mexer no que não deve.

### 4.2 Ligar o Pages

Repo `eventos` → **Settings** → **Pages** → Source: **Deploy from a branch** →
branch `main`, pasta `/ (root)` → **Save**.

Depois, no mesmo lugar, **Custom domain**: `eventos.studiopolel.com.br`. O
GitHub vai reclamar até o DNS existir — é esperado.

### 4.3 DNS no Registro.br

Registro.br → `studiopolel.com.br` → **Editar zona**:

| Tipo | Nome | Valor |
|---|---|---|
| CNAME | `eventos` | `studiopoleltecnologia-dotcom.github.io.` |

O ponto final no fim do valor é exigido pelo Registro.br. Propaga em minutos,
mas pode levar até algumas horas.

### 4.4 Fechar

Voltar em Settings → Pages e marcar **Enforce HTTPS** (só fica disponível
depois que o certificado é emitido, o que leva alguns minutos após o DNS
resolver).

## 5. Depois de migrar: não quebrar o link antigo

O endereço antigo da campanha — `sistema.studiopolel.com.br/<campanha>/` — já
terá circulado em story, no WhatsApp e no link da bio. Apagar a pasta quebra
quem salvou.

Trocar o `index.html` dessa pasta por um redirecionamento, e só removê-la
quando o evento tiver passado há tempo suficiente:

```html
<!doctype html><meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=https://eventos.studiopolel.com.br/NOME-DA-CAMPANHA/">
<link rel="canonical" href="https://eventos.studiopolel.com.br/NOME-DA-CAMPANHA/">
<p>Esta página mudou de endereço.
<a href="https://eventos.studiopolel.com.br/NOME-DA-CAMPANHA/">Clique aqui</a>.</p>
```

⚠️ A página de cada campanha tem `og:url` e `og:image` **absolutos** no
`<head>` (é o que faz a prévia aparecer quando o link é colado no WhatsApp).
Eles apontam para o domínio antigo e **precisam ser trocados na migração** —
senão a prévia continua puxando a imagem do endereço velho, e some no dia em
que a pasta for apagada.
