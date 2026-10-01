import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { requireSupabase } from '../../../lib/supabase'

const inputCls =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

type Estudio = {
  razao_social: string | null
  cnpj: string | null
  endereco: string | null
  whatsapp: string | null
}

type Flags = { exigir_contrato: boolean; exigir_parq: boolean }

async function buscarEstudio() {
  const { data, error } = await requireSupabase()
    .from('config_estudio')
    .select('razao_social, cnpj, endereco, whatsapp')
    .eq('id', true)
    .maybeSingle()
  if (error) throw error
  return data
}

async function buscarFlags() {
  const { data, error } = await requireSupabase()
    .from('config_cadastro')
    .select('exigir_contrato, exigir_parq')
    .eq('id', true)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Documentos obrigatórios — identificação do estúdio e as duas chaves.
 *
 * Separado das "Regras do cadastro" de propósito: aquelas validam campo
 * (sobrenome, DDD, CPF), estas ligam **documento legal**. Misturar faria
 * `validarCadastro()` passar a conhecer flags que não têm nada a ver com
 * validar um telefone.
 *
 * As duas chaves nascem desligadas, e esta tela existe justamente para
 * ligá-las de caso pensado:
 *
 * · **Contrato de Adesão** não pode ser ligado sem razão social, CNPJ e
 *   endereço — contrato sem a parte identificada não vale, e
 *   `aceitar_contrato()` recusa de qualquer forma. A tela avisa antes, em
 *   vez de deixar o aluno descobrir no checkout.
 * · **PAR-Q** bloqueia o agendamento de quem não respondeu. Ligar antes de
 *   os alunos vindos do Wix responderem trava a agenda de todos no mesmo
 *   dia — e é por isso que o aviso aqui é explícito.
 */
export function ConfigDocumentosModal({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient()
  const estudio = useQuery({ queryKey: ['config-estudio'], queryFn: buscarEstudio })
  const flags = useQuery({ queryKey: ['config-documentos'], queryFn: buscarFlags })

  const [e, setE] = useState<Estudio>({
    razao_social: '',
    cnpj: '',
    endereco: '',
    whatsapp: '',
  })
  const [f, setF] = useState<Flags>({ exigir_contrato: false, exigir_parq: false })
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (estudio.data) setE(estudio.data)
  }, [estudio.data])
  useEffect(() => {
    if (flags.data) setF(flags.data)
  }, [flags.data])

  const estudioCompleto =
    !!e.razao_social?.trim() && !!e.cnpj?.trim() && !!e.endereco?.trim()

  const salvar = useMutation({
    mutationFn: async () => {
      const sb = requireSupabase()
      const { error: erroE } = await sb
        .from('config_estudio')
        .update({
          razao_social: e.razao_social?.trim() || null,
          cnpj: e.cnpj?.trim() || null,
          endereco: e.endereco?.trim() || null,
          whatsapp: e.whatsapp?.trim() || null,
          atualizada_em: new Date().toISOString(),
        })
        .eq('id', true)
      if (erroE) throw erroE

      const { error: erroF } = await sb.from('config_cadastro').update(f).eq('id', true)
      if (erroF) throw erroF
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-estudio'] })
      qc.invalidateQueries({ queryKey: ['config-documentos'] })
      onFechar()
    },
    onError: (err) => setErro((err as { message?: string }).message ?? 'Não foi possível salvar.'),
  })

  return (
    <Modal title="Documentos obrigatórios" onFechar={onFechar} size="lg">
      <p className="mb-4 text-xs text-neutral-500">
        O Contrato de Adesão é gerado com estes dados. Eles aparecem no documento que o aluno
        aceita, então precisam ser os dados reais da empresa.
      </p>

      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Razão social</span>
          <input
            value={e.razao_social ?? ''}
            onChange={(ev) => setE({ ...e, razao_social: ev.target.value })}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">CNPJ</span>
          <input
            value={e.cnpj ?? ''}
            onChange={(ev) => setE({ ...e, cnpj: ev.target.value })}
            placeholder="00.000.000/0001-00"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Endereço</span>
          <input
            value={e.endereco ?? ''}
            onChange={(ev) => setE({ ...e, endereco: ev.target.value })}
            placeholder="Rua, número, bairro, cidade/UF"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            WhatsApp oficial (citado no contrato)
          </span>
          <input
            value={e.whatsapp ?? ''}
            onChange={(ev) => setE({ ...e, whatsapp: ev.target.value })}
            placeholder="(21) 97067-4691"
            className={inputCls}
          />
        </label>
      </div>

      <div className="mt-5 border-t border-neutral-100 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          O que é obrigatório para o aluno
        </p>

        <Chave
          ligada={f.exigir_contrato}
          onChange={(v) => setF({ ...f, exigir_contrato: v })}
          bloqueada={!estudioCompleto}
          titulo="Exigir aceite do Contrato de Adesão"
          detalhe="Sem aceite, o sistema não emite cobrança da contratação. O contrato é montado com as cláusulas do produto escolhido."
          avisoBloqueio="Preencha razão social, CNPJ e endereço antes de ligar — contrato sem a parte identificada não vale, e o banco recusa o aceite."
        />

        <Chave
          ligada={f.exigir_parq}
          onChange={(v) => setF({ ...f, exigir_parq: v })}
          titulo="Exigir PAR-Q para agendar"
          detalhe="Quem não respondeu, está vencido ou aguarda atestado não consegue reservar aula. Reservas feitas pelo Wellhub e TotalPass continuam passando."
          aviso="Ligue só depois de os alunos já cadastrados responderem: a partir daí, quem não tem PAR-Q válido para de conseguir agendar."
        />
      </div>

      {erro && <p className="mt-3 text-sm text-danger-600">{erro}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onFechar}>
          Cancelar
        </Button>
        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          {salvar.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </Modal>
  )
}

function Chave({
  ligada,
  onChange,
  titulo,
  detalhe,
  aviso,
  bloqueada,
  avisoBloqueio,
}: {
  ligada: boolean
  onChange: (v: boolean) => void
  titulo: string
  detalhe: string
  aviso?: string
  bloqueada?: boolean
  avisoBloqueio?: string
}) {
  return (
    <div className="mb-3 rounded-lg border border-neutral-200 p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={ligada && !bloqueada}
          disabled={bloqueada}
          onChange={(ev) => onChange(ev.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-brand-600 disabled:opacity-40"
        />
        <span>
          <span className="block text-sm font-medium text-neutral-900">{titulo}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">{detalhe}</span>
        </span>
      </label>

      {bloqueada && avisoBloqueio && (
        <p className="mt-2 flex gap-2 rounded-md bg-danger-50 p-2 text-xs text-danger-700">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          {avisoBloqueio}
        </p>
      )}
      {!bloqueada && aviso && ligada && (
        <p className="mt-2 flex gap-2 rounded-md bg-warning-50 p-2 text-xs text-warning-800">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          {aviso}
        </p>
      )}
      {!bloqueada && !ligada && (
        <p className="mt-2 flex gap-2 text-xs text-neutral-400">
          <CircleCheck className="mt-px size-3.5 shrink-0" />
          Desligado: nada muda para o aluno.
        </p>
      )}
    </div>
  )
}
