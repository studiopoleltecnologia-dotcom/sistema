import type { ReactNode } from 'react'
import { cn } from '../../../components/ui/cn'
import { ROTULO_MOTIVO_AULA } from '../../agenda/types'
import type { Aula, EstadoAula, MotivoForaDoPlano } from '../aulas'
import { fmtDiaMes, fmtHora } from '../datas'

/**
 * O cartão de uma aula na Agenda.
 *
 * Hierarquia, de cima para baixo e da esquerda para a direita:
 *   1. horário e modalidade — o que o aluno procura
 *   2. professora e sala
 *   3. uma única linha de situação (vagas, "Sua turma", "Na fila · 2º"…)
 *   4. a ação, uma só, à direita
 *
 * Cada estado tem UMA palavra e UMA cor. Explicação longa não mora no
 * cartão: vai para o aviso no topo da Agenda ou para a folha de detalhe.
 */

type Tom = 'sucesso' | 'atencao' | 'perigo' | 'marca' | 'neutro'

const TOM_TEXTO: Record<Tom, string> = {
  sucesso: 'text-success-700',
  atencao: 'text-warning-700',
  perigo: 'text-danger-600',
  marca: 'text-brand-700',
  neutro: 'text-neutral-400',
}

const TOM_PONTO: Record<Tom, string> = {
  sucesso: 'bg-success-500',
  atencao: 'bg-warning-500',
  perigo: 'bg-danger-500',
  marca: 'bg-brand-500',
  neutro: 'bg-neutral-300',
}

const MOTIVO_CURTO: Record<MotivoForaDoPlano, string> = {
  sem_plano: 'Precisa de plano',
  so_turma_fixa: 'Fora do seu plano',
  sem_credito: 'Sem crédito',
  pagamento: 'Pagamento pendente',
}

/**
 * A palavra da situação. `curto` é para a célula da semana no desktop,
 * onde "Fora do seu plano · 7 vagas" não cabe em 140px — lá o detalhe
 * completo está a um clique, na folha da aula.
 */
export function situacaoDaAula(
  estado: EstadoAula,
  vagas: number,
  curto = false,
): { texto: string; tom: Tom } {
  if (curto) {
    const t = TEXTO_CURTO[estado.tipo]
    if (t) return { texto: t, tom: situacaoDaAula(estado, vagas).tom }
  }
  switch (estado.tipo) {
    case 'cancelada':
      return { texto: `Cancelada · ${ROTULO_MOTIVO_AULA[estado.motivo]}`, tom: 'perigo' }
    case 'turma_fixa':
      return { texto: 'Sua turma fixa', tom: 'sucesso' }
    case 'agendada':
      return { texto: 'Agendada', tom: 'marca' }
    case 'encerrada':
      return { texto: 'Encerrada', tom: 'neutro' }
    case 'vaga_segurada':
      return { texto: 'Vagou! Vaga guardada para você', tom: 'atencao' }
    case 'na_fila':
      return { texto: `${curto ? 'Na fila' : 'Na lista de espera'} · ${estado.posicao}º`, tom: 'marca' }
    case 'lotada':
      return { texto: 'Lotada', tom: 'perigo' }
    case 'fora_do_plano':
      return {
        texto: vagas > 0 ? `${MOTIVO_CURTO[estado.motivo]} · ${fmtVagas(vagas)}` : MOTIVO_CURTO[estado.motivo],
        tom: 'neutro',
      }
    case 'abre_em':
      return { texto: `${curto ? 'Abre' : 'Agenda abre'} em ${fmtDiaMes(estado.data)}`, tom: 'neutro' }
    case 'pausado':
      return { texto: `Agendamento pausado até ${fmtDiaMes(estado.ate)}`, tom: 'neutro' }
    case 'limite':
      return { texto: `Limite de ${estado.max} aulas agendadas`, tom: 'neutro' }
    case 'disponivel':
      return estado.ultimas
        ? { texto: vagas === 1 ? 'Última vaga' : `Últimas ${vagas} vagas`, tom: 'atencao' }
        : { texto: fmtVagas(vagas), tom: 'sucesso' }
  }
}

const TEXTO_CURTO: Partial<Record<EstadoAula['tipo'], string>> = {
  cancelada: 'Cancelada',
  turma_fixa: 'Sua turma',
  vaga_segurada: 'Vagou! Garanta',
  fora_do_plano: 'Fora do plano',
  pausado: 'Pausado',
  limite: 'No limite',
}

function fmtVagas(n: number) {
  return n === 1 ? '1 vaga' : `${n} vagas`
}

/** Estados em que a aula não está ao alcance: o cartão recua visualmente. */
function apagada(estado: EstadoAula) {
  return ['cancelada', 'encerrada', 'fora_do_plano', 'abre_em', 'pausado', 'limite'].includes(estado.tipo)
}

function Ponto({ cor }: { cor: string | null }) {
  if (!cor) return null
  return <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: cor }} />
}

export function CartaoAula({
  aula,
  acao,
  onAbrir,
}: {
  aula: Aula
  /** O botão da aula, montado pela tela (é ela que sabe agendar/cancelar). */
  acao?: ReactNode
  /** Abre o detalhe. Sem isto o cartão não é clicável. */
  onAbrir?: () => void
}) {
  const { texto, tom } = situacaoDaAula(aula.estado, aula.vagas)
  const minha = aula.estado.tipo === 'turma_fixa' || aula.estado.tipo === 'agendada'

  return (
    <article
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-white p-3.5 transition',
        aula.estado.tipo === 'turma_fixa' && 'border-success-200 bg-success-50/40',
        aula.estado.tipo === 'agendada' && 'border-brand-200 bg-brand-50/50',
        !minha && 'border-neutral-200/80 shadow-sm',
        apagada(aula.estado) && 'opacity-70',
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        disabled={!onAbrir}
        className="flex min-w-0 flex-1 items-start gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-default"
      >
        <span className="w-12 shrink-0 pt-0.5">
          <span className="block font-display text-lg font-bold leading-none text-ink tabular-nums">
            {fmtHora(aula.horario)}
          </span>
          <span className="mt-1 block text-[11px] text-neutral-400">{aula.duracao} min</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Ponto cor={aula.cor} />
            <span className="truncate text-[15px] font-semibold leading-tight text-neutral-900">
              {aula.modalidade}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-neutral-500">
            {[aula.professora, aula.sala].filter(Boolean).join(' · ')}
          </span>
          <span className={cn('mt-1 flex items-center gap-1.5 text-xs font-semibold', TOM_TEXTO[tom])}>
            <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', TOM_PONTO[tom])} />
            {texto}
          </span>
        </span>
      </button>

      {acao && <div className="shrink-0">{acao}</div>}
    </article>
  )
}

/**
 * Versão de uma célula da semana (desktop). Só o essencial — horário,
 * modalidade, professora e a situação — e o cartão inteiro abre o
 * detalhe, onde está a ação.
 */
export function CartaoAulaCompacto({ aula, onAbrir }: { aula: Aula; onAbrir: () => void }) {
  const { texto, tom } = situacaoDaAula(aula.estado, aula.vagas, true)
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        'flex w-full flex-col items-start gap-0.5 rounded-lg border bg-white px-2.5 py-2 text-left transition',
        'outline-none hover:border-brand-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-300',
        aula.estado.tipo === 'turma_fixa' && 'border-success-200 bg-success-50/60',
        aula.estado.tipo === 'agendada' && 'border-brand-300 bg-brand-50',
        aula.estado.tipo !== 'turma_fixa' && aula.estado.tipo !== 'agendada' && 'border-neutral-200/80',
        apagada(aula.estado) && 'opacity-60',
      )}
    >
      <span className="flex w-full items-center gap-1.5">
        <span className="font-display text-sm font-bold text-ink tabular-nums">{fmtHora(aula.horario)}</span>
        <Ponto cor={aula.cor} />
      </span>
      <span className="w-full truncate text-[13px] font-semibold leading-tight text-neutral-900" title={aula.modalidade}>
        {aula.modalidade}
      </span>
      <span className="w-full truncate text-[11px] text-neutral-500" title={aula.professora}>
        {aula.professora}
      </span>
      <span className={cn('mt-0.5 w-full truncate text-[11px] font-semibold', TOM_TEXTO[tom])} title={texto}>
        {texto}
      </span>
    </button>
  )
}
