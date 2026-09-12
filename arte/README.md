# arte/

Peças de divulgação prontas para importar no Canva.

Esta pasta existe **fora de `docs/`** de propósito: `docs/` está no `.gitignore`
porque guarda material estratégico interno (precificação, benchmark, pesquisa
com alunas). O que mora aqui é o contrário disso — arte que já vai para o
Instagram e para o grupo do WhatsApp, e que precisa de uma URL pública para o
importador do Canva conseguir ler.

Nada aqui é fonte. A fonte é `scripts/grade-dados.mjs` (a grade) mais
`scripts/gerar-grade-estruturada.mjs` (o layout). Para atualizar:

```
node scripts/gerar-grade-estruturada.mjs
node scripts/exportar-grade-estruturada.mjs
cp "../GRADE-ESTRUTURADA/"*.pdf arte/
```

## grade-2-salas.pdf — 8 páginas

O material publicável, na estrutura **E1** (a sala parte a linha do horário).

| Páginas | Peça |
|---|---|
| 1–2 | Grade geral: Manhã & Tarde, Noite |
| 3–8 | Grade diária, um story por dia (seg → sáb) |

## comparativo-estruturas.pdf — 4 páginas

Só para a equipe decidir, **não é material de publicação**: as mesmas duas
telas gerais nas estruturas E2 (sala parte a coluna do dia) e E3 (uma tabela
fechada por sala).

---

Todas as pranchas são 1080×1920 e saem da aba **GRADE INTER** da planilha
"NOVA GRADE DE HORÁRIOS RASCUNHO".

⚠️ Pendências de conteúdo que aparecem na arte: as salas ainda não têm nome
(sai "Sala 1"/"Sala 2" — trocar `SALAS` em `scripts/grade-dados.mjs`); duas
aulas estão sem professora e saem como "a definir"; e "Defesa Pessoal
Feminina" está em Condicionamento provisoriamente, por não ter família
definida na planilha.
