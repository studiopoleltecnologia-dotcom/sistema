import { requireSupabase } from '../../../lib/supabase'
import type { Enums, Tables, TablesInsert } from '../../../lib/database.types'

export type Regra = Tables<'regras_remuneracao'>
export type Faixa = Tables<'regras_remuneracao_faixas'>
export type TipoRemuneracao = Enums<'tipo_remuneracao'>
export type BasePercentual = Enums<'base_percentual'>

/** Regra com as faixas embutidas e os nomes do escopo já resolvidos. */
export type RegraCompleta = Regra & {
  faixas: Faixa[]
  professora: { nome: string } | null
  modalidade: { nome: string } | null
  turma: { modalidade: string; dia_semana: number; horario: string } | null
}

/*
  Escrita direta na tabela, sem RPC: `regras_remuneracao` já tem policy
  `for all using (is_gestao())`, então o Postgres é quem autoriza. Uma
  RPC aqui só repetiria a checagem e esconderia o erro da constraint de
  não-sobreposição, que é justamente o que a tela precisa mostrar.
*/

export async function listarRegras(): Promise<RegraCompleta[]> {
  const { data, error } = await requireSupabase()
    .from('regras_remuneracao')
    .select(
      '*, faixas:regras_remuneracao_faixas(*), professora:professoras(nome), ' +
        'modalidade:modalidades(nome), turma:turmas(modalidade, dia_semana, horario)',
    )
    .order('vigencia_inicio', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as RegraCompleta[]
}

export async function salvarRegra(args: {
  id?: string
  dados: TablesInsert<'regras_remuneracao'>
  faixas: { min_alunos: number; valor_centavos: number }[]
}) {
  const sb = requireSupabase()
  let regraId = args.id

  if (regraId) {
    const { error } = await sb
      .from('regras_remuneracao')
      .update(args.dados)
      .eq('id', regraId)
    if (error) throw error
  } else {
    const { data, error } = await sb
      .from('regras_remuneracao')
      .insert(args.dados)
      .select('id')
      .single()
    if (error) throw error
    regraId = data.id
  }

  // Faixas são substituídas por inteiro: a tabela precisa ser completa
  // (a maior faixa que couber é a que vale), então editar linha a linha
  // deixaria estado intermediário pagando errado.
  const { error: eDel } = await sb
    .from('regras_remuneracao_faixas')
    .delete()
    .eq('regra_id', regraId)
  if (eDel) throw eDel

  if (args.faixas.length > 0) {
    const { error: eIns } = await sb
      .from('regras_remuneracao_faixas')
      .insert(args.faixas.map((f) => ({ ...f, regra_id: regraId! })))
    if (eIns) throw eIns
  }

  return regraId
}

/**
 * Encerrar é datar o fim, não apagar: a folha de um mês passado precisa
 * continuar encontrando a regra que valia naquela data.
 */
export async function encerrarRegra(id: string, vigenciaFim: string) {
  const { error } = await requireSupabase()
    .from('regras_remuneracao')
    .update({ vigencia_fim: vigenciaFim })
    .eq('id', id)
  if (error) throw error
}

/** Simulador: quanto UMA aula desta turma pagaria, com N presentes. */
export async function simularValorAula(args: {
  professoraId: string
  turmaId: string
  data: string
  presentes: number
}) {
  const { data, error } = await requireSupabase().rpc('valor_da_aula', {
    p_professora: args.professoraId,
    p_turma: args.turmaId,
    p_data: args.data,
    p_presentes: args.presentes,
  })
  if (error) throw error
  return Number(data ?? 0)
}
