import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Card, CardHeader } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { requireSupabase } from '../../../lib/supabase'
import { fmtCentavos } from '../../../lib/dinheiro'

/**
 * Importar o relatório de repasse do Portal do Parceiro.
 *
 * Por colagem e não por upload de arquivo: o Portal exporta `.xlsx`, e
 * ler isso no navegador exigiria uma biblioteca de planilha inteira no
 * bundle para uma tarefa de uma vez por mês. Selecionar as linhas no
 * Excel e colar aqui funciona com qualquer formato que a Wellhub
 * resolva usar amanhã — inclusive se virar CSV.
 *
 * O que o relatório tem, e por que ele importa tanto: data, hora, **ID
 * do Wellhub**, visitante, produto, tipo de check-in e **valor pago**. O
 * ID é o mesmo que o webhook grava em `clientes.gympass_id`, então cada
 * linha casa com uma presença nossa — e o valor para de ser estimativa.
 */
type Linha = {
  data: string
  hora: string | null
  gympass_id: string
  visitante: string | null
  produto: string | null
  tipo: string | null
  valor: number
  moeda: string | null
}

type Resultado = {
  competencia: string
  linhas: number
  casadas: number
  sem_presenca: number
  nossas_sem_linha: number
  total_centavos: number
  previsto_centavos: number
  diferenca_centavos: number
  tarifa_aprendida_centavos: number | null
}

/** Tira acento e caixa, para casar cabeçalho sem depender de como veio. */
function chave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * O ID do Wellhub chega em notação científica (`2.306547018225E12`)
 * porque o Excel trata treze dígitos como número. Sem desfazer isso,
 * nenhuma linha casa — e o erro seria silencioso, porque "não casou"
 * parece um aluno que não registramos.
 */
function normalizarId(bruto: string): string {
  const s = bruto.trim()
  if (!s) return ''
  if (/^\d+$/.test(s)) return s
  const n = Number(s.replace(',', '.'))
  if (!Number.isFinite(n)) return s
  return BigInt(Math.round(n)).toString()
}

function parseValor(bruto: string): number {
  const limpo = bruto.replace(/[R$\s]/g, '').trim()
  if (!limpo) return 0
  // "1.234,56" (pt-BR) x "1234.56" (o que o relatório traz hoje)
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : 0
}

/**
 * Lê o texto colado.
 *
 * O arquivo da Wellhub tem doze linhas de legenda antes da tabela, então
 * o cabeçalho é procurado em vez de presumido na primeira linha: quem
 * cola o arquivo inteiro e quem cola só as linhas de dados caem no mesmo
 * caminho.
 */
function lerLinhas(texto: string): { linhas: Linha[]; aviso: string | null } {
  const cruas = texto
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
  if (cruas.length === 0) return { linhas: [], aviso: null }

  const separar = (l: string) => (l.includes('\t') ? l.split('\t') : l.split(';'))

  const iCab = cruas.findIndex((l) => {
    const c = chave(l)
    return c.includes('data') && (c.includes('pagamento') || c.includes('wellhub'))
  })

  let col: Record<string, number> = {}
  let inicio = 0
  if (iCab >= 0) {
    const cab = separar(cruas[iCab]).map(chave)
    const achar = (...nomes: string[]) =>
      cab.findIndex((c) => nomes.some((n) => c.includes(n)))
    col = {
      data: achar('data'),
      hora: achar('hora'),
      id: achar('id do wellhub', 'wellhub'),
      visitante: achar('visitante'),
      produto: achar('produto'),
      tipo: achar('tipo de check'),
      valor: achar('pagamento', 'valor'),
      moeda: achar('moeda'),
    }
    inicio = iCab + 1
  } else {
    // Sem cabeçalho: a ordem do relatório de setembro/2026.
    col = { data: 0, hora: 1, id: 5, visitante: 4, produto: 6, tipo: 8, valor: 9, moeda: 10 }
  }

  const linhas: Linha[] = []
  let ignoradas = 0
  for (const l of cruas.slice(inicio)) {
    const c = separar(l)
    const data = (c[col.data] ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      ignoradas++
      continue
    }
    const id = normalizarId(c[col.id] ?? '')
    if (!id) {
      ignoradas++
      continue
    }
    linhas.push({
      data,
      hora: (c[col.hora] ?? '').trim() || null,
      gympass_id: id,
      visitante: (c[col.visitante] ?? '').trim() || null,
      produto: (c[col.produto] ?? '').trim() || null,
      tipo: (c[col.tipo] ?? '').trim() || null,
      valor: parseValor(c[col.valor] ?? ''),
      moeda: (c[col.moeda] ?? '').trim() || null,
    })
  }

  // Texto colado que não rendeu nada precisa dizer isso: silêncio aqui
  // parece tela quebrada, e o erro mais provável é ter copiado da coluna
  // errada ou de outro relatório.
  if (linhas.length === 0) {
    return {
      linhas,
      aviso: cruas.length > 0
        ? 'Não reconheci nenhum check-in aqui. Confira se copiou as colunas inteiras, da Data até a Moeda.'
        : null,
    }
  }

  return {
    linhas,
    aviso:
      ignoradas > 0
        ? `${ignoradas} linha${ignoradas === 1 ? '' : 's'} sem data no formato AAAA-MM-DD ${ignoradas === 1 ? 'foi ignorada' : 'foram ignoradas'} (legenda do arquivo, provavelmente).`
        : null,
  }
}

export function ImportarRepasseWellhub() {
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  const [dataCaixa, setDataCaixa] = useState(new Date().toISOString().slice(0, 10))
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const { linhas, aviso } = useMemo(() => lerLinhas(texto), [texto])

  const resumo = useMemo(() => {
    if (linhas.length === 0) return null
    const datas = linhas.map((l) => l.data).sort()
    const total = linhas.reduce((s, l) => s + Math.round(l.valor * 100), 0)
    const zerados = linhas.filter((l) => l.valor === 0).length
    return { de: datas[0], ate: datas[datas.length - 1], total, zerados }
  }, [linhas])

  const importar = useMutation({
    mutationFn: async () => {
      // A competência sai da PRIMEIRA data do arquivo. O relatório de
      // setembro vai de 02/09 a 01/10 — pegar a última jogaria o mês
      // inteiro para outubro.
      const competencia = `${resumo!.de.slice(0, 7)}-01`
      const { data, error } = await requireSupabase().rpc('importar_repasse_wellhub', {
        p_competencia: competencia,
        p_linhas: linhas,
        p_data_caixa: dataCaixa,
      })
      if (error) throw error
      return data as unknown as Resultado
    },
    onSuccess: (r) => {
      setErro(null)
      setResultado(r)
      setTexto('')
      for (const chaveQ of ['wellhub-pendentes', 'wellhub-planos', 'entradas', 'mei', 'saldo-caixa']) {
        qc.invalidateQueries({ queryKey: [chaveQ] })
      }
    },
    onError: (e) => setErro((e as Error).message),
  })

  return (
    <Card className="mb-5">
      <CardHeader
        title="Importar o relatório de repasse"
        subtitle="Abra o relatório no Portal do Parceiro, selecione as linhas na planilha e cole aqui. Cada check-in casa com a presença pelo ID do Wellhub, e o valor real substitui a previsão."
      />

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        placeholder="Cole aqui as linhas da planilha (pode colar o arquivo inteiro, com a legenda do começo)."
        className="w-full rounded-md border border-neutral-200 px-2.5 py-2 font-mono text-xs outline-none transition focus:border-brand-500"
      />

      {resumo && (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-600">
          <span>
            <strong className="text-neutral-800">{linhas.length}</strong> check-ins
          </span>
          <span>
            {resumo.de} a {resumo.ate}
          </span>
          <span>
            total <strong className="text-neutral-800">{fmtCentavos(resumo.total)}</strong>
          </span>
          {resumo.zerados > 0 && (
            <span className="text-neutral-400">
              {resumo.zerados} sem pagamento (visita experimental)
            </span>
          )}
        </div>
      )}

      {aviso && <p className="mt-1.5 text-[11px] text-neutral-400">{aviso}</p>}

      {linhas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              Data em que o repasse caiu
            </label>
            <Input
              type="date"
              value={dataCaixa}
              onChange={(e) => setDataCaixa(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={() => importar.mutate()} loading={importar.isPending}>
            <FileSpreadsheet className="size-4" />
            Importar e casar
          </Button>
        </div>
      )}

      {erro && <p className="mt-3 text-sm text-danger-600">{erro}</p>}

      {resultado && <Conferencia r={resultado} onFechar={() => setResultado(null)} />}
    </Card>
  )
}

/**
 * O que a importação encontrou.
 *
 * As duas sobras são o motivo de a tela existir: check-in que eles
 * pagaram e não registramos (a professora não viu na chamada, a ocupação
 * ficou errada) e presença nossa que eles não pagaram. Nenhum dos dois
 * aparece em lugar nenhum se a conciliação for só um total.
 */
function Conferencia({ r, onFechar }: { r: Resultado; onFechar: () => void }) {
  return (
    <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/40 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-display text-sm font-bold text-neutral-900">
          Competência {r.competencia} conciliada
        </h4>
        <Button size="sm" variant="ghost" onClick={onFechar}>
          Fechar
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-6 text-sm">
        <span>
          <span className="block text-xs text-neutral-500">Repasse</span>
          <strong className="text-neutral-900">{fmtCentavos(r.total_centavos)}</strong>
        </span>
        <span>
          <span className="block text-xs text-neutral-500">Prevíamos</span>
          <strong className="text-neutral-700">{fmtCentavos(r.previsto_centavos)}</strong>
        </span>
        <span>
          <span className="block text-xs text-neutral-500">Diferença</span>
          <strong className={r.diferenca_centavos < 0 ? 'text-danger-700' : 'text-success-700'}>
            {r.diferenca_centavos > 0 ? '+' : ''}
            {fmtCentavos(r.diferenca_centavos)}
          </strong>
        </span>
        <span>
          <span className="block text-xs text-neutral-500">Casados</span>
          <strong className="text-neutral-700">
            {r.casadas} de {r.linhas}
          </strong>
        </span>
      </div>

      {(r.sem_presenca > 0 || r.nossas_sem_linha > 0) && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-brand-100 pt-2 text-xs leading-relaxed text-warning-800">
          {r.sem_presenca > 0 && (
            <li>
              <strong>{r.sem_presenca}</strong> check-in{r.sem_presenca === 1 ? '' : 's'} que a
              Wellhub pagou e que não {r.sem_presenca === 1 ? 'tem' : 'têm'} presença nossa — alguém
              entrou sem o sistema registrar, então a professora não viu na chamada.
            </li>
          )}
          {r.nossas_sem_linha > 0 && (
            <li>
              <strong>{r.nossas_sem_linha}</strong> presença{r.nossas_sem_linha === 1 ? '' : 's'}{' '}
              nossa{r.nossas_sem_linha === 1 ? '' : 's'} que o relatório não menciona — ainda{' '}
              {r.nossas_sem_linha === 1 ? 'está' : 'estão'} como a receber.
            </li>
          )}
        </ul>
      )}

      {r.tarifa_aprendida_centavos !== null && (
        <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
          A previsão dos próximos check-ins passou a usar{' '}
          <strong>{fmtCentavos(r.tarifa_aprendida_centavos)}</strong>, que foi o valor do check-in
          pago mais recente deste relatório. Você não precisa manter isso à mão.
        </p>
      )}
    </div>
  )
}
