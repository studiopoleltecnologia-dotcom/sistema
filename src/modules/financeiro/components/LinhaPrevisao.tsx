import { useState } from 'react'
import { Eye, EyeOff, Link2, RotateCcw } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Select } from '../../../components/ui/Select'
import { cn } from '../../../components/ui/cn'
import { useClientes } from '../../clientes/hooks/useClientes'
import { DataEditavel, TextoEditavel, ValorEditavel } from './CamposEditaveis'
import type { LinhaPrevisao } from '../api/previsao'
import {
  useEditarPrevisao,
  useRedefinirPrevisao,
  useVincularPrevisao,
} from '../hooks/usePrevisao'

/**
 * Uma linha da previsão do Asaas, editável no lugar.
 *
 * Mora aqui, e não dentro de uma das telas, porque as **duas** mostram a
 * mesma linha: Previsão (os 12 meses) e Entradas (o recorte aberto). Uma
 * cópia em cada lugar seria duas chances de as telas discordarem sobre o
 * que acontece ao clicar — que é exatamente o problema que já apareceu
 * com a regra de recorte do mês.
 *
 * Os handlers ficam dentro do componente, não nas props: é uma folha, e
 * passar seis callbacks iguais em dois lugares só criaria oportunidade
 * de divergência.
 *
 * O que cada ação significa:
 *  · **valor/vencimento/descrição** — correção da gestão. Marca a linha
 *    como editada, e a sincronização passa a respeitá-la;
 *  · **ocultar** — "isso não vai entrar", sem apagar: sai do total e
 *    volta com um clique. Apagar não serviria: a sincronização seguinte
 *    recriaria a linha;
 *  · **voltar ao Asaas** — desfaz a edição e devolve a linha ao gateway;
 *  · **vincular** — liga a cobrança a um aluno quando o casamento
 *    automático (id do gateway → CPF → e-mail) não achou.
 */
export function LinhaPrevisaoEditavel({
  l,
  compacta = false,
}: {
  l: LinhaPrevisao
  /** Em Entradas a linha divide espaço com a lista de caixa: menos texto. */
  compacta?: boolean
}) {
  const editar = useEditarPrevisao()
  const redefinir = useRedefinirPrevisao()
  const vincular = useVincularPrevisao()
  const [vinculando, setVinculando] = useState(false)
  // A mesma query que Clientes e Entradas já usam: o cache é
  // compartilhado, então mostrar esta linha não gera busca nova.
  const { data: clientes } = useClientes()

  return (
    <li className={cn('flex flex-wrap items-center gap-2 py-2', l.oculto && 'opacity-45')}>
      <ValorEditavel
        valor={l.valor_centavos}
        onSalvar={(centavos) => editar.mutate({ id: l.id, patch: { valor_centavos: centavos } })}
        className="text-neutral-800"
        dica="Clique para corrigir o valor previsto. A correção sobrevive à sincronização."
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-800">
          {l.nome ?? 'Sem nome no gateway'}
          {l.sem_vinculo && (
            <span className="ml-2 align-middle text-[11px] font-normal text-warning-600">
              não vinculado
            </span>
          )}
        </p>
        <div className="text-[11px] text-neutral-400">
          <TextoEditavel
            valor={l.descricao ?? ''}
            onSalvar={(texto) => editar.mutate({ id: l.id, patch: { descricao: texto || null } })}
            placeholder="sem descrição"
            className="text-[11px]"
          />
        </div>
      </div>

      {!compacta && (
        <Badge variant={l.tipo === 'cobranca' ? 'brand' : 'neutral'}>
          {l.tipo === 'cobranca' ? 'cobrança emitida' : 'ciclo projetado'}
        </Badge>
      )}
      {l.editada && <Badge variant="warning">editada</Badge>}
      {l.fora_do_gateway && <Badge variant="danger">fora do Asaas</Badge>}

      <DataEditavel
        valor={l.vencimento}
        onSalvar={(iso) => editar.mutate({ id: l.id, patch: { vencimento: iso } })}
        rotulo="vence"
        dica="Clique para corrigir a data prevista"
      />

      {l.sem_vinculo &&
        (vinculando ? (
          <Select
            autoFocus
            defaultValue=""
            onChange={(ev) => {
              if (ev.target.value) vincular.mutate({ id: l.id, clienteId: ev.target.value })
              setVinculando(false)
            }}
            onBlur={() => setVinculando(false)}
            className="max-w-48"
          >
            <option value="">Escolha o aluno…</option>
            {(clientes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        ) : (
          <button
            type="button"
            onClick={() => setVinculando(true)}
            title="Ligar esta cobrança a um aluno do cadastro"
            className="rounded p-1 text-neutral-300 transition hover:text-brand-600"
          >
            <Link2 className="size-3.5" />
          </button>
        ))}

      {l.editada && (
        <button
          type="button"
          onClick={() => redefinir.mutate(l.id)}
          title="Voltar ao valor do Asaas (desfaz a edição)"
          className="rounded p-1 text-neutral-300 transition hover:text-brand-600"
        >
          <RotateCcw className="size-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={() => editar.mutate({ id: l.id, patch: { oculto: !l.oculto } })}
        title={l.oculto ? 'Voltar a contar no total' : 'Não contar no total (sem apagar)'}
        className="rounded p-1 text-neutral-300 transition hover:text-neutral-700"
      >
        {l.oculto ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </button>
    </li>
  )
}
