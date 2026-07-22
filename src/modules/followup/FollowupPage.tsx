import { useState } from 'react'
import { RegrasModal } from './components/RegrasModal'
import {
  useConcluirPendencia,
  useDispensarPendencia,
  useGerarAgora,
  usePendencias,
  useRegras,
} from './hooks/useFollowup'
import { ehWellhub, TIPO_FOLLOWUP_LABEL } from './types'

/** Link direto pro WhatsApp da cliente (DDI Brasil). */
function linkWhatsapp(telefone: string | null): string | null {
  if (!telefone) return null
  const digitos = telefone.replace(/\D/g, '')
  if (!digitos) return null
  return `https://wa.me/${digitos.length <= 11 ? '55' + digitos : digitos}`
}

export function FollowupPage() {
  const { data: pendencias, isLoading, error } = usePendencias()
  const { data: regras } = useRegras()
  const gerar = useGerarAgora()
  const concluir = useConcluirPendencia()
  const dispensar = useDispensarPendencia()
  const [regrasAbertas, setRegrasAbertas] = useState(false)

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Erro ao carregar follow-ups: {(error as Error).message}
      </p>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-sm text-neutral-400">
            {pendencias?.length ?? 0} pendente{(pendencias?.length ?? 0) === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => gerar.mutate()}
            disabled={gerar.isPending}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-brand-500 hover:text-brand-700 disabled:opacity-50"
          >
            {gerar.isPending ? 'Gerando…' : 'Gerar agora'}
          </button>
          <button
            onClick={() => setRegrasAbertas(true)}
            className="rounded-md px-2.5 py-1.5 text-sm text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
          >
            Regras
          </button>
        </div>
      </div>

      {gerar.isSuccess && gerar.data === 0 && (
        <p className="mb-4 text-xs text-neutral-400">
          Nenhuma pendência nova — tudo em dia.
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : (pendencias ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-400">
          Nenhum follow-up pendente. 🎉
        </div>
      ) : (
        <ul className="flex max-w-3xl flex-col gap-2">
          {(pendencias ?? []).map((p) => {
            const wa = linkWhatsapp(p.cliente.telefone)
            const wellhub = ehWellhub(p.cliente)
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-100 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-neutral-900">
                      {p.cliente.nome}
                    </span>
                    {p.cliente.vip && (
                      <span className="rounded bg-brand-50 px-1 text-[10px] font-semibold text-brand-600">
                        VIP
                      </span>
                    )}
                    {wellhub && (
                      <span
                        className="rounded bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700"
                        title="Aluno Wellhub: mensagem sem oferta, desconto, aula grátis ou benefício de indicação (regra da parceria)."
                      >
                        Wellhub — sem oferta
                      </span>
                    )}
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">
                      {TIPO_FOLLOWUP_LABEL[p.tipo]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">{p.detalhe}</div>
                </div>

                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition hover:border-brand-500 hover:text-brand-700"
                  >
                    WhatsApp
                  </a>
                )}
                <button
                  onClick={() =>
                    concluir.mutate({ id: p.id, cliente_id: p.cliente_id, tipo: p.tipo })
                  }
                  disabled={concluir.isPending}
                  className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                >
                  Feito
                </button>
                <button
                  onClick={() => dispensar.mutate(p.id)}
                  disabled={dispensar.isPending}
                  className="rounded-md px-2 py-1 text-xs text-neutral-400 transition hover:text-neutral-700"
                >
                  Dispensar
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {regrasAbertas && regras && (
        <RegrasModal regras={regras} onFechar={() => setRegrasAbertas(false)} />
      )}
    </div>
  )
}
