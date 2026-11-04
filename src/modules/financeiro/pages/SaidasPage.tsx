import { useMemo, useState, type FormEvent } from 'react'
import { CalendarClock, Pencil, Plus, Repeat, RotateCcw, Trash2, TrendingDown, TriangleAlert, Wallet } from 'lucide-react'
import { useConfirmar } from '../../../components/ui/ConfirmarAcao'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { CardColapsavel, type ChipTom } from '../../../components/ui/CardColapsavel'
import { Input } from '../../../components/ui/Input'
import { KpiCard } from '../../../components/ui/KpiCard'
import { Modal } from '../../../components/ui/Modal'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionTitle } from '../../../components/ui/SectionTitle'
import { Select } from '../../../components/ui/Select'
import { Tabs } from '../../../components/ui/Tabs'
import { cn } from '../../../components/ui/cn'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { ContasFixasModal } from '../components/ContasFixas'
import { ListaAPagar, type BucketKey, type ItemAPagar } from '../components/ListaAPagar'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { DataEditavel, TextoEditavel, ValorEditavel } from '../components/CamposEditaveis'
import { contemMes, mesAtual, periodoMes, type Periodo } from '../periodo'
import {
  useAtualizarSaida,
  useCategoriasSaida,
  useContasAPagar,
  useCriarCategoriaSaida,
  useCriarSaida,
  useExcluirSaida,
  useLancarRecorrente,
  useReverterPagamentoSaida,
  useSaidas,
} from '../hooks/useFinanceiro'
import { LINHA_BASE, STATUS_FIN } from '../statusVisual'
import {
  GRUPO_SAIDA_DESCRICAO,
  GRUPO_SAIDA_LABEL,
  ORDEM_GRUPO_SAIDA,
  ORDEM_TIPO_SAIDA,
  TIPO_SAIDA_LABEL,
  grupoDoTipo,
  type GrupoSaida,
  type TipoSaida,
} from '../types'

const hojeISO = () => new Date().toISOString().slice(0, 10)

/** Um tom por grupo — a caixinha do título identifica a seção de longe. */
const CHIP_GRUPO: Record<GrupoSaida, ChipTom> = {
  fixa: 'brand',
  variavel: 'warning',
  divida: 'neutral',
}

/**
 * Saídas em três grupos — Fixo recorrente, Variável e Dívidas —, cada um
 * com o que ainda vai sair ("A pagar") e o que já saiu ("Pago") dentro do
 * próprio grupo.
 *
 * A versão anterior tinha "A pagar" como bloco irmão dos tipos, o que
 * obrigava a olhar em dois lugares para responder "quanto o aluguel me
 * custa". O grupo Dívidas não existe em `tipo_saida`: é derivado de
 * `divida_id`, porque abatimento de empréstimo sai do caixa mas não é
 * despesa (fica fora do DRE).
 */
export function SaidasPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(mesAtual()))
  const [modo, setModo] = useState<'lista' | 'calendario'>('lista')
  const [novaSaida, setNovaSaida] = useState<{ tipo: TipoSaida } | null>(null)
  // null = fechado; { nova: true } = abre já no formulário (vindo do "+").
  const [contasFixas, setContasFixas] = useState<{ nova: boolean } | null>(null)

  const { data: saidas, isLoading } = useSaidas(periodo)
  const { data: aPagar } = useContasAPagar()
  const excluir = useExcluirSaida()
  const confirmar = useConfirmar()
  const reverter = useReverterPagamentoSaida()
  const atualizarSaida = useAtualizarSaida()
  const lancar = useLancarRecorrente()
  const hoje = hojeISO()

  // "A pagar" de todos os grupos vem de uma consulta só; o mapeamento para
  // a ação de pagar (lançar recorrente x quitar saída prevista) mora aqui
  // para a lista ser puramente de apresentação.
  const pendentesPorGrupo = useMemo(() => {
    const m = new Map<GrupoSaida, ItemAPagar[]>(ORDEM_GRUPO_SAIDA.map((g) => [g, []]))
    const periodoContemHoje = contemMes(periodo, hoje.slice(0, 7))

    /*
      "A pagar" vinha SEM filtro de período, enquanto o resto da tela
      respeitava o seletor. Para fixo e variável quase não se notava; para
      dívidas, as 12 parcelas do parcelamento inteiro apareciam somadas no
      card de um mês só — o total do grupo era o do empréstimo todo, não o
      do mês, e não havia como ler "quanto sai em novembro".

      Vencido continua à vista quando se olha o mês corrente: esconder uma
      conta atrasada é o oposto do que esta tela serve para fazer.
    */
    const dentroDoPeriodo = (venc: string) =>
      contemMes(periodo, venc.slice(0, 7)) || (periodoContemHoje && venc < hoje)

    for (const p of aPagar ?? []) {
      if (!dentroDoPeriodo(p.vencimento!)) continue
      const grupo: GrupoSaida = p.divida_id ? 'divida' : grupoDoTipo(p.tipo)
      const daRecorrente = p.origem === 'recorrente'
      const modelo = {
        id: p.id!,
        descricao: p.descricao ?? '',
        valor_centavos: p.valor_centavos!,
        categoria_id: p.categoria_id!,
        dia_vencimento: Number(p.vencimento!.slice(8, 10)),
      }
      const mes = p.vencimento!.slice(0, 7)
      m.get(grupo)!.push({
        id: p.id!,
        valor: p.valor_centavos!,
        categoria: p.categoria ?? '—',
        descricao: p.descricao || '—',
        venc: p.vencimento!,
        competencia: p.competencia,
        bucket: p.bucket as BucketKey,
        acao: () =>
          daRecorrente
            ? lancar.mutate({ recorrente: modelo, mes })
            : atualizarSaida.mutate({ id: p.id!, patch: { status_saida: 'paga', data_caixa: hoje } }),
        /*
          Conta fixa ainda não lançada não é uma linha no banco — é uma
          projeção do modelo recorrente. Então editar o valor dela lança o
          mês com o valor novo (como "A pagar", não como paga), em vez de
          mexer no modelo: "a internet veio mais cara em novembro" não quer
          dizer que ela mudou de preço para sempre. Para mudar todo mês,
          é em Contas fixas.
        */
        aoEditarValor: (centavos) =>
          daRecorrente
            ? lancar.mutate({ recorrente: modelo, mes, ajuste: { valorCentavos: centavos }, comoPrevista: true })
            : atualizarSaida.mutate({ id: p.id!, patch: { valor_centavos: centavos } }),
        aoEditarDescricao: (texto) =>
          daRecorrente
            ? lancar.mutate({ recorrente: modelo, mes, ajuste: { descricao: texto }, comoPrevista: true })
            : atualizarSaida.mutate({ id: p.id!, patch: { descricao: texto || null } }),
        /*
          Só `data_prevista` muda. `data_caixa` segue sendo a âncora do mês
          a que a conta pertence — é por ela que a view sabe que a
          recorrente do mês já foi lançada, e é ela que vira a data real no
          dia em que a conta for paga.
        */
        aoEditarVencimento: (iso) =>
          daRecorrente
            ? lancar.mutate({ recorrente: modelo, mes, ajuste: { data: iso }, comoPrevista: true })
            : atualizarSaida.mutate({ id: p.id!, patch: { data_prevista: iso } }),
        dicaValor: daRecorrente
          ? 'Clique para mudar o valor só deste mês (a conta fixa continua como está)'
          : undefined,
      })
    }
    return m
  }, [aPagar, hoje, periodo, atualizarSaida, lancar])

  const pagasPorGrupo = useMemo(() => {
    const m = new Map<GrupoSaida, NonNullable<typeof saidas>>(ORDEM_GRUPO_SAIDA.map((g) => [g, []]))
    for (const s of saidas ?? []) {
      const grupo: GrupoSaida = s.divida_id ? 'divida' : grupoDoTipo(s.categoria?.tipo)
      m.get(grupo)!.push(s)
    }
    return m
  }, [saidas])

  const somaPagas = (g: GrupoSaida) => (pagasPorGrupo.get(g) ?? []).reduce((s, x) => s + x.valor_centavos, 0)
  const somaPendentes = (g: GrupoSaida) => (pendentesPorGrupo.get(g) ?? []).reduce((s, x) => s + x.valor, 0)

  const totalPago = ORDEM_GRUPO_SAIDA.reduce((s, g) => s + somaPagas(g), 0)
  const totalAberto = ORDEM_GRUPO_SAIDA.reduce((s, g) => s + somaPendentes(g), 0)
  const atrasado = (aPagar ?? [])
    .filter((p) => p.bucket === 'atrasada')
    .reduce((s, p) => s + (p.valor_centavos ?? 0), 0)

  function abrirNovo(grupo: GrupoSaida) {
    if (grupo === 'fixa') setContasFixas({ nova: true })
    else setNovaSaida({ tipo: 'variavel' })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Saídas"
        subtitulo="Tudo que sai do caixa — fixo, variável e dívidas"
        acoes={
          <>
            {/*
              O cadastro das contas fixas é tarefa rara e ficava enterrado no
              fim de um card recolhível, misturado à leitura diária de "o que
              ainda tenho para pagar". Subiu para um botão próprio.
            */}
            <Button variant="secondary" onClick={() => setContasFixas({ nova: false })}>
              <Repeat className="size-4" />
              <span className="hidden sm:inline">Contas fixas</span>
            </Button>
            <Button onClick={() => setNovaSaida({ tipo: 'variavel' })}>
              <Plus className="size-4" />
              Nova saída
            </Button>
          </>
        }
        filtros={
          <>
            <SeletorPeriodo periodo={periodo} onChange={setPeriodo} />
            <Tabs
              value={modo}
              onChange={setModo}
              size="sm"
              items={[
                { value: 'lista', label: 'Lista' },
                { value: 'calendario', label: 'Calendário' },
              ]}
            />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Pago no período" value={fmtCentavos(totalPago)} icon={TrendingDown} tone="danger" />
        <KpiCard
          label="A pagar em aberto"
          value={fmtCentavos(totalAberto)}
          icon={CalendarClock}
          tone={totalAberto > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          label="Em atraso"
          value={fmtCentavos(atrasado)}
          icon={TriangleAlert}
          tone={atrasado > 0 ? 'danger' : 'neutral'}
        />
        <KpiCard
          label="Dívidas a pagar"
          value={fmtCentavos(somaPendentes('divida'))}
          icon={Wallet}
          tone="neutral"
          hint="parcelas programadas"
        />
      </div>

      {/*
        O valor editável só se anuncia no hover, e hover não ensina nada a
        quem não passou o mouse ali. Uma linha diz o que a tela ganhou.
      */}
      <p className="-mb-2 flex items-center gap-1.5 text-xs text-neutral-400">
        <Pencil className="size-3" />
        Clique em qualquer valor para corrigi-lo — previsto ou já pago.
      </p>

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {ORDEM_GRUPO_SAIDA.map((grupo) => {
        const pendentes = pendentesPorGrupo.get(grupo) ?? []
        const pagas = pagasPorGrupo.get(grupo) ?? []
        return (
          <CardColapsavel
            key={grupo}
            title={GRUPO_SAIDA_LABEL[grupo]}
            chip={CHIP_GRUPO[grupo]}
            subtitle={GRUPO_SAIDA_DESCRICAO[grupo]}
            persistKey={`fin-saidas-grupo-${grupo}`}
            forcarAberto={pendentes.some((p) => p.bucket === 'atrasada')}
            right={
              <div className="flex items-center gap-2">
                {/*
                  Antes havia um número só, sem rótulo, ao lado de um KPI
                  chamado "A pagar" — e ele era o PAGO. Os dois agora vêm
                  nomeados, porque é a pergunta que se faz olhando o card.
                */}
                <div className="text-right leading-tight">
                  {somaPendentes(grupo) > 0 && (
                    <div className="text-sm font-semibold tabular-nums text-warning-700">
                      {fmtCentavos(somaPendentes(grupo))}{' '}
                      <span className="text-[10px] font-normal text-neutral-400">a pagar</span>
                    </div>
                  )}
                  <div className="text-sm font-semibold tabular-nums text-neutral-700">
                    {fmtCentavos(somaPagas(grupo))}{' '}
                    <span className="text-[10px] font-normal text-neutral-400">pago</span>
                  </div>
                </div>
                <button
                  onClick={() => abrirNovo(grupo)}
                  title={`Adicionar em ${GRUPO_SAIDA_LABEL[grupo]}`}
                  className="rounded-md p-1 text-neutral-400 transition hover:bg-brand-50 hover:text-brand-600"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            }
          >
            <div className="flex flex-col gap-5">
              {/*
                Seção vazia não é desenhada. Com os três grupos abertos, a
                tela chegava a mostrar seis títulos e até quatro caixas de
                "nada aqui" — ruído que escondia as duas ou três linhas que
                de fato importavam no mês.
              */}
              {pendentes.length > 0 && (
                <Secao titulo="A pagar" total={somaPendentes(grupo)} cor="text-warning-700">
                  <ListaAPagar itens={pendentes} modo={modo} />
                </Secao>
              )}

              {pagas.length > 0 && (
                <Secao titulo="Pago" total={somaPagas(grupo)} cor="text-success-700">
                  <ul className="flex flex-col gap-1.5">
                    {pagas.map((s) => (
                      <li key={s.id} className={cn(LINHA_BASE, STATUS_FIN.pago.barra)}>
                        <ValorEditavel
                          valor={s.valor_centavos}
                          onSalvar={(centavos) =>
                            atualizarSaida.mutate({ id: s.id, patch: { valor_centavos: centavos } })
                          }
                          className={STATUS_FIN.pago.valor}
                          dica={
                            s.fechamento_id
                              ? 'Valor da folha desta professora. Corrigir aqui vale para o caixa; reaprovar o fechamento sobrescreve.'
                              : 'Clique para corrigir o valor pago'
                          }
                        />
                        <Badge variant="neutral">{s.categoria?.nome}</Badge>
                        <TextoEditavel
                          valor={s.descricao ?? ''}
                          onSalvar={(texto) =>
                            atualizarSaida.mutate({ id: s.id, patch: { descricao: texto || null } })
                          }
                          className="text-neutral-500"
                        />
                        {s.recorrente_id && (
                          <Repeat
                            className="size-3 shrink-0 text-brand-500"
                            aria-label="De uma recorrência"
                          />
                        )}
                        <div className="hidden sm:block">
                          <DataEditavel
                            valor={s.data_caixa}
                            onSalvar={(iso) =>
                              atualizarSaida.mutate({ id: s.id, patch: { data_caixa: iso } })
                            }
                            dica="Clique para corrigir a data em que o dinheiro saiu"
                          />
                        </div>

                        {/*
                          Reverter status e excluir são ações separadas de
                          propósito: antes havia só um "X", que parecia apagar
                          a despesa quando a intenção era desmarcar o pagamento.
                        */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => reverter.mutate(s.id)}
                          title="Voltar para A pagar (não exclui a despesa)"
                        >
                          <RotateCcw className="size-3.5" />
                          <span className="hidden sm:inline">Marcar como não pago</span>
                        </Button>
                        <button
                          onClick={() =>
                            confirmar.pedir({
                              titulo: 'Excluir esta despesa?',
                              descricao: (
                                <>
                                  <b>
                                    {s.descricao || s.categoria?.nome} —{' '}
                                    {fmtCentavos(s.valor_centavos)}
                                  </b>{' '}
                                  sai do fluxo de caixa e do DRE do período.
                                  <br />
                                  Para só desfazer o pagamento, use “Marcar como não pago”.
                                </>
                              ),
                              aoConfirmar: () => excluir.mutateAsync(s.id),
                            })
                          }
                          title="Excluir lançamento"
                          className="ml-1 shrink-0 rounded p-1 text-neutral-300 transition hover:bg-danger-50 hover:text-danger-600"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </Secao>
              )}

              {pendentes.length === 0 && pagas.length === 0 && (
                <p className="text-sm text-neutral-400">Nada neste período.</p>
              )}

              {grupo === 'fixa' && (
                <p className="text-[11px] text-neutral-400">
                  As contas que repetem todo mês ficam em <strong>Contas fixas</strong>, no topo
                  desta tela. O que está cadastrado lá aparece aqui sozinho, no dia de cada uma.
                </p>
              )}

              {grupo === 'divida' && (
                <p className="text-[11px] text-neutral-400">
                  Cadastro e cronograma das dívidas ficam na aba <strong>Dívidas</strong>. As parcelas
                  programadas lá aparecem aqui sozinhas, no mês de cada uma.
                </p>
              )}
            </div>
          </CardColapsavel>
        )
      })}

      {novaSaida && <NovaSaidaModal tipoInicial={novaSaida.tipo} onFechar={() => setNovaSaida(null)} />}
      {contasFixas && (
        <ContasFixasModal
          iniciarEmNova={contasFixas.nova}
          onFechar={() => setContasFixas(null)}
        />
      )}
      {confirmar.dialogo}
    </div>
  )
}

function Secao({
  titulo,
  total,
  cor,
  children,
}: {
  titulo: string
  total: number
  cor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <SectionTitle cor={cor} direita={fmtCentavos(total)}>
        {titulo}
      </SectionTitle>
      {children}
    </div>
  )
}

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

function NovaSaidaModal({ tipoInicial, onFechar }: { tipoInicial: TipoSaida; onFechar: () => void }) {
  const { data: categorias } = useCategoriasSaida()
  const criar = useCriarSaida()
  const criarCategoria = useCriarCategoriaSaida()

  const hoje = hojeISO()
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [data, setData] = useState(hoje)
  const [nova, setNova] = useState<{ nome: string; tipo: TipoSaida } | null>(null)

  const categoriasPorTipo = (tipo: TipoSaida) => (categorias ?? []).filter((c) => c.tipo === tipo)

  function salvarCategoria() {
    if (!nova?.nome.trim()) return
    criarCategoria.mutate(
      { nome: nova.nome.trim(), tipo: nova.tipo },
      { onSuccess: (cat) => { setCategoriaId(cat.id); setNova(null) } },
    )
  }

  function lancar(ev: FormEvent) {
    ev.preventDefault()
    const centavos = parseCentavos(valor)
    if (!centavos || !categoriaId) return
    criar.mutate(
      {
        descricao: descricao.trim() || null,
        valor_centavos: centavos,
        categoria_id: categoriaId,
        data_caixa: data,
        data_competencia: `${data.slice(0, 7)}-01`,
      },
      { onSuccess: onFechar },
    )
  }

  return (
    <Modal title="Nova saída" onFechar={onFechar}>
      <form onSubmit={lancar}>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Valor *</label>
            <Input value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="R$ 0,00" required autoFocus />
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <Input value={descricao} onChange={(ev) => setDescricao(ev.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <label className={labelCls}>Categoria *</label>
            <Select
              value={categoriaId}
              onChange={(ev) =>
                ev.target.value === '__nova__' ? setNova({ nome: '', tipo: tipoInicial }) : setCategoriaId(ev.target.value)
              }
              required
            >
              <option value="">Escolha…</option>
              {ORDEM_TIPO_SAIDA.map((tipo) => (
                <optgroup key={tipo} label={TIPO_SAIDA_LABEL[tipo]}>
                  {categoriasPorTipo(tipo).map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </optgroup>
              ))}
              <option value="__nova__">+ Nova categoria…</option>
            </Select>
          </div>

          {nova && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-neutral-50 p-3">
              <div className="flex-1">
                <label className={labelCls}>Nome</label>
                <Input
                  autoFocus
                  value={nova.nome}
                  onChange={(ev) => setNova({ ...nova, nome: ev.target.value })}
                  placeholder="Ex.: Energia"
                />
              </div>
              <Select
                value={nova.tipo}
                onChange={(ev) => setNova({ ...nova, tipo: ev.target.value as TipoSaida })}
                className="w-36"
              >
                {ORDEM_TIPO_SAIDA.map((tipo) => (
                  <option key={tipo} value={tipo}>{TIPO_SAIDA_LABEL[tipo]}</option>
                ))}
              </Select>
              <Button size="sm" type="button" onClick={salvarCategoria} loading={criarCategoria.isPending}>
                Criar
              </Button>
            </div>
          )}

          <div>
            <label className={labelCls}>Data</label>
            <Input type="date" value={data} onChange={(ev) => setData(ev.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800"
          >
            Cancelar
          </button>
          <Button type="submit" loading={criar.isPending}>
            <Plus className="size-4" />
            Lançar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
