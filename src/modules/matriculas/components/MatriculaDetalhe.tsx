import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Ban,
  CalendarRange,
  Coins,
  Gift,
  History,
  RotateCw,
  User,
  Wallet,
} from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { PainelLateral } from '../../../components/ui/PainelLateral'
import { fmtData, fmtDataHora } from '../../../lib/datas'
import { fmtCentavos } from '../../../lib/dinheiro'
import { useHistoricoMatricula } from '../hooks/useMatriculas'
import { TurmasVinculadas } from './TurmasVinculadas'
import type { MatriculaCompleta } from '../types'

const SITUACAO: Record<string, { rotulo: string; variante: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  ativa: { rotulo: 'Ativa', variante: 'success' },
  inadimplente: { rotulo: 'Pagamento em aberto', variante: 'danger' },
  pausada: { rotulo: 'Pausada', variante: 'warning' },
  cancelada: { rotulo: 'Cancelada', variante: 'neutral' },
}

/**
 * A matrícula por inteiro: situação, turmas, histórico e as ações.
 *
 * Três decisões de hierarquia, porque a versão anterior empilhava tudo
 * com o mesmo peso e a tela virava uma lista de caixas iguais:
 *
 * · **a situação vem primeiro e colorida.** "Pagamento em aberto" é o
 *   que muda o que se deve fazer; ficava perdido entre selos cinzas;
 * · **as ações são separadas por consequência**, não alinhadas em fila.
 *   Renovar e dar crédito entregam algo ao aluno; marcar em aberto e
 *   cancelar tiram. Misturadas, todas pareciam igualmente inofensivas;
 * · **o histórico diz quem fez.** Sem autor, "situação alterada" não
 *   responde a pergunta que se faz ao abrir o histórico.
 */
export function MatriculaDetalhe({
  matricula: m,
  gestao,
  pedidoCancelamento,
  onRenovar,
  onBonus,
  onInadimplir,
  onCancelar,
  onFechar,
}: {
  matricula: MatriculaCompleta
  gestao: boolean
  pedidoCancelamento: boolean
  onRenovar: () => void
  onBonus: () => void
  onInadimplir: () => void
  onCancelar: () => void
  onFechar: () => void
}) {
  const s = m.saldo
  const { data: historico, isLoading } = useHistoricoMatricula(s.matricula_id ?? null)
  const emAberto = s.status === 'inadimplente'
  const cancelando = Boolean(s.cancelamento_efetivo_em)
  const situacao = SITUACAO[s.status ?? ''] ?? { rotulo: s.status ?? '—', variante: 'neutral' as const }

  return (
    <PainelLateral
      titulo={m.clienteNome}
      subtitulo={m.produto?.nome ?? 'Produto'}
      onFechar={onFechar}
    >
      <div className="flex flex-col gap-5">
        {/* ---- Situação: o que muda a conduta, primeiro e com cor ---- */}
        {(emAberto || cancelando || pedidoCancelamento) && (
          <div
            className={`flex gap-2.5 rounded-lg border p-3 ${
              emAberto
                ? 'border-danger-200 bg-danger-50 text-danger-800'
                : 'border-warning-200 bg-warning-50 text-warning-800'
            }`}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="text-xs leading-relaxed">
              {emAberto && (
                <p className="font-semibold">
                  Pagamento em aberto — o aluno não consegue agendar.
                </p>
              )}
              {cancelando && (
                <p className={emAberto ? 'mt-1' : 'font-semibold'}>
                  Assinatura cancelada, ativa até {fmtData(s.cancelamento_efetivo_em)}.
                </p>
              )}
              {pedidoCancelamento && (
                <p className={emAberto || cancelando ? 'mt-1' : 'font-semibold'}>
                  O aluno pediu cancelamento pelo portal e ninguém respondeu.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ---- Os dois números que importam ---- */}
        <div className="grid grid-cols-2 gap-2">
          <Tile
            icone={m.ehTurmaFixa ? CalendarRange : Coins}
            rotulo={m.ehTurmaFixa ? 'turma fixa' : 'créditos'}
            valor={
              m.ehTurmaFixa
                ? String(m.turmas.length + m.turmasFuturas.length)
                : String(s.saldo ?? 0)
            }
            alerta={!m.ehTurmaFixa && (s.saldo ?? 0) === 0}
          />
          <Tile
            icone={Wallet}
            rotulo="por ciclo"
            valor={fmtCentavos(s.preco_contratado_centavos ?? 0)}
          />
        </div>

        {/* ---- Ficha ---- */}
        <section className="rounded-lg border border-neutral-200/80 bg-white p-3.5">
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={situacao.variante}>{situacao.rotulo}</Badge>
            {!cancelando && s.renova_automaticamente && (
              <Badge variant="neutral">renova sozinha</Badge>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <Dado
              rotulo="Ciclo"
              valor={
                (s.ciclos_compromisso ?? 1) > 1
                  ? `${s.ciclo_atual} de ${s.ciclos_compromisso}`
                  : String(s.ciclo_atual ?? 1)
              }
            />
            <Dado rotulo="Ciclo termina" valor={fmtData(s.data_fim)} />
            <Dado rotulo="Início" valor={fmtData(s.data_inicio)} />
            {!m.ehTurmaFixa && s.proxima_validade && s.proxima_validade !== s.data_fim && (
              <Dado rotulo="Créditos vencem" valor={fmtData(s.proxima_validade)} />
            )}
          </dl>
        </section>

        {m.ehTurmaFixa && (
          <section className="rounded-lg border border-neutral-200/80 bg-white p-3.5">
            <Titulo>
              {m.turmas.length + m.turmasFuturas.length === 1
                ? 'Turma vinculada'
                : 'Turmas vinculadas'}
            </Titulo>
            <TurmasVinculadas matricula={m} gestao={gestao} />
          </section>
        )}

        {/* ---- Ações, agrupadas pelo que fazem ---- */}
        {gestao && (
          <section className="flex flex-col gap-3">
            <div>
              <Titulo>Liberar para o aluno</Titulo>
              <div className="flex flex-col gap-1.5">
                {!cancelando && (
                  <Acao
                    icone={RotateCw}
                    tom="positiva"
                    titulo="Renovar agora"
                    ajuda="Recebeu por fora e quer liberar o próximo ciclo sem esperar a virada."
                    onClick={onRenovar}
                  />
                )}
                <Acao
                  icone={Gift}
                  tom="positiva"
                  titulo="Dar crédito"
                  ajuda="Cortesia ou reposição — entra no saldo com prazo e motivo."
                  onClick={onBonus}
                />
              </div>
            </div>

            {(s.status === 'ativa' || !cancelando) && (
              <div>
                <Titulo>Restringir</Titulo>
                <div className="flex flex-col gap-1.5">
                  {s.status === 'ativa' && (
                    <Acao
                      icone={Ban}
                      tom="atencao"
                      titulo="Marcar pagamento em aberto"
                      ajuda="Bloqueia novos agendamentos até regularizar. Não apaga crédito."
                      onClick={onInadimplir}
                    />
                  )}
                  {!cancelando && (
                    <Acao
                      icone={AlertTriangle}
                      tom="perigosa"
                      titulo="Cancelar assinatura"
                      ajuda="Para a cobrança automática. O ciclo já pago continua valendo."
                      onClick={onCancelar}
                    />
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ---- Histórico ---- */}
        <section>
          <Titulo>
            <History className="mr-1 inline size-3" />
            Histórico
          </Titulo>
          {isLoading && <p className="text-xs text-neutral-400">Carregando…</p>}
          {!isLoading && (historico ?? []).length === 0 && (
            <p className="text-xs text-neutral-400">Nada registrado ainda.</p>
          )}
          <ol className="flex flex-col">
            {(historico ?? []).map((h) => (
              <li key={h.id} className="flex gap-2.5 border-l-2 border-neutral-100 pl-3 pb-3 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-xs font-medium text-neutral-800">
                      {h.titulo}
                    </p>
                    {h.valor_centavos !== null && (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-neutral-700">
                        {fmtCentavos(h.valor_centavos)}
                      </span>
                    )}
                  </div>
                  {h.detalhe && <p className="text-[11px] text-neutral-500">{h.detalhe}</p>}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-neutral-400">
                    <span>{fmtDataHora(h.quando)}</span>
                    {h.autor_nome && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="flex items-center gap-0.5">
                          <User className="size-2.5" />
                          {h.autor_nome}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </PainelLateral>
  )
}

function Titulo({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
      {children}
    </h3>
  )
}

function Tile({
  icone: Icone,
  rotulo,
  valor,
  alerta,
}: {
  icone: typeof Coins
  rotulo: string
  valor: string
  alerta?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-3 text-center ${
        alerta ? 'border-danger-200 bg-danger-50' : 'border-neutral-200/80 bg-white'
      }`}
    >
      <Icone className={`mx-auto size-4 ${alerta ? 'text-danger-400' : 'text-neutral-300'}`} />
      <div
        className={`mt-1 font-display text-xl font-bold leading-none ${
          alerta ? 'text-danger-700' : 'text-neutral-900'
        }`}
      >
        {valor}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-400">{rotulo}</div>
    </div>
  )
}

/**
 * A cor carrega a consequência, não a decoração: verde entrega algo ao
 * aluno, âmbar restringe, vermelho encerra. Antes as quatro eram caixas
 * cinzas idênticas — o que fazia "cancelar assinatura" parecer tão banal
 * quanto "dar crédito".
 */
const TOM_ACAO = {
  positiva: {
    caixa: 'border-success-200 bg-success-50/50 hover:border-success-300 hover:bg-success-50',
    icone: 'text-success-600',
    texto: 'text-success-900',
  },
  atencao: {
    caixa: 'border-warning-200 bg-warning-50/50 hover:border-warning-300 hover:bg-warning-50',
    icone: 'text-warning-600',
    texto: 'text-warning-900',
  },
  perigosa: {
    caixa: 'border-danger-200 bg-danger-50/40 hover:border-danger-300 hover:bg-danger-50',
    icone: 'text-danger-600',
    texto: 'text-danger-800',
  },
} as const

function Acao({
  icone: Icone,
  tom,
  titulo,
  ajuda,
  onClick,
}: {
  icone: typeof Coins
  tom: keyof typeof TOM_ACAO
  titulo: string
  ajuda: string
  onClick: () => void
}) {
  const c = TOM_ACAO[tom]
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition ${c.caixa}`}
    >
      <Icone className={`mt-0.5 size-4 shrink-0 ${c.icone}`} />
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${c.texto}`}>{titulo}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{ajuda}</span>
      </span>
    </button>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-[11px] text-neutral-400">{rotulo}</dt>
      <dd className="text-sm font-medium text-neutral-800">{valor}</dd>
    </div>
  )
}
