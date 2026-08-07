import { Award, PartyPopper } from 'lucide-react'
import { fmtData } from '../../../lib/datas'
import { useAlunoDesde } from '../hooks/useClientes'

// Marcos de fidelidade, em meses de casa.
const MARCOS = [
  { meses: 3, label: '3 meses' },
  { meses: 6, label: '6 meses' },
  { meses: 12, label: '1 ano' },
  { meses: 24, label: '2 anos' },
  { meses: 36, label: '3 anos' },
  { meses: 48, label: '4 anos' },
  { meses: 60, label: '5 anos' },
]

// ISO 'YYYY-MM-DD' → Date local (meio-dia evita salto de fuso).
function parseISO(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d, 12)
}

// Date → 'YYYY-MM-DD' local (sem passar por UTC, que dropava o dia à noite).
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mesesEntre(desde: Date, ate: Date): number {
  let m = (ate.getFullYear() - desde.getFullYear()) * 12 + (ate.getMonth() - desde.getMonth())
  if (ate.getDate() < desde.getDate()) m -= 1
  return Math.max(0, m)
}

function rotuloTempo(meses: number): string {
  if (meses < 1) return 'menos de 1 mês'
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  const parteAnos = `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  if (resto === 0) return parteAnos
  return `${parteAnos} e ${resto} ${resto === 1 ? 'mês' : 'meses'}`
}

/**
 * Tempo de casa + marcos de fidelidade do aluno, com base na data da 1ª
 * matrícula. Nada aparece enquanto ainda é lead (sem matrícula).
 */
export function TempoDeCasa({ clienteId }: { clienteId: string }) {
  const { data: desdeISO } = useAlunoDesde(clienteId)
  if (!desdeISO) return null

  const desde = parseISO(desdeISO)
  const hoje = new Date()
  const meses = mesesEntre(desde, hoje)

  const marcoAtingido = [...MARCOS].reverse().find((mk) => meses >= mk.meses)
  const proximoMarco = MARCOS.find((mk) => meses < mk.meses)

  // Próximo aniversário de matrícula (dia/mês da 1ª matrícula).
  const prox = new Date(hoje.getFullYear(), desde.getMonth(), desde.getDate(), 12)
  if (prox < hoje) prox.setFullYear(hoje.getFullYear() + 1)
  const anosNoAniversario = prox.getFullYear() - desde.getFullYear()
  const diasParaAniversario = Math.round((prox.getTime() - hoje.getTime()) / 86_400_000)
  const aniversarioPerto = diasParaAniversario <= 30

  return (
    <div className="mt-6">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500">TEMPO DE CASA</h3>
      <div className="rounded-md border border-neutral-100 p-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-brand-50 p-2 text-brand-600">
            <Award className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-800">{rotuloTempo(meses)} de casa</p>
            <p className="text-[11px] text-neutral-400">aluno desde {fmtData(desdeISO)}</p>
          </div>
          {marcoAtingido && (
            <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">
              {marcoAtingido.label}
            </span>
          )}
        </div>

        {proximoMarco && (
          <p className="mt-2 text-[11px] text-neutral-400">
            Próximo marco: <span className="text-neutral-600">{proximoMarco.label}</span> em{' '}
            {proximoMarco.meses - meses} {proximoMarco.meses - meses === 1 ? 'mês' : 'meses'}
          </p>
        )}

        <div
          className={`mt-2 flex items-center gap-1.5 text-[11px] ${
            aniversarioPerto ? 'font-medium text-brand-600' : 'text-neutral-400'
          }`}
        >
          {aniversarioPerto && <PartyPopper className="size-3.5 shrink-0" />}
          <span>
            Aniversário de matrícula: {fmtData(isoLocal(prox))} · faz {anosNoAniversario}{' '}
            {anosNoAniversario === 1 ? 'ano' : 'anos'}
            {aniversarioPerto &&
              ` (${diasParaAniversario === 0 ? 'hoje!' : `em ${diasParaAniversario} dia${diasParaAniversario === 1 ? '' : 's'}`})`}
          </span>
        </div>
      </div>
    </div>
  )
}
