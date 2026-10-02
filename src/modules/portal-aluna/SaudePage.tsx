import { useMemo, useState, type FormEvent } from 'react'
import {
  CircleCheck,
  CircleAlert,
  Clock,
  FileUp,
  Loader2,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import { formatarCpf } from '../../lib/cadastro'
import { cn } from '../../components/ui/cn'
import { fmtDataCompleta } from './datas'
import { Aviso, Cabecalho, Carregando, Cartao, Secao } from './components/Basicos'
import { DocumentoHtml, EstiloDocumento } from './components/contrato/DocumentoHtml'
import {
  useEnviarAtestado,
  useMeusAtestados,
  usePerguntasParq,
  useResponderParq,
  useSituacaoParq,
  useVersaoParq,
} from './hooks/useDocumentos'
import { useMeuCliente } from './hooks/usePortalAluna'
import type { RespostaParq } from './api/documentos'

const inputCls =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

/** Como cada situação se apresenta. O texto vem do banco; aqui só o tom. */
const TOM: Record<string, { tom: 'sucesso' | 'atencao' | 'info' | 'perigo'; titulo: string }> = {
  nao_preenchido: { tom: 'atencao', titulo: 'PAR-Q pendente' },
  apto: { tom: 'sucesso', titulo: 'PAR-Q concluído' },
  aguardando_documento: { tom: 'atencao', titulo: 'Atestado médico necessário' },
  documento_enviado: { tom: 'info', titulo: 'Atestado em análise' },
  documento_aprovado: { tom: 'sucesso', titulo: 'Liberado para a prática' },
  documento_recusado: { tom: 'perigo', titulo: 'Atestado não aceito' },
  expirado: { tom: 'atencao', titulo: 'PAR-Q vencido' },
}

/**
 * Saúde — PAR-Q e Termo de Responsabilidade.
 *
 * Documento separado do Contrato de Adesão, de propósito: um é condição
 * comercial, o outro é segurança da prática. Misturar os dois faria o
 * aluno aceitar saúde dentro de um aceite de compra, e é justamente o
 * que o documento oficial não quer.
 *
 * O veredito **não** é calculado aqui. `responder_parq()` conta as
 * respostas de atenção no banco e decide entre "apto" e "aguardando
 * documento" — o front nunca diz a ninguém que está liberado.
 */
export function SaudePage() {
  const { data: cliente } = useMeuCliente()
  const { data: versao, isLoading: carregandoVersao } = useVersaoParq()
  const { data: perguntas } = usePerguntasParq(versao?.id)
  const { data: situacao, isLoading: carregandoSituacao } = useSituacaoParq()
  const [refazendo, setRefazendo] = useState(false)

  const carregando = carregandoVersao || carregandoSituacao
  const precisaResponder =
    !situacao || situacao.situacao === 'nao_preenchido' || situacao.situacao === 'expirado'

  // Menor de 18: o documento oficial exige que o questionário e o termo
  // sejam aceitos PELO responsável legal, com nome, CPF e vínculo.
  const menor = useMemo(() => {
    if (!cliente?.data_nascimento) return null
    const nasc = new Date(cliente.data_nascimento + 'T00:00:00')
    const limite = new Date()
    limite.setFullYear(limite.getFullYear() - 18)
    return nasc > limite
  }, [cliente?.data_nascimento])

  return (
    <div className="lg:max-w-2xl">
      <EstiloDocumento />
      <Cabecalho
        titulo="Saúde"
        subtitulo="Questionário de Prontidão para Atividade Física (PAR-Q)."
      />

      {carregando && <Carregando linhas={3} />}

      {!carregando && !versao && (
        <Aviso tom="atencao" titulo="Questionário indisponível">
          O estúdio ainda não publicou o PAR-Q. Fale com a recepção.
        </Aviso>
      )}

      {!carregando && versao && (
        <>
          {situacao && (
            <SituacaoParq
              situacao={situacao}
              onRefazer={() => setRefazendo(true)}
              refazendo={refazendo}
            />
          )}

          {(precisaResponder || refazendo) && perguntas && perguntas.length > 0 && (
            <Formulario
              versao={versao}
              perguntas={perguntas}
              menor={menor}
              nascimentoFaltando={!cliente?.data_nascimento}
              onPronto={() => setRefazendo(false)}
            />
          )}

          {!precisaResponder && !refazendo && situacao?.situacao !== 'apto' && (
            <Atestados respostaId={situacao?.resposta_id ?? null} />
          )}
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Situação
// ------------------------------------------------------------

function SituacaoParq({
  situacao,
  onRefazer,
  refazendo,
}: {
  situacao: {
    situacao: string | null
    mensagem: string | null
    validade: string | null
    versao: string | null
    respondido_em: string | null
    liberado: boolean | null
  }
  onRefazer: () => void
  refazendo: boolean
}) {
  const chave = situacao.situacao ?? 'nao_preenchido'
  const { tom, titulo } = TOM[chave] ?? TOM.nao_preenchido
  const podeRefazer = chave === 'apto' || chave === 'documento_aprovado'

  return (
    <div className="mb-6">
      <Aviso tom={tom} titulo={titulo}>
        {situacao.mensagem}
      </Aviso>

      {situacao.respondido_em && (
        <p className="mt-2 text-xs text-neutral-500">
          Respondido em {fmtDataCompleta(situacao.respondido_em.slice(0, 10))}
          {situacao.versao ? ` · versão ${situacao.versao}` : ''}
          {situacao.validade ? ` · vale até ${fmtDataCompleta(situacao.validade)}` : ''}
        </p>
      )}

      {/*
        Refazer antes de vencer é legítimo e importante: o aluno que
        começou a tomar um medicamento ou passou por cirurgia precisa
        atualizar na hora, não esperar a renovação anual. O anterior não
        é sobrescrito — vira histórico.
      */}
      {podeRefazer && !refazendo && (
        <button
          type="button"
          onClick={onRefazer}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500"
        >
          <RotateCcw className="size-3.5" />
          Mudou algo na minha saúde — quero atualizar
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Formulário
// ------------------------------------------------------------

function Formulario({
  versao,
  perguntas,
  menor,
  nascimentoFaltando,
  onPronto,
}: {
  versao: { id: string; aviso_html: string; termo_html: string }
  perguntas: { id: string; ordem: number; texto: string }[]
  menor: boolean | null
  nascimentoFaltando: boolean
  onPronto: () => void
}) {
  const responder = useResponderParq()
  const [respostas, setRespostas] = useState<Record<string, boolean>>({})
  const [observacoes, setObservacoes] = useState('')
  const [aceita, setAceita] = useState(false)
  const [respNome, setRespNome] = useState('')
  const [respCpf, setRespCpf] = useState('')
  const [respVinculo, setRespVinculo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const faltam = perguntas.filter((p) => respostas[p.id] === undefined).length

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    if (faltam > 0) {
      setErro(`Responda todas as perguntas — ${faltam} ${faltam === 1 ? 'falta' : 'faltam'}.`)
      return
    }
    if (!aceita) {
      setErro('É preciso aceitar o Termo de Responsabilidade.')
      return
    }

    const lista: RespostaParq[] = perguntas.map((p) => ({
      pergunta_id: p.id,
      ordem: p.ordem,
      texto: p.texto,
      resposta: respostas[p.id],
    }))

    responder.mutate(
      {
        respostas: lista,
        aceitaTermo: aceita,
        observacoes: observacoes.trim() || null,
        responsavel: menor
          ? { nome: respNome.trim(), cpf: respCpf.replace(/\D/g, ''), vinculo: respVinculo.trim() }
          : null,
      },
      {
        onSuccess: onPronto,
        onError: (e) =>
          setErro((e as { message?: string }).message ?? 'Não foi possível enviar. Tente de novo.'),
      },
    )
  }

  if (nascimentoFaltando) {
    return (
      <Aviso tom="atencao" titulo="Falta a sua data de nascimento">
        O PAR-Q depende dela para saber se o questionário precisa ser preenchido pelo responsável
        legal. Complete em <strong>Perfil</strong> e volte aqui.
      </Aviso>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <Cartao className="mb-5">
        <DocumentoHtml html={versao.aviso_html} />
      </Cartao>

      <Secao titulo="Questionário">
        <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {perguntas.map((p) => (
            <Pergunta
              key={p.id}
              numero={p.ordem}
              texto={p.texto}
              valor={respostas[p.id]}
              onChange={(v) => setRespostas((r) => ({ ...r, [p.id]: v }))}
            />
          ))}
        </div>
      </Secao>

      <label className="mt-5 block">
        <span className="mb-1 block text-xs font-medium text-neutral-600">
          Quer contar mais alguma coisa? (opcional)
        </span>
        <textarea
          rows={3}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Lesões, cirurgias, gestação, medicação — o que ajudar a equipe a cuidar de você."
          className={inputCls}
        />
      </label>

      {menor && (
        <div className="mt-5 rounded-xl border border-warning-200 bg-warning-50 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-warning-800">
            <ShieldAlert className="size-4 shrink-0" />
            Aluno menor de 18 anos
          </p>
          <p className="mb-3 text-xs leading-relaxed text-warning-800">
            O questionário, o Termo de Responsabilidade e a autorização para a prática precisam ser
            preenchidos e aceitos pelo <strong>responsável legal</strong>.
          </p>
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-warning-800">
                Nome do responsável
              </span>
              <input value={respNome} onChange={(e) => setRespNome(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-warning-800">
                CPF do responsável
              </span>
              <input
                value={respCpf}
                onChange={(e) => setRespCpf(formatarCpf(e.target.value))}
                inputMode="numeric"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-warning-800">
                Vínculo com o aluno
              </span>
              <input
                value={respVinculo}
                onChange={(e) => setRespVinculo(e.target.value)}
                placeholder="mãe, pai, responsável legal…"
                className={inputCls}
              />
            </label>
          </div>
        </div>
      )}

      <Secao titulo="Termo de Responsabilidade" className="mt-6">
        <Cartao>
          <DocumentoHtml html={versao.termo_html} />
        </Cartao>
      </Secao>

      <label className="mt-3 flex cursor-pointer gap-3 rounded-xl border border-neutral-200 bg-white p-3.5">
        <input
          type="checkbox"
          checked={aceita}
          onChange={(e) => setAceita(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-brand-600"
        />
        <span className="text-sm leading-snug text-neutral-700">
          Declaro que as respostas são verdadeiras e{' '}
          <strong className="text-neutral-900">aceito o Termo de Responsabilidade</strong>
          {menor ? ', como responsável legal pelo aluno' : ''}.
        </span>
      </label>

      {erro && <p className="mt-3 text-sm text-danger-600">{erro}</p>}

      <button
        type="submit"
        disabled={responder.isPending}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {responder.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Enviando…
          </>
        ) : (
          'Enviar questionário'
        )}
      </button>
    </form>
  )
}

function Pergunta({
  numero,
  texto,
  valor,
  onChange,
}: {
  numero: number
  texto: string
  valor: boolean | undefined
  onChange: (v: boolean) => void
}) {
  return (
    <div className="p-3.5">
      <p className="mb-2.5 flex gap-2 text-sm leading-snug text-neutral-700">
        <span className="shrink-0 font-semibold text-neutral-400">{numero}.</span>
        <span>{texto}</span>
      </p>
      <div className="flex gap-2 pl-5">
        {[
          { v: false, rotulo: 'Não' },
          { v: true, rotulo: 'Sim' },
        ].map(({ v, rotulo }) => (
          <button
            key={rotulo}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={valor === v}
            className={cn(
              'min-w-[72px] rounded-lg border px-3 py-1.5 text-sm font-semibold transition',
              valor === v
                ? v
                  ? 'border-warning-300 bg-warning-50 text-warning-800'
                  : 'border-brand-500 bg-brand-600 text-white'
                : 'border-neutral-200 text-neutral-500 hover:border-neutral-300',
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Atestado
// ------------------------------------------------------------

function Atestados({ respostaId }: { respostaId: string | null }) {
  const { data: atestados } = useMeusAtestados()
  const enviar = useEnviarAtestado()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [emitidoEm, setEmitidoEm] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!respostaId || !arquivo) {
      setErro('Escolha o arquivo do atestado.')
      return
    }
    enviar.mutate(
      { respostaId, arquivo, emitidoEm: emitidoEm || null },
      {
        onSuccess: () => {
          setArquivo(null)
          setEmitidoEm('')
        },
        onError: (e) =>
          setErro((e as { message?: string }).message ?? 'Não foi possível enviar o arquivo.'),
      },
    )
  }

  return (
    <Secao titulo="Atestado de aptidão física" className="mt-2">
      <form onSubmit={handleSubmit} className="rounded-xl border border-neutral-200 bg-white p-4">
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Arquivo (PDF ou foto)
          </span>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Data de emissão (opcional)
          </span>
          <input
            type="date"
            value={emitidoEm}
            onChange={(e) => setEmitidoEm(e.target.value)}
            className={inputCls}
          />
        </label>

        {erro && <p className="mb-3 text-sm text-danger-600">{erro}</p>}

        <button
          type="submit"
          disabled={enviar.isPending || !arquivo}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {enviar.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Enviando…
            </>
          ) : (
            <>
              <FileUp className="size-4" /> Enviar atestado
            </>
          )}
        </button>
      </form>

      {(atestados ?? []).length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {(atestados ?? []).map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-2.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-xs"
            >
              {a.aprovado === true ? (
                <CircleCheck className="mt-px size-4 shrink-0 text-success-600" />
              ) : a.aprovado === false ? (
                <CircleAlert className="mt-px size-4 shrink-0 text-danger-600" />
              ) : (
                <Clock className="mt-px size-4 shrink-0 text-neutral-400" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-neutral-900">{a.arquivo_nome}</span>
                <span className="block text-neutral-500">
                  Enviado em {fmtDataCompleta(a.enviado_em.slice(0, 10))}
                  {a.aprovado === true
                    ? ' · aprovado'
                    : a.aprovado === false
                      ? ' · não aceito'
                      : ' · em análise'}
                </span>
                {a.aprovado === false && a.motivo && (
                  <span className="mt-0.5 block text-danger-600">{a.motivo}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  )
}
