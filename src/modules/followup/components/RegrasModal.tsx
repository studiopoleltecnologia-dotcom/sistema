import { useState } from 'react'
import { useAtualizarRegra } from '../hooks/useFollowup'
import {
  TIPO_FOLLOWUP_DESCRICAO,
  TIPO_FOLLOWUP_LABEL,
  type FollowupRegra,
} from '../types'

/** Regras dos gatilhos: dias e ativa/inativa, editáveis pelas sócias. */
export function RegrasModal({
  regras,
  onFechar,
}: {
  regras: FollowupRegra[]
  onFechar: () => void
}) {
  const atualizar = useAtualizarRegra()
  const [dias, setDias] = useState<Record<string, string>>(
    Object.fromEntries(regras.map((r) => [r.tipo, String(r.dias)])),
  )

  function salvarDias(regra: FollowupRegra) {
    const valor = Number(dias[regra.tipo])
    if (!Number.isInteger(valor) || valor < 0 || valor === regra.dias) return
    atualizar.mutate({ tipo: regra.tipo, patch: { dias: valor } })
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/20 p-4"
      onClick={onFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
      >
        <h2 className="mb-1 text-base font-semibold text-neutral-900">
          Regras de follow-up
        </h2>
        <p className="mb-4 text-xs text-neutral-400">
          O gerador roda todo dia de manhã e cria as pendências conforme as regras.
        </p>

        <ul className="flex flex-col gap-3">
          {regras.map((regra) => (
            <li key={regra.tipo} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={regra.ativa}
                onChange={(e) =>
                  atualizar.mutate({ tipo: regra.tipo, patch: { ativa: e.target.checked } })
                }
                className="accent-brand-600"
              />
              <div className="flex-1">
                <div className={`text-sm ${regra.ativa ? 'text-neutral-800' : 'text-neutral-400'}`}>
                  {TIPO_FOLLOWUP_LABEL[regra.tipo]}
                </div>
                <div className="text-[11px] text-neutral-400">
                  {TIPO_FOLLOWUP_DESCRICAO[regra.tipo]}
                </div>
              </div>
              {regra.tipo !== 'aniversario' && (
                <div className="flex items-center gap-1 text-xs text-neutral-500">
                  <input
                    value={dias[regra.tipo] ?? ''}
                    onChange={(e) =>
                      setDias((d) => ({ ...d, [regra.tipo]: e.target.value }))
                    }
                    onBlur={() => salvarDias(regra)}
                    className="w-12 rounded-md border border-neutral-200 px-1.5 py-1 text-center text-sm outline-none transition focus:border-brand-500"
                  />
                  dias
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onFechar}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
