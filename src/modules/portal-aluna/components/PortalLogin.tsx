import { useState, type FormEvent } from 'react'
import { MailCheck, MailWarning, PencilLine } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { CampoSenha } from '../../../components/ui/CampoSenha'

const inputCls =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

/**
 * Para onde os links de e-mail (confirmação e senha) devolvem o aluno:
 * o próprio portal em que ele está — `/agendamentos/` ou o domínio do
 * aluno.
 *
 * Sem isto no `signUp`, o Supabase manda o link de confirmação para a
 * Site URL do projeto, que é a raiz do ERP. O aluno recém-confirmado caía
 * na tela da equipe e lia "peça para a gestão liberar o seu e-mail" —
 * porque o vínculo de aluno só nasce depois, quando ele completa o
 * cadastro aqui dentro (27/09/2026).
 *
 * Só vale se o endereço estiver em Authentication → URL Configuration →
 * Redirect URLs. Se não estiver, o Supabase ignora e volta para a raiz —
 * por isso existe também a rede de segurança em `SemFuncaoInterna`.
 */
const urlDoPortal = () => window.location.origin + window.location.pathname

export function PortalLogin() {
  const [modo, setModo] = useState<'entrar' | 'cadastro' | 'recuperar'>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  /** Só no cadastro: senha digitada uma segunda vez. */
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  /** E-mail que está esperando confirmação — mostra o aviso de spam e o reenvio. */
  const [aguardandoConfirmacao, setAguardandoConfirmacao] = useState<string | null>(null)
  const [reenvio, setReenvio] = useState<'idle' | 'enviando' | 'enviado' | 'erro'>('idle')

  async function reenviarConfirmacao() {
    if (!supabase || !aguardandoConfirmacao) return
    setReenvio('enviando')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: aguardandoConfirmacao,
      options: { emailRedirectTo: urlDoPortal() },
    })
    setReenvio(error ? 'erro' : 'enviado')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setSubmitting(true)
    setError(null)
    setAviso(null)

    if (modo === 'recuperar') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: urlDoPortal(),
      })
      if (error) setError(error.message)
      else setAviso('Se esse e-mail tiver conta, enviamos um link para redefinir a senha. Confira também o spam.')
    } else if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        const naoConfirmado = error.message === 'Email not confirmed'
        const amigavel = naoConfirmado
          ? 'Seu e-mail ainda não foi confirmado.'
          : 'E-mail ou senha inválidos.'
        // Em DEV, o motivo real também aparece. "Inválidos" engolia limite de
        // tentativas, projeto Supabase errado e falha de rede na mesma frase —
        // e aí não dá para saber se o problema é a senha ou o ambiente. O aluno
        // em produção continua vendo só a frase amigável.
        setError(import.meta.env.DEV ? `${amigavel} [${error.message}]` : amigavel)
        if (naoConfirmado) {
          setAguardandoConfirmacao(email)
          setReenvio('idle')
        }
      }
    } else {
      if (password !== confirmarSenha) {
        setError('As duas senhas não são iguais.')
        setSubmitting(false)
        return
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { papel: 'cliente' }, emailRedirectTo: urlDoPortal() },
      })
      if (error) {
        setError(error.message === 'User already registered' ? 'Este e-mail já tem conta.' : error.message)
      } else if (!data.session) {
        setAguardandoConfirmacao(email)
        setReenvio('idle')
        setModo('entrar')
      }
    }

    setSubmitting(false)
  }

  /*
    Confirmar o e-mail é um PASSO da jornada, não um aviso.
    Antes era um bloco amarelo acima dos campos do login: quem acabou de
    se cadastrar via o formulário de novo e concluía que o cadastro não
    tinha funcionado, ou tentava entrar e levava "e-mail não confirmado"
    de novo. Agora a tela inteira é sobre isso, com os três caminhos que
    a pessoa pode precisar: reenviar, corrigir o endereço e voltar.
  */
  if (aguardandoConfirmacao) {
    return (
      <ConfirmeSeuEmail
        email={aguardandoConfirmacao}
        reenvio={reenvio}
        onReenviar={reenviarConfirmacao}
        onTrocarEmail={() => {
          setAguardandoConfirmacao(null)
          setPassword('')
          setConfirmarSenha('')
          setError(null)
          setModo('cadastro')
        }}
        onVoltarAoLogin={() => {
          setAguardandoConfirmacao(null)
          setError(null)
          setModo('entrar')
        }}
      />
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8"
      >
        <h1 className="mb-1 text-lg font-semibold text-neutral-900">Studio Pole L</h1>
        <p className="mb-6 text-sm text-neutral-500">
          {modo === 'entrar'
            ? 'Entre para agendar suas aulas'
            : modo === 'cadastro'
              ? 'Crie sua conta de aluno'
              : 'Recuperar senha'}
        </p>

        {/* Só em DEV: diz em qual Supabase esta tela está batendo. São dois
            projetos com a mesma cara, e conta que existe em um não existe no
            outro — sem isso, "e-mail ou senha inválidos" pode ser só a aba
            errada aberta. Some no build de produção. */}
        {import.meta.env.DEV && (
          <p className="mb-6 -mt-4 rounded-md bg-warning-50 px-2.5 py-1.5 text-[11px] text-warning-800">
            Ambiente de desenvolvimento ·{' '}
            {String(import.meta.env.VITE_SUPABASE_URL).replace('https://', '').split('.')[0]}
          </p>
        )}


        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">E-mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </label>

        {modo !== 'recuperar' && (
          <CampoSenha
            className={modo === 'cadastro' ? 'mb-4' : 'mb-6'}
            rotulo="Senha"
            valor={password}
            onChange={setPassword}
            autoComplete={modo === 'cadastro' ? 'new-password' : 'current-password'}
            dica={modo === 'cadastro' ? 'Mínimo de 6 caracteres.' : undefined}
          />
        )}

        {modo === 'cadastro' && (
          <CampoSenha
            className="mb-6"
            rotulo="Repita a senha"
            valor={confirmarSenha}
            onChange={setConfirmarSenha}
            autoComplete="new-password"
          />
        )}

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {aviso && <p className="mb-4 text-sm text-brand-700">{aviso}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting
            ? 'Aguarde…'
            : modo === 'entrar'
              ? 'Entrar'
              : modo === 'cadastro'
                ? 'Criar conta'
                : 'Enviar link de recuperação'}
        </button>

        {modo === 'entrar' && (
          <button
            type="button"
            onClick={() => {
              setModo('recuperar')
              setError(null)
              setAviso(null)
            }}
            className="mt-3 w-full text-center text-xs text-neutral-400 hover:text-brand-700"
          >
            Esqueci minha senha
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setModo(modo === 'recuperar' ? 'entrar' : modo === 'entrar' ? 'cadastro' : 'entrar')
            setError(null)
            setAviso(null)
          }}
          className="mt-4 w-full text-center text-sm text-neutral-500 hover:text-brand-700"
        >
          {modo === 'entrar'
            ? 'Ainda não tem conta? Criar conta'
            : modo === 'cadastro'
              ? 'Já tem conta? Entrar'
              : 'Voltar para o login'}
        </button>
      </form>
    </div>
  )
}

/**
 * "Enviamos um e-mail de confirmação" como tela, não como aviso.
 *
 * Os três botões são os três motivos reais de alguém travar aqui:
 *
 * · **não chegou** → reenviar (e o aviso de spam vem antes, porque
 *   Hotmail e Outlook filtram mesmo com DMARC publicado);
 * · **errei o e-mail** → voltar ao cadastro com o campo livre. Isso cria
 *   um segundo login no Supabase Auth, e é aceitável: o endereço errado
 *   nunca é confirmado, então nunca vira acesso a nada;
 * · **já confirmei** → voltar ao login, que é o caminho de quem abriu o
 *   link no celular e voltou para o computador.
 */
function ConfirmeSeuEmail({
  email,
  reenvio,
  onReenviar,
  onTrocarEmail,
  onVoltarAoLogin,
}: {
  email: string
  reenvio: 'idle' | 'enviando' | 'enviado' | 'erro'
  onReenviar: () => void
  onTrocarEmail: () => void
  onVoltarAoLogin: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <MailCheck className="size-6" />
        </span>

        <h1 className="mb-2 text-lg font-semibold text-neutral-900">Confirme seu e-mail</h1>
        <p className="mb-5 text-sm leading-relaxed text-neutral-600">
          Enviamos um link de confirmação para
          <br />
          <strong className="break-all text-neutral-900">{email}</strong>
        </p>

        <div className="mb-5 flex gap-2.5 rounded-lg border border-warning-200 bg-warning-50 p-3 text-left text-xs leading-relaxed text-warning-800">
          <MailWarning className="mt-px size-4 shrink-0" />
          <span>
            <strong>Não achou na caixa de entrada?</strong> Procure no spam ou lixo eletrônico e
            marque como “não é spam” — assim os próximos avisos do estúdio chegam certo.
          </span>
        </div>

        <button
          type="button"
          onClick={onReenviar}
          disabled={reenvio === 'enviando' || reenvio === 'enviado'}
          className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {reenvio === 'enviando'
            ? 'Reenviando…'
            : reenvio === 'enviado'
              ? 'E-mail reenviado'
              : 'Reenviar e-mail de confirmação'}
        </button>

        {reenvio === 'enviado' && (
          <p className="mt-2 text-xs text-neutral-500">
            Pode levar alguns minutos para chegar.
          </p>
        )}
        {reenvio === 'erro' && (
          <p className="mt-2 text-xs text-danger-600">
            Não foi possível reenviar agora. Espere um minuto e tente de novo.
          </p>
        )}

        <button
          type="button"
          onClick={onTrocarEmail}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-300 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          <PencilLine className="size-3.5" />
          Digitei o e-mail errado
        </button>

        <button
          type="button"
          onClick={onVoltarAoLogin}
          className="mt-4 w-full text-center text-sm text-neutral-500 hover:text-brand-700"
        >
          Já confirmei — quero entrar
        </button>
      </div>
    </div>
  )
}
