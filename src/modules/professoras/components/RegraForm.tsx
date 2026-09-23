import { useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { useModalidades, useTurmas } from '../../agenda/hooks/useAgenda'
import { useProfessoras } from '../hooks/useProfessoras'
import { useSalvarRegra } from '../hooks/useRemuneracao'
import type { RegraCompleta, TipoRemuneracao } from '../api/remuneracao'

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

const TIPOS: { valor: TipoRemuneracao; rotulo: string; ajuda: string }[] = [
  { valor: 'por_aluna', rotulo: 'Por aluno presente', ajuda: 'Valor × presentes, respeitando piso e teto.' },
  { valor: 'por_hora', rotulo: 'Por hora', ajuda: 'Valor da hora × duração da aula.' },
  { valor: 'fixo_aula', rotulo: 'Fixo por aula', ajuda: 'Mesmo valor, venha quem vier.' },
  { valor: 'fixo_mes', rotulo: 'Fixo por mês', ajuda: 'Salário; entra uma vez no fechamento, não por aula.' },
  { valor: 'percentual', rotulo: 'Percentual da mensalidade', ajuda: '% das mensalidades contratadas na turma, rateado pelas aulas do mês.' },
]

const reais = (c: number | null) => (c === null || c === undefined ? '' : (c / 100).toFixed(2))

/**
 * Criar ou editar uma regra de remuneração.
 *
 * As três decisões que a tela precisa deixar óbvias, porque são as que
 * pagam errado quando ficam implícitas:
 *
 * 1. ESCOPO — quanto mais específico, mais forte. Uma regra de
 *    modalidade ganha da regra pessoal da professora; uma de turma
 *    ganha das duas. É assim que a tabela do Pole vale para todas sem
 *    apagar contrato individual de ninguém.
 * 2. VIGÊNCIA — é o que impede a tabela nova de recalcular o mês
 *    passado. Por isso a data de início é obrigatória e o banco recusa
 *    duas regras do mesmo escopo valendo ao mesmo tempo.
 * 3. FAIXAS — só para tabela irregular. Quando existe faixa, ela manda,
 *    e a maior que couber é a que vale: uma faixa solta em 2 valeria
 *    também para 3, 4 e 9. Piso e teto resolvem a maioria dos casos
 *    sem faixa nenhuma.
 */
export function RegraForm({
  regra,
  onFechar,
}: {
  regra: RegraCompleta | null
  onFechar: () => void
}) {
  const { data: professoras } = useProfessoras()
  const { data: modalidades } = useModalidades()
  const { data: turmas } = useTurmas()
  const salvar = useSalvarRegra()

  const [professoraId, setProfessoraId] = useState(regra?.professora_id ?? '')
  const [modalidadeId, setModalidadeId] = useState(regra?.modalidade_id ?? '')
  const [turmaId, setTurmaId] = useState(regra?.turma_id ?? '')
  const [tipo, setTipo] = useState<TipoRemuneracao>(regra?.tipo ?? 'por_aluna')
  const [valor, setValor] = useState(reais(regra?.valor_centavos ?? 0))
  const [percentual, setPercentual] = useState(regra?.percentual?.toString() ?? '')
  const [piso, setPiso] = useState(reais(regra?.piso_centavos ?? null))
  const [teto, setTeto] = useState(reais(regra?.teto_centavos ?? null))
  const [semAlunos, setSemAlunos] = useState(reais(regra?.valor_sem_alunos_centavos ?? 0))
  const [inicio, setInicio] = useState(regra?.vigencia_inicio ?? new Date().toISOString().slice(0, 10))
  const [fim, setFim] = useState(regra?.vigencia_fim ?? '')
  const [observacao, setObservacao] = useState(regra?.observacao ?? '')
  const [faixas, setFaixas] = useState<{ min_alunos: string; valor: string }[]>(
    (regra?.faixas ?? [])
      .sort((a, b) => a.min_alunos - b.min_alunos)
      .map((f) => ({ min_alunos: String(f.min_alunos), valor: reais(f.valor_centavos) })),
  )
  const [erro, setErro] = useState<string | null>(null)

  const ehPercentual = tipo === 'percentual'
  const usaFaixaEPiso = tipo === 'por_aluna'

  function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (ehPercentual && !percentual.trim()) {
      return setErro('Informe o percentual.')
    }
    salvar.mutate(
      {
        id: regra?.id,
        dados: {
          professora_id: professoraId || null,
          modalidade_id: modalidadeId || null,
          turma_id: turmaId || null,
          tipo,
          valor_centavos: ehPercentual ? 0 : (parseCentavos(valor) ?? 0),
          percentual: ehPercentual ? Number(percentual.replace(',', '.')) : null,
          base_percentual: ehPercentual ? 'mensalidade_contratada' : null,
          piso_centavos: usaFaixaEPiso ? parseCentavos(piso) : null,
          teto_centavos: usaFaixaEPiso ? parseCentavos(teto) : null,
          valor_sem_alunos_centavos: parseCentavos(semAlunos) ?? 0,
          vigencia_inicio: inicio,
          vigencia_fim: fim || null,
          observacao: observacao.trim() || null,
        },
        faixas: usaFaixaEPiso
          ? faixas
              .filter((f) => f.min_alunos.trim() && f.valor.trim())
              .map((f) => ({
                min_alunos: Number(f.min_alunos),
                valor_centavos: parseCentavos(f.valor) ?? 0,
              }))
          : [],
      },
      { onSuccess: onFechar, onError: (e) => setErro((e as Error).message) },
    )
  }

  return (
    <Modal title={regra ? 'Editar regra' : 'Nova regra de remuneração'} onFechar={onFechar} size="lg">
      <form onSubmit={submeter} className="flex flex-col gap-4">
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Para quem vale
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Professora</label>
              <Select value={professoraId} onChange={(e) => setProfessoraId(e.target.value)}>
                <option value="">Todas</option>
                {(professoras ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className={labelCls}>Modalidade</label>
              <Select value={modalidadeId} onChange={(e) => setModalidadeId(e.target.value)}>
                <option value="">Todas</option>
                {(modalidades ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className={labelCls}>Turma</label>
              <Select value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
                <option value="">Todas</option>
                {(turmas ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.modalidade} · {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][t.dia_semana]}{' '}
                    {String(t.horario).slice(0, 5)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-400">
            Deixar em “Todas” torna a regra mais geral. Quando duas servem, vale a mais
            específica: turma &gt; modalidade &gt; professora &gt; padrão do estúdio.
          </p>
        </section>

        <section className="border-t border-neutral-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Como paga
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Modelo</label>
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRemuneracao)}>
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-neutral-400">
                {TIPOS.find((t) => t.valor === tipo)?.ajuda}
              </p>
            </div>

            {ehPercentual ? (
              <div>
                <label className={labelCls}>Percentual (%)</label>
                <Input value={percentual} onChange={(e) => setPercentual(e.target.value)} placeholder="50" />
                <p className="mt-1 text-[11px] text-neutral-400">
                  Sobre as mensalidades contratadas na turma — por isso só funciona em Turma Fixa.
                </p>
              </div>
            ) : (
              <div>
                <label className={labelCls}>Valor (R$)</label>
                <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="18,00" />
              </div>
            )}
          </div>

          {usaFaixaEPiso && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Piso por aula (R$)</label>
                <Input value={piso} onChange={(e) => setPiso(e.target.value)} placeholder="45,00" />
              </div>
              <div>
                <label className={labelCls}>Teto por aula (R$)</label>
                <Input value={teto} onChange={(e) => setTeto(e.target.value)} placeholder="90,00" />
              </div>
              <div>
                <label className={labelCls}>Aula sem ninguém (R$)</label>
                <Input value={semAlunos} onChange={(e) => setSemAlunos(e.target.value)} />
              </div>
            </div>
          )}

          {usaFaixaEPiso && (
            <p className="mt-1.5 text-[11px] text-neutral-400">
              Piso e teto já dão a tabela do Pole: R$18/aluno com piso de {fmtCentavos(4500)} e teto
              de {fmtCentavos(9000)} rende 45, 45, 54, 72, 90, 90. Faixa só é necessária quando os
              degraus não são lineares.
            </p>
          )}
        </section>

        {usaFaixaEPiso && (
          <section className="border-t border-neutral-100 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Faixas (opcional)
              </p>
              <button
                type="button"
                onClick={() => setFaixas([...faixas, { min_alunos: '', valor: '' }])}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 transition hover:bg-brand-50"
              >
                <Plus className="size-3.5" /> faixa
              </button>
            </div>
            {faixas.length === 0 && (
              <p className="text-xs text-neutral-300">
                Sem faixas: vale o valor por aluno, com piso e teto.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {faixas.map((f, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>A partir de (alunos)</label>
                    <Input
                      value={f.min_alunos}
                      onChange={(e) =>
                        setFaixas(faixas.map((x, j) => (j === i ? { ...x, min_alunos: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Paga (R$)</label>
                    <Input
                      value={f.valor}
                      onChange={(e) =>
                        setFaixas(faixas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFaixas(faixas.filter((_, j) => j !== i))}
                    className="mb-1.5 rounded-md p-1.5 text-neutral-400 transition hover:bg-danger-50 hover:text-danger-600"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            {faixas.length > 0 && (
              <p className="mt-1.5 text-[11px] text-warning-700">
                Com faixas, a tabela precisa ser completa: vale a maior faixa que couber, então uma
                faixa solta em 2 valeria também para 3, 4 e 9.
              </p>
            )}
          </section>
        )}

        <section className="border-t border-neutral-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            De quando até quando
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Começa em *</label>
              <Input type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Termina em</label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
              <p className="mt-1 text-[11px] text-neutral-400">Vazio = vigente.</p>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-400">
            A vigência é o que protege o mês fechado: uma aula é sempre paga pela regra que valia
            na data dela.
          </p>
        </section>

        <div>
          <label className={labelCls}>Observação</label>
          <Input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: contrato SCBJJ, 50% das mensalidades"
          />
        </div>

        {erro && <p className="text-sm text-danger-600">{erro}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            {regra ? 'Salvar' : 'Criar regra'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
