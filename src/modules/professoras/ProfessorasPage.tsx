import { useState, type FormEvent } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { fmtCentavos, parseCentavos } from '../../lib/dinheiro'
import { RemuneracaoModal } from './components/RemuneracaoModal'
import {
  useContasProfessora,
  useCriarProfessora,
  useDesativarProfessora,
  useProfessoras,
  type Professora,
} from './hooks/useProfessoras'

const inputCls =
  'rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500'

function resumoModelo(p: Professora): string {
  if (p.modelo === 'fixo') return `fixo ${fmtCentavos(p.valor_fixo_mes_centavos)}/mês`
  if (p.modelo === 'por_hora') return `${fmtCentavos(p.valor_hora_centavos)}/h`
  return `${fmtCentavos(p.valor_por_aluna_centavos)}/aluno`
}

export function ProfessorasPage() {
  const { data: professoras, isLoading } = useProfessoras()
  const { data: comAcesso } = useContasProfessora()
  const criar = useCriarProfessora()
  const desativar = useDesativarProfessora()

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [valor, setValor] = useState('')
  const [editando, setEditando] = useState<Professora | null>(null)

  function adicionar(e: FormEvent) {
    e.preventDefault()
    const centavos = parseCentavos(valor)
    if (!nome.trim() || !centavos) return
    criar.mutate(
      {
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        // é este e-mail que libera o acesso dela ao portal (#/prof):
        // o signup dela só vincula se casar com o que está aqui
        email: email.trim() || null,
        data_nascimento: nascimento || null,
        valor_por_aluna_centavos: centavos,
      },
      {
        onSuccess: () => {
          setNome('')
          setTelefone('')
          setEmail('')
          setNascimento('')
          setValor('')
        },
      },
    )
  }

  return (
    <div>
      <form onSubmit={adicionar} className="mb-5 flex flex-wrap items-end gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome"
          required
          className={`${inputCls} w-44`}
        />
        <input
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="Telefone"
          className={`${inputCls} w-36`}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail (libera o portal)"
          className={`${inputCls} w-52`}
        />
        <input
          type="date"
          value={nascimento}
          onChange={(e) => setNascimento(e.target.value)}
          title="Data de nascimento"
          className={`${inputCls} w-36`}
        />
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="R$ por aluno"
          required
          className={`${inputCls} w-28`}
        />
        <button
          type="submit"
          disabled={criar.isPending}
          className="rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          Cadastrar
        </button>
      </form>

      <p className="mb-4 text-xs text-neutral-400">
        O modelo de pagamento começa como “por aluno”. Use <b>Remuneração</b> para ajustar pisos,
        hora/aula, valor fixo e passagem. O fechamento mensal (folha) fica no módulo Fechamento.
      </p>

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      <ul className="flex max-w-2xl flex-col gap-1.5">
        {(professoras ?? []).map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm"
          >
            <span className="flex-1 font-medium text-neutral-900">{p.nome}</span>
            <span className="text-neutral-500">{p.telefone ?? '—'}</span>
            <span className="text-xs text-neutral-400">{resumoModelo(p)}</span>
            {comAcesso?.has(p.id) ? (
              <span className="text-xs font-medium text-green-600" title={p.email ?? ''}>
                acesso ativo
              </span>
            ) : p.email ? (
              <span className="text-xs text-neutral-400" title={p.email}>
                aguardando 1º acesso
              </span>
            ) : (
              <span
                className="text-xs text-amber-600"
                title="Sem e-mail ela não consegue criar acesso"
              >
                sem e-mail
              </span>
            )}
            <button
              onClick={() => setEditando(p)}
              title="Configurar remuneração"
              className="flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100"
            >
              <SlidersHorizontal className="size-3" />
              Remuneração
            </button>
            <button
              onClick={() => desativar.mutate(p.id)}
              className="px-1 text-xs text-neutral-300 transition hover:text-red-500"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {editando && (
        <RemuneracaoModal professora={editando} onFechar={() => setEditando(null)} />
      )}
    </div>
  )
}
