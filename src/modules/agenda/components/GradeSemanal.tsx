import { Copy, Pencil, Trash2 } from 'lucide-react'
import { cn } from '../../../components/ui/cn'
import { corDaTurma, corModalidade, faixaOcupacao, type CorCartao } from '../cores'
import { ALTURA_FAIXA, type Exibicao } from '../exibicao'
import { diaDoMes, diasDaSemana, dowDe, hojeISO } from '../semana'
import { DIAS_SEMANA, fmtHora, type SalaNome, type TurmaComProfessora } from '../types'

export type OcupacaoTurma = { reservas: number; capacidade: number }

/**
 * Uma coluna de sala dentro do dia. `contem` é o que garante a partição:
 * as colunas cobrem o conjunto inteiro de turmas, sem sobra e sem repetição.
 */
type ColunaSala = {
  chave: string
  /** null = coluna única (a grade não está dividida por sala). */
  nome: string | null
  contem: (t: TurmaComProfessora) => boolean
}

const horaDe = (horario: string) => Number(horario.slice(0, 2))
const minutoDe = (horario: string) => Number(horario.slice(3, 5))

/**
 * Grade da semana — uma agenda operacional, não um calendário decorativo.
 *
 * Três decisões estruturais, nesta ordem de importância:
 *
 * 1. **Contraste por camadas, não por uma cor só.** O trilho da grade é
 *    cinza (`neutral-50`), o cartão é claro e tonalizado, e uma barra
 *    lateral sólida marca a categoria. Antes cartão e fundo eram os dois
 *    quase-brancos e o cartão sumia; agora ele só sumiria se as três
 *    camadas falhassem juntas.
 * 2. **A modalidade é o que se lê primeiro.** Ela ganha o corpo do cartão;
 *    horário, professora e sala viram apoio; a ocupação vira contador
 *    forte com barra. É a hierarquia de quem pergunta "qual aula é essa e
 *    cabe mais gente?".
 * 3. **Uma coluna por sala dentro do dia**, só quando há mais de uma sala
 *    com turma. Com uma sala só, dobrar as colunas seria espremer a grade
 *    à toa (é o caso hoje: as 17 turmas ativas estão todas na Sala 1).
 *
 * A largura das colunas é `minmax(...)`, não `min-width` no container: o
 * scroll horizontal fica dentro da grade e nunca vaza para a página.
 */
export function GradeSemanal({
  turmas,
  salas,
  ocupacao,
  exibicao,
  diaSelecionado,
  turmaSelecionada,
  onSelecionarDia,
  onSelecionarTurma,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  turmas: TurmaComProfessora[]
  salas: SalaNome[]
  /** turma_id → reservas/capacidade da semana exibida. */
  ocupacao: Map<string, OcupacaoTurma>
  exibicao: Exibicao
  diaSelecionado: string
  /** Turma aberta no painel do dia — ganha anel de seleção no cartão. */
  turmaSelecionada: string | null
  onSelecionarDia: (dataISO: string) => void
  onSelecionarTurma: (t: TurmaComProfessora, dataISO: string) => void
  onEditar: (t: TurmaComProfessora) => void
  onDuplicar: (t: TurmaComProfessora) => void
  onExcluir: (t: TurmaComProfessora) => void
}) {
  const dias = diasDaSemana(diaSelecionado).filter(
    (d) => exibicao.mostrarFimDeSemana || (dowDe(d) !== 0 && dowDe(d) !== 6),
  )

  // Colunas de sala dentro do dia. A regra é inegociável: **toda turma cai em
  // exatamente uma coluna**. O filtro antigo era
  // `if (salaId && t.sala_id !== salaId) return false`, que descartava em
  // silêncio a turma com `sala_id` nulo — some da grade sem aviso nenhum.
  //
  // A grade só se divide quando **todas** as turmas têm sala. Basta uma sem
  // sala e a divisão é desligada: aí a coluna única contém tudo, e a sala
  // aparece no cartão. É o que dispensa a coluna "Sem sala" sem trazer de
  // volta o sumiço — dividir com dado incompleto é que obrigava a inventar
  // uma coluna para o que sobrava.
  const salasComTurma = salas.filter((s) => turmas.some((t) => t.sala_id === s.id))
  const dividirPorSala = salasComTurma.length > 1 && turmas.every((t) => t.sala_id)

  const colunasSala: ColunaSala[] = dividirPorSala
    ? salasComTurma.map((s) => ({
        chave: s.id,
        nome: s.nome,
        contem: (t: TurmaComProfessora) => t.sala_id === s.id,
      }))
    : [{ chave: '__todas__', nome: null, contem: () => true }]

  if (turmas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white py-16 text-center text-sm text-neutral-500">
        Nenhuma turma cadastrada. Crie a primeira em “Nova turma”.
      </div>
    )
  }

  // A grade real vai de 08:00 (Pole de sábado) a 21:30 (Pole de quinta), e
  // a quinta tem aulas em 18:30/19:30/20:30 — o passo de 30 min não é
  // capricho de exibição, é o único que desenha a quinta corretamente.
  const inicios = turmas.map((t) => horaDe(t.horario) + (minutoDe(t.horario) >= 30 ? 0.5 : 0))
  const inicio = Math.floor(Math.min(...inicios))
  const fim = Math.max(...inicios)
  const passo = exibicao.intervalo === 30 ? 0.5 : 1
  const faixas: number[] = []
  for (let h = inicio; h <= fim; h += passo) faixas.push(h)

  // 8rem por dia é o menor valor em que "Pole Coreográfico" ainda entrega
  // as duas primeiras palavras. Com os 7 dias e a régua de horas dá ~59rem,
  // então em 1024px com o menu recolhido sobra um resto de domingo para
  // rolar — de propósito: apertar mais truncaria o nome da aula, que é o
  // elemento nº 1 da tela. Acima de ~1150px tudo cabe e as colunas crescem
  // sozinhas (`1fr`); abaixo, a rolagem é da grade, nunca da página.
  // Com 3+ colunas por dia (duas salas mais "Sem sala") são 21 colunas: a
  // régua encolhe, senão a rolagem horizontal vira o único jeito de ler.
  const larguraMin = !dividirPorSala ? '8rem' : colunasSala.length > 2 ? '5.5rem' : '6.5rem'
  const gridCols = `3.5rem repeat(${dias.length * colunasSala.length}, minmax(${larguraMin}, 1fr))`
  const alturaFaixa = ALTURA_FAIXA[exibicao.espacamento] * (passo === 0.5 ? 0.62 : 1)
  const hoje = hojeISO()

  const turmasEm = (dataISO: string, faixa: number, coluna: ColunaSala) =>
    turmas
      .filter((t) => {
        if (t.dia_semana !== dowDe(dataISO)) return false
        if (!coluna.contem(t)) return false
        const pos = horaDe(t.horario) + (minutoDe(t.horario) >= 30 ? 0.5 : 0)
        // Na faixa de 1h, a aula das 18:30 pertence à faixa das 18h — senão
        // ela simplesmente não apareceria na grade.
        return passo === 0.5 ? pos === faixa : Math.floor(pos) === faixa
      })
      .sort((a, b) => a.horario.localeCompare(b.horario))

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-fit">
          {/* Cabeçalho dos dias — sólido e grudado no topo. É a âncora de
              "que dia estou olhando" durante a rolagem vertical. */}
          <div
            className="sticky top-0 z-20 grid border-b border-neutral-200 bg-white"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="sticky left-0 z-10 border-r border-neutral-200 bg-white" />
            {dias.map((d) =>
              colunasSala.map((coluna, i) => {
                const ehHoje = d === hoje
                const ativo = d === diaSelecionado
                return (
                  <button
                    key={`${d}-${coluna.chave}`}
                    onClick={() => onSelecionarDia(d)}
                    title={`Ver o dia ${diaDoMes(d)} no painel`}
                    className={cn(
                      'flex flex-col items-center gap-0.5 border-l border-neutral-200 px-1 py-2.5 transition',
                      'hover:bg-neutral-50',
                      ativo && 'bg-brand-50',
                    )}
                  >
                    {i === 0 ? (
                      <>
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase tracking-widest',
                            ehHoje ? 'text-brand-700' : 'text-neutral-500',
                          )}
                        >
                          {DIAS_SEMANA[dowDe(d)].slice(0, 3)}
                        </span>
                        {/* Hoje é uma pastilha cheia, não uma tinta um pouco
                            mais escura: precisa ser achado num relance. */}
                        <span
                          className={cn(
                            'flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 font-display text-sm font-bold tabular-nums',
                            ehHoje
                              ? 'bg-brand-700 text-white'
                              : ativo
                                ? 'text-brand-800'
                                : 'text-neutral-700',
                          )}
                        >
                          {diaDoMes(d)}
                        </span>
                      </>
                    ) : (
                      <span className="h-[3.125rem]" aria-hidden />
                    )}
                    {dividirPorSala && (
                      <span
                        className="w-full truncate text-[10px] text-neutral-500"
                        title={coluna.nome ?? undefined}
                      >
                        {coluna.nome}
                      </span>
                    )}
                  </button>
                )
              }),
            )}
          </div>

          {faixas.map((faixa) => {
            const horaCheia = faixa % 1 === 0
            return (
              <div
                key={faixa}
                className={cn(
                  'grid last:border-b-0',
                  // Divisão forte na hora cheia, fraca na meia — a grade
                  // ganha ritmo sem virar papel quadriculado.
                  horaCheia ? 'border-b border-neutral-200' : 'border-b border-neutral-100',
                )}
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="sticky left-0 z-10 border-r border-neutral-200 bg-neutral-50 py-1.5 pr-2 text-right text-[11px] font-semibold tabular-nums text-neutral-500">
                  {horaCheia
                    ? `${String(faixa).padStart(2, '0')}:00`
                    : passo === 0.5
                      ? `${String(Math.floor(faixa)).padStart(2, '0')}:30`
                      : ''}
                </div>
                {dias.map((d) =>
                  colunasSala.map((coluna) => (
                    <div
                      key={`${d}-${coluna.chave}-${faixa}`}
                      className={cn(
                        'flex flex-col gap-1 border-l border-neutral-100 p-1',
                        d === diaSelecionado ? 'bg-brand-50/50' : 'bg-neutral-50/40',
                      )}
                      style={{ minHeight: alturaFaixa }}
                    >
                      {turmasEm(d, faixa, coluna).map((t) => (
                        <CartaoTurma
                          key={t.id}
                          turma={t}
                          data={d}
                          ocupacao={ocupacao.get(t.id)}
                          exibicao={exibicao}
                          mostrarSala={!dividirPorSala}
                          selecionada={t.id === turmaSelecionada && d === diaSelecionado}
                          onSelecionar={onSelecionarTurma}
                          onEditar={onEditar}
                          onDuplicar={onDuplicar}
                          onExcluir={onExcluir}
                        />
                      ))}
                    </div>
                  )),
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CartaoTurma({
  turma,
  data,
  ocupacao,
  exibicao,
  mostrarSala,
  selecionada,
  onSelecionar,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  turma: TurmaComProfessora
  data: string
  ocupacao?: OcupacaoTurma
  exibicao: Exibicao
  mostrarSala: boolean
  selecionada: boolean
  onSelecionar: (t: TurmaComProfessora, dataISO: string) => void
  onEditar: (t: TurmaComProfessora) => void
  onDuplicar: (t: TurmaComProfessora) => void
  onExcluir: (t: TurmaComProfessora) => void
}) {
  const reservas = ocupacao?.reservas ?? 0
  const capacidade = ocupacao?.capacidade ?? turma.capacidade
  const faixa = faixaOcupacao(reservas, capacidade)
  const vagas = Math.max(capacidade - reservas, 0)

  // `corDaTurma` garante cor mesmo sem categoria cadastrada — é o que tira
  // a grade do cinza total em que ela estava.
  let cor: CorCartao = corDaTurma(turma)
  if (exibicao.colorirPor === 'modalidade') cor = corModalidade(turma.modalidade)
  else if (exibicao.colorirPor === 'professora') cor = corModalidade(turma.professora.nome ?? '—')
  else if (exibicao.colorirPor === 'ocupacao') {
    cor = { bg: faixa.pastilha, borda: faixa.trilho, texto: '#3f3f46', acento: faixa.barra }
  }

  const pct = capacidade > 0 ? Math.min((reservas / capacidade) * 100, 100) : 0
  const compacto = exibicao.espacamento === 'compacto'

  const legenda = [turma.professora.nome, mostrarSala ? turma.sala?.nome : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelecionar(turma, data)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelecionar(turma, data)
        }
      }}
      className={cn(
        'group relative min-w-0 cursor-pointer overflow-hidden rounded-lg border pl-2 pr-1.5 shadow-sm transition',
        'outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-400',
        selecionada && 'ring-2 ring-brand-500 ring-offset-1',
        compacto ? 'py-1' : 'py-1.5',
      )}
      style={{ background: cor.bg, borderColor: cor.borda }}
      title={[
        turma.modalidade,
        turma.categoria?.nome,
        fmtHora(turma.horario),
        turma.professora.nome,
        turma.sala?.nome,
        `${reservas}/${capacidade} — ${faixa.label}`,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {/* Barra lateral cheia: o identificador de categoria que dá para
          bater o olho e reconhecer sem ler nada. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: cor.acento }}
      />

      <div className="flex items-center justify-between gap-1">
        <span
          className="text-[10px] font-bold tabular-nums tracking-wide"
          style={{ color: cor.texto }}
        >
          {fmtHora(turma.horario)}
        </span>
        {/* Lotada e quase cheia viram pastilha: são os dois estados que
            mudam o que a secretária faz a seguir. */}
        {faixa.chave === 'lotada' ? (
          <span className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide text-white" style={{ background: faixa.barra }}>
            Lotada
          </span>
        ) : faixa.chave === 'quase' ? (
          <span className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide" style={{ background: faixa.pastilha, color: faixa.barra }}>
            {vagas} vaga{vagas === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {/* O nome da aula é o maior elemento do cartão. */}
      <div className="truncate text-[13px] font-semibold leading-snug text-ink">
        {turma.modalidade}
      </div>

      {!compacto && legenda && (
        <div className="truncate text-[10px] leading-tight" style={{ color: cor.texto }}>
          {legenda}
        </div>
      )}

      {/* Ocupação: número forte + barra. A barra repete a informação sem
          depender de cor, e o trilho acompanha a faixa para o cartão vazio
          não parecer "quebrado". */}
      <div className="mt-1 flex items-center gap-1.5">
        <div
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
          style={{ background: faixa.trilho }}
        >
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${Math.max(pct, reservas > 0 ? 8 : 0)}%`,
              background: faixa.barra,
            }}
          />
        </div>
        <span
          className="shrink-0 text-[11px] font-bold tabular-nums leading-none"
          style={{ color: faixa.chave === 'vazia' ? '#71717a' : faixa.barra }}
        >
          {reservas}/{capacidade}
        </span>
      </div>

      {/* Ações só no hover/foco, e param o clique para não abrir o painel. */}
      <div className="pointer-events-none absolute right-1 top-1 hidden gap-0.5 rounded-md bg-white/85 p-0.5 shadow-sm backdrop-blur-[1px] group-focus-within:pointer-events-auto group-focus-within:flex group-hover:pointer-events-auto group-hover:flex">
        <IconeAcao title="Editar turma" onClick={() => onEditar(turma)}>
          <Pencil className="size-3" />
        </IconeAcao>
        <IconeAcao title="Duplicar turma" onClick={() => onDuplicar(turma)}>
          <Copy className="size-3" />
        </IconeAcao>
        <IconeAcao title="Arquivar turma" onClick={() => onExcluir(turma)}>
          <Trash2 className="size-3" />
        </IconeAcao>
      </div>
    </div>
  )
}

function IconeAcao({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
    >
      {children}
    </button>
  )
}
