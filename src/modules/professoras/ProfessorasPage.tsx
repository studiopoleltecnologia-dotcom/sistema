import { useState, type FormEvent } from 'react'
import { ShieldAlert, SlidersHorizontal } from 'lucide-react'
import { useConfirmar } from '../../components/ui/ConfirmarAcao'
import { fmtCentavos, parseCentavos } from '../../lib/dinheiro'
import { ContatoEmergenciaModal } from './components/ContatoEmergenciaModal'
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

const temEmergencia = (p: Professora) =>
  Boolean(p.contato_emergencia_nome?.trim() && p.contato_emergencia_telefone?.trim())

export function ProfessorasPage() {
  const { data: professoras, isLoading } = useProfessoras()
  const { data: comAcesso } = useContasProfessora()
  const criar = useCriarProfessora()
  const desativar = useDesativarProfessora()
  const confirmar = useConfirmar()

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [valor, setValor] = useState('')
  const [emergNome, setEmergNome] = useState('')
  const [emergTelefone, setEmergTelefone] = useState('')
  const [emergParentesco, setEmergParentesco] = useState('')
  const [editando, setEditando] = useState<Professora | null>(null)
  const [editandoContato, setEditandoContato] = useState<Professora | null>(null)

  function adicionar(e: FormEvent) {
    e.preventDefault()
    const centavos = parseCentavos(valor)
    if (!nome.trim() || !centavos) return
    // Estúdio de atividade física de risco: quem passa o dia na sala
    // precisa ter a quem acionar. O banco recusa o insert sem isto
    // (trigger), então a tela só evita a ida e volta.
    if (!emergNome.trim() || !emergTelefone.trim()) return
    criar.mutate(
      {
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        // é este e-mail que libera o acesso dela ao portal (#/prof):
        // o signup dela só vincula se casar com o que está aqui
        email: email.trim() || null,
        data_nascimento: nascimento || null,
        valor_por_aluna_centavos: centavos,
        contato_emergencia_nome: emergNome.trim(),
        contato_emergencia_telefone: emergTelefone.trim(),
        contato_emergencia_parentesco: emergParentesco.trim() || null,
      },
      {
        onSuccess: () => {
          setNome('')
          setTelefone('')
          setEmail('')
          setNascimento('')
          setValor('')
          setEmergNome('')
          setEmergTelefone('')
          setEmergParentesco('')
        },
      },
    )
  }

  const pendentes = (professoras ?? []).filter((p) => !temEmergencia(p))

  return (
    <div>
      <form onSubmit={adicionar} className="mb-5 flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
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
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <span className="pb-1.5 text-xs font-medium text-neutral-400">Emergência:</span>
          <input
            value={emergNome}
            onChange={(e) => setEmergNome(e.target.value)}
            placeholder="Quem acionar *"
            required
            className={`${inputCls} w-44`}
          />
          <input
            value={emergTelefone}
            onChange={(e) => setEmergTelefone(e.target.value)}
            placeholder="Telefone *"
            required
            className={`${inputCls} w-36`}
          />
          <input
            value={emergParentesco}
            onChange={(e) => setEmergParentesco(e.target.value)}
            placeholder="Parentesco"
            className={`${inputCls} w-36`}
          />
          <button
            type="submit"
            disabled={criar.isPending}
            className="rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            Cadastrar
          </button>
        </div>
      </form>

      <p className="mb-4 text-xs text-neutral-400">
        O modelo de pagamento começa como “por aluno”. Use <b>Remuneração</b> para ajustar pisos,
        hora/aula, valor fixo e passagem. O fechamento mensal (folha) fica no módulo Fechamento.
      </p>

      {/* Pendência visível em vez de silenciosa: quem foi cadastrada antes
          da regra não tem o dado, e ninguém descobriria isso sozinho. */}
      {pendentes.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warning-200 bg-warning-50 px-3.5 py-2.5 text-sm text-warning-700">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>
              {pendentes.length} professora{pendentes.length > 1 ? 's' : ''} sem contato de
              emergência
            </b>{' '}
            — cadastradas antes da regra. Clique em “contato” na linha de cada uma para completar.
          </span>
        </div>
      )}

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
              onClick={() => setEditandoContato(p)}
              title={
                temEmergencia(p)
                  ? `Emergência: ${p.contato_emergencia_nome} · ${p.contato_emergencia_telefone}`
                  : 'Sem contato de emergência — clique para preencher'
              }
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition ${
                temEmergencia(p)
                  ? 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                  : 'bg-warning-50 text-warning-700 hover:bg-warning-100'
              }`}
            >
              {!temEmergencia(p) && <ShieldAlert className="size-3" />}
              contato
            </button>
            <button
              onClick={() => setEditando(p)}
              title="Configurar remuneração"
              className="flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100"
            >
              <SlidersHorizontal className="size-3" />
              Remuneração
            </button>
            <button
              onClick={() =>
                confirmar.pedir({
                  titulo: `Arquivar ${p.nome}?`,
                  tom: 'arquivar',
                  descricao: (
                    <>
                      Ela sai da lista e do seletor de turmas. O histórico de aulas, presenças e
                      pagamentos continua intacto, e o fechamento dos meses anteriores não muda.
                    </>
                  ),
                  aoConfirmar: () => desativar.mutateAsync(p.id),
                })
              }
              title="Arquivar professora"
              className="px-1 text-xs text-neutral-300 transition hover:text-red-500"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {editando && <RemuneracaoModal professora={editando} onFechar={() => setEditando(null)} />}
      {editandoContato && (
        <ContatoEmergenciaModal
          professora={editandoContato}
          onFechar={() => setEditandoContato(null)}
        />
      )}
      {confirmar.dialogo}
    </div>
  )
}
