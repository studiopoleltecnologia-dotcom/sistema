import { useState } from 'react'
import { minhasProximasAulas, mensagemDoBanco } from '../aulas'
import { fmtDataCompleta, fmtHoraCurta, rotuloDia } from '../datas'
import {
  useBeneficioConvidado,
  useContextoAluno,
  useDesistirDoConvidado,
  useGradePublica,
  useIndicarConvidado,
} from '../hooks/usePortalAluna'
import type { MeuPlano } from '../types'
import type { Database } from '../../../lib/database.types'
import { Aviso } from './Basicos'

export type MeuConvidado = Database['public']['Functions']['meus_convidados']['Returns'][number]

/** Só o plano com o benefício na coluna, e ativo, oferece o botão. */
export function podeConvidar(p: MeuPlano): boolean {
  return (p.convidados_por_ciclo ?? 0) > 0 && p.status === 'ativa'
}

/**
 * O convite deste ciclo, quando existe um em aberto.
 *
 * Dois estados, e o segundo é o que precisa de cuidado:
 *
 * * **indicado** — a vaga ainda NÃO está reservada. Quem indica e acha
 *   que está tudo pronto traz a amiga e descobre na porta.
 * * **confirmado** — a vaga é dela. Aqui o aviso muda de assunto: o que
 *   importa é que desistir em cima da hora gasta o convidado do ciclo,
 *   porque a vaga ficou ocupada à toa.
 *
 * `devolve_beneficio` vem do banco (`convite_devolve_beneficio`), a mesma
 * conta que o `cancelar_convidado` aplica — a tela não recalcula prazo,
 * senão prometeria devolução que o banco não faz.
 */
export function ConviteEmAberto({ convite }: { convite: MeuConvidado }) {
  const desistir = useDesistirDoConvidado()
  const [erro, setErro] = useState<string | null>(null)

  const botao = convite.pode_desistir && (
    <button
      onClick={() => {
        setErro(null)
        desistir.mutate(convite.id, {
          onError: (e) => setErro(mensagemDoBanco(e, 'Não foi possível desistir agora.')),
        })
      }}
      disabled={desistir.isPending}
      className="mt-2 block text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-800 disabled:opacity-50"
    >
      {desistir.isPending ? 'Cancelando…' : 'Desistir do convite'}
    </button>
  )

  const quando = `${fmtDataCompleta(convite.data)} às ${fmtHoraCurta(convite.horario)}`

  if (convite.status === 'confirmado') {
    return (
      <Aviso tom="info" titulo={`${convite.convidado_nome} está confirmado`} className="mt-5">
        Na sua aula de {convite.turma_rotulo}, em {quando}. A vaga já é dela — peça para chegar 10
        minutos antes, que a recepção faz um cadastro rápido.
        {convite.pode_desistir && (
          <span className="mt-1 block text-xs text-neutral-500">
            {convite.devolve_beneficio
              ? 'Se ela não puder vir, dá tempo de desistir sem perder o seu convidado deste ciclo.'
              : 'Agora já está perto da aula: desistindo, o convidado deste ciclo é considerado usado.'}
          </span>
        )}
        {botao}
        {erro && <span className="mt-1.5 block text-xs text-danger-700">{erro}</span>}
      </Aviso>
    )
  }

  if (convite.status === 'solicitado') {
    return (
      <Aviso tom="atencao" titulo="Convidado em análise" className="mt-5">
        Você indicou <strong className="text-neutral-900">{convite.convidado_nome}</strong> para{' '}
        {convite.turma_rotulo}, em {quando}.{' '}
        <strong className="text-neutral-900">A vaga ainda não está reservada</strong>: a equipe
        confere o nível da aula e você recebe um e-mail com a resposta.
        {botao}
        {erro && <span className="mt-1.5 block text-xs text-danger-700">{erro}</span>}
      </Aviso>
    )
  }

  if (convite.status === 'recusado') {
    return (
      <Aviso tom="atencao" titulo="Não deu para confirmar o seu convidado" className="mt-5">
        {convite.motivo_decisao}
        <span className="mt-1 block text-xs text-neutral-500">
          O seu convidado deste ciclo não foi gasto — você pode indicar outra pessoa.
        </span>
      </Aviso>
    )
  }

  return null
}

/**
 * Indicar o convidado.
 *
 * A aula sai de uma lista, não de um calendário: o 11.1 exige que o
 * convidado participe da MESMA aula do titular, então as únicas aulas
 * possíveis são as que ele já tem — reserva por crédito ou assento de
 * turma fixa. Deixar escolher uma aula qualquer seria oferecer o erro.
 *
 * A pessoa é nome + telefone, e o telefone não é burocracia: é por ele
 * que o banco reconhece quem já passou pelo estúdio (ex-aluna, lead
 * antigo), que é o que a carência de 6 meses do 11.1 depende.
 */
export function IndicarConvidado({
  plano,
  onFechar,
  onIndicado,
}: {
  plano: MeuPlano
  onFechar: () => void
  onIndicado: () => void
}) {
  const { ctx } = useContextoAluno()
  const { data: grade } = useGradePublica()
  const { data: beneficio, isLoading } = useBeneficioConvidado(plano.matricula_id)
  const indicar = useIndicarConvidado()

  const [aula, setAula] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const aulas = minhasProximasAulas(grade ?? [], ctx, 30)
  const escolhida = aulas.find((a) => a.chave === aula)
  const valido = Boolean(escolhida && nome.trim().length > 2 && telefone.replace(/\D/g, '').length >= 10)

  function enviar() {
    if (!escolhida) return
    setErro(null)
    indicar.mutate(
      {
        matriculaId: plano.matricula_id,
        nome: nome.trim(),
        telefone: telefone.trim(),
        turmaId: escolhida.turmaId,
        data: escolhida.data,
        email: email.trim() || undefined,
        observacao: observacao.trim() || undefined,
      },
      {
        onSuccess: onIndicado,
        onError: (e) => setErro(mensagemDoBanco(e, 'Não foi possível indicar agora.')),
      },
    )
  }

  const campo = 'mb-1 block text-xs font-medium text-neutral-500'
  const input =
    'w-full rounded-md border border-neutral-200 px-2.5 py-2 text-sm outline-none transition focus:border-brand-500'

  if (isLoading) {
    return <p className="py-6 text-center text-sm text-neutral-400">Carregando…</p>
  }

  if (beneficio && !beneficio.tem) {
    return (
      <div>
        <Aviso tom="atencao" titulo="Sem convidado disponível agora">
          {beneficio.motivo}
        </Aviso>
        <button
          onClick={onFechar}
          className="mt-4 w-full rounded-md py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-800"
        >
          Fechar
        </button>
      </div>
    )
  }

  // Sem aula marcada não há convite possível, e dizer isso é mais útil
  // que um seletor vazio: o caminho é agendar primeiro.
  if (aulas.length === 0) {
    return (
      <div>
        <Aviso tom="atencao" titulo="Agende a sua aula primeiro">
          O convidado participa da mesma aula que você. Marque a sua na agenda e volte aqui para
          indicar quem vem com você.
        </Aviso>
        <button
          onClick={onFechar}
          className="mt-4 w-full rounded-md py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-800"
        >
          Fechar
        </button>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-4 text-sm leading-relaxed text-neutral-600">
        Seu plano dá direito a <strong className="text-neutral-800">um convidado por ciclo</strong>:
        alguém que ainda não treina aqui e vem fazer uma aula com você, sem pagar nada.
      </p>

      <label className={campo}>Em qual das suas aulas?</label>
      <div className="mb-4 grid gap-1.5">
        {aulas.map((a) => (
          <button
            key={a.chave}
            onClick={() => setAula(a.chave)}
            aria-pressed={aula === a.chave}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
              aula === a.chave
                ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-300'
                : 'border-neutral-200 hover:border-brand-300'
            }`}
          >
            <span className="min-w-0">
              <span className="block font-medium text-neutral-800">{a.modalidade}</span>
              <span className="block text-xs text-neutral-500">
                {rotuloDia(a.data)} · {fmtHoraCurta(a.horario)}
                {a.origem === 'turma_fixa' && ' · sua turma fixa'}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={campo}>Nome de quem vem</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={input} />
        </div>
        <div>
          <label className={campo}>Telefone (WhatsApp)</label>
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            inputMode="tel"
            placeholder="(11) 90000-0000"
            className={input}
          />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-400">
        O telefone é o que nos permite falar com ela e confirmar que é a primeira vez dela aqui.
      </p>

      <div className="mt-3">
        <label className={campo}>E-mail (opcional)</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          inputMode="email"
          className={input}
        />
      </div>

      <div className="mt-3">
        <label className={campo}>Quer contar algo sobre ela? (opcional)</label>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          placeholder="Ex.: ela já fez ballet, nunca subiu no pole."
          className={input}
        />
      </div>

      <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-sm leading-relaxed text-neutral-600">
        <strong className="font-semibold text-neutral-800">A equipe confirma antes de valer.</strong>{' '}
        Toda aula tem um nível, e a segurança de quem nunca subiu no pole depende disso — por isso a
        vaga só é reservada depois do nosso ok. Você recebe um e-mail com a resposta.
        <span className="mt-1.5 block">
          O convidado é para quem <strong className="text-neutral-800">não tem plano aqui</strong> e
          não treina com a gente há algum tempo.
        </span>
      </div>

      {erro && <p className="mt-3 rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{erro}</p>}

      <button
        onClick={enviar}
        disabled={!valido || indicar.isPending}
        className="mt-4 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {indicar.isPending ? 'Enviando…' : 'Indicar convidado'}
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
