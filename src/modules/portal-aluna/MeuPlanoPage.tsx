import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Coins, FileText, Sparkles } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { mensagemDoBanco } from './aulas'
import { Aviso, Cabecalho, Carregando, Cartao, Dado, ErroCarregar } from './components/Basicos'
import { Folha } from './components/Folha'
import { fmtPreco } from './components/planos/catalogo'
import { RegrasDoPlano } from './components/RegrasDoPlano'
import { SolicitarCancelamento } from './components/SolicitarCancelamento'
import {
  fmtDataCompleta,
  fmtDataHora,
  fmtDiaMes,
  fmtHoraCurta,
  hojeIso,
  nomeDiaPlural,
} from './datas'
import {
  useMeusLotes,
  useMeusPlanos,
  useMinhasTurmasFixas,
  useRetirarSolicitacao,
} from './hooks/usePortalAluna'
import {
  FORMATO_ROTULO,
  SITUACAO,
  ativoAte,
  fmtCreditos,
  formatoDoPlano,
  periodoDoPlano,
  podeSolicitarCancelamento,
  precoDoPlano,
  proximaRenovacaoEfetiva,
  separarPlanos,
  situacaoDoPlano,
  tituloDoPlano,
} from './plano'
import type { LoteCredito, MeuPlano, TurmaFixa } from './types'

/**
 * Meu plano.
 *
 * Em cinco segundos o aluno precisa responder: qual é o meu plano, está
 * ativo, até quando vale, quando renova, quanto custa e o que tenho
 * disponível. Essas seis respostas ficam no primeiro cartão; o resto
 * (datas de contrato, forma de pagamento, modalidades) vem depois, e o
 * regulamento só abre quando pedido.
 *
 * A regra de cancelamento aparece AQUI, ao lado da data de renovação —
 * antes de o aluno precisar dela, não só quando ele clica em cancelar.
 *
 * Aluno com mais de um contrato (créditos + turma fixa, ou plano + aula
 * avulsa) vê cada um no seu bloco: são regras diferentes e não podem se
 * misturar num número só.
 */
export function MeuPlanoPage() {
  const planos = useMeusPlanos()
  const turmas = useMinhasTurmasFixas()
  const lotes = useMeusLotes()
  const [regrasDe, setRegrasDe] = useState<MeuPlano | null>(null)
  const [cancelarDe, setCancelarDe] = useState<MeuPlano | null>(null)

  const hoje = hojeIso()
  const { principais, pacotes, ultimoEncerrado } = separarPlanos(planos.data ?? [], hoje)

  return (
    <div>
      <Cabecalho
        titulo="Meu plano"
        acao={
          <Link
            to="../planos"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
          >
            <Sparkles className="size-4" />
            Conhecer planos
          </Link>
        }
      />

      {planos.error ? (
        <ErroCarregar onTentar={() => planos.refetch()} />
      ) : planos.isLoading ? (
        <Carregando linhas={2} />
      ) : principais.length === 0 && pacotes.length === 0 ? (
        <SemPlano encerrado={ultimoEncerrado} />
      ) : (
        <div className="flex flex-col gap-8">
          {principais.map((p) => (
            <PlanoDetalhado
              key={p.matricula_id}
              plano={p}
              turmas={(turmas.data ?? []).filter((t) => t.matricula_id === p.matricula_id)}
              lotes={(lotes.data ?? []).filter((l) => l.matricula_id === p.matricula_id)}
              onRegras={() => setRegrasDe(p)}
              onCancelar={() => setCancelarDe(p)}
            />
          ))}

          {pacotes.length > 0 && <OutrosPacotes pacotes={pacotes} lotes={lotes.data ?? []} />}
        </div>
      )}

      {regrasDe && (
        <Folha titulo="Regras do seu plano" onFechar={() => setRegrasDe(null)}>
          <RegrasDoPlano plano={regrasDe} />
        </Folha>
      )}

      {cancelarDe && <SolicitarCancelamento plano={cancelarDe} onFechar={() => setCancelarDe(null)} />}
    </div>
  )
}

// ------------------------------------------------------------
// Um contrato
// ------------------------------------------------------------

function PlanoDetalhado({
  plano: p,
  turmas,
  lotes,
  onRegras,
  onCancelar,
}: {
  plano: MeuPlano
  turmas: TurmaFixa[]
  lotes: LoteCredito[]
  onRegras: () => void
  onCancelar: () => void
}) {
  const formato = formatoDoPlano(p)
  const situacao = situacaoDoPlano(p)
  const { rotulo, variante } = SITUACAO[situacao]

  return (
    <section className="grid gap-4 lg:grid-cols-3 lg:gap-5">
      <div className="flex flex-col gap-4 lg:col-span-2">
        {/* ---- 1. O essencial ---- */}
        <Cartao destaque>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Badge variant={variante}>{rotulo}</Badge>
            <Badge variant="neutral">{FORMATO_ROTULO[formato]}</Badge>
            <Badge variant={p.ciclos_compromisso > 1 ? 'brand' : 'neutral'}>{periodoDoPlano(p)}</Badge>
          </div>

          <h2 className="font-display text-2xl font-bold leading-tight text-ink lg:text-3xl">
            {tituloDoPlano(p)}
          </h2>
          {p.plano_nome !== tituloDoPlano(p) && <p className="mt-0.5 text-xs text-neutral-400">{p.plano_nome}</p>}

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Fato rotulo="Válido até">{fmtDataCompleta(ativoAte(p))}</Fato>
            <Fato rotulo="Próxima renovação">
              {proximaRenovacaoEfetiva(p) ? (
                fmtDataCompleta(proximaRenovacaoEfetiva(p))
              ) : (
                <span className="text-neutral-400">Não renova</span>
              )}
            </Fato>
            <Fato rotulo="Valor">{precoDoPlano(p)}</Fato>
            <Fato rotulo="Disponível">
              {formato === 'turma_fixa'
                ? `${turmas.length} ${turmas.length === 1 ? 'turma' : 'turmas'}`
                : fmtCreditos(p.saldo)}
            </Fato>
          </dl>

          <AvisoDePagamento plano={p} />
        </Cartao>

        {/* ---- 2. O que ele tem para usar ---- */}
        {formato === 'turma_fixa' ? (
          <MinhasTurmas turmas={turmas} />
        ) : (
          <MeusCreditos plano={p} lotes={lotes} />
        )}

        {/* ---- 3. Renovação e cancelamento ---- */}
        <RenovacaoECancelamento plano={p} onRegras={onRegras} onCancelar={onCancelar} />
      </div>

      {/* ---- 4. Detalhes do contrato ---- */}
      <div className="flex flex-col gap-4">
        <Cartao>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Detalhes do contrato
          </h3>
          <dl className="divide-y divide-neutral-100">
            <Dado rotulo="Formato">{FORMATO_ROTULO[formato]}</Dado>
            <Dado rotulo="Contrato">
              {p.ciclos_compromisso > 1
                ? `${periodoDoPlano(p)} · ${p.ciclos_compromisso} ciclos`
                : 'Mensal · sem compromisso'}
            </Dado>
            <Dado rotulo="Ciclo">
              {p.ciclos_compromisso > 1 && p.ciclo_atual <= p.ciclos_compromisso
                ? `${p.ciclo_atual}º de ${p.ciclos_compromisso}`
                : `${p.ciclo_atual}º`}{' '}
              · {p.periodicidade_dias} dias
            </Dado>
            <Dado rotulo="Contratado em">{fmtDataCompleta(p.data_contratacao)}</Dado>
            <Dado rotulo="Ciclo atual">
              {fmtDiaMes(p.data_inicio)} a {fmtDataCompleta(p.data_fim)}
            </Dado>
            {p.fim_compromisso && <Dado rotulo="Compromisso até">{fmtDataCompleta(p.fim_compromisso)}</Dado>}
            <Dado rotulo="Valor">{precoDoPlano(p)}</Dado>
            <Dado rotulo="Renovação automática">{p.renova_automaticamente && !p.cancelada_em ? 'Sim' : 'Não'}</Dado>
            {/* Ainda não há cobrança pelo sistema (backlog A3): o pagamento é
                combinado na recepção. Dizer isso é melhor que inventar um
                "cartão final 1234" que não existe. */}
            <Dado rotulo="Pagamento">Combinado com o estúdio</Dado>
            <Dado rotulo="Modalidades">
              {formato === 'turma_fixa'
                ? [...new Set(turmas.map((t) => t.modalidade))].join(', ') || '—'
                : p.modalidades?.length
                  ? p.modalidades.join(', ')
                  : 'Todas da grade regular'}
            </Dado>
            {formato === 'creditos' && <Dado rotulo="Créditos por ciclo">{p.creditos_por_ciclo}</Dado>}
          </dl>
        </Cartao>
      </div>
    </section>
  )
}

function Fato({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-neutral-500">{rotulo}</dt>
      <dd className="mt-0.5 text-base font-semibold text-neutral-900">{children}</dd>
    </div>
  )
}

function AvisoDePagamento({ plano: p }: { plano: MeuPlano }) {
  if (p.status === 'inadimplente') {
    return (
      <Aviso tom="perigo" titulo="Pagamento em atraso" className="mt-5">
        O ciclo não foi pago e novos agendamentos estão bloqueados. Regularize com a recepção — os créditos do
        ciclo já pago continuam valendo até expirarem.
      </Aviso>
    )
  }
  if (p.pagamento_pendente_desde && !p.cancelada_em) {
    return (
      <Aviso tom="atencao" titulo="Aguardando pagamento" className="mt-5">
        Há uma cobrança em aberto desde {fmtDataCompleta(p.pagamento_pendente_desde)}. O pagamento é combinado
        com o estúdio (PIX ou recepção).
      </Aviso>
    )
  }
  return null
}

// ------------------------------------------------------------
// Créditos / turma fixa
// ------------------------------------------------------------

function MeusCreditos({ plano: p, lotes }: { plano: MeuPlano; lotes: LoteCredito[] }) {
  const usados = p.creditos_usados_ciclo
  const total = Math.max(p.saldo + usados, p.creditos_por_ciclo, 1)
  const proximo = lotes.find((l) => (l.saldo ?? 0) > 0 && l.validade)
  const vencemJuntos = proximo
    ? lotes.filter((l) => l.validade === proximo.validade).reduce((s, l) => s + (l.saldo ?? 0), 0)
    : 0

  return (
    <Cartao>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Coins className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-3xl font-bold leading-none text-ink">
            {p.saldo}
            <span className="ml-1.5 text-base font-semibold text-neutral-500">
              {p.saldo === 1 ? 'crédito disponível' : 'créditos disponíveis'}
            </span>
          </p>
          <p className="mt-1.5 text-sm text-neutral-500">
            {usados} {usados === 1 ? 'usado' : 'usados'} neste ciclo · plano de {p.creditos_por_ciclo} por ciclo
          </p>
        </div>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100"
        role="img"
        aria-label={`${usados} de ${total} créditos usados`}
      >
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (usados / total) * 100)}%` }} />
      </div>

      {proximo?.validade && (
        <p className="mt-3 text-sm text-neutral-600">
          {vencemJuntos === 1 ? '1 crédito vence' : `${vencemJuntos} créditos vencem`} em{' '}
          <strong className="text-neutral-900">{fmtDataCompleta(proximo.validade)}</strong>. Os mais antigos são
          usados primeiro.
        </p>
      )}
      {p.saldo === 0 && (
        <p className="mt-3 text-sm text-neutral-600">
          Seus créditos deste ciclo acabaram.{' '}
          <Link to="../planos" className="font-semibold text-brand-700 hover:underline">
            Comprar crédito extra
          </Link>
        </p>
      )}
    </Cartao>
  )
}

function MinhasTurmas({ turmas }: { turmas: TurmaFixa[] }) {
  return (
    <Cartao>
      <div className="mb-3 flex items-center gap-2">
        <CalendarCheck className="size-4 text-success-600" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {turmas.length === 1 ? 'Sua turma fixa' : 'Suas turmas fixas'}
        </h3>
      </div>
      {turmas.length === 0 ? (
        <p className="text-sm text-neutral-500">A equipe ainda vai vincular sua turma. Fale com a recepção.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {turmas.map((t) => (
            <li key={t.vinculo_id} className="rounded-lg bg-success-50/60 px-3.5 py-3">
              <p className="font-semibold text-neutral-900">{t.modalidade}</p>
              <p className="text-sm text-neutral-600">
                {t.dia_semana !== null ? nomeDiaPlural(t.dia_semana) : ''} · {fmtHoraCurta(t.horario)}
                {t.professora && ` · Prof. ${t.professora}`}
                {t.sala && ` · ${t.sala}`}
              </p>
              {t.futuro && t.inicio && (
                <p className="mt-1 text-xs font-semibold text-brand-700">A partir de {fmtDataCompleta(t.inicio)}</p>
              )}
              {t.fim && !t.futuro && (
                <p className="mt-1 text-xs font-semibold text-warning-700">Até {fmtDataCompleta(t.fim)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Sua vaga é garantida toda semana — não precisa agendar. Faltas não geram reposição nem crédito.
      </p>
    </Cartao>
  )
}

// ------------------------------------------------------------
// Renovação e cancelamento — a regra ANTES do problema
// ------------------------------------------------------------

function RenovacaoECancelamento({
  plano: p,
  onRegras,
  onCancelar,
}: {
  plano: MeuPlano
  onRegras: () => void
  onCancelar: () => void
}) {
  const retirar = useRetirarSolicitacao()
  const [confirmandoRetirar, setConfirmandoRetirar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // ---- Pedido em análise ----
  if (p.solicitacao_status === 'pendente' && p.solicitacao_id) {
    const id = p.solicitacao_id
    return (
      <Cartao className="border-warning-200">
        <h3 className="font-display text-lg font-bold text-ink">Cancelamento solicitado</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Recebemos sua solicitação em <strong className="text-neutral-900">{fmtDataHora(p.solicitacao_em)}</strong>.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm text-neutral-600">
          <li>Seu plano permanece ativo normalmente neste momento.</li>
          <li>A equipe do Studio Pole L confirma por escrito, conforme as condições do seu contrato.</li>
          {p.solicitacao_dentro_prazo === false && p.solicitacao_proxima_renovacao && (
            <li>
              Como o pedido chegou depois de {fmtDataCompleta(p.solicitacao_prazo_limite)}, a renovação de{' '}
              {fmtDataCompleta(p.solicitacao_proxima_renovacao)} acontece normalmente (item 7.1).
            </li>
          )}
        </ul>
        {p.solicitacao_vigente_ate && (
          <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2.5 text-sm font-semibold text-warning-700">
            Seu plano permanecerá ativo até {fmtDataCompleta(p.solicitacao_vigente_ate)}.
          </p>
        )}
        {p.solicitacao_devolucao_centavos !== null && (
          <p className="mt-2 text-xs text-neutral-500">
            Devolução do desconto do semestral (item 7.4): {fmtPreco(p.solicitacao_devolucao_centavos)} — isenta
            com atestado de saúde ou mudança de cidade.
          </p>
        )}

        {confirmandoRetirar ? (
          <div className="mt-4 rounded-lg bg-neutral-50 p-3">
            <p className="text-sm text-neutral-700">
              Desistir do pedido? Seu plano volta a renovar normalmente.
            </p>
            {erro && <p className="mt-2 text-sm text-danger-600">{erro}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setConfirmandoRetirar(false)} disabled={retirar.isPending}>
                Manter o pedido
              </Button>
              <Button
                size="sm"
                loading={retirar.isPending}
                onClick={() =>
                  retirar.mutate(id, {
                    onSuccess: () => setConfirmandoRetirar(false),
                    onError: (e) => setErro(mensagemDoBanco(e, 'Não foi possível desistir do pedido.')),
                  })
                }
              >
                Desistir do pedido
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setErro(null); setConfirmandoRetirar(true) }}>
              Desistir da solicitação
            </Button>
            <Button size="sm" variant="ghost" onClick={onRegras}>
              Ver regras do plano
            </Button>
          </div>
        )}
      </Cartao>
    )
  }

  // ---- Cancelamento já confirmado ----
  if (p.cancelada_em) {
    const aindaRenova = proximaRenovacaoEfetiva(p) !== null
    return (
      <Cartao>
        <h3 className="font-display text-lg font-bold text-ink">Cancelamento confirmado</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Seu plano não renova mais e fica ativo até{' '}
          <strong className="text-neutral-900">{fmtDataCompleta(p.cancelamento_efetivo_em)}</strong>.
          {aindaRenova && (
            <> Antes disso, a renovação de {fmtDataCompleta(proximaRenovacaoEfetiva(p))} ainda acontece, porque o pedido chegou fora do prazo (item 7.1).</>
          )}
        </p>
        <div className="mt-4">
          <Link to="../planos" className="text-sm font-semibold text-brand-700 hover:underline">
            Quero continuar treinando — ver planos
          </Link>
        </div>
      </Cartao>
    )
  }

  // ---- Não renova sozinho (plano antigo, cortesia) ----
  if (!p.renova_automaticamente || !p.proxima_renovacao) {
    return (
      <Cartao>
        <h3 className="font-display text-lg font-bold text-ink">Renovação</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Este plano não renova automaticamente: ele termina em{' '}
          <strong className="text-neutral-900">{fmtDataCompleta(p.data_fim)}</strong>. Não há o que cancelar.
        </p>
        <div className="mt-4">
          <Button size="sm" variant="ghost" onClick={onRegras}>
            Ver regras do plano
          </Button>
        </div>
      </Cartao>
    )
  }

  // ---- O caso comum: renova, e a regra aparece antes do problema ----
  const dentro = p.dentro_prazo_cancelamento === true
  return (
    <Cartao>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Renovação</h3>
          <p className="mt-1.5 text-sm text-neutral-600">
            Próxima renovação:{' '}
            <strong className="text-base text-neutral-900">{fmtDataCompleta(p.proxima_renovacao)}</strong>
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Automática
            {p.proximo_plano_preco_centavos !== null && `, com cobrança de ${fmtPreco(p.proximo_plano_preco_centavos)}`}.
          </p>
          {p.proximo_plano_nome && (
            <p className="mt-1.5 text-xs text-brand-700">
              Fim do semestral: a partir daí o plano passa a Mensal ({p.proximo_plano_nome}) — item 7.7.
            </p>
          )}
          {!p.proximo_plano_nome && p.fim_compromisso && (
            <p className="mt-1.5 text-xs text-neutral-500">
              Compromisso semestral até {fmtDataCompleta(p.fim_compromisso)} (ciclo {p.ciclo_atual} de{' '}
              {p.ciclos_compromisso}).
            </p>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Cancelamento</h3>
          {dentro ? (
            <p className="mt-1.5 text-sm text-neutral-600">
              Para impedir esta renovação, solicite o cancelamento até{' '}
              <strong className="text-base text-neutral-900">{fmtDataCompleta(p.prazo_cancelamento)}</strong>.
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-neutral-600">
              O prazo para impedir a renovação de {fmtDiaMes(p.proxima_renovacao)} terminou em{' '}
              <strong className="text-neutral-900">{fmtDataCompleta(p.prazo_cancelamento)}</strong>. Um pedido
              feito agora vale para a renovação seguinte: o plano ficaria ativo até{' '}
              {fmtDataCompleta(p.vigente_ate_se_cancelar)}.
            </p>
          )}
          {p.saida_antecipada && (
            <p className="mt-1.5 text-xs text-neutral-500">
              Sair antes do fim do semestral devolve o desconto recebido
              {p.devolucao_desconto_centavos !== null && ` (${fmtPreco(p.devolucao_desconto_centavos)})`} — item 7.4.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
        <Button size="sm" variant="secondary" onClick={onRegras}>
          <FileText className="size-3.5" />
          Ver regras do plano
        </Button>
        {podeSolicitarCancelamento(p) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancelar}
            className="text-neutral-500 hover:bg-danger-50 hover:text-danger-700 sm:ml-auto"
          >
            Solicitar cancelamento
          </Button>
        )}
      </div>
    </Cartao>
  )
}

// ------------------------------------------------------------
// Pacotes avulsos e estados vazios
// ------------------------------------------------------------

function OutrosPacotes({ pacotes, lotes }: { pacotes: MeuPlano[]; lotes: LoteCredito[] }) {
  return (
    <section>
      <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Aulas avulsas e pacotes
      </h2>
      <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm lg:max-w-2xl">
        {pacotes.map((p) => {
          const vence = lotes
            .filter((l) => l.matricula_id === p.matricula_id && (l.saldo ?? 0) > 0)
            .map((l) => l.validade)
            .filter(Boolean)
            .sort()[0]
          return (
            <div key={p.matricula_id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">{p.plano_nome}</p>
                <p className="text-xs text-neutral-500">
                  Comprado em {fmtDataCompleta(p.data_contratacao)}
                  {vence && ` · vale até ${fmtDataCompleta(vence)}`}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-sm font-semibold',
                  p.saldo > 0 ? 'text-neutral-900' : 'text-neutral-400',
                )}
              >
                {p.gera_credito ? fmtCreditos(p.saldo) : SITUACAO[situacaoDoPlano(p)].rotulo}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SemPlano({ encerrado }: { encerrado: MeuPlano | null }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center lg:max-w-2xl">
      {encerrado ? (
        <>
          <p className="font-display text-xl font-bold text-ink">Seu plano terminou</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-neutral-500">
            O plano {encerrado.plano_nome} ficou ativo até {fmtDataCompleta(ativoAte(encerrado))}. Que tal voltar
            a treinar com a gente?
          </p>
        </>
      ) : (
        <>
          <p className="font-display text-xl font-bold text-ink">Você ainda não tem um plano</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-neutral-500">
            Escolha entre créditos para variar de aula ou uma turma fixa no seu horário.
          </p>
        </>
      )}
      <Link
        to="../planos"
        className="mt-5 inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
      >
        Conhecer os planos
      </Link>
    </div>
  )
}
