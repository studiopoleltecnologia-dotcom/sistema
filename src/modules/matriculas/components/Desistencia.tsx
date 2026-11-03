import { useState } from 'react'
import { AlertTriangle, Scale } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos } from '../../../lib/dinheiro'
import { useDesistenciaPossivel, useDesistir } from '../hooks/useDesistencias'
import type { MatriculaCompleta } from '../types'

/**
 * Desistência de 7 dias (regulamento 9.7 / CDC art. 49).
 *
 * A tela mostra a conta inteira ANTES do clique, e com uma razão: é a
 * gestão que vai fazer o Pix de volta, e o número tem de sair daqui e
 * não de uma conta de cabeça na recepção.
 *
 * Três coisas aparecem de propósito:
 *
 * * **a origem da contratação.** O art. 49 vale para compra fora do
 *   estabelecimento. Pedido pelo portal é fora, sem dúvida; venda
 *   registrada pela equipe pode ter sido no balcão (não vale) ou por
 *   WhatsApp (vale) — e isso só quem atendeu sabe. O sistema calcula,
 *   quem decide é quem tem o dado.
 * * **o que vai ser desfeito**, item a item. Desistir não é cancelar:
 *   aqui os créditos expiram hoje e as aulas marcadas caem.
 * * **os alertas**, que são os dois jeitos de o aluno ser cobrado de
 *   novo depois de desistir — assinatura de cartão viva no gateway e
 *   link de pagamento em aberto. Nenhum dos dois se resolve daqui.
 */
export function Desistencia({
  matricula: m,
  onFechar,
}: {
  matricula: MatriculaCompleta
  onFechar: () => void
}) {
  const id = m.saldo.matricula_id!
  const { data: conta, isLoading } = useDesistenciaPossivel(id)
  const desistir = useDesistir()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  if (isLoading || !conta) {
    return (
      <Modal title="Desistência de 7 dias" onFechar={onFechar} size="sm">
        <p className="py-4 text-center text-sm text-neutral-400">Carregando…</p>
      </Modal>
    )
  }

  const linha = 'flex items-baseline justify-between gap-3 py-1 text-sm'

  return (
    <Modal title="Desistência de 7 dias" onFechar={onFechar} size="sm">
      <div className="flex flex-col gap-3">
        <p className="flex gap-2 text-xs leading-relaxed text-neutral-500">
          <Scale className="mt-px size-4 shrink-0" />
          <span>
            Art. 49 do Código de Defesa do Consumidor: contratação feita <b>fora do estúdio</b>{' '}
            (site, WhatsApp ou telefone) pode ser desfeita no prazo, com devolução do que foi pago
            menos as aulas já utilizadas.
          </span>
        </p>

        <div className="rounded-md border border-neutral-200 bg-neutral-50/70 px-3 py-2">
          <p className={linha}>
            <span className="text-neutral-500">Comprado em</span>
            <span className="font-medium text-neutral-800">
              {fmtData(conta.comprada_em)} · há {conta.dias_desde_compra}{' '}
              {conta.dias_desde_compra === 1 ? 'dia' : 'dias'}
            </span>
          </p>
          <p className={linha}>
            <span className="text-neutral-500">Prazo vai até</span>
            <span className="font-medium text-neutral-800">{fmtData(conta.prazo_ate)}</span>
          </p>
          <p className={linha}>
            <span className="text-neutral-500">Pedido feito</span>
            <span className="font-medium text-neutral-800">
              {conta.origem_contratacao === 'portal'
                ? 'pelo portal (fora do estúdio)'
                : conta.origem_contratacao === 'equipe'
                  ? 'pela equipe — confira se foi por WhatsApp/telefone'
                  : 'sem registro de origem'}
            </span>
          </p>
        </div>

        {!conta.pode ? (
          <p className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800">
            {conta.motivo}
          </p>
        ) : (
          <>
            <div className="rounded-md border border-neutral-200 px-3 py-2">
              <p className={linha}>
                <span className="text-neutral-500">Pago</span>
                <span className="font-medium text-neutral-800">
                  {fmtCentavos(conta.pago_centavos)}
                </span>
              </p>
              {conta.aulas_utilizadas > 0 && (
                <p className={linha}>
                  <span className="text-neutral-500">
                    {conta.aulas_utilizadas} {conta.aulas_utilizadas === 1 ? 'aula' : 'aulas'} ×{' '}
                    {fmtCentavos(conta.valor_aula_avulsa_centavos)} (avulsa)
                  </span>
                  <span className="font-medium text-neutral-800">
                    −{fmtCentavos(conta.retido_centavos)}
                  </span>
                </p>
              )}
              <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-neutral-100 pt-2 text-sm">
                <span className="font-semibold text-neutral-700">A devolver por Pix</span>
                <span className="font-display text-base font-bold text-neutral-900">
                  {fmtCentavos(conta.devolver_centavos)}
                </span>
              </p>
            </div>

            <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-600">
              Ao confirmar: o plano de <b>{m.clienteNome}</b> é encerrado hoje, o saldo de créditos
              expira, as aulas que ela tinha marcadas são canceladas
              {m.ehTurmaFixa && ' e a vaga na turma volta para a grade'}. O financeiro fica com{' '}
              {conta.retido_centavos > 0 ? fmtCentavos(conta.retido_centavos) : 'nada'} desta venda.{' '}
              <b>O Pix de volta é feito por você</b> — o sistema registra o valor, não transfere.
            </p>

            {conta.alerta && (
              <p className="flex gap-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-relaxed text-warning-800">
                <AlertTriangle className="mt-px size-4 shrink-0" />
                <span>{conta.alerta}</span>
              </p>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                Motivo (fica no registro)
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Ex.: comprou pelo site e desistiu no dia seguinte, antes da primeira aula."
                className="w-full rounded-md border border-neutral-200 px-2.5 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </>
        )}

        {erro && <p className="text-sm text-danger-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar}>
            {conta.pode ? 'Voltar' : 'Fechar'}
          </Button>
          {conta.pode && (
            <Button
              variant="danger"
              disabled={desistir.isPending}
              onClick={() => {
                setErro(null)
                desistir.mutate(
                  { matriculaId: id, motivo: motivo.trim() || undefined },
                  {
                    onSuccess: onFechar,
                    onError: (e) => setErro((e as Error).message),
                  },
                )
              }}
            >
              Registrar desistência
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
