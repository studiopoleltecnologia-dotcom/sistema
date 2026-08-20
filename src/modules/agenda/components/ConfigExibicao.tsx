import { Modal } from '../../../components/ui/Modal'
import { cn } from '../../../components/ui/cn'
import { FAIXAS_OCUPACAO } from '../cores'
import type { ColorirPor, Espacamento, Exibicao } from '../exibicao'

/** Painel de preferências da grade — inspirado no "Configurações de exibição" do Wix. */
export function ConfigExibicao({
  exibicao,
  onAlterar,
  onFechar,
}: {
  exibicao: Exibicao
  onAlterar: (patch: Partial<Exibicao>) => void
  onFechar: () => void
}) {
  return (
    <Modal title="Configurações de exibição" onFechar={onFechar}>
      <div className="flex flex-col gap-5">
        <Grupo titulo="Espaçamento da grade">
          <Opcoes<Espacamento>
            valor={exibicao.espacamento}
            onChange={(v) => onAlterar({ espacamento: v })}
            itens={[
              { valor: 'compacto', label: 'Compacto' },
              { valor: 'confortavel', label: 'Confortável' },
              { valor: 'largo', label: 'Largo' },
            ]}
          />
        </Grupo>

        <Grupo titulo="Colorir por">
          <Opcoes<ColorirPor>
            valor={exibicao.colorirPor}
            onChange={(v) => onAlterar({ colorirPor: v })}
            itens={[
              { valor: 'categoria', label: 'Categoria' },
              { valor: 'ocupacao', label: 'Ocupação' },
              { valor: 'modalidade', label: 'Modalidade' },
              { valor: 'professora', label: 'Professora' },
            ]}
          />
          {exibicao.colorirPor === 'categoria' ? (
            <p className="mt-2 text-[11px] text-neutral-500">
              O mesmo código de cor da grade impressa. A legenda fica acima da grade, e as
              cores se editam ali em “Categorias”.
            </p>
          ) : exibicao.colorirPor === 'ocupacao' ? (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {FAIXAS_OCUPACAO.map((f) => (
                <span key={f.chave} className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: f.barra }}
                  />
                  {f.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-neutral-500">
              A cor deixa de indicar quantas alunas reservaram — só o número no cartão mostra.
            </p>
          )}
        </Grupo>

        <Grupo titulo="Intervalo da grade">
          <Opcoes<30 | 60>
            valor={exibicao.intervalo}
            onChange={(v) => onAlterar({ intervalo: v })}
            itens={[
              { valor: 60, label: '1 hora' },
              { valor: 30, label: '30 min' },
            ]}
          />
        </Grupo>

        <Grupo titulo="Ver opções">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={exibicao.mostrarFimDeSemana}
              onChange={(e) => onAlterar({ mostrarFimDeSemana: e.target.checked })}
              className="accent-brand-600"
            />
            Mostrar fins de semana
          </label>
        </Grupo>
      </div>
    </Modal>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-neutral-100 pb-4 last:border-b-0 last:pb-0">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-500">{titulo}</h3>
      {children}
    </div>
  )
}

function Opcoes<T extends string | number>({
  valor,
  onChange,
  itens,
}: {
  valor: T
  onChange: (v: T) => void
  itens: { valor: T; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((i) => (
        <button
          key={String(i.valor)}
          onClick={() => onChange(i.valor)}
          aria-pressed={valor === i.valor}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-medium transition',
            valor === i.valor
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50 hover:text-neutral-900',
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  )
}
