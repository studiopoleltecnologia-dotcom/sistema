import { useState, type FormEvent } from 'react'
import { fmtCentavos, parseCentavos } from '../../lib/dinheiro'
import {
  useContasProfessora,
  useCriarProfessora,
  useDesativarProfessora,
  useLancarPagamento,
  usePagamentoProfessoras,
  usePagamentosLancados,
  useProfessoras,
} from './hooks/useProfessoras'

const inputCls =
  'rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500'

export function ProfessorasPage() {
  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const [mes, setMes] = useState(mesAtual)

  const { data: professoras, isLoading } = useProfessoras()
  const { data: pagamentos } = usePagamentoProfessoras(mes)
  const { data: lancados } = usePagamentosLancados(mes)
  const { data: comAcesso } = useContasProfessora()
  const criar = useCriarProfessora()
  const desativar = useDesativarProfessora()
  const lancar = useLancarPagamento()

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [valor, setValor] = useState('')

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
      <div className="mb-6 flex items-center justify-end">
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className={inputCls}
        />
      </div>

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

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      <ul className="mb-8 flex max-w-2xl flex-col gap-1.5">
        {(professoras ?? []).map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm"
          >
            <span className="flex-1 font-medium text-neutral-900">{p.nome}</span>
            <span className="text-neutral-500">{p.telefone ?? '—'}</span>
            <span className="text-xs text-neutral-400">
              {fmtCentavos(p.valor_por_aluna_centavos)}/aluno
            </span>
            {comAcesso?.has(p.id) ? (
              <span className="text-xs font-medium text-green-600" title={p.email ?? ''}>
                acesso ativo
              </span>
            ) : p.email ? (
              <span className="text-xs text-neutral-400" title={p.email}>
                aguardando 1º acesso
              </span>
            ) : (
              <span className="text-xs text-amber-600" title="Sem e-mail ela não consegue criar acesso">
                sem e-mail
              </span>
            )}
            <button
              onClick={() => desativar.mutate(p.id)}
              className="px-1 text-xs text-neutral-300 transition hover:text-red-500"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500">
        PAGAMENTO DO MÊS (por aluno presente)
      </h2>
      <ul className="flex max-w-2xl flex-col gap-1.5">
        {(pagamentos ?? []).map((pg) => {
          const jaLancado = lancados?.has(`Pagamento ${pg.professora} (${mes})`) ?? false
          return (
            <li
              key={pg.professora_id}
              className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm"
            >
              <span className="flex-1 font-medium text-neutral-900">{pg.professora}</span>
              <span className="text-xs text-neutral-400">
                {pg.aulas} aula{pg.aulas === 1 ? '' : 's'} · {pg.alunas_presentes} presença
                {pg.alunas_presentes === 1 ? '' : 's'}
              </span>
              <span className="font-semibold text-neutral-900">
                {fmtCentavos(pg.total_centavos)}
              </span>
              {jaLancado ? (
                <span className="text-xs font-medium text-neutral-400">já lançado ✓</span>
              ) : (
                <button
                  onClick={() =>
                    lancar.mutate({
                      professora: pg.professora ?? '',
                      mes,
                      total_centavos: pg.total_centavos ?? 0,
                    })
                  }
                  disabled={lancar.isPending || !pg.total_centavos}
                  className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-40"
                >
                  Lançar saída
                </button>
              )}
            </li>
          )
        })}
        {(pagamentos ?? []).length === 0 && (
          <li className="py-2 text-sm text-neutral-300">Nenhuma presença no mês.</li>
        )}
      </ul>
    </div>
  )
}
