import { Bell, Mail } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../components/ui/cn'
import { usePreferenciasNotificacao, useSalvarPreferencia } from '../hooks/useNotificacoes'

/**
 * O que cada uma quer receber, e por onde.
 *
 * A escolha é **por pessoa**, não do estúdio: quem fica na recepção
 * quer o sino e não quer o e-mail; quem acompanha de longe quer o
 * e-mail. Antes disso, todo aviso ia por e-mail para todas as sócias de
 * gestão, sempre — e e-mail demais é como e-mail nenhum.
 *
 * Os dois canais são independentes de propósito, inclusive os dois
 * desligados: tem aviso que uma pessoa simplesmente não precisa ver.
 */
export function PreferenciasNotificacao({ onFechar }: { onFechar: () => void }) {
  const { data: itens, isLoading } = usePreferenciasNotificacao(true)
  const salvar = useSalvarPreferencia()

  return (
    <Modal title="O que eu quero receber" onFechar={onFechar}>
      {isLoading && <p className="py-6 text-center text-sm text-neutral-400">Carregando…</p>}

      {!isLoading && (
        <>
          <p className="mb-3 text-sm leading-relaxed text-neutral-600">
            Esta escolha é <strong className="text-neutral-800">sua</strong>, não do estúdio. As
            outras sócias continuam recebendo do jeito delas.
          </p>

          <div className="flex flex-col divide-y divide-neutral-100">
            {(itens ?? []).map((p) => (
              <div key={p.tipo} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-800">{p.rotulo}</p>
                  {p.descricao && (
                    <p className="mt-0.5 text-xs leading-snug text-neutral-500">{p.descricao}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Canal
                    icone={Bell}
                    titulo="No sino"
                    ligado={p.no_sistema}
                    onClick={() =>
                      salvar.mutate({
                        tipo: p.tipo,
                        noSistema: !p.no_sistema,
                        porEmail: p.por_email,
                      })
                    }
                  />
                  <Canal
                    icone={Mail}
                    titulo="Por e-mail"
                    ligado={p.por_email}
                    onClick={() =>
                      salvar.mutate({
                        tipo: p.tipo,
                        noSistema: p.no_sistema,
                        porEmail: !p.por_email,
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          {salvar.isError && (
            <p className="mt-3 text-sm text-danger-600">{(salvar.error as Error).message}</p>
          )}

          <p className="mt-4 text-xs leading-relaxed text-neutral-400">
            Desligar o e-mail não desliga o aviso: ele continua no sino, e o histórico fica lá.
          </p>

          <div className="mt-4 flex justify-end">
            <Button onClick={onFechar}>Pronto</Button>
          </div>
        </>
      )}
    </Modal>
  )
}

function Canal({
  icone: Icone,
  titulo,
  ligado,
  onClick,
}: {
  icone: typeof Bell
  titulo: string
  ligado: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={`${titulo}: ${ligado ? 'ligado' : 'desligado'}`}
      aria-pressed={ligado}
      aria-label={titulo}
      className={cn(
        'rounded-md border p-1.5 transition',
        ligado
          ? 'border-brand-300 bg-brand-50 text-brand-700'
          : 'border-neutral-200 text-neutral-300 hover:text-neutral-500',
      )}
    >
      <Icone className="size-4" />
    </button>
  )
}
