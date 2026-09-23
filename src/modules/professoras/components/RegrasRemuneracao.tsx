import { useMemo, useState } from 'react'
import { CalendarClock, Plus, Scale } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useConfirmar } from '../../../components/ui/ConfirmarAcao'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos } from '../../../lib/dinheiro'
import { useEncerrarRegra, useRegrasRemuneracao } from '../hooks/useRemuneracao'
import { RegraForm } from './RegraForm'
import type { RegraCompleta } from '../api/remuneracao'

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** O que a regra paga, em uma linha legível. */
function comoPaga(r: RegraCompleta): string {
  switch (r.tipo) {
    case 'percentual':
      return `${r.percentual}% das mensalidades contratadas na turma`
    case 'por_hora':
      return `${fmtCentavos(r.valor_centavos)} por hora`
    case 'fixo_aula':
      return `${fmtCentavos(r.valor_centavos)} por aula`
    case 'fixo_mes':
      return `${fmtCentavos(r.valor_centavos)} por mês`
    default: {
      const partes = [`${fmtCentavos(r.valor_centavos)} por aluno`]
      if (r.piso_centavos) partes.push(`piso ${fmtCentavos(r.piso_centavos)}`)
      if (r.teto_centavos) partes.push(`teto ${fmtCentavos(r.teto_centavos)}`)
      return partes.join(' · ')
    }
  }
}

/** Para quem a regra vale, do mais específico para o mais geral. */
function escopo(r: RegraCompleta): { texto: string; peso: number } {
  if (r.turma) {
    return {
      texto: `${r.turma.modalidade} · ${DIAS[r.turma.dia_semana]} ${String(r.turma.horario).slice(0, 5)}`,
      peso: 3,
    }
  }
  if (r.modalidade) return { texto: r.modalidade.nome, peso: 2 }
  if (r.professora) return { texto: r.professora.nome, peso: 1 }
  return { texto: 'Padrão do estúdio', peso: 0 }
}

const ROTULO_PESO = ['padrão', 'professora', 'modalidade', 'turma']

/**
 * As regras que decidem a folha.
 *
 * A tela existe porque a alternativa é a gestão depender de migration
 * para mudar quanto uma professora ganha — e valores mudam. O que ela
 * precisa deixar claro, além dos números:
 *
 * · quem ganha de quem quando duas regras servem à mesma aula;
 * · que encerrar é datar o fim, não apagar — a folha de um mês passado
 *   precisa continuar achando a regra que valia naquela data.
 */
export function RegrasRemuneracao() {
  const { data: regras, isLoading } = useRegrasRemuneracao()
  const encerrar = useEncerrarRegra()
  const confirmar = useConfirmar()
  const [editando, setEditando] = useState<RegraCompleta | null>(null)
  const [criando, setCriando] = useState(false)

  const hoje = new Date().toISOString().slice(0, 10)
  const vigente = (r: RegraCompleta) =>
    r.vigencia_inicio <= hoje && (!r.vigencia_fim || r.vigencia_fim >= hoje)

  const ordenadas = useMemo(
    () =>
      [...(regras ?? [])].sort((a, b) => {
        const va = Number(vigente(a))
        const vb = Number(vigente(b))
        if (va !== vb) return vb - va
        const ea = escopo(a).peso
        const eb = escopo(b).peso
        if (ea !== eb) return eb - ea
        return b.vigencia_inicio.localeCompare(a.vigencia_inicio)
      }),
    [regras],
  )

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-xs text-neutral-500">
          Quando mais de uma regra serve à mesma aula, vale a mais específica —
          <strong> turma</strong> ganha de <strong>modalidade</strong>, que ganha de{' '}
          <strong>professora</strong>, que ganha do padrão. O valor de cada aula é sempre o da
          regra vigente <em>na data da aula</em>, então mudar a tabela hoje não mexe no mês que
          já passou.
        </p>
        <Button size="sm" onClick={() => setCriando(true)}>
          <Plus className="size-4" />
          Nova regra
        </Button>
      </div>

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {!isLoading && ordenadas.length === 0 && (
        <EmptyState
          icon={Scale}
          title="Nenhuma regra cadastrada"
          description="Sem regra vigente, a aula vale zero no fechamento — de propósito, para a falta aparecer em vez de pagar um valor inventado."
          action={
            <Button size="sm" onClick={() => setCriando(true)}>
              <Plus className="size-4" />
              Nova regra
            </Button>
          }
        />
      )}

      <div className="flex flex-col gap-2">
        {ordenadas.map((r) => {
          const e = escopo(r)
          const atual = vigente(r)
          return (
            <article
              key={r.id}
              className={`rounded-lg border bg-white p-3.5 shadow-sm transition ${
                atual ? 'border-neutral-200/80' : 'border-neutral-100 opacity-60'
              }`}
            >
              <header className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-display text-sm font-bold text-neutral-900">{e.texto}</h3>
                    <Badge variant="neutral">{ROTULO_PESO[e.peso]}</Badge>
                    {!atual && <Badge variant="neutral">encerrada</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-600">{comoPaga(r)}</p>
                  {r.faixas.length > 0 && (
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Faixas:{' '}
                      {[...r.faixas]
                        .sort((a, b) => a.min_alunos - b.min_alunos)
                        .map((f) => `${f.min_alunos}+ → ${fmtCentavos(f.valor_centavos)}`)
                        .join(' · ')}
                    </p>
                  )}
                  {r.observacao && (
                    <p className="mt-0.5 text-xs italic text-neutral-400">{r.observacao}</p>
                  )}
                </div>

                <div className="shrink-0 text-right text-xs text-neutral-500">
                  <p className="flex items-center gap-1 justify-end">
                    <CalendarClock className="size-3.5 text-neutral-400" />
                    desde {fmtData(r.vigencia_inicio)}
                  </p>
                  {r.vigencia_fim && <p className="mt-0.5">até {fmtData(r.vigencia_fim)}</p>}
                </div>
              </header>

              <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-neutral-100 pt-2">
                <button
                  onClick={() => setEditando(r)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-brand-600 transition hover:bg-brand-50"
                >
                  editar
                </button>
                {atual && (
                  <button
                    onClick={() =>
                      confirmar.pedir({
                        titulo: 'Encerrar esta regra?',
                        tom: 'arquivar',
                        textoConfirmar: 'Encerrar hoje',
                        descricao: (
                          <>
                            A regra deixa de valer a partir de amanhã. Ela <strong>não é
                            apagada</strong>: as aulas já dadas continuam sendo pagas por ela, que
                            é o que mantém o mês fechado correto.
                          </>
                        ),
                        aoConfirmar: () =>
                          encerrar.mutateAsync({ id: r.id, vigenciaFim: hoje }),
                      })
                    }
                    className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                  >
                    encerrar
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {(criando || editando) && (
        <RegraForm
          regra={editando}
          onFechar={() => {
            setCriando(false)
            setEditando(null)
          }}
        />
      )}
      {confirmar.dialogo}
    </div>
  )
}
