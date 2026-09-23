import { useMemo, useState } from 'react'
import { CalendarRange, Coins, Plus, Users } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { useConfirmar } from '../../components/ui/ConfirmarAcao'
import { useAbaUrl } from '../../lib/aba'
import { fmtData } from '../../lib/datas'
import { fmtCentavos } from '../../lib/dinheiro'
import { useMinhaFuncao } from '../../lib/funcao'
import { AprovacoesContratacao } from './components/AprovacoesContratacao'
import { BonusCreditos } from './components/BonusCreditos'
import { MatriculaDetalhe } from './components/MatriculaDetalhe'
import { MatriculaForm } from './components/MatriculaForm'
import { SolicitacoesCancelamento } from './components/SolicitacoesCancelamento'
import {
  useCancelarAssinatura,
  useMarcarInadimplente,
  useMatriculasCompletas,
  useRenovarCiclo,
  useSolicitacoesPendentes,
} from './hooks/useMatriculas'
import { useContratacoesAbertas } from './hooks/useContratacoes'
import type { MatriculaCompleta } from './types'

type Filtro = 'todas' | 'contratacoes' | 'creditos' | 'turma_fixa' | 'em_aberto' | 'cancelamentos'
const FILTROS = [
  'todas',
  'contratacoes',
  'creditos',
  'turma_fixa',
  'em_aberto',
  'cancelamentos',
] as const satisfies readonly Filtro[]

/**
 * Matrículas: quem contratou o quê, e em que situação está.
 *
 * Saiu de dentro de /produtos, onde vivia como uma seção no fim da
 * página. Eram duas responsabilidades numa tela só — o catálogo
 * (o que o estúdio vende) e as contratações (quem comprou) — e a
 * segunda só crescia. Com turma fixa, ela precisa mostrar a turma
 * vinculada de cada aluno, o que não cabia numa linha de lista.
 */
export function MatriculasPage() {
  const { data: matriculas, isLoading } = useMatriculasCompletas()
  const { data: pedidos } = useSolicitacoesPendentes()
  const { data: contratacoes } = useContratacoesAbertas()
  const { data: funcao } = useMinhaFuncao()
  // Secretária acompanha a operação (quem está ativo, em qual turma)
  // mas não mexe em cobrança nem cancela. A RLS já recusa; aqui é só
  // para não oferecer o clique.
  const ehGestao = funcao === 'gestao'
  const confirmar = useConfirmar()

  const renovar = useRenovarCiclo()
  const inadimplir = useMarcarInadimplente()
  const cancelar = useCancelarAssinatura()

  const [novo, setNovo] = useState(false)
  const [bonus, setBonus] = useState<MatriculaCompleta | null>(null)
  // Por id e não pelo objeto: a lista é revalidada em segundo plano, e
  // guardar a matrícula congelada deixaria o painel mostrando o saldo
  // de antes da ação que acabou de acontecer dentro dele.
  const [abertaId, setAbertaId] = useState<string | null>(null)
  // Na URL (?aba=em_aberto): o menu lateral aponta direto para cada recorte,
  // e o alerta de inadimplência do painel pode linkar 'Em aberto' de uma vez.
  const [filtro, setFiltro] = useAbaUrl(FILTROS, 'todas')

  const contagens = useMemo(() => {
    const l = matriculas
    return {
      todas: l.length,
      creditos: l.filter((m) => !m.ehTurmaFixa).length,
      turma_fixa: l.filter((m) => m.ehTurmaFixa).length,
      em_aberto: l.filter((m) => m.saldo.status === 'inadimplente').length,
      cancelamentos: pedidos?.length ?? 0,
      contratacoes: contratacoes?.length ?? 0,
    }
  }, [matriculas, pedidos, contratacoes])

  const comPedido = useMemo(() => new Set((pedidos ?? []).map((p) => p.matricula_id)), [pedidos])

  const visiveis = useMemo(() => {
    const l = matriculas
    if (filtro === 'creditos') return l.filter((m) => !m.ehTurmaFixa)
    if (filtro === 'turma_fixa') return l.filter((m) => m.ehTurmaFixa)
    if (filtro === 'em_aberto') return l.filter((m) => m.saldo.status === 'inadimplente')
    // Os pedidos têm cartão próprio (SolicitacoesCancelamento), acima.
    if (filtro === 'cancelamentos') return []
    // Idem para a fila de contratações (AprovacoesContratacao).
    if (filtro === 'contratacoes') return []
    return l
  }, [matriculas, filtro])

  // Derivada da lista viva, não guardada: uma ação feita dentro do painel
  // (renovar, dar crédito) revalida a lista, e o painel precisa refletir
  // o resultado em vez de continuar mostrando o retrato da abertura.
  const aberta = visiveis.find((m) => m.saldo.matricula_id === abertaId) ?? null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Matrículas"
        subtitulo="Alunos com plano ativo, o que contrataram e em que turma"
        acoes={
          ehGestao ? (
            <Button onClick={() => setNovo(true)}>
              <Plus className="size-4" />
              Nova matrícula
            </Button>
          ) : undefined
        }
      />

      {/* Também quando ainda não há matrícula nenhuma: é exatamente o
          estado em que existe contratação esperando pagamento e nada
          na lista — esconder as abas aqui deixaria a fila inalcançável. */}
      {(contagens.todas > 0 || contagens.contratacoes > 0) && (
        <Tabs
          value={filtro}
          onChange={setFiltro}
          size="sm"
          items={[
            { value: 'todas', label: `Todas (${contagens.todas})` },
            // Permanente, e não só quando há fila: é onde a gestão
            // confere se alguma contratação ficou parada esperando
            // pagamento. Uma aba que some quando esvazia esconderia
            // justamente a resposta "não há nada pendente".
            {
              value: 'contratacoes' as Filtro,
              label: `Contratações (${contagens.contratacoes})`,
            },
            { value: 'creditos', label: `Por créditos (${contagens.creditos})` },
            { value: 'turma_fixa', label: `Turma fixa (${contagens.turma_fixa})` },
            ...(contagens.em_aberto > 0
              ? [{ value: 'em_aberto' as Filtro, label: `Em aberto (${contagens.em_aberto})` }]
              : []),
            // Pedidos do portal (regulamento 7.1): a aba só existe quando há
            // o que responder, como "Em aberto".
            ...(contagens.cancelamentos > 0
              ? [
                  {
                    value: 'cancelamentos' as Filtro,
                    label: `Pedidos de cancelamento (${contagens.cancelamentos})`,
                  },
                ]
              : []),
          ]}
        />
      )}

      {filtro === 'contratacoes' && (
        <AprovacoesContratacao solicitacoes={contratacoes ?? []} gestao={ehGestao} />
      )}

      {filtro === 'cancelamentos' && (
        <SolicitacoesCancelamento solicitacoes={pedidos ?? []} gestao={ehGestao} />
      )}

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {/* Só nas abas que listam matrícula. Na fila de contratações, um
          "nenhuma matrícula ativa" embaixo dos pedidos diria o oposto do
          que a tela mostra: há gente contratando, só não pagou ainda. */}
      {!isLoading && contagens.todas === 0 && filtro !== 'contratacoes' && filtro !== 'cancelamentos' && (
        <EmptyState
          icon={Users}
          title="Nenhuma matrícula ativa"
          description="Assim que um aluno contratar um plano, ele aparece aqui com a situação do ciclo e, no caso da turma fixa, a turma que ele reservou."
          action={
            ehGestao ? (
              <Button size="sm" onClick={() => setNovo(true)}>
                <Plus className="size-4" />
                Nova matrícula
              </Button>
            ) : undefined
          }
        />
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {visiveis.map((m) => (
          <CartaoMatricula
            key={m.saldo.matricula_id}
            matricula={m}
            gestao={ehGestao}
            pedidoCancelamento={comPedido.has(m.saldo.matricula_id ?? '')}
            onAbrir={() => setAbertaId(m.saldo.matricula_id ?? null)}
          />
        ))}
      </div>

      {aberta && (
        <MatriculaDetalhe
          matricula={aberta}
          gestao={ehGestao}
          pedidoCancelamento={comPedido.has(aberta.saldo.matricula_id ?? '')}
          onFechar={() => setAbertaId(null)}
          onRenovar={() =>
            confirmar.pedir({
              titulo: 'Adiantar a renovação?',
              // Não destrói nada, mas libera crédito e gera cobrança —
              // difícil de desfazer depois que o aluno já usou.
              tom: 'confirmar',
              textoConfirmar: 'Renovar agora',
              descricao: (
                <>
                  A virada acontece sozinha quando o ciclo termina. Renovar agora começa o
                  próximo ciclo já
                  {aberta.ehTurmaFixa
                    ? ' — use quando o pagamento entrou por fora e você quer liberar na frente do aluno.'
                    : ` e, se o plano não acumula, o saldo restante de ${aberta.clienteNome} expira.`}
                </>
              ),
              aoConfirmar: () => renovar.mutateAsync(aberta.saldo.matricula_id!),
            })
          }
          onBonus={() => setBonus(aberta)}
          onInadimplir={() =>
            // Era a única das quatro sem duplo-check: um clique bloqueava
            // o aluno de agendar. Bloquear quem pagou é um erro que só
            // aparece quando ele tenta marcar aula e não consegue.
            confirmar.pedir({
              titulo: 'Marcar pagamento em aberto?',
              tom: 'arquivar',
              textoConfirmar: 'Marcar em aberto',
              descricao: (
                <>
                  {aberta.clienteNome} deixa de conseguir agendar novas aulas até alguém
                  regularizar. <b>Os créditos não são apagados</b> — as aulas já marcadas
                  continuam de pé, e o saldo volta a valer quando a situação mudar.
                </>
              ),
              aoConfirmar: () => inadimplir.mutateAsync(aberta.saldo.matricula_id!),
            })
          }
          onCancelar={() =>
            confirmar.pedir({
              titulo: 'Cancelar a assinatura?',
              // A mais pesada das quatro: encerra o contrato. Vermelho,
              // para não se confundir com as outras no meio de um dia
              // cheio na recepção.
              tom: 'excluir',
              // Vermelho pelo peso, mas sem o aviso de irreversível: a
              // assinatura pode ser recontratada, e o histórico registra
              // o cancelamento e um eventual desfazer.
              irreversivel: false,
              textoConfirmar: 'Cancelar assinatura',
              descricao: (
                <>
                  A cobrança automática de {aberta.clienteNome} para.{' '}
                  {aberta.ehTurmaFixa ? (
                    <>
                      A vaga na turma continua sendo dela até {fmtData(aberta.saldo.data_fim)} e
                      só depois volta para a grade.
                    </>
                  ) : (
                    <>
                      Os créditos já pagos continuam valendo até {fmtData(aberta.saldo.data_fim)}{' '}
                      — nada é apagado.
                    </>
                  )}
                </>
              ),
              aoConfirmar: async () => {
                await cancelar.mutateAsync({ matriculaId: aberta.saldo.matricula_id! })
              },
            })
          }
        />
      )}

      {novo && <MatriculaForm onFechar={() => setNovo(false)} />}
      {bonus && <BonusCreditos matricula={bonus} onFechar={() => setBonus(null)} />}
      {confirmar.dialogo}
    </div>
  )
}

function CartaoMatricula({
  matricula: m,
  gestao,
  pedidoCancelamento,
  onAbrir,
}: {
  matricula: MatriculaCompleta
  gestao: boolean
  /** O aluno pediu cancelamento pelo portal e ninguém respondeu ainda. */
  pedidoCancelamento: boolean
  onAbrir: () => void
}) {
  const s = m.saldo
  const emAberto = s.status === 'inadimplente'
  const cancelando = Boolean(s.cancelamento_efetivo_em)

  return (
    <article
      onClick={onAbrir}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAbrir()
        }
      }}
      className={`flex cursor-pointer flex-col gap-3 rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-neutral-300 hover:shadow-md ${
        emAberto ? 'border-danger-300' : 'border-neutral-200/80'
      }`}
    >
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-bold text-neutral-900">
            {m.clienteNome}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
            {m.ehTurmaFixa ? (
              <CalendarRange className="size-3.5 text-success-600" />
            ) : (
              <Coins className="size-3.5 text-brand-500" />
            )}
            <span className="font-medium text-neutral-700">{m.produto?.nome ?? 'Produto'}</span>
            {(s.ciclos_compromisso ?? 1) > 1 && (
              <span>
                · {(s.ciclo_atual ?? 1) <= (s.ciclos_compromisso ?? 1)
                  ? `ciclo ${s.ciclo_atual}/${s.ciclos_compromisso}`
                  : `ciclo ${s.ciclo_atual}`}
              </span>
            )}
            {(s.ciclos_compromisso ?? 1) === 1 && <span>· ciclo {s.ciclo_atual}</span>}
          </p>
        </div>

        <div className="shrink-0 text-right">
          {m.ehTurmaFixa ? (
            <p className="font-display text-base font-bold text-neutral-900">
              {fmtCentavos(s.preco_contratado_centavos ?? 0)}
              <span className="ml-1 text-[11px] font-medium text-neutral-400">/ciclo</span>
            </p>
          ) : (
            <p
              className={`font-display text-lg font-bold leading-none ${
                (s.saldo ?? 0) > 0 ? 'text-neutral-900' : 'text-danger-600'
              }`}
            >
              {s.saldo}
              <span className="ml-1 text-[11px] font-medium text-neutral-400">
                crédito{s.saldo === 1 ? '' : 's'}
              </span>
            </p>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {emAberto && <Badge variant="danger">pagamento em aberto</Badge>}
        {pedidoCancelamento && <Badge variant="warning">pediu cancelamento</Badge>}
        {cancelando && (
          <Badge variant="warning">cancela {fmtData(s.cancelamento_efetivo_em)}</Badge>
        )}
        {!cancelando && s.renova_automaticamente && (
          <Badge variant="neutral" title="Renova sozinha na virada do ciclo">
            renova sozinha
          </Badge>
        )}
        <Badge variant="neutral">ciclo até {fmtData(s.data_fim)}</Badge>
        {!m.ehTurmaFixa && s.proxima_validade && s.proxima_validade !== s.data_fim && (
          <Badge variant="neutral" title="Data em que o próximo lote de créditos vence">
            créditos vencem {fmtData(s.proxima_validade)}
          </Badge>
        )}
      </div>

      {/* Só a contagem. A lista com os botões de trocar/encerrar turma
          mora no painel: dentro de um cartão que virou clicável, cada
          botão ali seria um alvo competindo com o clique de abrir. */}
      {m.ehTurmaFixa && (
        <p className="text-xs text-neutral-500">
          {m.turmas.length + m.turmasFuturas.length === 1
            ? '1 turma vinculada'
            : `${m.turmas.length + m.turmasFuturas.length} turmas vinculadas`}
        </p>
      )}

      {gestao && (
        <p className="border-t border-neutral-100 pt-2.5 text-[11px] text-neutral-400">
          Abrir para ver o histórico e agir
        </p>
      )}
    </article>
  )
}
