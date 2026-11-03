import { useEffect, useState, type FormEvent } from 'react'
import {
  formatarCpf,
  temErros,
  useConfigCadastro,
  validarCadastro,
  type ErrosCadastro,
} from '../../lib/cadastro'
import { supabase } from '../../lib/supabase'
import { Link } from 'react-router-dom'
import { Camera, HeartPulse } from 'lucide-react'
import { Cabecalho } from './components/Basicos'
import { useAtualizarMeuCliente, useMeuCliente } from './hooks/usePortalAluna'
import { useAutorizacaoImagem, useSituacaoParq } from './hooks/useDocumentos'
import { cn } from '../../components/ui/cn'

const inputCls =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500'
const erroCls = 'mt-1 text-xs text-red-600'

/**
 * Atalho para o PAR-Q, com a situação à vista.
 *
 * Fica no Perfil e não na barra de baixo: é um passo que se faz uma vez
 * por ano, não um destino diário. Mas precisa estar visível, porque é ele
 * que destrava o agendamento.
 */
function Saude() {
  const { data: parq } = useSituacaoParq()
  const pendente = !parq || parq.situacao === 'nao_preenchido' || !parq.liberado

  return (
    <Link
      to="../saude"
      className={cn(
        'mt-4 flex items-center gap-3 rounded-lg border p-4 transition',
        pendente
          ? 'border-warning-200 bg-warning-50 hover:bg-warning-100/60'
          : 'border-neutral-200 bg-white hover:bg-neutral-50',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          pendente ? 'bg-warning-100 text-warning-700' : 'bg-brand-50 text-brand-600',
        )}
      >
        <HeartPulse className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-sm font-semibold',
            pendente ? 'text-warning-800' : 'text-neutral-900',
          )}
        >
          Saúde — PAR-Q
        </span>
        <span className={cn('block text-xs', pendente ? 'text-warning-800' : 'text-neutral-500')}>
          {!parq || parq.situacao === 'nao_preenchido'
            ? 'Preencha antes da sua primeira aula'
            : parq.situacao === 'expirado'
              ? 'Vencido — precisa renovar'
              : parq.liberado
                ? 'Em dia'
                : 'Aguardando atestado médico'}
        </span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-brand-700">Abrir</span>
    </Link>
  )
}

/**
 * Uso de imagem — preferência separada, revogável.
 *
 * Fora do aceite do contrato de propósito (regulamento 11.4):
 * consentimento embutido em aceite obrigatório não é consentimento livre,
 * e o regulamento promete que dá para mudar "a qualquer momento, sem
 * precisar justificar". Recusar não interfere na contratação, e a tela
 * diz isso.
 *
 * `null` (nunca respondeu) é diferente de "não autorizo": enquanto não
 * houver resposta explícita, a equipe trata como NÃO autorizado.
 */
function Imagem({ autoriza }: { autoriza: boolean | null }) {
  const definir = useAutorizacaoImagem()
  const atual = definir.isPending ? definir.variables : autoriza

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <Camera className="size-4 text-neutral-400" />
        Uso da minha imagem
      </p>
      <p className="mb-3 text-xs leading-relaxed text-neutral-500">
        Autorizo o uso da minha imagem em fotos e vídeos produzidos pelo Studio para
        divulgação. Você pode mudar isso quando quiser, sem precisar justificar, e a sua
        escolha <strong>não interfere</strong> na contratação do plano.
      </p>

      <div className="flex gap-2">
        {[
          { v: true, rotulo: 'Autorizo' },
          { v: false, rotulo: 'Não autorizo' },
        ].map(({ v, rotulo }) => (
          <button
            key={rotulo}
            type="button"
            disabled={definir.isPending}
            onClick={() => definir.mutate(v)}
            aria-pressed={atual === v}
            className={cn(
              'flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-60',
              atual === v
                ? 'border-brand-500 bg-brand-600 text-white'
                : 'border-neutral-200 text-neutral-600 hover:border-neutral-300',
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {autoriza === null && !definir.isPending && (
        <p className="mt-2 text-xs text-neutral-400">
          Você ainda não respondeu. Até responder, tratamos como não autorizado.
        </p>
      )}
      {definir.isError && (
        <p className="mt-2 text-xs text-red-600">Não foi possível salvar. Tente novamente.</p>
      )}
    </div>
  )
}

export function PerfilPage() {
  const { data: cliente } = useMeuCliente()
  const atualizar = useAtualizarMeuCliente()
  const cfg = useConfigCadastro()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpf] = useState('')
  const [emergNome, setEmergNome] = useState('')
  const [emergTelefone, setEmergTelefone] = useState('')
  const [erros, setErros] = useState<ErrosCadastro>({})

  useEffect(() => {
    if (cliente) {
      setNome(cliente.nome ?? '')
      setTelefone(cliente.telefone ?? '')
      setCpf(cliente.cpf ? formatarCpf(cliente.cpf) : '')
      setEmergNome(cliente.contato_emergencia_nome ?? '')
      setEmergTelefone(cliente.contato_emergencia_telefone ?? '')
    }
  }, [cliente])

  // O aluno preenche o CPF quando está vazio; trocar passa pelo estúdio
  // (é o documento da cobrança — o banco também recusa).
  const cpfTravado = !!cliente?.cpf

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!cliente) return
    const patch = {
      nome: nome.trim(),
      telefone: telefone.trim(),
      contato_emergencia_nome: emergNome.trim() || null,
      contato_emergencia_telefone: emergTelefone.trim() || null,
      ...(cpfTravado ? {} : { cpf: cpf.trim() || null }),
    }
    // Só o que mudou é validado — igual ao banco. Cadastro antigo com
    // telefone sem DDD continua conseguindo trocar o contato de emergência.
    const encontrados = validarCadastro({ ...cliente, ...patch }, cfg, { original: cliente })
    setErros(encontrados)
    if (temErros(encontrados)) return
    atualizar.mutate([cliente.id, patch])
  }

  return (
    <div className="lg:max-w-xl">
      <Cabecalho titulo="Meu perfil" subtitulo={cliente?.email ?? undefined} />

      <form onSubmit={handleSubmit} className="rounded-lg border border-neutral-200 bg-white p-4">
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Nome completo</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
          {erros.nome && <p className={erroCls}>Informe seu nome e sobrenome.</p>}
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Telefone</span>
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className={inputCls}
          />
          {erros.telefone && (
            <p className={erroCls}>Telefone inválido — informe com DDD, ex.: (21) 98765-4321.</p>
          )}
        </label>

        {!cliente?.estrangeiro && (
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">CPF</span>
            <input
              inputMode="numeric"
              value={cpf}
              disabled={cpfTravado}
              onChange={(e) => setCpf(formatarCpf(e.target.value))}
              placeholder="000.000.000-00"
              className={`${inputCls} disabled:bg-neutral-50 disabled:text-neutral-500`}
            />
            {erros.cpf ? (
              <p className={erroCls}>{erros.cpf}</p>
            ) : (
              <p className="mt-1 text-xs text-neutral-400">
                {cpfTravado
                  ? 'Para corrigir o CPF, fale com o estúdio.'
                  : 'Usado para emitir a cobrança do plano.'}
              </p>
            )}
          </label>
        )}

        <div className="mb-4 mt-1 border-t border-neutral-100 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Contato de emergência
          </p>
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Nome</span>
            <input
              value={emergNome}
              onChange={(e) => setEmergNome(e.target.value)}
              placeholder="Quem acionar se precisar"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Telefone</span>
            <input
              value={emergTelefone}
              onChange={(e) => setEmergTelefone(e.target.value)}
              placeholder="(11) 91234-5678"
              className={inputCls}
            />
            {erros.contato_emergencia_telefone && (
              <p className={erroCls}>Telefone inválido — informe com DDD, ex.: (21) 98765-4321.</p>
            )}
          </label>
        </div>

        {atualizar.isSuccess && (
          <p className="mb-3 text-sm text-brand-700">Dados atualizados.</p>
        )}
        {/* Sem isto, uma recusa do banco parecia um clique que não pegou. */}
        {atualizar.isError && (
          <p className="mb-3 text-sm text-red-600">
            {(atualizar.error as { message?: string })?.message ??
              'Não foi possível salvar. Tente novamente.'}
          </p>
        )}

        <button
          type="submit"
          disabled={atualizar.isPending}
          className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          Salvar alterações
        </button>
      </form>

      <Saude />
      <Imagem autoriza={cliente?.autoriza_imagem ?? null} />

      <button
        onClick={() => supabase?.auth.signOut()}
        className="mt-4 w-full rounded-md border border-neutral-200 py-2.5 text-sm text-neutral-500 hover:bg-neutral-50 lg:hidden"
      >
        Sair
      </button>
    </div>
  )
}
