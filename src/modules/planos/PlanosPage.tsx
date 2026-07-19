import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '../../lib/supabase'
import { fmtCentavos, parseCentavos } from '../../lib/dinheiro'
import { fmtData } from '../../lib/datas'
import { useClientes } from '../clientes/hooks/useClientes'
import type { Enums, Tables } from '../../lib/database.types'

type Plano = Tables<'planos'>
type PlanoTipo = Enums<'plano_tipo'>
type SaldoCredito = Tables<'vw_saldo_creditos'>

const inputCls =
  'rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500'

function usePlanos() {
  return useQuery({
    queryKey: ['planos'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('planos')
        .select('*')
        .eq('ativo', true)
        .order('preco_centavos')
      if (error) throw error
      return data
    },
  })
}

function useSaldos() {
  return useQuery({
    queryKey: ['saldo-creditos'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('vw_saldo_creditos')
        .select('*')
        .eq('status', 'ativa')
        .order('data_fim')
      if (error) throw error
      return data
    },
  })
}

export function PlanosPage() {
  const qc = useQueryClient()
  const { data: planos, isLoading } = usePlanos()
  const { data: saldos } = useSaldos()
  const { data: clientes } = useClientes()

  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<PlanoTipo>('semanal')
  const [quantidade, setQuantidade] = useState('2')
  const [vigencia, setVigencia] = useState('30')
  const [preco, setPreco] = useState('')

  const [matriculaCliente, setMatriculaCliente] = useState('')
  const [matriculaPlano, setMatriculaPlano] = useState('')

  const criarPlano = useMutation({
    mutationFn: async () => {
      const precoCentavos = parseCentavos(preco)
      if (!nome.trim() || !precoCentavos) throw new Error('dados incompletos')
      const { error } = await requireSupabase().from('planos').insert({
        nome: nome.trim(),
        tipo,
        quantidade: Number(quantidade),
        vigencia_dias: Number(vigencia),
        preco_centavos: precoCentavos,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planos'] })
      setNome('')
      setPreco('')
    },
  })

  const desativarPlano = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase()
        .from('planos')
        .update({ ativo: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planos'] }),
  })

  const matricular = useMutation({
    mutationFn: async () => {
      const { error } = await requireSupabase().rpc('matricular', {
        p_cliente: matriculaCliente,
        p_plano: matriculaPlano,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saldo-creditos'] })
      qc.invalidateQueries({ queryKey: ['entradas'] })
      setMatriculaCliente('')
      setMatriculaPlano('')
    },
  })

  const reposicao = useMutation({
    mutationFn: async (matriculaId: string) => {
      const sb = requireSupabase()
      const { data: auth } = await sb.auth.getUser()
      const { error } = await sb.from('creditos_eventos').insert({
        matricula_id: matriculaId,
        delta: 1,
        motivo: 'reposicao',
        criado_por: auth.user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saldo-creditos'] }),
  })

  function submitPlano(e: FormEvent) {
    e.preventDefault()
    criarPlano.mutate()
  }

  const nomeCliente = (id: string | null) =>
    (clientes ?? []).find((c) => c.id === id)?.nome ?? '—'
  const nomePlano = (id: string | null) =>
    (planos ?? []).find((p) => p.id === id)?.nome ?? '—'
  const descricaoPlano = (p: Plano) =>
    p.tipo === 'creditos'
      ? `${p.quantidade} créditos · ${p.vigencia_dias} dias`
      : `${p.quantidade}x/semana · ${p.vigencia_dias} dias`

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-neutral-900">Planos</h1>

      <form onSubmit={submitPlano} className="mb-5 flex flex-wrap items-end gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do plano"
          required
          className={`${inputCls} w-44`}
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as PlanoTipo)}
          className={inputCls}
        >
          <option value="semanal">Aulas por semana</option>
          <option value="creditos">Pacote de créditos</option>
        </select>
        <input
          type="number"
          min={1}
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          title={tipo === 'creditos' ? 'Total de créditos' : 'Aulas por semana'}
          className={`${inputCls} w-16`}
        />
        <input
          type="number"
          min={1}
          value={vigencia}
          onChange={(e) => setVigencia(e.target.value)}
          title="Vigência (dias)"
          className={`${inputCls} w-20`}
        />
        <input
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          placeholder="R$ preço"
          required
          className={`${inputCls} w-24`}
        />
        <button
          type="submit"
          disabled={criarPlano.isPending}
          className="rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          Criar plano
        </button>
      </form>

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}
      <ul className="mb-8 flex max-w-2xl flex-col gap-1.5">
        {(planos ?? []).map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm"
          >
            <span className="flex-1 font-medium text-neutral-900">{p.nome}</span>
            <span className="text-xs text-neutral-400">{descricaoPlano(p)}</span>
            <span className="font-semibold text-neutral-900">
              {fmtCentavos(p.preco_centavos)}
            </span>
            <button
              onClick={() => desativarPlano.mutate(p.id)}
              className="px-1 text-xs text-neutral-300 transition hover:text-red-500"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500">
        MATRÍCULAS ATIVAS
      </h2>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <select
          value={matriculaCliente}
          onChange={(e) => setMatriculaCliente(e.target.value)}
          className={inputCls}
        >
          <option value="">Cliente…</option>
          {(clientes ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select
          value={matriculaPlano}
          onChange={(e) => setMatriculaPlano(e.target.value)}
          className={inputCls}
        >
          <option value="">Plano…</option>
          {(planos ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} ({fmtCentavos(p.preco_centavos)})
            </option>
          ))}
        </select>
        <button
          onClick={() => matricular.mutate()}
          disabled={!matriculaCliente || !matriculaPlano || matricular.isPending}
          className="rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          Matricular
        </button>
        <span className="text-[11px] text-neutral-400">
          Gera a cobrança automaticamente no Financeiro (a receber).
        </span>
      </div>

      <ul className="flex max-w-2xl flex-col gap-1.5">
        {((saldos ?? []) as SaldoCredito[]).map((s) => (
          <li
            key={s.matricula_id}
            className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm"
          >
            <span className="flex-1 font-medium text-neutral-900">
              {nomeCliente(s.cliente_id)}
            </span>
            <span className="text-xs text-neutral-400">{nomePlano(s.plano_id)}</span>
            <span className="text-xs text-neutral-400">até {fmtData(s.data_fim)}</span>
            <span
              className={`font-semibold ${
                (s.saldo ?? 0) > 0 ? 'text-neutral-900' : 'text-red-600'
              }`}
            >
              {s.saldo} crédito{s.saldo === 1 ? '' : 's'}
            </span>
            <button
              onClick={() => s.matricula_id && reposicao.mutate(s.matricula_id)}
              disabled={reposicao.isPending}
              title="Conceder 1 crédito de reposição (limite configurável na Agenda → Config)"
              className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-40"
            >
              + reposição
            </button>
          </li>
        ))}
        {(saldos ?? []).length === 0 && (
          <li className="py-2 text-sm text-neutral-300">Nenhuma matrícula ativa.</li>
        )}
      </ul>
    </div>
  )
}
