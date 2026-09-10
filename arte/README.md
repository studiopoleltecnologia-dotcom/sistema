# arte/

Peças de divulgação prontas para importar no Canva.

Esta pasta existe **fora de `docs/`** de propósito: `docs/` está no `.gitignore`
porque guarda material estratégico interno (precificação, benchmark, pesquisa
com alunas). O que mora aqui é o contrário disso — arte que já vai para o
Instagram e para o grupo do WhatsApp, e que precisa de uma URL pública para o
importador do Canva conseguir ler.

Nada aqui é fonte. A fonte é `scripts/gerar-grade-2-salas.mjs`; estes arquivos
são saída. Para atualizar:

```
node scripts/gerar-grade-2-salas.mjs
node scripts/exportar-grade-2-salas.mjs
cp "../GRADE-2-SALAS/grade-2-salas.pdf" arte/
```

## grade-2-salas.pdf

12 páginas de 1080×1920, com a grade da aba **GRADE INTER** da planilha
"NOVA GRADE DE HORÁRIOS RASCUNHO" (estado de 09/09/2026).

| Páginas | Peça |
|---|---|
| 1–6 | Opção A — um dia por tela (story diário) |
| 7–9 | Opção M1 — semana por período, nome da sala no vão da esquerda |
| 10–12 | Opção M2 — semana por período, etiqueta do nome sobre o trilho |

M1 e M2 são a **mesma estrutura** com dois tratamentos diferentes para assinar
a sala — servem para a equipe escolher um, não para publicar os dois.

⚠️ As salas ainda não têm nome. Sai "Sala 1" e "Sala 2"; se forem batizadas,
trocar `SALAS` no topo do gerador e reexportar.
