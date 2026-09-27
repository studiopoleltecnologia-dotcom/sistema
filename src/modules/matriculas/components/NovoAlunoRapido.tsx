import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import {
  formatarCpf,
  temErros,
  useConfigCadastro,
  validarCadastro,
  type ErrosCadastro,
} from '../../../lib/cadastro'
import { useCriarCliente } from '../../clientes/hooks/useClientes'

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'
const erroCls = 'mt-1 text-[11px] text-danger-600'

/**
 * Cadastro mínimo de aluno, de dentro da Nova matrícula.
 *
 * O problema que resolve: a tela de matrícula só oferecia alunos que já
 * existiam, e a única porta de entrada era o módulo Clientes — a pessoa
 * estava no balcão, a equipe precisava sair da tela, cadastrar, voltar e
 * procurar de novo.
 *
 * Pede só o que o sistema não consegue inventar nem adiar:
 * nome e sobrenome, e-mail (sem ele o aluno não recebe aviso de aula
 * cancelada nem cobrança, e `matricular_produto()` recusa plano), CPF
 * (sem ele o gateway não emite a cobrança) e o contato de emergência,
 * que é obrigatório por trigger no banco desde `20260723130000`. O resto
 * do cadastro — Instagram, origem, funil, nascimento — fica para a ficha
 * completa, sem travar a venda.
 *
 * Nasce com estágio `ativa`, então o banco exige CPF e e-mail
 * (`20260930120000`). Estrangeiro é isento.
 */
export function NovoAlunoRapido({
  onCriado,
  onFechar,
}: {
  /** Devolve o aluno criado para a matrícula já seguir com ele selecionado. */
  onCriado: (cliente: { id: string; nome: string }) => void
  onFechar: () => void
}) {
  const criar = useCriarCliente()
  const cfg = useConfigCadastro()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpf] = useState('')
  const [estrangeiro, setEstrangeiro] = useState(false)
  const [emergNome, setEmergNome] = useState('')
  const [emergTel, setEmergTel] = useState('')
  const [erros, setErros] = useState<ErrosCadastro>({})
  const [erro, setErro] = useState<string | null>(null)

  function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const dados = {
      nome: nome.trim(),
      email: email.trim() || null,
      telefone: telefone.trim() || null,
      cpf: estrangeiro ? null : cpf.trim() || null,
      estrangeiro,
      contato_emergencia_nome: emergNome.trim(),
      contato_emergencia_telefone: emergTel.trim(),
      origem: 'outros' as const,
      estagio: 'ativa' as const,
    }
    const encontrados = validarCadastro(dados, cfg)
    setErros(encontrados)
    if (temErros(encontrados)) return
    criar.mutate(dados, {
      onSuccess: (c) => onCriado({ id: c.id, nome: c.nome }),
      onError: (e) => setErro((e as Error).message),
    })
  }

  return (
    <Modal title="Novo aluno" onFechar={onFechar} size="md">
      <form onSubmit={submeter} className="flex flex-col gap-4">
        <p className="text-xs text-neutral-500">
          O essencial para matricular agora. O cadastro completo — Instagram, origem, funil,
          nascimento — pode ser preenchido depois na ficha do aluno.
        </p>

        <div>
          <label className={labelCls}>Nome completo *</label>
          <Input
            autoFocus
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="nome e sobrenome"
          />
          {erros.nome && <p className={erroCls}>{erros.nome}</p>}
        </div>

        <label className="-mt-2 flex items-center gap-2 text-xs text-neutral-500">
          <input
            id="novo-aluno-estrangeiro"
            type="checkbox"
            checked={estrangeiro}
            onChange={(e) => setEstrangeiro(e.target.checked)}
            className="accent-brand-600"
          />
          Estrangeiro — sem CPF e com telefone de fora
        </label>

        <div>
          <label className={labelCls}>E-mail{estrangeiro ? '' : ' *'}</label>
          <Input
            type="email"
            required={!estrangeiro}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="para avisos de aula, cobrança e acesso ao portal"
          />
          {erros.email ? (
            <p className={erroCls}>{erros.email}</p>
          ) : (
            <p className="mt-1 text-[11px] text-neutral-400">
              Sem e-mail o aluno não recebe aviso de aula cancelada nem cobrança, e o plano não
              pode ser contratado.
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {!estrangeiro && (
            <div>
              <label className={labelCls}>CPF *</label>
              <Input
                inputMode="numeric"
                required
                value={cpf}
                onChange={(e) => setCpf(formatarCpf(e.target.value))}
                placeholder="000.000.000-00"
              />
              {erros.cpf ? (
                <p className={erroCls}>{erros.cpf}</p>
              ) : (
                <p className="mt-1 text-[11px] text-neutral-400">
                  Sem CPF o gateway não emite a cobrança.
                </p>
              )}
            </div>
          )}
          <div>
            <label className={labelCls}>Telefone</label>
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder={estrangeiro ? '+1 …' : '(21) 98765-4321'}
            />
            {erros.telefone && <p className={erroCls}>{erros.telefone}</p>}
          </div>
        </div>

        {/* Obrigatório no banco desde 20260723130000 — pedir aqui evita
            que a gravação falhe com erro de trigger na cara da equipe. */}
        <fieldset className="rounded-md border border-neutral-200 p-3">
          <legend className="px-1 text-xs font-medium text-neutral-500">
            Contato de emergência *
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Nome *</label>
              <Input
                required
                value={emergNome}
                onChange={(e) => setEmergNome(e.target.value)}
                placeholder="Quem acionar"
              />
            </div>
            <div>
              <label className={labelCls}>Telefone *</label>
              <Input
                required
                value={emergTel}
                onChange={(e) => setEmergTel(e.target.value)}
                placeholder={estrangeiro ? '+1 …' : '(21) 98765-4321'}
              />
              {erros.contato_emergencia_telefone && (
                <p className={erroCls}>{erros.contato_emergencia_telefone}</p>
              )}
            </div>
          </div>
        </fieldset>

        {erro && <p className="text-sm text-danger-600">{erro}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={criar.isPending}>
            Cadastrar e continuar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
