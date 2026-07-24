import { useState, type FormEvent } from 'react'
import { flags } from '../../../lib/flags'
import {
  ESTAGIOS,
  ORIGENS,
  type Cliente,
  type ClienteInsert,
  type Socia,
} from '../types'

const inputCls =
  'w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500'
const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

/** Formulário de criar/editar cliente (modal). Só nome é obrigatório. */
export function ClienteForm({
  cliente,
  socias,
  onSalvar,
  onFechar,
  salvando,
}: {
  cliente: Cliente | null
  socias: Socia[]
  onSalvar: (dados: ClienteInsert) => void
  onFechar: () => void
  salvando: boolean
}) {
  const [form, setForm] = useState<ClienteInsert>({
    nome: cliente?.nome ?? '',
    telefone: cliente?.telefone ?? null,
    instagram: cliente?.instagram ?? null,
    origem: cliente?.origem ?? 'whatsapp',
    estagio: cliente?.estagio ?? 'lead',
    modalidade: cliente?.modalidade ?? null,
    responsavel_id: cliente?.responsavel_id ?? null,
    primeiro_contato: cliente?.primeiro_contato ?? new Date().toISOString().slice(0, 10),
    data_nascimento: cliente?.data_nascimento ?? null,
    gympass_id: cliente?.gympass_id ?? null,
    vip: cliente?.vip ?? false,
    observacoes: cliente?.observacoes ?? null,
    contato_emergencia_nome: cliente?.contato_emergencia_nome ?? null,
    contato_emergencia_telefone: cliente?.contato_emergencia_telefone ?? null,
  })

  const set = <K extends keyof ClienteInsert>(campo: K, valor: ClienteInsert[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }))

  // texto vazio vira null no banco
  const texto = (v: string) => (v.trim() === '' ? null : v)

  const origens = ORIGENS.filter((o) => o.value !== 'classpass' || flags.classpass)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) return
    // Contato de emergência é obrigatório (estúdio de atividade física).
    if (!form.contato_emergencia_nome?.trim() || !form.contato_emergencia_telefone?.trim()) return
    onSalvar(form)
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/20 p-4"
      onClick={onFechar}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
      >
        <h2 className="mb-4 text-base font-semibold text-neutral-900">
          {cliente ? 'Editar aluno' : 'Novo aluno'}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Nome *</label>
            <input
              autoFocus
              required
              className={inputCls}
              value={form.nome}
              onChange={(e) => set('nome', e.target.value)}
            />
          </div>

          <div>
            <label className={labelCls}>Telefone</label>
            <input
              className={inputCls}
              value={form.telefone ?? ''}
              onChange={(e) => set('telefone', texto(e.target.value))}
              placeholder="(21) 9…"
            />
          </div>
          <div>
            <label className={labelCls}>Instagram</label>
            <input
              className={inputCls}
              value={form.instagram ?? ''}
              onChange={(e) => set('instagram', texto(e.target.value))}
              placeholder="@"
            />
          </div>

          <div>
            <label className={labelCls}>Origem</label>
            <select
              className={inputCls}
              value={form.origem ?? 'whatsapp'}
              onChange={(e) => set('origem', e.target.value as ClienteInsert['origem'])}
            >
              {origens.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Estágio</label>
            <select
              className={inputCls}
              value={form.estagio ?? 'lead'}
              onChange={(e) => set('estagio', e.target.value as ClienteInsert['estagio'])}
            >
              {ESTAGIOS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {form.origem === 'wellhub' && (
            <div className="col-span-2">
              <label className={labelCls}>ID Gympass/Wellhub</label>
              <input
                className={inputCls}
                value={form.gympass_id ?? ''}
                onChange={(e) => set('gympass_id', texto(e.target.value))}
                placeholder="para casar com o check-in do app (Fase 4)"
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Modalidade</label>
            <input
              className={inputCls}
              value={form.modalidade ?? ''}
              onChange={(e) => set('modalidade', texto(e.target.value))}
              placeholder="Pole Dance"
            />
          </div>
          <div>
            <label className={labelCls}>Responsável</label>
            <select
              className={inputCls}
              value={form.responsavel_id ?? ''}
              onChange={(e) => set('responsavel_id', e.target.value || null)}
            >
              <option value="">—</option>
              {socias.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Primeiro contato</label>
            <input
              type="date"
              className={inputCls}
              value={form.primeiro_contato ?? ''}
              onChange={(e) => set('primeiro_contato', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Nascimento</label>
            <input
              type="date"
              className={inputCls}
              value={form.data_nascimento ?? ''}
              onChange={(e) => set('data_nascimento', e.target.value || null)}
            />
          </div>

          <div className="col-span-2 mt-1 border-t border-neutral-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Contato de emergência *
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nome *</label>
                <input
                  required
                  className={inputCls}
                  value={form.contato_emergencia_nome ?? ''}
                  onChange={(e) => set('contato_emergencia_nome', texto(e.target.value))}
                  placeholder="Quem acionar"
                />
              </div>
              <div>
                <label className={labelCls}>Telefone *</label>
                <input
                  required
                  className={inputCls}
                  value={form.contato_emergencia_telefone ?? ''}
                  onChange={(e) => set('contato_emergencia_telefone', texto(e.target.value))}
                  placeholder="(21) 9…"
                />
              </div>
            </div>
          </div>

          <div className="col-span-2">
            <label className={labelCls}>Observações</label>
            <textarea
              rows={2}
              className={inputCls}
              value={form.observacoes ?? ''}
              onChange={(e) => set('observacoes', texto(e.target.value))}
            />
          </div>

          <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={form.vip ?? false}
              onChange={(e) => set('vip', e.target.checked)}
              className="accent-brand-600"
            />
            Cliente VIP (cadência personalizada de follow-up)
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
