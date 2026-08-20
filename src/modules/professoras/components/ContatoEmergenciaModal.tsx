import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useAtualizarProfessora, type Professora } from '../hooks/useProfessoras'

/**
 * Preenche o contato de emergência de uma professora já cadastrada.
 *
 * Existe porque a obrigatoriedade só vale para cadastros novos: quem já
 * estava no banco antes da migration não tem como ter o dado inventado. A
 * tela marca a pendência e este formulário é como ela se resolve — sem
 * isso, "obrigatório" viraria um erro do banco sem saída pela interface.
 */
export function ContatoEmergenciaModal({
  professora,
  onFechar,
}: {
  professora: Professora
  onFechar: () => void
}) {
  const atualizar = useAtualizarProfessora()
  const [nome, setNome] = useState(professora.contato_emergencia_nome ?? '')
  const [telefone, setTelefone] = useState(professora.contato_emergencia_telefone ?? '')
  const [parentesco, setParentesco] = useState(professora.contato_emergencia_parentesco ?? '')
  const [erro, setErro] = useState<string | null>(null)

  const label = 'mb-1 block text-xs font-medium text-neutral-500'

  function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !telefone.trim()) {
      return setErro('Nome e telefone do contato são obrigatórios.')
    }
    atualizar.mutate(
      {
        id: professora.id,
        patch: {
          contato_emergencia_nome: nome.trim(),
          contato_emergencia_telefone: telefone.trim(),
          contato_emergencia_parentesco: parentesco.trim() || null,
        },
      },
      { onSuccess: onFechar, onError: () => setErro('Não foi possível salvar. Tente de novo.') },
    )
  }

  return (
    <Modal title={`Contato de emergência — ${professora.nome}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <div>
          <label className={label}>Quem acionar *</label>
          <Input
            autoFocus
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Telefone *</label>
            <Input
              required
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(21) 9…"
              className="w-full"
            />
          </div>
          <div>
            <label className={label}>Parentesco</label>
            <Input
              value={parentesco}
              onChange={(e) => setParentesco(e.target.value)}
              placeholder="mãe, cônjuge, amiga…"
              className="w-full"
            />
          </div>
        </div>

        {erro && <p className="text-sm text-danger-600">{erro}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={atualizar.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
