import { useState } from 'react'
import { fmtCentavos, parseCentavos } from '../../lib/dinheiro'
import { DiaView } from './components/DiaView'
import { GradeView } from './components/GradeView'
import { useAtualizarConfigAgendamento, useConfigAgendamento } from './hooks/useAgenda'
import { DIAS_SEMANA } from './types'

export function AgendaPage() {
  const hoje = new Date().toISOString().slice(0, 10)
  const [data, setData] = useState(hoje)
  const [aba, setAba] = useState<'dia' | 'grade' | 'config'>('dia')

  const abaCls = (ativa: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition ${
      ativa ? 'bg-brand-50 text-brand-700' : 'text-neutral-400 hover:text-neutral-700'
    }`

  const diaSemana = new Date(data + 'T00:00:00').getDay()

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-neutral-900">Agenda</h1>
          <div className="flex gap-1">
            <button className={abaCls(aba === 'dia')} onClick={() => setAba('dia')}>
              Dia
            </button>
            <button className={abaCls(aba === 'grade')} onClick={() => setAba('grade')}>
              Grade
            </button>
            <button className={abaCls(aba === 'config')} onClick={() => setAba('config')}>
              Config
            </button>
          </div>
        </div>
        {aba === 'dia' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-400">{DIAS_SEMANA[diaSemana]}</span>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500"
            />
          </div>
        )}
      </div>

      {aba === 'dia' && <DiaView data={data} />}
      {aba === 'grade' && <GradeView />}
      {aba === 'config' && <ConfigAgendamentoForm />}
    </div>
  )
}

function ConfigAgendamentoForm() {
  const { data: config } = useConfigAgendamento()
  const atualizar = useAtualizarConfigAgendamento()
  const [horas, setHoras] = useState<string | null>(null)
  const [reposicoes, setReposicoes] = useState<string | null>(null)
  const [valorWellhub, setValorWellhub] = useState<string | null>(null)

  if (!config) return <p className="text-sm text-neutral-400">Carregando…</p>

  function salvar() {
    if (!config) return
    const valorCent =
      valorWellhub !== null ? parseCentavos(valorWellhub) : config.valor_checkin_wellhub_centavos
    atualizar.mutate({
      horas_cancelamento: horas !== null ? Number(horas) : config.horas_cancelamento,
      max_reposicoes_por_matricula:
        reposicoes !== null ? Number(reposicoes) : config.max_reposicoes_por_matricula,
      valor_checkin_wellhub_centavos: valorCent ?? config.valor_checkin_wellhub_centavos,
    })
  }

  const campo = 'mb-1 block text-xs font-medium text-neutral-500'
  const input =
    'w-40 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500'

  return (
    <div className="max-w-md">
      <div className="flex flex-col gap-4">
        <div>
          <label className={campo}>
            Cancelamento de mensalista: antecedência mínima (horas) para devolver o crédito
          </label>
          <input
            value={horas ?? String(config.horas_cancelamento)}
            onChange={(e) => setHoras(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className={campo}>Máximo de reposições por matrícula</label>
          <input
            value={reposicoes ?? String(config.max_reposicoes_por_matricula)}
            onChange={(e) => setReposicoes(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className={campo}>
            Valor estimado por check-in Wellhub (hoje{' '}
            {fmtCentavos(config.valor_checkin_wellhub_centavos)}) — usado no "a reconciliar"
          </label>
          <input
            value={valorWellhub ?? String(config.valor_checkin_wellhub_centavos / 100)}
            onChange={(e) => setValorWellhub(e.target.value)}
            className={input}
          />
        </div>
        <button
          onClick={salvar}
          disabled={atualizar.isPending}
          className="w-fit rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {atualizar.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
