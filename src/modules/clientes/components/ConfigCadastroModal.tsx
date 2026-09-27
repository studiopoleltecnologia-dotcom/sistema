import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import {
  salvarConfigCadastro,
  useConfigCadastro,
  type ConfigCadastro,
} from '../../../lib/cadastro'

const OPCOES: { campo: keyof ConfigCadastro; titulo: string; detalhe: string }[] = [
  {
    campo: 'exigir_sobrenome',
    titulo: 'Nome e sobrenome',
    detalhe: 'Recusa cadastro com uma palavra só, como "caroline".',
  },
  {
    campo: 'validar_telefone_br',
    titulo: 'Telefone com DDD',
    detalhe: 'Celular com 9 na frente ou fixo, com DDD que existe. Vale também para o contato de emergência.',
  },
  {
    campo: 'exigir_cpf',
    titulo: 'CPF obrigatório',
    detalhe:
      'Exigido ao criar conta no portal, ao cadastrar aluno e ao contratar plano. Desligar NÃO libera a cobrança: o gateway continua recusando emitir sem CPF.',
  },
  {
    campo: 'exigir_email',
    titulo: 'E-mail obrigatório',
    detalhe: 'Exigido ao cadastrar aluno. Plano continua exigindo e-mail de qualquer jeito.',
  },
  {
    campo: 'exigir_cpf_email_no_lead',
    titulo: 'Exigir CPF e e-mail também de lead',
    detalhe:
      'Desligado, quem ainda está no funil (lead, pediu informações, experimental) entra só com nome e WhatsApp.',
  },
]

/**
 * As regras do cadastro, desligáveis pela gestão sem deploy.
 * Quem garante é a RLS de `config_cadastro` (só `is_gestao()` altera);
 * esconder o botão para os outros é só para não oferecer o que o banco
 * recusaria.
 */
export function ConfigCadastroModal({ onFechar }: { onFechar: () => void }) {
  const atual = useConfigCadastro()
  const qc = useQueryClient()
  const [cfg, setCfg] = useState<ConfigCadastro>(atual)
  useEffect(() => setCfg(atual), [atual])

  const salvar = useMutation({
    mutationFn: salvarConfigCadastro,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-cadastro'] })
      onFechar()
    },
  })

  return (
    <Modal title="Regras do cadastro" onFechar={onFechar} size="md">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-neutral-500">
          Valem para o portal do aluno e para os cadastros feitos pela equipe. Aluno estrangeiro
          fica fora de todas.
        </p>

        {OPCOES.map((o) => (
          <label
            key={o.campo}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 p-3 transition hover:bg-neutral-50"
          >
            <input
              id={`config-cadastro-${o.campo}`}
              type="checkbox"
              checked={cfg[o.campo]}
              onChange={(e) => setCfg((c) => ({ ...c, [o.campo]: e.target.checked }))}
              className="mt-0.5 accent-brand-600"
            />
            <span>
              <span className="block text-sm font-medium text-neutral-800">{o.titulo}</span>
              <span className="block text-xs text-neutral-500">{o.detalhe}</span>
            </span>
          </label>
        ))}

        {salvar.isError && (
          <p className="text-sm text-danger-600">
            {(salvar.error as Error).message ?? 'Não foi possível salvar.'}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate(cfg)} loading={salvar.isPending}>
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
