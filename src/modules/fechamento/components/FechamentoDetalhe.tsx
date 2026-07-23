import { useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { fmtDataHora } from '../../../lib/datas'
import type { Tables } from '../../../lib/database.types'
import {
  useLancarPagamento,
  usePagamentosLancados,
} from '../../professoras/hooks/useProfessoras'
import {
  useAdicionarAjuste,
  useAprovarFechamento,
  useReabrirFechamento,
  useRemoverAjuste,
} from '../hooks/useFechamento'
import type { TipoAjuste } from '../api/fechamento'

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
  const lancar = useLancarPagamento()
  const { data: lancados } = usePagamentosLancados(competencia)

  const [tipo, setTipo] = useState<TipoAjuste>('bonus')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')

  const aprovado = fechamento?.status === 'aprovado'
  // aprovado congela o snapshot; aberto calcula ao vivo pela view
  const aulas = aprovado ? fechamento?.aulas ?? 0 : pagamento?.aulas ?? 0
  const horas = aprovado ? Number(fechamento?.horas ?? 0) : Number(pagamento?.horas ?? 0)
  const alunas = aprovado ? fechamento?.alunas ?? 0 : pagamento?.alunas_presentes ?? 0
  const bruto = aprovado ? fechamento?.bruto_centavos ?? 0 : pagamento?.total_centavos ?? 0

  const ajustes = fechamento?.ajustes ?? []
  const ajustesTotal = ajustes.reduce((s, a) => s + a.valor_centavos, 0)
  const final = bruto + ajustesTotal

  const jaLancado = lancados?.has(`Pagamento ${professora.nome} (${competencia})`) ?? false

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
    <aside className="fixed inset-y-0 right-0 z-10 flex w-96 flex-col border-l border-neutral-100 bg-white shadow-xl">
      <div className="flex items-start justify-between border-b border-neutral-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">{professora.nome}</h2>
          <p className="mt-0.5 text-xs text-neutral-400">Fechamento · {competencia}</p>
        </div>
        <button
          onClick={onFechar}
          className="rounded-md px-2 py-1 text-xs text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
        >
          Fechar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Resumo */}
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-neutral-50 py-2">
            <div className="font-display text-lg font-bold text-neutral-900">{aulas}</div>
            <div className="text-[10px] text-neutral-400">aulas</div>
          </div>
          <div className="rounded-lg bg-neutral-50 py-2">
            <div className="font-display text-lg font-bold text-neutral-900">{horas}h</div>
            <div className="text-[10px] text-neutral-400">horas</div>
          </div>
          <div className="rounded-lg bg-neutral-50 py-2">
            <div className="font-display text-lg font-bold text-neutral-900">{alunas}</div>
            <div className="text-[10px] text-neutral-400">alunos</div>
          </div>
        </div>

        <div className={`${linha} border-b border-neutral-100 pb-2`}>
          <span className="text-neutral-500">Valor bruto</span>
          <span className="font-medium text-neutral-900">{fmtCentavos(bruto)}</span>
        </div>

        {/* Ajustes */}
        <h3 className="mb-2 mt-4 text-xs font-semibold tracking-wide text-neutral-500">AJUSTES</h3>
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
                  onClick={() => remover.mutate(a.id)}
                  className="rounded p-0.5 text-neutral-300 transition hover:text-danger-600"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
          {ajustes.length === 0 && (
            <li className="text-xs text-neutral-300">Nenhum ajuste.</li>
          )}
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
        ) : (
          <>
            {jaLancado ? (
              <p className="text-center text-xs font-medium text-neutral-400">
                Já lançado no Financeiro ✓
              </p>
            ) : (
              <Button
                onClick={() =>
                  lancar.mutate({
                    professora: professora.nome,
                    mes: competencia,
                    total_centavos: final,
                  })
                }
                loading={lancar.isPending}
              >
                Lançar {fmtCentavos(final)} no Financeiro
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fechamento && reabrir.mutate(fechamento.id)}
              loading={reabrir.isPending}
            >
              <RotateCcw className="size-3.5" />
              Reabrir
            </Button>
          </>
        )}
      </div>
    </aside>
  )
}
