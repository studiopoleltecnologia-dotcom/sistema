import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card, CardHeader } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { requireSupabase } from '../../../lib/supabase'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'

/**
 * Quanto a Wellhub paga por check-in, por plano do assinante.
 *
 * Existe porque o repasse deixou de ser um número só: com Silver+ e
 * Gold, cada check-in vale um valor diferente, e o plano vem no payload
 * de cada check-in.
 *
 * A lista **não é cadastrada à mão**: o sistema aprende o plano na
 * primeira vez que ele aparece e avisa no sino. Esta tela é onde se diz
 * quanto ele vale — e enquanto ninguém disser, o plano aparece marcado,
 * porque receita prevista errada só dá as caras no dia 15, quando o
 * repasse real não bate.
 */
export function PlanosWellhub() {
  const qc = useQueryClient()
  const [valores, setValores] = useState<Record<number, string>>({})
  const [erro, setErro] = useState<string | null>(null)

  const { data: planos, isLoading } = useQuery({
    queryKey: ['wellhub-planos'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('wellhub_planos')
        .select('*')
        .order('descricao', { nullsFirst: false })
      if (error) throw error
      return data
    },
  })

  const salvar = useMutation({
    mutationFn: async (a: { product_id: number; valor_centavos: number }) => {
      const { error } = await requireSupabase()
        .from('wellhub_planos')
        .update({ valor_centavos: a.valor_centavos, confirmado: true })
        .eq('product_id', a.product_id)
      if (error) throw error
    },
    onSuccess: (_d, a) => {
      setErro(null)
      setValores((v) => {
        const { [a.product_id]: _, ...resto } = v
        return resto
      })
      qc.invalidateQueries({ queryKey: ['wellhub-planos'] })
    },
    onError: (e) => setErro((e as Error).message),
  })

  const { data: referencia } = useQuery({
    queryKey: ['wellhub-precos-referencia'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('wellhub_precos_referencia')
        .select('*')
        .order('nome')
      if (error) throw error
      return data
    },
  })

  if (isLoading) return null
  // Com a lista vazia o cartão ainda aparece, se houver preço combinado:
  // antes do primeiro check-in de cada plano não há nada em
  // `wellhub_planos`, e esconder tudo faria o valor combinado sumir da
  // vista de quem o informou.
  if ((planos ?? []).length === 0 && (referencia ?? []).length === 0) return null

  return (
    <Card className="mb-5">
      <CardHeader
        title="Quanto vale cada plano Wellhub"
        subtitle="O plano do assinante vem junto com o check-in. O valor daqui alimenta a previsão de receita — o acerto continua sendo a conciliação do repasse."
      />

      <div className="flex flex-col divide-y divide-neutral-100">
        {(planos ?? []).map((p) => {
          const emEdicao = valores[p.product_id] ?? ''
          return (
            <div key={p.product_id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-800">
                  {p.descricao ?? `Plano ${p.product_id}`}
                  {!p.confirmado && (
                    <Badge variant="warning">
                      <AlertTriangle className="size-3" />
                      sem valor confirmado
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  id {p.product_id} · visto pela primeira vez em {fmtData(p.visto_em)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-500">{fmtCentavos(p.valor_centavos)}</span>
                <Input
                  value={emEdicao}
                  onChange={(e) =>
                    setValores((v) => ({ ...v, [p.product_id]: e.target.value }))
                  }
                  placeholder="novo valor"
                  className="w-28"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={parseCentavos(emEdicao) === null || salvar.isPending}
                  onClick={() => {
                    // `parseCentavos` devolve null em texto inválido, e
                    // salvar isso como 0 significaria "esta plataforma não
                    // paga nada" — o botão fica desligado em vez disso.
                    const v = parseCentavos(emEdicao)
                    if (v === null) return
                    salvar.mutate({ product_id: p.product_id, valor_centavos: v })
                  }}
                >
                  Salvar
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {erro && <p className="mt-3 text-sm text-danger-600">{erro}</p>}

      {(referencia ?? []).length > 0 && (
        <p className="mt-3 border-t border-neutral-100 pt-2 text-[11px] leading-relaxed text-neutral-500">
          <strong className="text-neutral-600">Preços combinados com a Wellhub:</strong>{' '}
          {(referencia ?? []).map((r) => `${r.nome} ${fmtCentavos(r.valor_centavos)}`).join(' · ')}.
          <span className="block text-neutral-400">
            É daqui que um plano novo nasce com o valor certo, sem precisar perguntar. Depois
            disso quem vale é a lista acima.
          </span>
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
        Mudar o valor vale para os check-ins <strong>daqui para frente</strong>. Os que já estão
        lançados ficam como estão — e são corrigidos pela conciliação do mês, que é onde entra o
        valor real do repasse.
      </p>
    </Card>
  )
}
