import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from './cn'

/**
 * Campo de senha com "mostrar senha".
 *
 * Existe como componente único porque os quatro formulários de senha do
 * sistema (login da equipe, login do portal, login da professora e
 * redefinição) escreviam o mesmo `<input type="password">` à mão, com a
 * mesma classe — e o olhinho teria que ser colado em cinco lugares, com
 * cinco chances de sair diferente.
 *
 * Por que o olhinho: senha digitada às cegas no celular é a causa mais
 * comum de "minha senha não funciona" que na verdade é um caractere
 * errado. Quem está na recepção com gente do lado continua podendo
 * deixar oculto — o default é oculto, o olhinho é escolha de quem digita.
 *
 * O botão fica `tabIndex={-1}` de propósito: o Tab tem que ir do campo
 * para o botão de enviar, não parar num controle visual.
 */
export function CampoSenha({
  rotulo,
  valor,
  onChange,
  autoComplete,
  minLength = 6,
  required = true,
  className,
  dica,
}: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
  /** `new-password` no cadastro, `current-password` no login. */
  autoComplete?: string
  minLength?: number
  required?: boolean
  /** Classe do `<label>`, para a margem casar com o formulário em volta. */
  className?: string
  /** Linha de apoio abaixo do campo (ex.: "mínimo de 6 caracteres"). */
  dica?: string
}) {
  const [visivel, setVisivel] = useState(false)
  const id = useId()

  return (
    <label className={cn('block', className)} htmlFor={id}>
      <span className="mb-1 block text-xs font-medium text-neutral-600">{rotulo}</span>
      <span className="relative block">
        <input
          id={id}
          type={visivel ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-neutral-300 py-2 pl-3 pr-10 text-sm outline-none focus:border-brand-500"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visivel}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-neutral-400 transition hover:text-neutral-700"
        >
          {visivel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
      {dica && <span className="mt-1 block text-[11px] text-neutral-400">{dica}</span>}
    </label>
  )
}
