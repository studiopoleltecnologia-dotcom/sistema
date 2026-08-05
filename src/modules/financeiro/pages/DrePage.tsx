import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { KpiCard } from '../../../components/ui/KpiCard'
import { fmtCentavos } from '../../../lib/dinheiro'
import { deslocarMes, mesAtual, periodoMes, rotuloPeriodo } from '../periodo'
import { useDreCompetencia } from '../hooks/useFinanceiro'
import {
  CATEGORIA_ENTRADA_LABEL,
  ORDEM_TIPO_SAIDA,
  TIPO_SAIDA_LABEL,
  type CategoriaEntrada,
  type TipoSaida,
} from '../types'
import { useState } from 'react'

type Linha = { rotulo: string; valor: number }
type Grupo = { titulo: string; linhas: Linha[]; subtotal: number }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const rotuloExtenso = (ym: string) => {
  const [ano, mes] = ym.split('-').map(Number)
  return `${MESES[mes - 1]} de ${ano}`
}

export function DrePage() {
  const [mes, setMes] = useState(mesAtual())
  const periodo = periodoMes(mes)
  const { data: dre } = useDreCompetencia(periodo)

  // Receita gerada no mês (competência), por categoria — recebida ou não.
  const recPorCat = new Map<CategoriaEntrada, number>()
  for (const l of dre ?? []) {
    if (l.tipo !== 'receita' || !l.categoria) continue
    const cat = l.categoria as CategoriaEntrada
    recPorCat.set(cat, (recPorCat.get(cat) ?? 0) + (l.total_centavos ?? 0))
  }
  const receitas: Linha[] = [...recPorCat.entries()]
    .map(([cat, v]) => ({ rotulo: CATEGORIA_ENTRADA_LABEL[cat], valor: v }))
    .sort((a, b) => b.valor - a.valor)
  const receitaTotal = receitas.reduce((s, l) => s + l.valor, 0)

  // Despesa gerada no mês (competência), por tipo (Fixo / Fixo planejado / Variável) e categoria.
  const grupos: Grupo[] = ORDEM_TIPO_SAIDA.map((tipo: TipoSaida) => {
    const porCat = new Map<string, number>()
    for (const l of dre ?? []) {
      if (l.tipo !== 'despesa' || l.subtipo !== tipo || !l.categoria) continue
      porCat.set(l.categoria, (porCat.get(l.categoria) ?? 0) + (l.total_centavos ?? 0))
    }
    const linhas = [...porCat.entries()]
      .map(([rotulo, valor]) => ({ rotulo, valor }))
      .sort((a, b) => b.valor - a.valor)
    return { titulo: TIPO_SAIDA_LABEL[tipo], linhas, subtotal: linhas.reduce((s, l) => s + l.valor, 0) }
  }).filter((g) => g.linhas.length > 0)
  const despesaTotal = grupos.reduce((s, g) => s + g.subtotal, 0)
  const resultado = receitaTotal - despesaTotal

  function imprimir() {
    const win = window.open('', '_blank', 'width=820,height=900')
    if (!win) return
    win.document.write(montarHtml({ mes, receitas, receitaTotal, grupos, despesaTotal, resultado }))
    win.document.close()
    win.focus()
    win.print()
  }

  const linhaCls = 'flex items-center justify-between py-1.5 text-sm'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMes(deslocarMes(mes, -1))}
            className="rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-28 text-center text-sm font-medium text-neutral-700">
            {rotuloExtenso(mes)}
          </span>
          <button
            onClick={() => setMes(deslocarMes(mes, 1))}
            className="rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <button
          onClick={imprimir}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          <Printer className="size-4" />
          Salvar PDF
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Receita" value={fmtCentavos(receitaTotal)} tone="success" />
        <KpiCard label="Despesa" value={fmtCentavos(despesaTotal)} tone="danger" />
        <KpiCard
          label="Resultado"
          value={fmtCentavos(resultado)}
          tone={resultado >= 0 ? 'success' : 'danger'}
          hint="receita − despesa"
        />
      </div>

      <div className="rounded-xl border border-neutral-200/80 bg-white p-5 shadow-sm">
        <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-success-600">
          Receitas
        </h3>
        {receitas.length === 0 ? (
          <p className="py-2 text-sm text-neutral-400">Nenhuma receita gerada no mês.</p>
        ) : (
          receitas.map((l) => (
            <div key={l.rotulo} className={`${linhaCls} border-b border-neutral-50`}>
              <span className="text-neutral-600">{l.rotulo}</span>
              <span className="font-medium tabular-nums text-neutral-800">{fmtCentavos(l.valor)}</span>
            </div>
          ))
        )}
        <div className={`${linhaCls} mt-1 border-t border-neutral-200 pt-2 font-semibold`}>
          <span className="text-neutral-700">Total de receitas</span>
          <span className="tabular-nums text-success-700">{fmtCentavos(receitaTotal)}</span>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200/80 bg-white p-5 shadow-sm">
        <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-danger-600">
          Despesas
        </h3>
        {grupos.length === 0 ? (
          <p className="py-2 text-sm text-neutral-400">Nenhuma despesa no mês.</p>
        ) : (
          grupos.map((g) => (
            <div key={g.titulo} className="mb-3">
              <p className="mb-1 text-xs font-medium text-neutral-400">{g.titulo}</p>
              {g.linhas.map((l) => (
                <div key={l.rotulo} className={`${linhaCls} border-b border-neutral-50`}>
                  <span className="text-neutral-600">{l.rotulo}</span>
                  <span className="font-medium tabular-nums text-neutral-800">{fmtCentavos(l.valor)}</span>
                </div>
              ))}
              <div className={`${linhaCls} text-xs text-neutral-500`}>
                <span>Subtotal {g.titulo.toLowerCase()}</span>
                <span className="tabular-nums">{fmtCentavos(g.subtotal)}</span>
              </div>
            </div>
          ))
        )}
        <div className={`${linhaCls} mt-1 border-t border-neutral-200 pt-2 font-semibold`}>
          <span className="text-neutral-700">Total de despesas</span>
          <span className="tabular-nums text-danger-600">{fmtCentavos(despesaTotal)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-4">
        <span className="font-display font-semibold text-neutral-800">Resultado do mês</span>
        <span
          className={`font-display text-xl font-bold tabular-nums ${
            resultado >= 0 ? 'text-success-700' : 'text-danger-600'
          }`}
        >
          {fmtCentavos(resultado)}
        </span>
      </div>

      <p className="text-xs text-neutral-400">
        Regime de competência (conta no mês em que a receita/despesa foi gerada — recebida/paga ou não).{' '}
        {rotuloPeriodo(periodo)}.
      </p>
    </div>
  )
}

// --- PDF via impressão do navegador: documento HTML autossuficiente ---

function montarHtml(d: {
  mes: string
  receitas: Linha[]
  receitaTotal: number
  grupos: Grupo[]
  despesaTotal: number
  resultado: number
}): string {
  const linha = (rotulo: string, valor: number, forte = false) =>
    `<tr${forte ? ' class="forte"' : ''}><td>${escapar(rotulo)}</td><td class="v">${fmtCentavos(valor)}</td></tr>`

  const receitasHtml = d.receitas.length
    ? d.receitas.map((l) => linha(l.rotulo, l.valor)).join('')
    : '<tr><td colspan="2" class="vazio">Nenhuma receita gerada no mês.</td></tr>'

  const despesasHtml = d.grupos.length
    ? d.grupos
        .map(
          (g) =>
            `<tr class="grupo"><td colspan="2">${escapar(g.titulo)}</td></tr>` +
            g.linhas.map((l) => linha(l.rotulo, l.valor)).join('') +
            `<tr class="sub"><td>Subtotal ${escapar(g.titulo.toLowerCase())}</td><td class="v">${fmtCentavos(g.subtotal)}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="2" class="vazio">Nenhuma despesa no mês.</td></tr>'

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
  <title>DRE ${escapar(rotuloExtenso(d.mes))} — Studio Pole L</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; color: #241f33; margin: 0; padding: 40px; }
    .cab { border-bottom: 2px solid #6a5d8f; padding-bottom: 12px; margin-bottom: 24px; }
    .cab h1 { margin: 0; font-size: 20px; letter-spacing: .04em; }
    .cab p { margin: 4px 0 0; color: #6b6480; font-size: 13px; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; margin: 22px 0 6px; }
    h2.rec { color: #1f8a58; } h2.des { color: #c0392b; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 5px 0; font-size: 13px; border-bottom: 1px solid #f0edf5; }
    td.v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    tr.forte td { font-weight: 700; border-top: 1.5px solid #241f33; border-bottom: none; padding-top: 8px; }
    tr.grupo td { font-weight: 600; color: #6b6480; padding-top: 10px; border-bottom: none; font-size: 12px; }
    tr.sub td { color: #928aa6; font-size: 12px; border-bottom: none; }
    td.vazio { color: #928aa6; font-style: italic; }
    .resultado { display: flex; justify-content: space-between; align-items: center; margin-top: 26px; padding: 14px 16px; border: 1px solid #e7e2ef; border-radius: 10px; background: #faf9fc; }
    .resultado span:first-child { font-weight: 600; }
    .resultado .num { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .pos { color: #1f8a58; } .neg { color: #c0392b; }
    .rodape { margin-top: 30px; color: #928aa6; font-size: 11px; }
    @media print { body { padding: 24px; } }
  </style></head><body>
    <div class="cab">
      <h1>STUDIO POLE L</h1>
      <p>DRE — Demonstrativo de Resultado · ${escapar(rotuloExtenso(d.mes))}</p>
    </div>
    <h2 class="rec">Receitas</h2>
    <table>${receitasHtml}${linha('Total de receitas', d.receitaTotal, true)}</table>
    <h2 class="des">Despesas</h2>
    <table>${despesasHtml}${linha('Total de despesas', d.despesaTotal, true)}</table>
    <div class="resultado">
      <span>Resultado do mês (receita − despesa)</span>
      <span class="num ${d.resultado >= 0 ? 'pos' : 'neg'}">${fmtCentavos(d.resultado)}</span>
    </div>
    <p class="rodape">Regime de competência. Gerado pelo sistema Studio Pole L.</p>
  </body></html>`
}

function escapar(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}
