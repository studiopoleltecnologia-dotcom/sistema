import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Repeat, X } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { useConfirmar } from '../../../components/ui/ConfirmarAcao'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import {
  useAtualizarRecorrente,
  useCategoriasSaida,
  useCriarRecorrente,
  useDesativarRecorrente,
  useRecorrentes,
} from '../hooks/useFinanceiro'
import { ORDEM_TIPO_SAIDA, TIPO_SAIDA_LABEL, type DespesaRecorrente, type TipoSaida } from '../types'

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

/**
 * Cadastro das contas fixas recorrentes — os modelos que geram "A pagar"
 * todo mês (aluguel, internet, softwares).
 *
 * Mora num botão do topo da tela, e não mais numa seção dentro do grupo
 * "Fixo recorrente". São duas tarefas de ritmo diferente: consultar o que
 * vence é diário, cadastrar aluguel acontece uma vez por ano. Misturar as
 * duas enchia a tela de Saídas de cadastro justamente onde se procura
 * "quanto ainda tenho para pagar" — e o cadastro ficava escondido no fim de
 * um card recolhível, o lugar mais difícil da tela.
 *
 * Lista e formulário dividem o MESMO modal, alternando a vista. Abrir um
 * segundo modal por cima do primeiro empilharia dois overlays, e o Esc
 * fecharia os dois de uma vez.
 */
export function ContasFixasModal({
  iniciarEmNova = false,
  onFechar,
}: {
  /** O "+" do grupo Fixo recorrente abre já no formulário. */
  iniciarEmNova?: boolean
  onFechar: () => void
}) {
  const [form, setForm] = useState<{ recorrente?: DespesaRecorrente } | null>(
    iniciarEmNova ? {} : null,
  )
  const { data: recorrentes, isLoading } = useRecorrentes()
  const desativar = useDesativarRecorrente()
  const confirmar = useConfirmar()

  const lista = [...(recorrentes ?? [])].sort((a, b) => a.dia_vencimento - b.dia_vencimento)
  const comprometido = lista.reduce((s, r) => s + r.valor_centavos, 0)

  // Formulário: o mesmo modal, outra vista. Voltar é para a lista — exceto
  // quando a tela abriu direto no formulário, aí fechar é fechar.
  if (form) {
    const voltar = () => (iniciarEmNova ? onFechar() : setForm(null))
    return (
      <Modal
        title={form.recorrente ? 'Editar conta fixa' : 'Nova conta fixa'}
        onFechar={voltar}
      >
        <FormContaFixa recorrente={form.recorrente} onPronto={voltar} />
      </Modal>
    )
  }

  return (
    <Modal title="Contas fixas recorrentes" size="lg" onFechar={onFechar}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-500">
          {lista.length === 0
            ? 'Nada cadastrado ainda.'
            : `${lista.length} conta${lista.length > 1 ? 's' : ''} · ${fmtCentavos(comprometido)} por mês comprometidos.`}
        </p>
        <Button size="sm" onClick={() => setForm({})}>
          <Plus className="size-3.5" />
          Nova
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Nenhuma conta fixa"
          description="Cadastre aluguel, internet, softwares… e o sistema cobra todo mês, sozinho."
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lista.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-200/80 bg-white px-3.5 py-2.5 text-sm"
            >
              <span className="w-24 shrink-0 font-semibold tabular-nums text-neutral-900">
                {fmtCentavos(r.valor_centavos)}
              </span>
              <Badge variant="neutral">{r.categoria?.nome}</Badge>
              <span className="flex-1 truncate text-neutral-600">
                {r.descricao}
                {r.observacoes && (
                  <span className="ml-1.5 text-xs text-neutral-400">· {r.observacoes}</span>
                )}
              </span>
              <span className="hidden shrink-0 text-xs text-neutral-400 sm:inline">
                dia {r.dia_vencimento}
                {r.data_fim && ` · até ${r.data_fim.split('-').reverse().join('/')}`}
              </span>
              <button
                onClick={() => setForm({ recorrente: r })}
                title="Editar"
                className="rounded p-1 text-neutral-400 transition hover:text-brand-600"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={() =>
                  confirmar.pedir({
                    titulo: `Encerrar a recorrência de ${r.descricao}?`,
                    tom: 'arquivar',
                    textoConfirmar: 'Encerrar',
                    descricao: (
                      <>
                        Ela para de gerar “A pagar” todo mês, a partir de agora. Os lançamentos que
                        já foram feitos continuam no financeiro — encerrar não mexe em nada do
                        passado.
                      </>
                    ),
                    aoConfirmar: () => desativar.mutateAsync(r.id),
                  })
                }
                title="Encerrar recorrência (não afeta lançamentos já feitos)"
                className="rounded p-1 text-neutral-300 transition hover:text-danger-600"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {confirmar.dialogo}
    </Modal>
  )
}

function FormContaFixa({
  recorrente,
  onPronto,
}: {
  recorrente?: DespesaRecorrente
  onPronto: () => void
}) {
  const editando = recorrente != null
  const { data: categorias } = useCategoriasSaida()
  const criar = useCriarRecorrente()
  const atualizar = useAtualizarRecorrente()

  const [descricao, setDescricao] = useState(recorrente?.descricao ?? '')
  const [valor, setValor] = useState(recorrente ? fmtCentavos(recorrente.valor_centavos) : '')
  const [categoriaId, setCategoriaId] = useState(recorrente?.categoria_id ?? '')
  const [dia, setDia] = useState(String(recorrente?.dia_vencimento ?? 5))
  const [inicio, setInicio] = useState(
    recorrente?.data_inicio ?? new Date().toISOString().slice(0, 10),
  )
  const [fim, setFim] = useState(recorrente?.data_fim ?? '')
  const [observacoes, setObservacoes] = useState(recorrente?.observacoes ?? '')

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    const centavos = parseCentavos(valor)
    if (!centavos || !categoriaId) return
    const campos = {
      descricao: descricao.trim() || 'Despesa recorrente',
      valor_centavos: centavos,
      categoria_id: categoriaId,
      dia_vencimento: Math.min(Math.max(Number(dia) || 1, 1), 28),
      data_inicio: inicio,
      data_fim: fim || null,
      observacoes: observacoes.trim() || null,
    }
    if (editando) {
      atualizar.mutate({ id: recorrente.id, patch: campos }, { onSuccess: onPronto })
    } else {
      criar.mutate(campos, { onSuccess: onPronto })
    }
  }

  const categoriasPorTipo = (tipo: TipoSaida) => (categorias ?? []).filter((c) => c.tipo === tipo)

  return (
    <form onSubmit={salvar}>
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>Descrição</label>
          <Input
            value={descricao}
            onChange={(ev) => setDescricao(ev.target.value)}
            placeholder="Ex.: Aluguel"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Valor mensal *</label>
            <Input
              value={valor}
              onChange={(ev) => setValor(ev.target.value)}
              placeholder="R$ 0,00"
              required
            />
          </div>
          <div>
            <label className={labelCls}>Vence no dia</label>
            <Input
              type="number"
              min={1}
              max={28}
              value={dia}
              onChange={(ev) => setDia(ev.target.value)}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Categoria *</label>
          <Select value={categoriaId} onChange={(ev) => setCategoriaId(ev.target.value)} required>
            <option value="">Escolha…</option>
            {ORDEM_TIPO_SAIDA.map((tipo) => (
              <optgroup key={tipo} label={TIPO_SAIDA_LABEL[tipo]}>
                {categoriasPorTipo(tipo).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Início</label>
            <Input type="date" value={inicio} onChange={(ev) => setInicio(ev.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Término</label>
            <Input type="date" value={fim} onChange={(ev) => setFim(ev.target.value)} />
            <p className="mt-1 text-[11px] text-neutral-400">Vazio = sem prazo</p>
          </div>
        </div>
        <div>
          <label className={labelCls}>Observações</label>
          <Input
            value={observacoes}
            onChange={(ev) => setObservacoes(ev.target.value)}
            placeholder="Ex.: reajuste em janeiro"
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onPronto}
          className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800"
        >
          Cancelar
        </button>
        <Button type="submit" loading={criar.isPending || atualizar.isPending}>
          {editando ? 'Salvar' : 'Criar'}
        </Button>
      </div>
    </form>
  )
}
