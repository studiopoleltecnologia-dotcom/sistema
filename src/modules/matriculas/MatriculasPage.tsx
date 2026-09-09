import { useMemo, useState } from 'react'
import { CalendarRange, Coins, Plus, Users } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { useConfirmar } from '../../components/ui/ConfirmarAcao'
import { fmtData } from '../../lib/datas'
import { fmtCentavos } from '../../lib/dinheiro'
import { useMinhaFuncao } from '../../lib/funcao'
import { MatriculaForm } from './components/MatriculaForm'
import { TurmasVinculadas } from './components/TurmasVinculadas'
import {
  useCancelarAssinatura,
  useMarcarInadimplente,
  useMatriculasCompletas,
  useRenovarCiclo,
} from './hooks/useMatriculas'
import type { MatriculaCompleta } from './types'

type Filtro = 'todas' | 'creditos' | 'turma_fixa' | 'em_aberto'

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
  const [filtro, setFiltro] = useState<Filtro>('todas')

  const contagens = useMemo(() => {
    const l = matriculas
    return {
      todas: l.length,
      creditos: l.filter((m) => !m.ehTurmaFixa).length,
      turma_fixa: l.filter((m) => m.ehTurmaFixa).length,
      em_aberto: l.filter((m) => m.saldo.status === 'inadimplente').length,
    }
  }, [matriculas])

  const visiveis = useMemo(() => {
    const l = matriculas
    if (filtro === 'creditos') return l.filter((m) => !m.ehTurmaFixa)
    if (filtro === 'turma_fixa') return l.filter((m) => m.ehTurmaFixa)
    if (filtro === 'em_aberto') return l.filter((m) => m.saldo.status === 'inadimplente')
    return l
  }, [matriculas, filtro])

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

      {contagens.todas > 0 && (
        <Tabs
          value={filtro}
          onChange={setFiltro}
          size="sm"
          items={[
            { value: 'todas', label: `Todas (${contagens.todas})` },
            { value: 'creditos', label: `Por créditos (${contagens.creditos})` },
            { value: 'turma_fixa', label: `Turma fixa (${contagens.turma_fixa})` },
            ...(contagens.em_aberto > 0
              ? [{ value: 'em_aberto' as Filtro, label: `Em aberto (${contagens.em_aberto})` }]
              : []),
          ]}
        />
      )}

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {!isLoading && contagens.todas === 0 && (
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
            onRenovar={() =>
              confirmar.pedir({
                titulo: 'Adiantar a renovação?',
                tom: 'arquivar',
                textoConfirmar: 'Renovar agora',
                descricao: (
                  <>
                    A virada acontece sozinha quando o ciclo termina. Renovar agora começa o
                    próximo ciclo já
                    {m.ehTurmaFixa
                      ? ' — use quando o pagamento entrou por fora e você quer liberar na frente do aluno.'
                      : ` e, se o plano não acumula, o saldo restante de ${m.clienteNome} expira.`}
                  </>
                ),
                aoConfirmar: () => renovar.mutateAsync(m.saldo.matricula_id!),
              })
            }
            onInadimplir={() => inadimplir.mutate(m.saldo.matricula_id!)}
            onCancelar={() =>
              confirmar.pedir({
                titulo: 'Cancelar a assinatura?',
                tom: 'arquivar',
                textoConfirmar: 'Cancelar assinatura',
                descricao: (
                  <>
                    A cobrança automática de {m.clienteNome} para.{' '}
                    {m.ehTurmaFixa ? (
                      <>
                        A vaga na turma continua sendo dela até {fmtData(m.saldo.data_fim)} e só
                        depois volta para a grade.
                      </>
                    ) : (
                      <>
                        Os créditos já pagos continuam valendo até {fmtData(m.saldo.data_fim)} —
                        nada é apagado.
                      </>
                    )}
                  </>
                ),
                aoConfirmar: async () => {
                  await cancelar.mutateAsync({ matriculaId: m.saldo.matricula_id! })
                },
              })
            }
          />
        ))}
      </div>

      {novo && <MatriculaForm onFechar={() => setNovo(false)} />}
      {confirmar.dialogo}
    </div>
  )
}

function CartaoMatricula({
  matricula: m,
  gestao,
  onRenovar,
  onInadimplir,
  onCancelar,
}: {
  matricula: MatriculaCompleta
  gestao: boolean
  onRenovar: () => void
  onInadimplir: () => void
  onCancelar: () => void
}) {
  const s = m.saldo
  const emAberto = s.status === 'inadimplente'
  const cancelando = Boolean(s.cancelamento_efetivo_em)

  return (
    <article
      className={`flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm transition ${
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

      {m.ehTurmaFixa && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            {m.turmas.length + m.turmasFuturas.length === 1
              ? 'Turma vinculada'
              : 'Turmas vinculadas'}
          </p>
          <TurmasVinculadas matricula={m} gestao={gestao} />
        </div>
      )}

      {gestao && (
        <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 pt-2.5">
          {!cancelando && (
            <button
              onClick={onRenovar}
              title="Recebeu por fora e quer liberar o próximo ciclo sem esperar a virada"
              className="rounded-md bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700 transition hover:bg-success-100"
            >
              renovar agora
            </button>
          )}
          {s.status === 'ativa' && (
            <button
              onClick={onInadimplir}
              title="Mensalidade não entrou: bloqueia novos agendamentos até regularizar"
              className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-400 transition hover:bg-danger-50 hover:text-danger-600"
            >
              não pagou
            </button>
          )}
          {!cancelando && (
            <button
              onClick={onCancelar}
              title="Desliga a renovação no fim do ciclo pago"
              className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            >
              cancelar assinatura
            </button>
          )}
        </div>
      )}
    </article>
  )
}
