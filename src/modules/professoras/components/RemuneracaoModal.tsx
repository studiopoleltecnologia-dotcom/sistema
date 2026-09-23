import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { parseCentavos } from '../../../lib/dinheiro'
import type { Tables } from '../../../lib/database.types'
import { useAtualizarProfessora } from '../hooks/useProfessoras'

type Professora = Tables<'professoras'>
type Modelo = Professora['modelo']

const MODELO_LABEL: Record<Modelo, string> = {
  por_aluna: 'Por aluno presente',
  por_hora: 'Por hora/aula',
  fixo: 'Valor fixo mensal',
}

const campoCls = 'mb-1 block text-xs font-medium text-neutral-500'
const reais = (c: number | null) => (c ? String(c / 100) : '')
const cent = (s: string) => parseCentavos(s) || 0

/** Configura o modelo de remuneração de uma professora (contrato flexível). */
export function RemuneracaoModal({
  professora,
  onFechar,
}: {
  professora: Professora
  onFechar: () => void
}) {
  const atualizar = useAtualizarProfessora()

  const [modelo, setModelo] = useState<Modelo>(professora.modelo)
  const [valorAluno, setValorAluno] = useState(reais(professora.valor_por_aluna_centavos))
  const [pisoUma, setPisoUma] = useState(reais(professora.piso_uma_aluna_centavos))
  const [diaSemAlunas, setDiaSemAlunas] = useState(reais(professora.valor_dia_sem_alunas_centavos))
  const [valorHora, setValorHora] = useState(reais(professora.valor_hora_centavos))
  const [valorFixo, setValorFixo] = useState(reais(professora.valor_fixo_mes_centavos))
  const [passagemDia, setPassagemDia] = useState(reais(professora.valor_passagem_dia_centavos))
  const [percPassagem, setPercPassagem] = useState(String(professora.percentual_passagem || ''))

  async function salvar() {
    await atualizar.mutateAsync({
      id: professora.id,
      patch: {
        modelo,
        valor_por_aluna_centavos: cent(valorAluno),
        piso_uma_aluna_centavos: cent(pisoUma),
        valor_dia_sem_alunas_centavos: cent(diaSemAlunas),
        valor_hora_centavos: cent(valorHora),
        valor_fixo_mes_centavos: cent(valorFixo),
        valor_passagem_dia_centavos: cent(passagemDia),
        percentual_passagem: Number(percPassagem) || 0,
      },
    })
    onFechar()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
      onClick={onFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900">Remuneração</h2>
          <button
            onClick={onFechar}
            className="rounded-md p-1 text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-400">{professora.nome}</p>

        {/*
          A folha passou a calcular por `regras_remuneracao`, que têm
          vigência — é o que impede a tabela de outubro de recalcular
          setembro. Estes campos viraram a semente da regra pessoal e
          continuam valendo para quem não tem regra mais específica, mas
          mexer aqui NÃO altera a tabela do Pole que entra em 01/10.
          Sem este aviso, a gestão editaria um valor e veria a folha não
          mudar, sem entender por quê.
        */}
        <p className="mb-5 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-700">
          A folha agora calcula por <strong>regras com vigência</strong>. Estes valores valem
          como a regra pessoal dela e só se aplicam onde não houver regra mais específica —
          nas aulas de Pole a partir de 01/10 vale a tabela da modalidade (piso R$45, teto
          R$90), e mexer aqui não a altera.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className={campoCls}>Modelo</label>
            <Select
              value={modelo}
              onChange={(e) => setModelo(e.target.value as Modelo)}
              className="w-full"
            >
              {(Object.keys(MODELO_LABEL) as Modelo[]).map((m) => (
                <option key={m} value={m}>
                  {MODELO_LABEL[m]}
                </option>
              ))}
            </Select>
          </div>

          {modelo === 'por_aluna' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={campoCls}>R$ / aluno</label>
                <Input value={valorAluno} onChange={(e) => setValorAluno(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className={campoCls}>Piso 1 aluno</label>
                <Input value={pisoUma} onChange={(e) => setPisoUma(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className={campoCls}>Dia s/ alunos</label>
                <Input value={diaSemAlunas} onChange={(e) => setDiaSemAlunas(e.target.value)} className="w-full" />
              </div>
            </div>
          )}

          {modelo === 'por_hora' && (
            <div>
              <label className={campoCls}>R$ por hora/aula</label>
              <Input value={valorHora} onChange={(e) => setValorHora(e.target.value)} className="w-40" />
            </div>
          )}

          {modelo === 'fixo' && (
            <div>
              <label className={campoCls}>Valor fixo mensal (R$)</label>
              <Input value={valorFixo} onChange={(e) => setValorFixo(e.target.value)} className="w-40" />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-neutral-100 pt-4">
            <div>
              <label className={campoCls}>Passagem por dia (R$)</label>
              <Input
                value={passagemDia}
                onChange={(e) => setPassagemDia(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className={campoCls}>% reembolsado</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={percPassagem}
                onChange={(e) => setPercPassagem(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-neutral-400">
            Passagem = % × valor/dia × dias trabalhados no mês. Deixe zerado se não houver.
          </p>

          <div className="mt-1 flex justify-end gap-2">
            <Button variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={atualizar.isPending}>
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
