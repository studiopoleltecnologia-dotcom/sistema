import { useMemo } from 'react'
import { cn } from '../../../../components/ui/cn'

/**
 * Remove o que não tem por que existir num documento nosso.
 *
 * O HTML do contrato vem do banco: as cláusulas são escritas pela gestão
 * e os valores do cadastro já chegam escapados por `html_escape()`. Esta
 * limpeza é a segunda camada — se um dia alguém colar HTML de fora numa
 * cláusula, o `<script>` não roda.
 *
 * É deliberadamente uma lista de remoção curta, e não um sanitizador
 * completo: o conjunto de tags que o contrato usa é pequeno e conhecido
 * (p, h2–h4, ul, li, strong, table), e uma biblioteca de 20 kB no bundle
 * do aluno custaria mais do que resolve.
 */
function limpar(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
}

/**
 * Renderiza um documento legal (contrato, termo) com tipografia de
 * leitura: linha confortável, hierarquia clara e a tabela do
 * quadro-resumo legível no celular.
 *
 * Os estilos moram aqui, e não no `index.css`, porque são deste tipo de
 * conteúdo — HTML que vem do banco e não tem como receber classes
 * Tailwind em cada elemento.
 */
export function DocumentoHtml({ html, className }: { html: string; className?: string }) {
  const limpo = useMemo(() => limpar(html), [html])
  return (
    <div
      className={cn('documento-legal text-sm leading-relaxed text-neutral-700', className)}
      // O conteúdo é nosso (cláusulas da gestão) e os valores do cadastro
      // chegam escapados do banco; `limpar()` é a segunda camada.
      dangerouslySetInnerHTML={{ __html: limpo }}
    />
  )
}

/** Os estilos do documento, injetados uma vez por página que o mostra. */
export function EstiloDocumento() {
  return (
    <style>{`
      .documento-legal h2 {
        font-size: 1rem; font-weight: 700; color: #171717;
        margin: 0 0 .75rem;
      }
      .documento-legal h3 {
        font-size: .9375rem; font-weight: 700; color: #171717;
        margin: 1.5rem 0 .5rem; padding-top: 1rem;
        border-top: 1px solid #f5f5f5;
      }
      .documento-legal h3:first-of-type { border-top: 0; padding-top: 0; }
      .documento-legal h4 {
        font-size: .875rem; font-weight: 600; color: #404040;
        margin: 1.125rem 0 .375rem;
      }
      .documento-legal p { margin: 0 0 .625rem; }
      .documento-legal p:last-child { margin-bottom: 0; }
      .documento-legal strong { color: #171717; font-weight: 600; }
      .documento-legal .nota {
        font-size: .75rem; color: #737373; font-style: italic;
        margin: .75rem 0 0; padding: .625rem .75rem;
        background: #fafafa; border-radius: .5rem;
      }
      .documento-legal .registro {
        font-size: .75rem; color: #737373;
        margin-top: .75rem; word-break: break-word;
      }
      .documento-legal table.quadro {
        width: 100%; border-collapse: collapse; margin: 0 0 .25rem;
        font-size: .8125rem;
      }
      .documento-legal table.quadro th,
      .documento-legal table.quadro td {
        text-align: left; vertical-align: top;
        padding: .4375rem .625rem; border-bottom: 1px solid #f5f5f5;
      }
      .documento-legal table.quadro th {
        width: 42%; font-weight: 500; color: #737373; white-space: nowrap;
      }
      .documento-legal table.quadro td { color: #171717; font-weight: 500; }
      @media (max-width: 420px) {
        .documento-legal table.quadro th { white-space: normal; width: 45%; }
      }
    `}</style>
  )
}
