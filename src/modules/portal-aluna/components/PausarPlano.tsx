import { useState } from 'react'
import { fmtDataCompleta, hojeIso } from '../datas'
import { mensagemDoBanco } from '../aulas'
import { useDesistirDaPausa, useDireitoAPausa, useSolicitarPausa } from '../hooks/usePortalAluna'
import type { MeuPlano } from '../types'
import { Aviso } from './Basicos'

/** Soma dias a uma data ISO sem passar por Date (que muda de dia por fuso). */
function maisDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d + dias))
  return dt.toISOString().slice(0, 10)
}

function diasEntre(de: string, ate: string): number {
  const n = (s: string) => Date.UTC(...(s.split('-').map(Number) as [number, number, number]))
  return Math.round((n(ate) - n(de)) / 86400000) + 1
}

/**
 * O estado da pausa, quando existe uma em aberto.
 *
 * Três situações bem diferentes, e a terceira é a que mais gera dúvida:
 *
 * * **pedida** — nada mudou ainda, e é importante dizer isso: o plano
 *   segue ativo e a cobrança também. Quem pede pausa no dia 28 e acha que
 *   já está pausado leva um susto na fatura.
 * * **aprovada** — vale a partir de uma data futura.
 * * **em curso** — não dá para agendar, e os dias voltam no fim.
 */
export function PausaEmAberto({
  pausa,
}: {
  pausa: {
    id: string | null
    status: string | null
    tipo: string | null
    inicio: string | null
    fim: string | null
    dias_pedidos: number | null
  }
}) {
  const desistir = useDesistirDaPausa()
  if (!pausa.status || !pausa.inicio || !pausa.fim) return null

  const podeDesistir = pausa.status === 'solicitada' || pausa.status === 'aprovada'
  const botao = podeDesistir && pausa.id && (
    <button
      onClick={() => desistir.mutate(pausa.id!)}
      disabled={desistir.isPending}
      className="mt-2 block text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-800 disabled:opacity-50"
    >
      {desistir.isPending ? 'Cancelando…' : 'Desistir da pausa'}
    </button>
  )

  if (pausa.status === 'ativa') {
    return (
      <Aviso tom="info" titulo="Seu plano está pausado" className="mt-5">
        A pausa vai até <strong className="text-neutral-900">{fmtDataCompleta(pausa.fim)}</strong>.
        Enquanto isso você não é cobrado e não consegue agendar aulas — seus créditos ficam
        guardados, e a validade deles anda junto com a pausa.
        <span className="mt-1 block text-xs text-neutral-500">
          Quer voltar antes? Fale com a gente: você só usa os dias que de fato pausar.
        </span>
      </Aviso>
    )
  }

  if (pausa.status === 'aprovada') {
    return (
      <Aviso tom="info" titulo="Pausa confirmada" className="mt-5">
        Seu plano fica pausado de <strong className="text-neutral-900">{fmtDataCompleta(pausa.inicio)}</strong>{' '}
        a <strong className="text-neutral-900">{fmtDataCompleta(pausa.fim)}</strong>. Até lá tudo
        segue normal.
        {botao}
      </Aviso>
    )
  }

  return (
    <Aviso tom="atencao" titulo="Pausa em análise" className="mt-5">
      Pedido de {fmtDataCompleta(pausa.inicio)} a {fmtDataCompleta(pausa.fim)}
      {pausa.tipo === 'atestado' ? ' (afastamento de saúde)' : ''}.{' '}
      <strong className="text-neutral-900">Nada mudou ainda</strong>: seu plano continua ativo e a
      cobrança também, até a equipe confirmar.
      {botao}
    </Aviso>
  )
}

/**
 * Pedir a pausa.
 *
 * O limite de dias vem do banco e aparece na tela antes de o aluno
 * escolher a data — não como erro depois de enviar. O campo de volta é
 * limitado pelo `max` do input, então o caminho normal nem chega a errar.
 *
 * O atestado é uma opção, não um upload: o documento é combinado com a
 * equipe (o mesmo caminho do atestado do PAR-Q, que já tem fila própria).
 * Pedir arquivo aqui criaria um segundo lugar para guardar documento de
 * saúde, e é o tipo de dado que não se quer espalhado.
 */
export function PedirPausa({
  plano,
  onFechar,
  onPedida,
}: {
  plano: MeuPlano
  onFechar: () => void
  onPedida: () => void
}) {
  const [atestado, setAtestado] = useState(false)
  const [inicio, setInicio] = useState(hojeIso())
  const [fim, setFim] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const { data: direito, isLoading } = useDireitoAPausa(plano.matricula_id, atestado)
  const pedir = useSolicitarPausa()

  const max = direito?.max_dias ?? 0
  const ultimoDia = inicio && max > 0 ? maisDias(inicio, max - 1) : ''
  const dias = inicio && fim ? diasEntre(inicio, fim) : 0
  const valido = Boolean(inicio && fim) && dias > 0 && dias <= max && (!atestado || observacao.trim() !== '')

  function enviar() {
    setErro(null)
    pedir.mutate(
      {
        matriculaId: plano.matricula_id,
        inicio,
        fim,
        atestado,
        observacao: observacao.trim() || undefined,
      },
      {
        onSuccess: onPedida,
        onError: (e) => setErro(mensagemDoBanco(e, 'Não foi possível pedir a pausa agora.')),
      },
    )
  }

  const campo = 'mb-1 block text-xs font-medium text-neutral-500'
  const input =
    'w-full rounded-md border border-neutral-200 px-2.5 py-2 text-sm outline-none transition focus:border-brand-500'

  if (isLoading) {
    return <p className="py-6 text-center text-sm text-neutral-400">Carregando…</p>
  }

  if (direito && !direito.pode) {
    return (
      <div>
        <Aviso tom="atencao" titulo="Não dá para pausar agora">
          {direito.motivo}
          {direito.proxima_liberacao && (
            <span className="mt-1 block">
              O direito à pausa volta em {fmtDataCompleta(direito.proxima_liberacao)}.
            </span>
          )}
        </Aviso>
        {!atestado && (
          <button
            onClick={() => setAtestado(true)}
            className="mt-4 w-full rounded-lg border border-neutral-200 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-brand-300"
          >
            É um afastamento de saúde com atestado
          </button>
        )}
        <button
          onClick={onFechar}
          className="mt-2 w-full rounded-md py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-800"
        >
          Fechar
        </button>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-4 text-sm leading-relaxed text-neutral-600">
        Durante a pausa a cobrança e o ciclo ficam <strong className="text-neutral-800">congelados</strong>:
        você não é cobrado, não perde créditos, e os dias pausados voltam no fim da sua vigência.
      </p>

      {/* O tipo primeiro: ele muda o limite de dias, e trocar depois de
          escolher a data faria o campo de volta mudar de regra embaixo do
          dedo do aluno. */}
      <div className="mb-4 flex gap-2">
        {[
          { v: false, r: 'Pausa normal' },
          { v: true, r: 'Afastamento de saúde' },
        ].map((o) => (
          <button
            key={String(o.v)}
            onClick={() => {
              setAtestado(o.v)
              setFim('')
            }}
            aria-pressed={atestado === o.v}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              atestado === o.v
                ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-300'
                : 'border-neutral-200 text-neutral-600 hover:border-brand-300'
            }`}
          >
            {o.r}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={campo}>A partir de</label>
          <input
            type="date"
            value={inicio}
            min={hojeIso()}
            onChange={(e) => {
              setInicio(e.target.value)
              setFim('')
            }}
            className={input}
          />
        </div>
        <div>
          <label className={campo}>Volto em</label>
          <input
            type="date"
            value={fim}
            min={inicio || hojeIso()}
            max={ultimoDia || undefined}
            onChange={(e) => setFim(e.target.value)}
            className={input}
          />
        </div>
      </div>

      <p className="mt-1.5 text-[11px] text-neutral-400">
        {atestado
          ? `Afastamento de saúde: até ${max} dias, e não consome a sua pausa normal.`
          : `Este plano permite pausa de até ${max} dias.`}
        {dias > 0 && ` Você escolheu ${dias} ${dias === 1 ? 'dia' : 'dias'}.`}
      </p>

      <div className="mt-4">
        <label className={campo}>
          {atestado ? 'Conte o que aconteceu (a equipe vai pedir o atestado)' : 'Quer dizer algo? (opcional)'}
        </label>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={3}
          className={input}
        />
      </div>

      <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-sm leading-relaxed text-neutral-600">
        <strong className="font-semibold text-neutral-800">A pausa vale depois de confirmada.</strong> Até
        lá o plano segue ativo e a cobrança também. Você recebe um e-mail com a resposta.
        {plano.turmas_fixas > 0 && (
          <span className="mt-1.5 block">
            Como o seu plano é de turma fixa, a sua vaga pode ser liberada durante a pausa — na volta,
            a mesma turma depende de ter lugar.
          </span>
        )}
      </div>

      {erro && <p className="mt-3 rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{erro}</p>}

      <button
        onClick={enviar}
        disabled={!valido || pedir.isPending}
        className="mt-4 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pedir.isPending ? 'Enviando…' : 'Pedir pausa'}
      </button>
      <button
        onClick={onFechar}
        className="mt-2 w-full rounded-md py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-800"
      >
        Voltar
      </button>
    </div>
  )
}
