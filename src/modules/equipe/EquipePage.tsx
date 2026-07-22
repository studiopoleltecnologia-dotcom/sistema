import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, X } from 'lucide-react'
import { requireSupabase } from '../../lib/supabase'
import type { Enums, Tables } from '../../lib/database.types'

type FuncaoInterna = Enums<'funcao_interna'>
type MembroEquipe = Tables<'vw_equipe'>
type Convite = Tables<'equipe_convites'>

const FUNCOES: { value: FuncaoInterna; label: string; desc: string }[] = [
  { value: 'gestao', label: 'Gestão', desc: 'Vê tudo, inclusive o Financeiro' },
  { value: 'secretaria', label: 'Secretária', desc: 'Operação, sem valores financeiros' },
  { value: 'social', label: 'Social', desc: 'Só o módulo de Conteúdo' },
]
const FUNCAO_LABEL = Object.fromEntries(FUNCOES.map((f) => [f.value, f.label])) as Record<
  FuncaoInterna,
  string
>

const inputCls =
  'rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500'

function useEquipe() {
  return useQuery({
    queryKey: ['equipe'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('vw_equipe')
        .select('*')
        .order('nome')
      if (error) throw error
      return data
    },
  })
}

function useConvitesPendentes() {
  return useQuery({
    queryKey: ['equipe-convites'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('equipe_convites')
        .select('*')
        .is('usado_em', null)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function EquipePage() {
  const qc = useQueryClient()
  const equipe = useEquipe()
  const convites = useConvitesPendentes()

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [funcao, setFuncao] = useState<FuncaoInterna>('secretaria')
  const [aviso, setAviso] = useState<string | null>(null)

  function invalidar() {
    qc.invalidateQueries({ queryKey: ['equipe'] })
    qc.invalidateQueries({ queryKey: ['equipe-convites'] })
  }

  const convidar = useMutation({
    mutationFn: async () => {
      const { data, error } = await requireSupabase().rpc('convidar_equipe', {
        p_email: email.trim(),
        p_nome: nome.trim(),
        p_funcao: funcao,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (resultado) => {
      setAviso(
        resultado === 'ativado'
          ? 'Acesso ativado — a pessoa já tinha login e agora entra com a função escolhida.'
          : 'Convite criado. Peça para a pessoa criar a conta no sistema com este mesmo e-mail.',
      )
      setNome('')
      setEmail('')
      invalidar()
    },
    onError: (e) => setAviso((e as Error).message),
  })

  const mudarFuncao = useMutation({
    mutationFn: async (args: { id: string; funcao: FuncaoInterna }) => {
      const { error } = await requireSupabase().rpc('definir_funcao', {
        p_id: args.id,
        p_funcao: args.funcao,
      })
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (e) => setAviso((e as Error).message),
  })

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().rpc('remover_acesso', { p_id: id })
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (e) => setAviso((e as Error).message),
  })

  const cancelarConvite = useMutation({
    mutationFn: async (emailConvite: string) => {
      const { error } = await requireSupabase()
        .from('equipe_convites')
        .delete()
        .eq('email', emailConvite)
      if (error) throw error
    },
    onSuccess: invalidar,
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    if (!nome.trim() || !email.trim()) return
    convidar.mutate()
  }

  return (
    <div className="max-w-3xl">
      <p className="mb-5 text-sm text-neutral-500">
        Convide quem vai usar o sistema e escolha a função. O acesso ao Financeiro é
        exclusivo da gestão.
      </p>

      {/* convidar */}
      <form onSubmit={submit} className="mb-2 flex flex-wrap items-end gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome"
          required
          className={`${inputCls} w-40`}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          required
          className={`${inputCls} w-56`}
        />
        <select
          value={funcao}
          onChange={(e) => setFuncao(e.target.value as FuncaoInterna)}
          className={inputCls}
          title="Função"
        >
          {FUNCOES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={convidar.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          <UserPlus className="size-3.5" />
          Convidar
        </button>
      </form>
      <p className="mb-6 text-xs text-neutral-400">
        {FUNCOES.find((f) => f.value === funcao)?.desc}
      </p>

      {aviso && (
        <p className="mb-5 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">{aviso}</p>
      )}

      {/* com acesso */}
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500">COM ACESSO</h2>
      <ul className="mb-8 flex flex-col gap-1.5">
        {(equipe.data ?? []).map((m: MembroEquipe) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-neutral-900">{m.nome}</div>
              <div className="truncate text-xs text-neutral-400">{m.email}</div>
            </div>
            <select
              value={m.funcao ?? 'secretaria'}
              onChange={(e) =>
                m.id && mudarFuncao.mutate({ id: m.id, funcao: e.target.value as FuncaoInterna })
              }
              className="rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-brand-500"
            >
              {FUNCOES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => m.id && remover.mutate(m.id)}
              title="Remover acesso"
              className="px-1 text-neutral-300 transition hover:text-red-500"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
        {equipe.data?.length === 0 && (
          <li className="py-2 text-sm text-neutral-300">Ninguém com acesso ainda.</li>
        )}
      </ul>

      {/* convites pendentes */}
      {(convites.data ?? []).length > 0 && (
        <>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500">
            CONVITES PENDENTES
          </h2>
          <ul className="flex flex-col gap-1.5">
            {(convites.data ?? []).map((c: Convite) => (
              <li
                key={c.email}
                className="flex items-center gap-3 rounded-md border border-dashed border-neutral-200 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-neutral-700">{c.nome}</div>
                  <div className="truncate text-xs text-neutral-400">{c.email}</div>
                </div>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">
                  {FUNCAO_LABEL[c.funcao]} · aguardando cadastro
                </span>
                <button
                  onClick={() => cancelarConvite.mutate(c.email)}
                  title="Cancelar convite"
                  className="px-1 text-neutral-300 transition hover:text-red-500"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
