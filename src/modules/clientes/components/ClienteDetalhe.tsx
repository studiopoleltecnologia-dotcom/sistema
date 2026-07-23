import { useState } from 'react'
import { Badge } from '../../../components/ui/Badge'
import { fmtData, fmtDataHora } from '../../../lib/datas'
import {
  useAdicionarInteracao,
  useAtualizarCliente,
  useInteracoes,
  useMatriculasDoCliente,
  usePlanosNomes,
  useProximasAulasDoCliente,
} from '../hooks/useClientes'
import {
  ESTAGIOS,
  ORIGEM_LABEL,
  TIPO_INTERACAO_LABEL,
  type Cliente,
  type EstagioFunil,
  type Socia,
  type TipoInteracao,
} from '../types'

const fmtHora = (h: string) => h.slice(0, 5)
const CANAL_CURTO: Record<string, string> = {
  wellhub: 'Wellhub',
  classpass: 'ClassPass',
  avulsa: 'Avulsa',
}

/**
 * Painel lateral: dados da cliente, mudança de estágio (1 clique) e
 * histórico de interações — que a Fase 3 (Follow-up) vai consumir.
 */
export function ClienteDetalhe({
  cliente,
  socias,
  onEditar,
  onFechar,
}: {
  cliente: Cliente
  socias: Socia[]
  onEditar: () => void
  onFechar: () => void
}) {
  const { data: interacoes } = useInteracoes(cliente.id)
  const { data: matriculas } = useMatriculasDoCliente(cliente.id)
  const { data: aulas } = useProximasAulasDoCliente(cliente.id)
  const { data: planosNomes } = usePlanosNomes()
  const atualizar = useAtualizarCliente()
  const adicionarInteracao = useAdicionarInteracao()

  const [novaNota, setNovaNota] = useState('')
  const [tipoNota, setTipoNota] = useState<TipoInteracao>('nota')

  const responsavel = socias.find((s) => s.id === cliente.responsavel_id)?.nome
  const nomePlano = (id: string | null) =>
    (planosNomes ?? []).find((p) => p.id === id)?.nome ?? 'Plano'

  function mudarEstagio(estagio: EstagioFunil) {
    atualizar.mutate({ id: cliente.id, patch: { estagio } })
  }

  function registrarNota() {
    const descricao = novaNota.trim()
    if (!descricao) return
    adicionarInteracao.mutate(
      { cliente_id: cliente.id, tipo: tipoNota, descricao },
      { onSuccess: () => setNovaNota('') },
    )
  }

  const dado = (rotulo: string, valor: string | null | undefined) => (
    <div>
      <dt className="text-xs text-neutral-400">{rotulo}</dt>
      <dd className="text-sm text-neutral-700">{valor || '—'}</dd>
    </div>
  )

  return (
    <aside className="fixed inset-y-0 right-0 z-10 flex w-96 flex-col border-l border-neutral-100 bg-white shadow-xl">
      <div className="flex items-start justify-between border-b border-neutral-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            {cliente.nome}
            {cliente.vip && (
              <span className="rounded bg-brand-50 px-1.5 text-[10px] font-semibold text-brand-600">
                VIP
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            {ORIGEM_LABEL[cliente.origem]} · desde {fmtData(cliente.primeiro_contato)}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEditar}
            className="rounded-md px-2 py-1 text-xs text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800"
          >
            Editar
          </button>
          <button
            onClick={onFechar}
            className="rounded-md px-2 py-1 text-xs text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
          >
            Fechar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <label className="mb-1 block text-xs font-medium text-neutral-500">
          Estágio no funil
        </label>
        <select
          value={cliente.estagio}
          onChange={(e) => mudarEstagio(e.target.value as EstagioFunil)}
          disabled={atualizar.isPending}
          className="mb-4 w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500"
        >
          {ESTAGIOS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {dado('Telefone', cliente.telefone)}
          {dado('Instagram', cliente.instagram)}
          {dado('Modalidade', cliente.modalidade)}
          {dado('Responsável', responsavel)}
          {dado('Última conversa', fmtData(cliente.ultima_conversa))}
          {dado('Última aula', fmtData(cliente.ultima_aula))}
          {dado('Nascimento', fmtData(cliente.data_nascimento))}
          {cliente.gympass_id ? dado('ID Wellhub', cliente.gympass_id) : null}
        </dl>

        {cliente.observacoes && (
          <p className="mt-3 rounded-md bg-neutral-50 p-2.5 text-xs text-neutral-600">
            {cliente.observacoes}
          </p>
        )}

        <h3 className="mb-2 mt-6 text-xs font-semibold tracking-wide text-neutral-500">
          PLANO &amp; CRÉDITOS
        </h3>
        {(matriculas ?? []).length === 0 ? (
          <p className="text-xs text-neutral-400">Sem plano ativo — matricule em Planos.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {(matriculas ?? []).map((m) => (
              <li key={m.matricula_id ?? ''} className="rounded-md border border-neutral-100 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm font-medium text-neutral-800">
                    {nomePlano(m.plano_id)}
                  </span>
                  {m.status === 'inadimplente' && <Badge variant="danger">em aberto</Badge>}
                  <span
                    className={`text-sm font-semibold ${
                      (m.saldo ?? 0) > 0 ? 'text-neutral-900' : 'text-danger-600'
                    }`}
                  >
                    {m.saldo} crédito{m.saldo === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-400">
                  {(m.ciclos_total ?? 1) > 1 && `mês ${m.ciclo_atual}/${m.ciclos_total} · `}
                  válido até {fmtData(m.data_fim)}
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mb-2 mt-6 text-xs font-semibold tracking-wide text-neutral-500">
          PRÓXIMAS AULAS
        </h3>
        {(aulas ?? []).length === 0 ? (
          <p className="text-xs text-neutral-400">Nenhuma aula agendada.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {(aulas ?? []).map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-md border border-neutral-100 px-2.5 py-2 text-xs"
              >
                <span className="font-medium text-neutral-700">{fmtData(a.data)}</span>
                {a.turma && <span className="text-neutral-500">{fmtHora(a.turma.horario)}</span>}
                <span className="flex-1 truncate text-neutral-500">{a.turma?.modalidade}</span>
                {a.canal !== 'mensalista' && (
                  <Badge variant="brand">{CANAL_CURTO[a.canal] ?? a.canal}</Badge>
                )}
                {a.professora && <span className="text-neutral-400">{a.professora}</span>}
              </li>
            ))}
          </ul>
        )}

        <h3 className="mb-2 mt-6 text-xs font-semibold tracking-wide text-neutral-500">
          HISTÓRICO
        </h3>

        <div className="mb-3 flex gap-1.5">
          <select
            value={tipoNota}
            onChange={(e) => setTipoNota(e.target.value as TipoInteracao)}
            className="rounded-md border border-neutral-200 px-1.5 py-1 text-xs outline-none"
          >
            <option value="nota">Nota</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="conversa">Conversa</option>
          </select>
          <input
            value={novaNota}
            onChange={(e) => setNovaNota(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && registrarNota()}
            placeholder="Registrar interação…"
            className="flex-1 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none transition focus:border-brand-500"
          />
          <button
            onClick={registrarNota}
            disabled={adicionarInteracao.isPending || !novaNota.trim()}
            className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            OK
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {(interacoes ?? []).map((i) => (
            <li key={i.id} className="rounded-md border border-neutral-100 p-2.5">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>{TIPO_INTERACAO_LABEL[i.tipo]}</span>
                <span>{fmtDataHora(i.criada_em)}</span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-700">{i.descricao}</p>
            </li>
          ))}
          {interacoes?.length === 0 && (
            <li className="py-2 text-center text-xs text-neutral-300">
              Nenhuma interação registrada.
            </li>
          )}
        </ul>
      </div>
    </aside>
  )
}
