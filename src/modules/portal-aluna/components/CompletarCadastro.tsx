import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../../lib/supabase'
import { useCriarContaAluna, useMeuCadastroPrevio } from '../hooks/usePortalAluna'

const inputCls =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

/**
 * Primeiro acesso do aluno.
 *
 * Duas pessoas diferentes chegam nesta tela:
 *
 * · quem a equipe já cadastrou (o caminho comum — a gestão cadastra na
 *   recepção e manda o link). O formulário vem preenchido com o que o
 *   estúdio já sabe, e ele só confere;
 * · quem se cadastrou sozinho, e preenche do zero.
 *
 * O que separa os dois é o e-mail, e por isso ele **não é editável aqui**:
 * é o e-mail da conta que o Auth confirmou, e é por ele que o banco acha
 * o cadastro que estava esperando. Deixá-lo editável era o que fazia a
 * mesma pessoa nascer duas vezes — digitava outro e-mail, e o cadastro
 * que a equipe preencheu ficava órfão, com o plano e o histórico dentro.
 */
export function CompletarCadastro() {
  const criar = useCriarContaAluna()
  const { data: previo, isLoading: carregandoPrevio } = useMeuCadastroPrevio()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [emergNome, setEmergNome] = useState('')
  const [emergTelefone, setEmergTelefone] = useState('')
  const [aceite, setAceite] = useState(false)

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email)
    })
  }, [])

  // Preenche o que a equipe já cadastrou, sem sobrescrever o que ele
  // eventualmente já digitou enquanto a consulta voltava.
  useEffect(() => {
    if (!previo) return
    setNome((v) => v || previo.nome || '')
    setTelefone((v) => v || previo.telefone || '')
    setNascimento((v) => v || previo.data_nascimento || '')
    setEmergNome((v) => v || previo.contato_emergencia_nome || '')
    setEmergTelefone((v) => v || previo.contato_emergencia_telefone || '')
  }, [previo])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!aceite) return
    criar.mutate({
      nome: nome.trim(),
      telefone: telefone.trim(),
      email: email.trim(),
      dataNascimento: nascimento || null,
      aceiteLgpd: aceite,
      emergenciaNome: emergNome.trim(),
      emergenciaTelefone: emergTelefone.trim(),
    })
  }

  const primeiroNome = previo?.nome?.trim().split(/\s+/)[0]

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8"
      >
        {previo ? (
          <>
            <h1 className="mb-1 text-lg font-semibold text-neutral-900">
              {primeiroNome ? `Oi, ${primeiroNome}` : 'Achamos seu cadastro'}
            </h1>
            <p className="mb-6 text-sm text-neutral-500">
              Seu cadastro no estúdio já existe. Confira se está tudo certo e conclua.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-lg font-semibold text-neutral-900">Quase lá</h1>
            <p className="mb-6 text-sm text-neutral-500">
              Só mais alguns dados para liberar sua conta.
            </p>
          </>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Nome</span>
          <input
            id="cadastro-nome"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={inputCls}
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Telefone</span>
          <input
            id="cadastro-telefone"
            required
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(11) 91234-5678"
            className={inputCls}
          />
        </label>

        <div className="mb-4">
          <span className="mb-1 block text-xs font-medium text-neutral-600">E-mail</span>
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            {email || '…'}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            É o e-mail da sua conta. Para trocar, fale com o estúdio.
          </p>
        </div>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Data de nascimento
          </span>
          <input
            id="cadastro-nascimento"
            type="date"
            required
            value={nascimento}
            onChange={(e) => setNascimento(e.target.value)}
            className={inputCls}
          />
        </label>

        <div className="mb-4 border-t border-neutral-100 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Contato de emergência
          </p>
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Nome</span>
            <input
              id="cadastro-emergencia-nome"
              required
              value={emergNome}
              onChange={(e) => setEmergNome(e.target.value)}
              placeholder="Quem acionar se precisar"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Telefone</span>
            <input
              id="cadastro-emergencia-telefone"
              required
              value={emergTelefone}
              onChange={(e) => setEmergTelefone(e.target.value)}
              placeholder="(11) 91234-5678"
              className={inputCls}
            />
          </label>
        </div>

        <label className="mb-6 flex items-start gap-2 text-sm text-neutral-600">
          <input
            id="cadastro-aceite"
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-0.5 accent-brand-600"
          />
          Li e aceito os termos de uso e a política de privacidade.
        </label>

        {criar.isError && (
          <p className="mb-4 text-sm text-red-600">
            {(criar.error as { message?: string })?.message ??
              'Não foi possível criar sua conta. Tente novamente.'}
          </p>
        )}

        <button
          type="submit"
          disabled={!aceite || criar.isPending || carregandoPrevio}
          className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {criar.isPending ? 'Criando…' : previo ? 'Confirmar e entrar' : 'Concluir cadastro'}
        </button>
      </form>
    </div>
  )
}
