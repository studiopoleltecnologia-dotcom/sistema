import type { Enums, Tables, TablesInsert, TablesUpdate } from '../../lib/database.types'

export type Cliente = Tables<'clientes'>
export type ClienteInsert = TablesInsert<'clientes'>
export type ClienteUpdate = TablesUpdate<'clientes'>
export type Socia = Tables<'socias'>
export type Interacao = Tables<'interacoes_crm'>
export type EstagioFunil = Enums<'estagio_funil'>
export type OrigemCliente = Enums<'origem_cliente'>
export type TipoInteracao = Enums<'tipo_interacao'>

/** Ordem das colunas do funil = ordem da jornada (docs/01-NEGOCIO.md seção 4). */
export const ESTAGIOS: { value: EstagioFunil; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'pediu_informacoes', label: 'Pediu informações' },
  { value: 'agendou_experimental', label: 'Agendou experimental' },
  { value: 'fez_experimental', label: 'Fez experimental' },
  { value: 'ativa', label: 'Aluno ativo' },
  { value: 'inativa', label: 'Parou de frequentar' },
  { value: 'em_retorno', label: 'Em retorno' },
  { value: 'ex_aluna', label: 'Ex-aluno' },
]

export const ESTAGIO_LABEL = Object.fromEntries(
  ESTAGIOS.map((e) => [e.value, e.label]),
) as Record<EstagioFunil, string>

export const ORIGENS: { value: OrigemCliente; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'wellhub', label: 'Wellhub' },
  { value: 'classpass', label: 'ClassPass' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'passou_na_porta', label: 'Passou na porta' },
  { value: 'outros', label: 'Outros' },
]

export const ORIGEM_LABEL = Object.fromEntries(
  ORIGENS.map((o) => [o.value, o.label]),
) as Record<OrigemCliente, string>

export const TIPO_INTERACAO_LABEL: Record<TipoInteracao, string> = {
  nota: 'Nota',
  whatsapp: 'WhatsApp',
  conversa: 'Conversa',
  mudanca_estagio: 'Mudança de estágio',
}
