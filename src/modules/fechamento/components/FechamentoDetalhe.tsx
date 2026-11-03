import { useEffect, useState } from 'react'
import { Check, Landmark, RotateCcw, X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { useConfirmar } from '../../../components/ui/ConfirmarAcao'
import { Input } from '../../../components/ui/Input'
import { PainelLateral } from '../../../components/ui/PainelLateral'
import { Select } from '../../../components/ui/Select'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { fmtDataHora } from '../../../lib/datas'
import type { Tables } from '../../../lib/database.types'
import {
  useAdicionarAjuste,
  useAprovarFechamento,
  useReabrirFechamento,
  useRemoverAjuste,
  useSalvarResumoFolha,
} from '../hooks/useFechamento'
import type { TipoAjuste } from '../api/fechamento'
import { valorEfetivoFolha } from '../regras'

// Dia 15 do mês seguinte à competência 'YYYY-MM' — o dia de pagamento da folha.
function vencimentoFolha(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number)
  const d = new Date(ano, mes, 15) // mes 1-based vira índice 0-based do mês seguinte
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

type Ajuste = Tables<'fechamento_ajustes'>
type Fechamento = Tables<'fechamentos_professora'> & { ajustes: Ajuste[] }
type Pagamento = Tables<'vw_pagamento_professoras'>

const TIPO_LABEL: Record<TipoAjuste, string> = {
  bonus: 'Bônus',
  desconto: 'Desconto',
  falta: 'Falta',
  substituicao: 'Substituição',
  reposicao: 'Reposição',
  passagem: 'Passagem',
  workshop: 'Workshop',
  outro: 'Outro',
}
// tipos que reduzem o pagamento (guardados com valor negativo)
const NEGATIVOS: TipoAjuste[] = ['desconto', 'falta']

export function FechamentoDetalhe({
  professora,
  competencia,
  pagamento,
  fechamento,
  onFechar,
}: {
  professora: { id: string; nome: string }
  competencia: string
  pagamento: Pagamento | undefined
  fechamento: Fechamento | undefined
  onFechar: () => void
}) {
  const adicionar = useAdicionarAjuste()
  const remover = useRemoverAjuste()
  const aprovar = useAprovarFechamento()
  const reabrir = useReabrirFechamento()
  const salvarResumo = useSalvarResumoFolha()
  const confirmar = useConfirmar()

  const [tipo, setTipo] = useState<TipoAjuste>('bonus')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')

  const aprovado = fechamento?.status === 'aprovado'

  // O que a view calcula sozinha, pelas presenças marcadas no ERP.
  const calcAulas = pagamento?.aulas ?? 0
  const calcHoras = Number(pagamento?.horas ?? 0)
  const calcAlunas = pagamento?.alunas_presentes ?? 0
  const calcBruto = pagamento?.total_centavos ?? 0

  // O que a gestão digitou (null = nunca digitou).
  const digAulas = fechamento?.aulas ?? null
  const digHoras = fechamento?.horas != null ? Number(fechamento.horas) : null
  const digAlunas = fechamento?.alunas ?? null
  const digBruto = fechamento?.bruto_centavos ?? null

  // Precedência digitado × calculado: ver regras.ts.
  const aulas = valorEfetivoFolha(digAulas, calcAulas, aprovado)
  const horas = valorEfetivoFolha(digHoras, calcHoras, aprovado)
  const alunas = valorEfetivoFolha(digAlunas, calcAlunas, aprovado)
  const bruto = valorEfetivoFolha(digBruto, calcBruto, aprovado)

  const ajustes = fechamento?.ajustes ?? []
  const ajustesTotal = ajustes.reduce((s, a) => s + a.valor_centavos, 0)
  const final = bruto + ajustesTotal

  const algumDigitado =
    digAulas != null || digHoras != null || digAlunas != null || digBruto != null

  function salvarCampo(campo: 'aulas' | 'horas' | 'alunas' | 'bruto_centavos') {
    return (novo: number | null) =>
      salvarResumo.mutate({
        professoraId: professora.id,
        competencia,
        campos: { [campo]: novo },
      })
  }

  function addAjuste() {
    const c = parseCentavos(valor)
    if (!c) return
    const assinado = NEGATIVOS.includes(tipo) ? -Math.abs(c) : Math.abs(c)
    adicionar.mutate(
      {
        professoraId: professora.id,
        competencia,
        tipo,
        descricao: descricao.trim() || null,
        valor_centavos: assinado,
      },
      { onSuccess: () => setValor('') },
    )
  }

  const linha = 'flex items-center justify-between text-sm'

  return (
    <PainelLateral
      titulo={professora.nome}
      subtitulo={`Fechamento · ${competencia}`}
      onFechar={onFechar}
    >
      <div>
        {/* Resumo do mês — digitável enquanto o fechamento está aberto */}
        {aprovado ? (
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            {[
              { v: `${aulas}`, r: 'aulas' },
              { v: `${horas}h`, r: 'horas' },
              { v: `${alunas}`, r: 'alunos' },
            ].map((c) => (
              <div key={c.r} className="rounded-lg bg-neutral-50 py-2">
                <div className="font-display text-lg font-bold text-neutral-900">{c.v}</div>
                <div className="text-[10px] text-neutral-400">{c.r}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-3 grid grid-cols-3 gap-2">
            <CampoFolha
              rotulo="aulas"
              digitado={digAulas}
              calculado={calcAulas}
              inteiro
              onSalvar={salvarCampo('aulas')}
            />
            <CampoFolha
              rotulo="horas"
              digitado={digHoras}
              calculado={calcHoras}
              onSalvar={salvarCampo('horas')}
            />
            <CampoFolha
              rotulo="alunos"
              digitado={digAlunas}
              calculado={calcAlunas}
              inteiro
              onSalvar={salvarCampo('alunas')}
            />
          </div>
        )}

        {aprovado ? (
          <div className={`${linha} border-b border-neutral-100 pb-2`}>
            <span className="text-neutral-500">Valor bruto</span>
            <span className="font-medium text-neutral-900">{fmtCentavos(bruto)}</span>
          </div>
        ) : (
          <div className="border-b border-neutral-100 pb-3">
            <CampoFolha
              rotulo="valor bruto"
              digitado={digBruto}
              calculado={calcBruto}
              moeda
              onSalvar={salvarCampo('bruto_centavos')}
            />
            <p className="mt-1.5 text-[11px] leading-snug text-neutral-400">
              Campo em branco = o sistema calcula pelas presenças marcadas na Agenda
              {calcBruto > 0 ? ` (${fmtCentavos(calcBruto)})` : ' (hoje, nada marcado)'}.
              {algumDigitado ? ' Apagar o campo devolve a linha ao cálculo.' : ''}
            </p>
            {salvarResumo.isError && (
              <p className="mt-1 text-[11px] text-danger-600">
                {(salvarResumo.error as Error).message}
              </p>
            )}
          </div>
        )}

        {/* Ajustes */}
        <h3 className="mb-1 mt-4 text-xs font-semibold tracking-wide text-neutral-500">AJUSTES</h3>
        {!aprovado && (
          <p className="mb-2 text-[11px] leading-snug text-neutral-400">
            Só o que entra além do valor dela — passagem, substituição, desconto. O pagamento das
            aulas vai no valor bruto, acima.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {ajustes.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                {TIPO_LABEL[a.tipo]}
              </span>
              <span className="flex-1 truncate text-neutral-500">{a.descricao}</span>
              <span
                className={`font-medium ${
                  a.valor_centavos < 0 ? 'text-danger-600' : 'text-success-600'
                }`}
              >
                {a.valor_centavos < 0 ? '−' : '+'} {fmtCentavos(Math.abs(a.valor_centavos))}
              </span>
              {!aprovado && (
                <button
                  onClick={() =>
                    confirmar.pedir({
                      titulo: 'Excluir este ajuste da folha?',
                      descricao: (
                        <>
                          <b>
                            {TIPO_LABEL[a.tipo]} · {a.valor_centavos < 0 ? '−' : '+'}{' '}
                            {fmtCentavos(Math.abs(a.valor_centavos))}
                          </b>{' '}
                          sai do cálculo e o valor final da professora é recalculado na hora.
                        </>
                      ),
                      aoConfirmar: () => remover.mutateAsync(a.id),
                    })
                  }
                  className="rounded p-0.5 text-neutral-300 transition hover:text-danger-600"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
          {ajustes.length === 0 && <li className="text-xs text-neutral-300">Nenhum ajuste.</li>}
        </ul>

        {!aprovado && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoAjuste)}
              className="w-28"
            >
              {(Object.keys(TIPO_LABEL) as TipoAjuste[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </Select>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição"
              className="w-28 flex-1"
            />
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="R$"
              className="w-16"
            />
            <Button size="sm" onClick={addAjuste} loading={adicionar.isPending}>
              +
            </Button>
          </div>
        )}

        {/* Final */}
        <div className={`${linha} mt-4 border-t border-neutral-200 pt-3`}>
          <span className="font-medium text-neutral-700">Valor final</span>
          <span className="font-display text-lg font-bold text-brand-700">
            {fmtCentavos(final)}
          </span>
        </div>

        {aprovado && fechamento?.aprovado_em && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-success-600">
            <Check className="size-3" />
            Aprovado em {fmtDataHora(fechamento.aprovado_em)}
          </p>
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-col gap-2 border-t border-neutral-100 px-5 py-4">
        {!aprovado ? (
          <>
            <Button
              onClick={() =>
                aprovar.mutate({
                  professoraId: professora.id,
                  competencia,
                  aulas,
                  horas,
                  alunas,
                  bruto_centavos: bruto,
                })
              }
              loading={aprovar.isPending}
            >
              <Check className="size-4" />
              Aprovar fechamento
            </Button>
            <p className="text-center text-[11px] text-neutral-400">
              Ao aprovar, {fmtCentavos(final)} entra no Financeiro vencendo{' '}
              {vencimentoFolha(competencia)}.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-1.5 rounded-md bg-success-50 py-2 text-xs font-medium text-success-700">
              <Landmark className="size-3.5" />
              Lançado no Financeiro · vence {vencimentoFolha(competencia)}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fechamento && reabrir.mutate(fechamento.id)}
              loading={reabrir.isPending}
            >
              <RotateCcw className="size-3.5" />
              Reabrir para editar
            </Button>
            <p className="text-center text-[11px] text-neutral-400">
              Reabrir tira a saída do Financeiro; aprovar de novo relança com o valor novo.
            </p>
          </>
        )}
      </div>
      {confirmar.dialogo}
    </PainelLateral>
  )
}

/** Texto que o campo mostra para um valor guardado. */
function textoDoValor(v: number | null, moeda: boolean): string {
  if (v == null) return ''
  return moeda ? (v / 100).toFixed(2).replace('.', ',') : String(v)
}

/**
 * Um número da folha, digitável.
 *
 * Grava no `onBlur` (e no Enter), não a cada tecla: cada gravação é um UPDATE
 * no fechamento, e salvar letra por letra encheria a rede de requisições e
 * faria o campo pular durante a digitação.
 *
 * Vazio é um valor legítimo — significa "volte a calcular pelas presenças" —,
 * mas texto que não é número NÃO apaga nada: volta ao que estava. Apagar um
 * valor de folha por erro de digitação seria perda silenciosa de dado.
 */
function CampoFolha({
  rotulo,
  digitado,
  calculado,
  moeda = false,
  inteiro = false,
  onSalvar,
}: {
  rotulo: string
  digitado: number | null
  calculado: number
  moeda?: boolean
  inteiro?: boolean
  onSalvar: (v: number | null) => void
}) {
  const [texto, setTexto] = useState(() => textoDoValor(digitado, moeda))
  const [focado, setFocado] = useState(false)

  // Em foco, quem manda é quem digita. Fora de foco, o campo reflete o banco
  // (inclusive depois de a gravação voltar).
  useEffect(() => {
    if (!focado) setTexto(textoDoValor(digitado, moeda))
  }, [digitado, moeda, focado])

  function confirmarValor() {
    setFocado(false)
    const t = texto.trim()
    if (t === '') {
      if (digitado != null) onSalvar(null)
      return
    }
    const lido = moeda ? parseCentavos(t) : Number(t.replace(',', '.'))
    if (lido == null || !Number.isFinite(lido) || lido < 0) {
      setTexto(textoDoValor(digitado, moeda)) // não era número: devolve o anterior
      return
    }
    const novo = inteiro ? Math.round(lido) : lido
    if (novo !== digitado) onSalvar(novo)
    else setTexto(textoDoValor(digitado, moeda))
  }

  return (
    <label className="block">
      <div className="relative">
        {moeda && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
            R$
          </span>
        )}
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => setFocado(true)}
          onBlur={confirmarValor}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          inputMode="decimal"
          placeholder={moeda ? textoDoValor(calculado, true) || '0,00' : String(calculado)}
          className={`w-full rounded-md border border-neutral-200 bg-white py-2 text-sm tabular-nums text-neutral-900 outline-none transition placeholder:text-neutral-300 hover:border-neutral-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${
            moeda
              ? 'pl-9 pr-3 text-right font-display text-base font-bold'
              : 'px-2 text-center font-medium'
          }`}
        />
      </div>
      <span className="mt-0.5 block text-center text-[10px] text-neutral-400">{rotulo}</span>
    </label>
  )
}
