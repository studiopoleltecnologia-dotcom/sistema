import { useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import {
  useAtualizarTurma,
  useCriarModalidade,
  useCriarTurma,
  useModalidades,
  useNomesProfessoras,
  useSalas,
} from '../hooks/useAgenda'
import { DIAS_SEMANA } from '../types'

export type TurmaInicial = {
  modalidadeId: string
  modalidade: string
  salaId: string
  professoraId: string
  dia: string
  horario: string
  duracao: string
  capacidade: string
}

const NOVA = '__nova__'
const campoCls = 'mb-1 block text-xs font-medium text-neutral-500'

/** Modal de criar/editar turma. turmaId nulo = criando (inclui duplicar). */
export function TurmaForm({
  inicial,
  turmaId,
  onFechar,
}: {
  inicial: TurmaInicial
  turmaId: string | null
  onFechar: () => void
}) {
  const { data: modalidades } = useModalidades()
  const { data: salas } = useSalas()
  const { data: professoras } = useNomesProfessoras()
  const criarModalidade = useCriarModalidade()
  const criar = useCriarTurma()
  const atualizar = useAtualizarTurma()

  const [modalidadeId, setModalidadeId] = useState(inicial.modalidadeId)
  const [novaModalidade, setNovaModalidade] = useState<string | null>(null)
  const [salaId, setSalaId] = useState(inicial.salaId)
  const [professoraId, setProfessoraId] = useState(inicial.professoraId)
  const [dia, setDia] = useState(inicial.dia)
  const [horario, setHorario] = useState(inicial.horario)
  const [duracao, setDuracao] = useState(inicial.duracao)
  const [capacidade, setCapacidade] = useState(inicial.capacidade)
  const [erro, setErro] = useState<string | null>(null)

  const salvando = criar.isPending || atualizar.isPending || criarModalidade.isPending

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!professoraId) return setErro('Escolha a professora.')
    if (!salaId) return setErro('Escolha a sala.')

    let modId: string | null = modalidadeId || null
    let modNome = (modalidades ?? []).find((m) => m.id === modalidadeId)?.nome ?? inicial.modalidade

    if (novaModalidade !== null) {
      const nome = novaModalidade.trim()
      if (!nome) return setErro('Digite o nome da nova modalidade.')
      const nova = await criarModalidade.mutateAsync(nome)
      modId = nova.id
      modNome = nova.nome
    }
    if (!modNome) return setErro('Escolha a modalidade.')

    const payload = {
      modalidade: modNome,
      modalidade_id: modId,
      sala_id: salaId,
      professora_id: professoraId,
      dia_semana: Number(dia),
      horario,
      capacidade: Number(capacidade),
      duracao_minutos: Number(duracao),
    }

    if (turmaId) await atualizar.mutateAsync({ id: turmaId, patch: payload })
    else await criar.mutateAsync(payload)
    onFechar()
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
      onClick={onFechar}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={salvar}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900">
            {turmaId ? 'Editar turma' : 'Nova turma'}
          </h2>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md p-1 text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className={campoCls}>Modalidade</label>
            {novaModalidade === null ? (
              <Select
                value={modalidadeId}
                onChange={(e) => {
                  if (e.target.value === NOVA) setNovaModalidade('')
                  else setModalidadeId(e.target.value)
                }}
                className="w-full"
              >
                <option value="">Escolha…</option>
                {(modalidades ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
                <option value={NOVA}>+ Criar nova modalidade…</option>
              </Select>
            ) : (
              <div className="flex gap-1.5">
                <Input
                  autoFocus
                  value={novaModalidade}
                  onChange={(e) => setNovaModalidade(e.target.value)}
                  placeholder="Nome da modalidade"
                  className="w-full"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNovaModalidade(null)}
                >
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={campoCls}>Sala</label>
              <Select value={salaId} onChange={(e) => setSalaId(e.target.value)} className="w-full">
                <option value="">Escolha…</option>
                {(salas ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className={campoCls}>Professora</label>
              <Select
                value={professoraId}
                onChange={(e) => setProfessoraId(e.target.value)}
                className="w-full"
              >
                <option value="">Escolha…</option>
                {(professoras ?? []).map((p) => (
                  <option key={p.id} value={p.id ?? ''}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={campoCls}>Dia da semana</label>
              <Select value={dia} onChange={(e) => setDia(e.target.value)} className="w-full">
                {DIAS_SEMANA.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className={campoCls}>Horário</label>
              <Input
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={campoCls}>Duração (min)</label>
              <Input
                type="number"
                min={15}
                step={5}
                value={duracao}
                onChange={(e) => setDuracao(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className={campoCls}>Capacidade (vagas)</label>
              <Input
                type="number"
                min={1}
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          {erro && <p className="text-sm text-danger-600">{erro}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" loading={salvando}>
              <Plus className="size-4" />
              {turmaId ? 'Salvar' : 'Criar turma'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
