import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  useAlunasDaAula,
  useBuscarAluna,
  useMinhasTurmas,
  useRegistrarPresenca,
} from './hooks/usePortalProfessora'
import { deISO, fmtDataCurta, fmtHora, hojeISO } from './types'

function BotaoPresenca({
  ativo,
  cor,
  desabilitado,
  onClick,
  children,
}: {
  ativo: boolean
  cor: 'verde' | 'vermelho'
  desabilitado: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const ativoCls =
    cor === 'verde' ? 'border-green-600 bg-green-600 text-white' : 'border-red-600 bg-red-600 text-white'
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
        ativo ? ativoCls : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300'
      }`}
    >
      {children}
    </button>
  )
}

export function ChamadaPage() {
  const { turmaId = '', data = '' } = useParams()
  const turmas = useMinhasTurmas()
  const alunas = useAlunasDaAula(turmaId, data)
  const marcar = useRegistrarPresenca(turmaId, data)

  const [incluindo, setIncluindo] = useState(false)
  const [termo, setTermo] = useState('')
  const busca = useBuscarAluna(termo)

  const turma = turmas.data?.find((t) => t.id === turmaId)
  // O banco recusa presença de aula futura; a tela avisa antes de tentar.
  const futura = deISO(data) > deISO(hojeISO())

  const jaNaLista = new Set((alunas.data ?? []).map((a) => a.cliente_id))
  const candidatas = (busca.data ?? []).filter((c) => !jaNaLista.has(c.id))

  function incluir(clienteId: string) {
    marcar.mutate(
      { clienteId, presente: true },
      {
        onSuccess: () => {
          setTermo('')
          setIncluindo(false)
        },
      },
    )
  }

  return (
    <div>
      <Link to="/" className="text-sm text-neutral-500 hover:text-brand-700">
        ← Aulas
      </Link>

      <h1 className="mt-3 text-lg font-semibold text-neutral-900">
        {turma ? turma.modalidade : 'Chamada'}
      </h1>
      <p className="mb-5 text-sm text-neutral-500">
        {fmtDataCurta(data)}
        {turma ? ` · ${fmtHora(turma.horario)}` : ''}
      </p>

      {futura && (
        <p className="mb-4 rounded-md bg-neutral-100 p-3 text-xs text-neutral-500">
          Esta aula ainda não aconteceu — a chamada abre no dia.
        </p>
      )}

      {alunas.isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}
      {alunas.isError && (
        <p className="text-sm text-red-600">Não foi possível carregar a lista.</p>
      )}

      {alunas.data && alunas.data.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Nenhum aluno agendado nesta aula.
        </div>
      )}

      <div className="space-y-2">
        {(alunas.data ?? []).map((a) => (
          <div
            key={a.cliente_id}
            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-neutral-900">{a.aluna}</div>
              <div className="text-xs text-neutral-400">
                {a.agendamento_id ? 'Agendado' : 'Incluído na hora'}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <BotaoPresenca
                ativo={a.presente === true}
                cor="verde"
                desabilitado={futura || marcar.isPending}
                onClick={() => marcar.mutate({ clienteId: a.cliente_id!, presente: true })}
              >
                Presente
              </BotaoPresenca>
              <BotaoPresenca
                ativo={a.presente === false}
                cor="vermelho"
                desabilitado={futura || marcar.isPending}
                onClick={() => marcar.mutate({ clienteId: a.cliente_id!, presente: false })}
              >
                Faltou
              </BotaoPresenca>
            </div>
          </div>
        ))}
      </div>

      {marcar.isError && (
        <p className="mt-3 text-sm text-red-600">
          {(marcar.error as Error).message || 'Não foi possível registrar.'}
        </p>
      )}

      {!futura && (
        <div className="mt-5">
          {!incluindo ? (
            <button
              onClick={() => setIncluindo(true)}
              className="w-full rounded-md border border-dashed border-neutral-300 py-2.5 text-sm text-neutral-500 transition hover:border-brand-400 hover:text-brand-700"
            >
              + Incluir aluno que chegou sem agendar
            </button>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-900">Incluir aluno</span>
                <button
                  onClick={() => {
                    setIncluindo(false)
                    setTermo('')
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-600"
                >
                  cancelar
                </button>
              </div>

              <input
                autoFocus
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Nome do aluno (mín. 3 letras)"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />

              {busca.isLoading && <p className="mt-2 text-xs text-neutral-400">Buscando…</p>}

              {busca.data && candidatas.length === 0 && termo.trim().length >= 3 && (
                <p className="mt-2 text-xs text-neutral-400">Nenhum aluno encontrado.</p>
              )}

              <div className="mt-2 space-y-1">
                {candidatas.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => incluir(c.id)}
                    disabled={marcar.isPending}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {c.nome}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
