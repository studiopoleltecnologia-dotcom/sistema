import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { Card, CardHeader } from '../../../components/ui/Card'
import { corDaTurma, faixaOcupacao } from '../../agenda/cores'
import { fmtHora } from '../../agenda/types'
import type { AulaDoDia } from '../api/dashboard'

/**
 * A grade de **hoje**, aula por aula.
 *
 * Substitui as barras de "reservas por dia". Aquele card partia dos
 * agendamentos, então um dia com dez aulas e ninguém marcado aparecia como
 * "nenhuma aula agendada" — exatamente o dia em que havia algo a fazer. Aqui
 * a lista parte da grade: **toda aula do dia aparece**, e o número ao lado diz
 * quanto dela já foi vendido.
 *
 * Só hoje, e não hoje + amanhã: com 11 aulas num dia comum, dois dias lado a
 * lado tomavam mais altura que o resto do painel inteiro e o card passava a
 * competir com a Agenda em vez de resumir o dia. Amanhã fica a um clique, no
 * "Ver a grade".
 *
 * Em duas colunas a partir do `sm` pela mesma razão: 11 linhas empilhadas são
 * uma tela de rolagem; em duas colunas cabem numa olhada.
 */
export function AulasDoDia({ aulas }: { aulas: AulaDoDia[] }) {
  return (
    <Card>
      <CardHeader
        title="Aulas de hoje"
        subtitle="Toda a grade do dia, com quantas vagas já foram ocupadas"
        action={
          <Link
            to="/agenda"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-neutral-400 transition hover:text-brand-700"
          >
            Ver a grade
            <ArrowRight className="size-3" />
          </Link>
        }
      />

      {aulas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 px-4 py-8 text-center">
          <CalendarDays className="mx-auto mb-2 size-5 text-neutral-300" />
          <p className="text-sm text-neutral-500">Nenhuma aula na grade de hoje</p>
          <p className="mt-0.5 text-xs text-neutral-400">
            Se isso não confere, a grade ainda não foi cadastrada na Agenda.
          </p>
        </div>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2 sm:gap-x-3">
          {aulas.map((aula) => (
            <LinhaAula key={aula.turma_id} aula={aula} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function LinhaAula({ aula }: { aula: AulaDoDia }) {
  const cor = corDaTurma(aula)
  const faixa = faixaOcupacao(aula.agendados, aula.capacidade)

  return (
    <li
      className="flex min-w-0 items-center gap-2 rounded-md border-l-[3px] bg-neutral-50/70 py-1.5 pl-2 pr-1.5"
      style={{ borderLeftColor: cor.acento }}
      title={`${faixa.label} · ${[aula.professora, aula.sala].filter(Boolean).join(' · ')}`}
    >
      <span className="w-9 shrink-0 text-[11px] font-bold tabular-nums" style={{ color: cor.texto }}>
        {fmtHora(aula.horario)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-neutral-800">{aula.modalidade}</p>
        {/* Professora e sala numa linha só e em corpo miúdo: quem lê o painel
            quer varrer horários, não fichas de turma. O detalhe está na Agenda. */}
        <p className="truncate text-[10px] text-neutral-400">
          {[aula.professora, aula.sala].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
        style={{
          background: faixa.pastilha,
          color: faixa.chave === 'lotada' ? '#fff' : faixa.barra,
        }}
      >
        {aula.agendados}/{aula.capacidade}
      </span>
    </li>
  )
}
