import { useMemo, useState, type FormEvent } from 'react'
import { CalendarClock, Plus, Repeat, RotateCcw, Trash2, TrendingDown, TriangleAlert, Wallet } from 'lucide-react'
import { useConfirmar } from '../../../components/ui/ConfirmarAcao'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { CardColapsavel, type ChipTom } from '../../../components/ui/CardColapsavel'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { KpiCard } from '../../../components/ui/KpiCard'
import { Modal } from '../../../components/ui/Modal'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionTitle } from '../../../components/ui/SectionTitle'
import { Select } from '../../../components/ui/Select'
import { Tabs } from '../../../components/ui/Tabs'
import { cn } from '../../../components/ui/cn'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { ListaAPagar, type BucketKey, type ItemAPagar } from '../components/ListaAPagar'
import { RecorrentesCard } from '../components/RecorrentesCard'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { mesAtual, periodoMes, type Periodo } from '../periodo'
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
  const [novaRecorrencia, setNovaRecorrencia] = useState(false)

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
    for (const p of aPagar ?? []) {
      const grupo: GrupoSaida = p.divida_id ? 'divida' : grupoDoTipo(p.tipo)
      m.get(grupo)!.push({
        id: p.id!,
        valor: p.valor_centavos!,
        categoria: p.categoria ?? '—',
        descricao: p.descricao || '—',
        venc: p.vencimento!,
        competencia: p.competencia,
        bucket: p.bucket as BucketKey,
        acao: () =>
          p.origem === 'recorrente'
            ? lancar.mutate({
                recorrente: {
                  id: p.id!,
                  descricao: p.descricao ?? '',
                  valor_centavos: p.valor_centavos!,
                  categoria_id: p.categoria_id!,
                  dia_vencimento: Number(p.vencimento!.slice(8, 10)),
                },
                mes: p.vencimento!.slice(0, 7),
              })
            : atualizarSaida.mutate({ id: p.id!, patch: { status_saida: 'paga', data_caixa: hoje } }),
      })
    }
    return m
  }, [aPagar, hoje, atualizarSaida, lancar])

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
    if (grupo === 'fixa') setNovaRecorrencia(true)
    else setNovaSaida({ tipo: 'variavel' })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Saídas"
        subtitulo="Tudo que sai do caixa — fixo, variável e dívidas"
        acoes={
          <Button onClick={() => setNovaSaida({ tipo: 'variavel' })}>
            <Plus className="size-4" />
            Nova saída
          </Button>
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
                <span className="text-sm font-semibold tabular-nums text-neutral-700">{fmtCentavos(somaPagas(grupo))}</span>
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
              <Secao titulo="A pagar" total={somaPendentes(grupo)} cor="text-warning-700">
                <ListaAPagar itens={pendentes} modo={modo} />
              </Secao>

              <Secao titulo="Pago" total={somaPagas(grupo)} cor="text-success-700">
                {pagas.length === 0 ? (
                  <EmptyState title="Nada pago neste período." />
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {pagas.map((s) => (
                      <li key={s.id} className={cn(LINHA_BASE, STATUS_FIN.pago.barra)}>
                        <span className={cn('w-24 shrink-0 font-semibold tabular-nums', STATUS_FIN.pago.valor)}>
                          {fmtCentavos(s.valor_centavos)}
                        </span>
                        <Badge variant="neutral">{s.categoria?.nome}</Badge>
                        <span className="flex-1 truncate text-neutral-500">
                          {s.descricao}
                          {s.recorrente_id && (
                            <Repeat
                              className="ml-1.5 inline-block size-3 text-brand-500"
                              aria-label="De uma recorrência"
                            />
                          )}
                        </span>
                        <span className="hidden shrink-0 text-xs text-neutral-400 sm:inline">{fmtData(s.data_caixa)}</span>

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
                )}
              </Secao>

              {grupo === 'fixa' && (
                <RecorrentesCard
                  novoAberto={novaRecorrencia}
                  onNovo={() => setNovaRecorrencia(true)}
                  onFecharNovo={() => setNovaRecorrencia(false)}
                />
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
