import { useMemo, useState } from 'react'
import { CalendarRange, Coins, Plus } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos } from '../../../lib/dinheiro'
import { useProdutos } from '../../produtos/hooks/useProdutos'
import { RECORRENCIA_LABEL, recorrenciaDoProduto } from '../../produtos/types'
import { MatriculaForm } from '../../matriculas/components/MatriculaForm'
import { TurmasVinculadas } from '../../matriculas/components/TurmasVinculadas'
import { useMatriculaTurmas } from '../../matriculas/hooks/useMatriculas'
import type { MatriculaCompleta, MatriculaTurma } from '../../matriculas/types'
import { useMatriculasDoCliente } from '../hooks/useClientes'

/**
 * O plano do aluno, na ficha dele — item 16 do pedido.
 *
 * O bloco antigo dizia só "nome do plano + saldo de créditos". Para
 * turma fixa isso não responde nada: saldo é sempre 0 e o que a equipe
 * precisa saber é EM QUAL TURMA a pessoa treina. A regra do bloco agora
 * é: mostrar o que aquele formato de plano torna verdadeiro — crédito
 * para quem tem crédito, turma para quem tem assento —, e não um
 * formulário genérico que serve mal para os dois.
 *
 * Os dados vêm das mesmas fontes das Matrículas (vw_saldo_creditos e
 * vw_matricula_turmas). Nada é duplicado nem recalculado aqui: se o
 * número diverge entre a ficha e /matriculas, é bug de cache, não de
 * duas contas diferentes.
 */
export function PlanoDoCliente({
  clienteId,
  clienteNome,
  gestao,
}: {
  clienteId: string
  clienteNome: string
  gestao: boolean
}) {
  const { data: matriculas } = useMatriculasDoCliente(clienteId)
  const { data: vinculos } = useMatriculaTurmas()
  const { data: produtos } = useProdutos()
  const [novo, setNovo] = useState(false)

  const completas = useMemo<MatriculaCompleta[]>(() => {
    const porProduto = new Map((produtos ?? []).map((p) => [p.id, p]))
    const porMatricula = new Map<string, MatriculaTurma[]>()
    for (const v of vinculos ?? []) {
      if (!v.matricula_id) continue
      const atual = porMatricula.get(v.matricula_id) ?? []
      atual.push(v)
      porMatricula.set(v.matricula_id, atual)
    }
    return (matriculas ?? []).map((s) => {
      const produto = s.plano_id ? porProduto.get(s.plano_id) ?? null : null
      const todos = s.matricula_id ? porMatricula.get(s.matricula_id) ?? [] : []
      return {
        saldo: s,
        produto,
        clienteId,
        clienteNome,
        turmas: todos.filter((t) => t.vigente),
        turmasFuturas: todos.filter((t) => t.futuro),
        turmasEncerradas: todos.filter((t) => !t.vigente && !t.futuro),
        ehTurmaFixa: (produto?.turmas_fixas ?? 0) > 0,
      }
    })
  }, [matriculas, vinculos, produtos, clienteId, clienteNome])

  return (
    <>
      <h3 className="mb-2 mt-6 flex items-center gap-2 text-xs font-semibold tracking-wide text-neutral-500">
        PLANO ATUAL
        {gestao && (
          <button
            onClick={() => setNovo(true)}
            title="Matricular em um plano"
            className="ml-auto flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-medium normal-case tracking-normal text-neutral-400 transition hover:bg-neutral-100 hover:text-brand-700"
          >
            <Plus className="size-3" />
            matricular
          </button>
        )}
      </h3>

      {completas.length === 0 ? (
        <p className="text-xs text-neutral-400">
          Sem plano ativo.
          {gestao && ' Use "matricular" acima ou o módulo Matrículas.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {completas.map((m) => {
            const s = m.saldo
            const recorrencia = m.produto ? RECORRENCIA_LABEL[recorrenciaDoProduto(m.produto)] : null
            return (
              <li
                key={s.matricula_id ?? ''}
                className="rounded-md border border-neutral-200 bg-white p-2.5"
              >
                <div className="flex items-start gap-2">
                  {m.ehTurmaFixa ? (
                    <CalendarRange className="mt-0.5 size-4 shrink-0 text-success-600" />
                  ) : (
                    <Coins className="mt-0.5 size-4 shrink-0 text-brand-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-neutral-900">
                      {m.produto?.nome ?? 'Plano'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {recorrencia}
                      {s.preco_contratado_centavos
                        ? ` · ${fmtCentavos(s.preco_contratado_centavos)}${
                            s.renova_automaticamente ? '/ciclo' : ''
                          }`
                        : ' · cortesia'}
                    </p>
                  </div>
                  {!m.ehTurmaFixa && (
                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        (s.saldo ?? 0) > 0 ? 'text-neutral-900' : 'text-danger-600'
                      }`}
                    >
                      {s.saldo} crédito{s.saldo === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {s.status === 'inadimplente' && <Badge variant="danger">em aberto</Badge>}
                  {(s.ciclos_compromisso ?? 1) > 1 &&
                    (s.ciclo_atual ?? 1) <= (s.ciclos_compromisso ?? 1) && (
                      <Badge variant="neutral">
                        ciclo {s.ciclo_atual}/{s.ciclos_compromisso}
                      </Badge>
                    )}
                  <Badge variant="neutral">
                    {s.cancelamento_efetivo_em ? 'vale até' : 'renova em'}{' '}
                    {fmtData(s.data_fim)}
                  </Badge>
                  {s.cancelamento_efetivo_em ? (
                    <Badge variant="warning">cancelada</Badge>
                  ) : s.renova_automaticamente ? (
                    <Badge variant="neutral">renova sozinha</Badge>
                  ) : null}
                </div>

                {m.ehTurmaFixa && (
                  <div className="mt-2 border-t border-neutral-100 pt-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      {m.turmas.length + m.turmasFuturas.length === 1
                        ? 'Turma vinculada'
                        : 'Turmas vinculadas'}
                    </p>
                    <TurmasVinculadas matricula={m} gestao={gestao} compacto />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {novo && (
        <MatriculaForm
          clienteFixo={{ id: clienteId, nome: clienteNome }}
          onFechar={() => setNovo(false)}
        />
      )}
    </>
  )
}
