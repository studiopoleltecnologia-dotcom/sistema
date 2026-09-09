import { requireSupabase } from '../../../lib/supabase'
import type { ProdutoInsert, ProdutoUpdate, TipoRequisito } from '../types'

/**
 * Catálogo visto pela equipe — inclui os ocultos (plano personalizado,
 * cortesia), que são justamente os que o aluno não pode ver. Quem separa
 * um do outro é a RLS: a policy do aluno exige `visivel_no_catalogo`.
 *
 * Traz os arquivados junto (`ativo = false`) porque arquivar deixou de
 * ser mão única: a tela mostra o que saiu do catálogo num bloco à parte
 * e permite reativar. Filtrar aqui esconderia o produto do lugar onde
 * ele precisa reaparecer para voltar.
 */
export async function listarProdutos() {
  const { data, error } = await requireSupabase()
    .from('produtos')
    .select('*')
    .order('ordem')
    .order('preco_centavos')
  if (error) throw error
  return data
}

export async function criarProduto(input: ProdutoInsert) {
  const { data, error } = await requireSupabase()
    .from('produtos')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarProduto(id: string, patch: ProdutoUpdate) {
  const { data, error } = await requireSupabase()
    .from('produtos')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Arquiva, nunca apaga: `matriculas.plano_id` aponta para cá, e apagar
 * levaria junto o vínculo de quem já comprou. Arquivado some do catálogo
 * e não pode mais ser vendido; quem já contratou não é afetado.
 */
export async function arquivarProduto(id: string) {
  const { error } = await requireSupabase()
    .from('produtos')
    .update({ ativo: false })
    .eq('id', id)
  if (error) throw error
}

/**
 * Volta ao catálogo. Existe porque arquivar por engano é fácil (um
 * clique) e sem isto a correção exigia SQL — o que na prática significa
 * criar um produto duplicado com o mesmo nome e perder o vínculo com as
 * matrículas antigas.
 */
export async function reativarProduto(id: string) {
  const { error } = await requireSupabase()
    .from('produtos')
    .update({ ativo: true })
    .eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------
// Modalidades cobertas — nenhuma linha significa "todas"
// ------------------------------------------------------------

export async function listarProdutoModalidades() {
  const { data, error } = await requireSupabase()
    .from('produto_modalidades')
    .select('produto_id, modalidade_id')
  if (error) throw error
  return data
}

/**
 * Troca o conjunto inteiro de uma vez (apaga e regrava) em vez de
 * diferenciar item a item: são poucas linhas por produto e o diff
 * incremental só traria chance de estado meio-salvo.
 */
export async function definirModalidadesDoProduto(
  produtoId: string,
  modalidadeIds: string[],
) {
  const sb = requireSupabase()
  const { error: erroDel } = await sb
    .from('produto_modalidades')
    .delete()
    .eq('produto_id', produtoId)
  if (erroDel) throw erroDel

  if (modalidadeIds.length === 0) return
  const { error } = await sb
    .from('produto_modalidades')
    .insert(modalidadeIds.map((m) => ({ produto_id: produtoId, modalidade_id: m })))
  if (error) throw error
}

// ------------------------------------------------------------
// Requisitos de elegibilidade
// ------------------------------------------------------------

export async function listarRequisitos() {
  const { data, error } = await requireSupabase().from('produto_requisitos').select('*')
  if (error) throw error
  return data
}

export type RequisitoInput = {
  tipo: TipoRequisito
  parametro_int: number | null
  janela_dias: number | null
}

export async function definirRequisitosDoProduto(
  produtoId: string,
  requisitos: RequisitoInput[],
) {
  const sb = requireSupabase()
  const { error: erroDel } = await sb
    .from('produto_requisitos')
    .delete()
    .eq('produto_id', produtoId)
  if (erroDel) throw erroDel

  if (requisitos.length === 0) return
  const { error } = await sb
    .from('produto_requisitos')
    .insert(requisitos.map((r) => ({ ...r, produto_id: produtoId })))
  if (error) throw error
}
