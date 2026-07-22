import { supabase } from '../../lib/supabase'
import { useProfessoraAtual } from './ProfessoraContext'
import { deISO } from './types'

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between border-b border-neutral-100 py-3 last:border-0">
      <span className="text-sm text-neutral-500">{rotulo}</span>
      <span className="text-sm text-neutral-900">{valor}</span>
    </div>
  )
}

export function PerfilPage() {
  const p = useProfessoraAtual()

  return (
    <div>
      <h1 className="mb-5 text-lg font-semibold text-neutral-900">Meu perfil</h1>

      <div className="rounded-xl border border-neutral-200 bg-white px-4">
        <Linha rotulo="Nome" valor={p.nome} />
        <Linha rotulo="Telefone" valor={p.telefone ?? '—'} />
        <Linha rotulo="E-mail" valor={p.email ?? '—'} />
        <Linha
          rotulo="Nascimento"
          valor={p.data_nascimento ? deISO(p.data_nascimento).toLocaleDateString('pt-BR') : '—'}
        />
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        Para corrigir algum dado, fale com a equipe do estúdio.
      </p>

      <button
        onClick={() => supabase?.auth.signOut()}
        className="mt-6 w-full rounded-md border border-neutral-200 bg-white py-2.5 text-sm font-medium text-neutral-600 transition hover:border-neutral-300"
      >
        Sair
      </button>
    </div>
  )
}
