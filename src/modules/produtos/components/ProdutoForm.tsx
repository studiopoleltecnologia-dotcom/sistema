import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { useModalidades } from '../../agenda/hooks/useAgenda'
import type { RequisitoInput } from '../api/produtos'
import { useSalvarProduto } from '../hooks/useProdutos'
import {
  REQUISITOS,
  TIPOS_PRODUTO,
  descreverCobranca,
  type Produto,
  type TipoProduto,
  type TipoRequisito,
} from '../types'

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'
const ajudaCls = 'mt-1 text-[11px] leading-snug text-neutral-400'

/**
 * Cadastro de produto. As seções aparecem conforme o tipo escolhido —
 * perguntar "acumula crédito?" para uma aula particular seria pedir uma
 * resposta que não significa nada.
 *
 * O que NÃO existe aqui de propósito: um campo por produto conhecido.
 * O formulário é o mesmo para plano mensal, cortesia e treino livre; o
 * que muda é a combinação de atributos. É isso que permite a equipe
 * inventar um produto novo sem ninguém tocar em código.
 */
export function ProdutoForm({
  produto,
  modalidadesIniciais,
  requisitosIniciais,
  onFechar,
}: {
  produto: Produto | null
  modalidadesIniciais: string[]
  requisitosIniciais: RequisitoInput[]
  onFechar: () => void
}) {
  const salvar = useSalvarProduto()
  const { data: modalidades } = useModalidades()

  const [tipo, setTipo] = useState<TipoProduto>(produto?.tipo_produto ?? 'plano')
  const [nome, setNome] = useState(produto?.nome ?? '')
  const [descricao, setDescricao] = useState(produto?.descricao ?? '')
  const [preco, setPreco] = useState(
    produto ? String(produto.preco_centavos / 100).replace('.', ',') : '',
  )
  const [recorrente, setRecorrente] = useState(produto?.renova_automaticamente ?? true)
  const [periodicidade, setPeriodicidade] = useState(String(produto?.periodicidade_dias ?? 30))
  const [ciclos, setCiclos] = useState(String(produto?.ciclos_compromisso ?? 1))

  const [geraCredito, setGeraCredito] = useState(produto?.gera_credito ?? true)
  const [creditos, setCreditos] = useState(String(produto?.creditos_por_ciclo ?? 4))
  const [validade, setValidade] = useState(
    produto?.validade_creditos_dias ? String(produto.validade_creditos_dias) : '',
  )
  const [acumula, setAcumula] = useState(produto?.acumula_creditos ?? false)
  const [tetoAcumulo, setTetoAcumulo] = useState(String(produto?.teto_acumulo_ciclos ?? 1))

  const [antecedencia, setAntecedencia] = useState(
    produto?.dias_antecedencia_agendamento ? String(produto.dias_antecedencia_agendamento) : '',
  )
  const [maxSimultaneos, setMaxSimultaneos] = useState(
    produto?.max_agendamentos_simultaneos ? String(produto.max_agendamentos_simultaneos) : '',
  )
  const [horasCancelamento, setHorasCancelamento] = useState(
    produto?.horas_cancelamento !== null && produto?.horas_cancelamento !== undefined
      ? String(produto.horas_cancelamento)
      : '',
  )
  const [limiteCliente, setLimiteCliente] = useState(
    produto?.limite_por_cliente ? String(produto.limite_por_cliente) : '',
  )
  const [descontoEventos, setDescontoEventos] = useState(
    String(produto?.desconto_eventos_pct ?? 0),
  )
  const [convidados, setConvidados] = useState(String(produto?.convidados_por_ciclo ?? 0))
  const [visivel, setVisivel] = useState(produto?.visivel_no_catalogo ?? true)

  const [modalidadeIds, setModalidadeIds] = useState<string[]>(modalidadesIniciais)
  const [requisitos, setRequisitos] = useState<RequisitoInput[]>(requisitosIniciais)
  const [erro, setErro] = useState<string | null>(null)

  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  function alternarRequisito(t: TipoRequisito) {
    setRequisitos((atual) =>
      atual.some((r) => r.tipo === t)
        ? atual.filter((r) => r.tipo !== t)
        : [
            ...atual,
            t === 'checkins_wellhub'
              ? { tipo: t, parametro_int: 4, janela_dias: 30 }
              : { tipo: t, parametro_int: null, janela_dias: null },
          ],
    )
  }

  function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!nome.trim()) return setErro('Dê um nome ao produto.')

    const precoCentavos = preco.trim() === '' ? 0 : parseCentavos(preco)
    if (precoCentavos === null || precoCentavos === undefined) {
      return setErro('Valor inválido. Use 170 ou 170,00 — e 0 para cortesia.')
    }

    const nCreditos = geraCredito ? Number(creditos) : 0
    if (geraCredito && (!Number.isFinite(nCreditos) || nCreditos <= 0)) {
      return setErro('Quantos créditos este produto entrega?')
    }

    salvar.mutate(
      {
        id: produto?.id ?? null,
        dados: {
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          tipo_produto: tipo,
          preco_centavos: precoCentavos,
          renova_automaticamente: recorrente,
          periodicidade_dias: Number(periodicidade) || 30,
          ciclos_compromisso: recorrente ? Number(ciclos) || 1 : 1,
          gera_credito: geraCredito,
          creditos_por_ciclo: nCreditos,
          validade_creditos_dias: geraCredito ? num(validade) : null,
          acumula_creditos: geraCredito && acumula,
          teto_acumulo_ciclos: Number(tetoAcumulo) || 1,
          dias_antecedencia_agendamento: num(antecedencia),
          max_agendamentos_simultaneos: num(maxSimultaneos),
          horas_cancelamento: num(horasCancelamento),
          limite_por_cliente: num(limiteCliente),
          desconto_eventos_pct: Number(descontoEventos) || 0,
          convidados_por_ciclo: Number(convidados) || 0,
          visivel_no_catalogo: visivel,
        },
        modalidadeIds,
        requisitos,
      },
      {
        onSuccess: onFechar,
        onError: (e) => setErro((e as Error).message),
      },
    )
  }

  // Prévia da frase que o aluno vai ler. Montar a partir do estado atual,
  // e não do produto salvo, é o que deixa a pessoa ver na hora que
  // "recorrente" desmarcado muda a promessa que está sendo feita.
  const previa = descreverCobranca({
    preco_centavos: preco.trim() === '' ? 0 : (parseCentavos(preco) ?? 0),
    renova_automaticamente: recorrente,
    periodicidade_dias: Number(periodicidade) || 30,
    ciclos_compromisso: recorrente ? Number(ciclos) || 1 : 1,
  } as Produto)

  return (
    <Modal title={produto ? 'Editar produto' : 'Novo produto'} onFechar={onFechar} size="lg">
      <form onSubmit={submeter} className="flex flex-col gap-5">
        <Secao titulo="O que é">
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_PRODUTO.map((t) => (
              <button
                key={t.valor}
                type="button"
                onClick={() => {
                  setTipo(t.valor)
                  // Defaults coerentes com o tipo — a pessoa ainda pode
                  // mudar tudo, mas não começa com uma combinação absurda.
                  if (t.valor === 'plano') {
                    setRecorrente(true)
                    setGeraCredito(true)
                  } else if (t.valor === 'pacote') {
                    setRecorrente(false)
                    setGeraCredito(true)
                  } else {
                    setRecorrente(false)
                    setGeraCredito(false)
                  }
                }}
                aria-pressed={tipo === t.valor}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  tipo === t.valor
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className={ajudaCls}>{TIPOS_PRODUTO.find((t) => t.valor === tipo)?.ajuda}</p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Nome *</label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Mensal 8 créditos"
                className="w-full"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Valor</label>
              <Input
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                placeholder="0 para cortesia"
                className="w-full"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className={labelCls}>Descrição (aparece para o aluno)</label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Válido para todas as modalidades da grade"
              className="w-full"
            />
          </div>
        </Secao>

        <Secao titulo="Como cobra">
          <Marcador
            checked={recorrente}
            onChange={setRecorrente}
            label="Cobrança recorrente (renova sozinha até o aluno cancelar)"
          />
          {recorrente && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>A cada quantos dias</label>
                <Input
                  type="number"
                  min={1}
                  value={periodicidade}
                  onChange={(e) => setPeriodicidade(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className={labelCls}>Permanência mínima (ciclos)</label>
                <Input
                  type="number"
                  min={1}
                  value={ciclos}
                  onChange={(e) => setCiclos(e.target.value)}
                  className="w-full"
                />
                <p className={ajudaCls}>1 = sem compromisso. 6 = semestral.</p>
              </div>
            </div>
          )}
          <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            O aluno vai ler: <strong>{previa}</strong>
          </p>
        </Secao>

        <Secao titulo="O que entrega">
          <Marcador
            checked={geraCredito}
            onChange={setGeraCredito}
            label="Entrega créditos para agendar aulas da grade"
          />
          {geraCredito ? (
            <>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>
                    Quantos créditos {recorrente ? 'por ciclo' : 'na compra'}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={creditos}
                    onChange={(e) => setCreditos(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className={labelCls}>Validade dos créditos (dias)</label>
                  <Input
                    value={validade}
                    onChange={(e) => setValidade(e.target.value)}
                    placeholder={recorrente ? 'vazio = até o fim do ciclo' : 'ex.: 30'}
                    className="w-full"
                  />
                </div>
              </div>
              {recorrente && (
                <div className="mt-3">
                  <Marcador
                    checked={acumula}
                    onChange={setAcumula}
                    label="Crédito que sobra passa para o ciclo seguinte"
                  />
                  {acumula && (
                    <div className="mt-2 max-w-[16rem]">
                      <label className={labelCls}>Acumula até quantos ciclos</label>
                      <Input
                        type="number"
                        min={0}
                        value={tetoAcumulo}
                        onChange={(e) => setTetoAcumulo(e.target.value)}
                        className="w-full"
                      />
                      <p className={ajudaCls}>
                        1 = o saldo nunca passa do dobro do plano.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className={ajudaCls}>
              Aula particular e treino livre entram aqui: o horário é combinado à parte e não
              consome crédito de plano.
            </p>
          )}
        </Secao>

        {geraCredito && (
          <Secao titulo="Regras de uso">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Agendar com até quantos dias de antecedência</label>
                <Input
                  value={antecedencia}
                  onChange={(e) => setAntecedencia(e.target.value)}
                  placeholder="vazio = sem limite"
                  className="w-full"
                />
              </div>
              <div>
                <label className={labelCls}>Máximo de aulas agendadas ao mesmo tempo</label>
                <Input
                  value={maxSimultaneos}
                  onChange={(e) => setMaxSimultaneos(e.target.value)}
                  placeholder="vazio = sem limite"
                  className="w-full"
                />
              </div>
              <div>
                <label className={labelCls}>Cancelamento: horas de antecedência</label>
                <Input
                  value={horasCancelamento}
                  onChange={(e) => setHorasCancelamento(e.target.value)}
                  placeholder="vazio = usa a regra da casa"
                  className="w-full"
                />
              </div>
              <div>
                <label className={labelCls}>Limite de compras por aluno</label>
                <Input
                  value={limiteCliente}
                  onChange={(e) => setLimiteCliente(e.target.value)}
                  placeholder="vazio = sem limite"
                  className="w-full"
                />
                <p className={ajudaCls}>1 = uma por pessoa (aula experimental).</p>
              </div>
            </div>
            <p className={ajudaCls}>
              Estes limites ainda não bloqueiam o agendamento — passam a valer na etapa das
              regras de uso. Cadastrar agora deixa o valor pronto.
            </p>
          </Secao>
        )}

        <Secao titulo="Modalidades cobertas">
          <p className={ajudaCls}>
            Nenhuma marcada = vale para todas as modalidades da grade.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(modalidades ?? []).map((m) => {
              const marcada = modalidadeIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setModalidadeIds((atual) =>
                      marcada ? atual.filter((x) => x !== m.id) : [...atual, m.id],
                    )
                  }
                  aria-pressed={marcada}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    marcada
                      ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-300'
                      : 'bg-white text-neutral-500 ring-1 ring-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  {m.nome}
                </button>
              )
            })}
          </div>
        </Secao>

        <Secao titulo="Quem pode comprar">
          <div className="flex flex-col gap-2">
            {REQUISITOS.map((r) => {
              const atual = requisitos.find((x) => x.tipo === r.valor)
              return (
                <div key={r.valor}>
                  <Marcador
                    checked={Boolean(atual)}
                    onChange={() => alternarRequisito(r.valor)}
                    label={r.label}
                  />
                  {atual && r.valor === 'checkins_wellhub' && (
                    <div className="ml-6 mt-2 flex items-end gap-2">
                      <div className="w-24">
                        <label className={labelCls}>Quantos</label>
                        <Input
                          type="number"
                          min={1}
                          value={String(atual.parametro_int ?? 4)}
                          onChange={(e) =>
                            setRequisitos((a) =>
                              a.map((x) =>
                                x.tipo === r.valor
                                  ? { ...x, parametro_int: Number(e.target.value) }
                                  : x,
                              ),
                            )
                          }
                          className="w-full"
                        />
                      </div>
                      <div className="w-32">
                        <label className={labelCls}>Nos últimos (dias)</label>
                        <Input
                          type="number"
                          min={1}
                          value={String(atual.janela_dias ?? 30)}
                          onChange={(e) =>
                            setRequisitos((a) =>
                              a.map((x) =>
                                x.tipo === r.valor
                                  ? { ...x, janela_dias: Number(e.target.value) }
                                  : x,
                              ),
                            )
                          }
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Secao>

        <Secao titulo="Benefícios e visibilidade">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Desconto em aulões e workshops (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={descontoEventos}
                onChange={(e) => setDescontoEventos(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className={labelCls}>Convidados por ciclo</label>
              <Input
                type="number"
                min={0}
                value={convidados}
                onChange={(e) => setConvidados(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <div className="mt-3">
            <Marcador
              checked={!visivel}
              onChange={(v) => setVisivel(!v)}
              label="Só a gestão pode vender (não aparece para o aluno)"
            />
            <p className={ajudaCls}>
              É assim que se faz um <strong>plano personalizado</strong> (valor negociado para uma
              pessoa) ou um <strong>pacote de cortesia</strong>. O aluno não vê nem consegue
              contratar pelo portal — a trava está no banco, não só nesta tela.
            </p>
          </div>
        </Secao>

        {erro && <p className="text-sm text-danger-600">{erro}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
          <span className="mr-auto text-xs text-neutral-400">
            {preco.trim() === '' || parseCentavos(preco) === 0
              ? 'Cortesia'
              : fmtCentavos(parseCentavos(preco) ?? 0)}
          </span>
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            {produto ? 'Salvar' : 'Criar produto'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="border-b border-neutral-100 pb-4 last:border-b-0 last:pb-0">
      <h3 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-neutral-500">
        {titulo}
      </h3>
      {children}
    </div>
  )
}

function Marcador({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-brand-600"
      />
      {label}
    </label>
  )
}
