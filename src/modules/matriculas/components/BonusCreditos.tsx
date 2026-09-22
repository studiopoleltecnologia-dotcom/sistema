import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { fmtData } from '../../../lib/datas'
import { useConcederCreditos } from '../hooks/useMatriculas'
import type { MatriculaCompleta } from '../types'

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

/**
 * Dar crédito de cortesia ou reposição para uma aluna.
 *
 * Existe porque isso acontece o tempo todo no balcão ("perdeu a aula
 * por causa do trânsito", "indicou uma amiga") e até aqui só o sistema
 * dava crédito: todos os lançamentos nasciam dentro de `renovar_ciclo()`.
 * Quem quisesse bonificar teria que escrever no banco à mão.
 *
 * A validade vai SEMPRE preenchida. O banco aceita omitir (e aí usa o
 * fim do ciclo), mas recusa a omissão quando o ciclo já venceu — que é
 * justamente o caso de bonificar quem sumiu. Mandar a data resolvida
 * daqui evita que esse erro chegue na cara de quem está no balcão.
 */
export function BonusCreditos({
  matricula: m,
  onFechar,
}: {
  matricula: MatriculaCompleta
  onFechar: () => void
}) {
  const conceder = useConcederCreditos()

  const hoje = new Date().toISOString().slice(0, 10)
  const fimDoCiclo = m.saldo.data_fim ?? ''
  // Ciclo vigente: o bônus acompanha o que ela já tem, e vence junto.
  // Ciclo vencido: 30 dias é um prazo de reaproximação, e fica visível
  // no campo para quem quiser mudar antes de salvar.
  const validadePadrao =
    fimDoCiclo && fimDoCiclo >= hoje
      ? fimDoCiclo
      : new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

  const [quantidade, setQuantidade] = useState(1)
  const [origem, setOrigem] = useState<'ajuste' | 'reposicao'>('ajuste')
  const [motivo, setMotivo] = useState('')
  const [validade, setValidade] = useState(validadePadrao)
  const [erro, setErro] = useState<string | null>(null)

  const cicloVencido = Boolean(fimDoCiclo) && fimDoCiclo < hoje

  function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (quantidade < 1) return setErro('A quantidade precisa ser pelo menos 1.')
    if (!motivo.trim()) return setErro('Escreva o motivo — ele aparece no extrato da aluna.')
    if (validade < hoje) return setErro('A validade não pode estar no passado.')

    conceder.mutate(
      { matriculaId: m.saldo.matricula_id!, quantidade, motivo: motivo.trim(), validade, origem },
      { onSuccess: onFechar, onError: (e) => setErro((e as Error).message) },
    )
  }

  return (
    <Modal title={`Dar crédito para ${m.clienteNome}`} onFechar={onFechar} size="md">
      <form onSubmit={submeter} className="flex flex-col gap-4">
        <div className="rounded-md border border-neutral-200 bg-neutral-50/70 px-3 py-2 text-xs leading-relaxed text-neutral-600">
          <p>
            <span className="font-medium text-neutral-800">{m.produto?.nome ?? 'Plano'}</span> ·
            saldo hoje: <span className="font-medium text-neutral-800">{m.saldo.saldo}</span>
          </p>
          <p>
            {cicloVencido ? (
              <>
                Ciclo venceu em {fmtData(fimDoCiclo)} — escolha até quando o bônus vale.
              </>
            ) : (
              <>Ciclo vai até {fmtData(fimDoCiclo)}.</>
            )}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Quantos créditos *"
            type="number"
            min={1}
            step={1}
            value={quantidade}
            onChange={(e) => setQuantidade(Number(e.target.value))}
            required
          />

          <div>
            <label className={labelCls}>Tipo *</label>
            <Select
              value={origem}
              onChange={(e) => setOrigem(e.target.value as 'ajuste' | 'reposicao')}
            >
              <option value="ajuste">Cortesia</option>
              <option value="reposicao">Reposição de aula</option>
            </Select>
          </div>
        </div>

        <Input
          label="Vale até *"
          type="date"
          min={hoje}
          value={validade}
          onChange={(e) => setValidade(e.target.value)}
          hint="Crédito sempre tem prazo — depois dessa data ele expira, como qualquer outro."
          required
        />

        <Input
          label="Motivo *"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: aula cancelada por falta de professora"
          hint="Aparece no extrato que a aluna vê no portal."
          required
        />

        {erro && <p className="text-sm text-danger-600">{erro}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={conceder.isPending} disabled={!motivo.trim()}>
            Dar {quantidade} crédito{quantidade === 1 ? '' : 's'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
