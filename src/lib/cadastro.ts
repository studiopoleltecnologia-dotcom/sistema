import { useQuery } from '@tanstack/react-query'
import { requireSupabase } from './supabase'

/**
 * Validação do cadastro de cliente — espelho de
 * `20260930120000_validacao_cadastro_cliente.sql`.
 *
 * Quem decide é o banco (CLAUDE.md §3.4). Isto existe para a tela
 * apontar o campo errado antes do envio, com a mesma mensagem que o
 * banco daria. Se as duas divergirem, vale o banco — e a divergência é
 * bug daqui.
 */

export type ConfigCadastro = {
  exigir_sobrenome: boolean
  validar_telefone_br: boolean
  exigir_cpf: boolean
  exigir_email: boolean
  exigir_cpf_email_no_lead: boolean
}

/** Enquanto a configuração não chega, vale o mesmo default do banco. */
export const CONFIG_CADASTRO_PADRAO: ConfigCadastro = {
  exigir_sobrenome: true,
  validar_telefone_br: true,
  exigir_cpf: true,
  exigir_email: true,
  exigir_cpf_email_no_lead: false,
}

/** O funil antes de virar aluno — quem está aqui não precisa de CPF. */
export const ESTAGIOS_DO_FUNIL = [
  'lead',
  'pediu_informacoes',
  'agendou_experimental',
  'fez_experimental',
] as const

export const MSG = {
  nome: 'informe nome e sobrenome',
  telefone: 'telefone inválido — informe com DDD, ex.: (21) 98765-4321',
  emergencia: 'telefone inválido — informe com DDD, ex.: (21) 98765-4321',
  cpf: 'CPF inválido — confira os números',
  email: 'e-mail inválido',
  cpfObrigatorio: 'CPF é obrigatório — o gateway de pagamento não emite cobrança sem ele',
  emailObrigatorio: 'e-mail é obrigatório — é por ele que o aluno recebe confirmações e cobranças',
  cpfApagado: 'o CPF não pode ser apagado do cadastro',
  emailApagado: 'o e-mail não pode ser apagado do cadastro',
} as const

export const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

const tudoIgual = (d: string) => /^(\d)\1*$/.test(d)

/** CPF (11) ou CNPJ (14), com dígito verificador. */
export function cpfValido(v: string | null | undefined): boolean {
  const d = soDigitos(v)
  if (tudoIgual(d)) return false
  const n = (i: number) => Number(d[i])

  if (d.length === 11) {
    const dv = (ate: number) => {
      let s = 0
      for (let i = 0; i < ate; i++) s += n(i) * (ate + 1 - i)
      const r = (s * 10) % 11
      return r === 10 ? 0 : r
    }
    return dv(9) === n(9) && dv(10) === n(10)
  }

  if (d.length === 14) {
    const dv = (pesos: number[]) => {
      const s = pesos.reduce((acc, p, i) => acc + n(i) * p, 0)
      const r = s % 11
      return r < 2 ? 0 : 11 - r
    }
    return (
      dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === n(12) &&
      dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === n(13)
    )
  }

  return false
}

/** DDDs em uso (Anatel). Norma nacional, não preferência. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68,
  69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95,
  96, 97, 98, 99,
])

/** Celular (11 dígitos, 3º é 9) ou fixo (10, 3º de 2 a 5), com DDD. */
export function telefoneBrValido(v: string | null | undefined): boolean {
  let d = soDigitos(v)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if ((d.length !== 10 && d.length !== 11) || tudoIgual(d)) return false
  if (!DDDS.has(Number(d.slice(0, 2)))) return false
  return d.length === 11 ? d[2] === '9' : d[2] >= '2' && d[2] <= '5'
}

const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

/** Duas palavras com 2+ letras, e a última não é partícula. */
export function nomeCompletoValido(v: string | null | undefined): boolean {
  const partes = (v ?? '').trim().split(/\s+/).filter(Boolean)
  // Mesma conta do banco: letra é o que não é dígito nem pontuação ASCII,
  // então "Zé" conta duas letras e "S." conta uma.
  const comLetras = partes.filter(
    (p) => p.replace(/[0-9!-\/:-@[-`{-~]/g, '').length >= 2,
  ).length
  const ultima = partes[partes.length - 1]?.toLowerCase() ?? ''
  return comLetras >= 2 && !PARTICULAS.has(ultima)
}

export const emailValido = (v: string | null | undefined) =>
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v ?? '')

/** Máscara de CPF enquanto digita: 000.000.000-00. */
export function formatarCpf(v: string): string {
  const d = soDigitos(v).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

export type CamposCadastro = {
  nome?: string | null
  telefone?: string | null
  contato_emergencia_telefone?: string | null
  cpf?: string | null
  email?: string | null
  estrangeiro?: boolean | null
  estagio?: string | null
}

export type ErrosCadastro = Partial<
  Record<'nome' | 'telefone' | 'contato_emergencia_telefone' | 'cpf' | 'email', string>
>

const vazio = (v: string | null | undefined) => !v || v.trim() === ''

/**
 * Mesma lógica do gatilho `validar_cadastro_cliente()`:
 *
 * · formato só do campo que entrou ou mudou — cadastro antigo com dado
 *   ruim continua editável no que não for mexido;
 * · presença de CPF e e-mail na criação de quem saiu do funil (ou
 *   sempre, se `exigirPresenca` vier ligado — o portal usa isso);
 * · estrangeiro é isento de tudo, menos de apagar CPF/e-mail.
 */
export function validarCadastro(
  dados: CamposCadastro,
  cfg: ConfigCadastro,
  opcoes: { original?: CamposCadastro | null; exigirPresenca?: boolean } = {},
): ErrosCadastro {
  const erros: ErrosCadastro = {}
  const original = opcoes.original ?? null
  const novo = original === null
  const virouBrasileiro = !!original?.estrangeiro && !dados.estrangeiro

  const normal: Record<keyof ErrosCadastro, (v: string | null | undefined) => string> = {
    nome: (v) => (v ?? '').trim(),
    telefone: (v) => (v ?? '').trim(),
    contato_emergencia_telefone: (v) => (v ?? '').trim(),
    cpf: soDigitos,
    email: (v) => (v ?? '').trim().toLowerCase(),
  }
  const mudou = (c: keyof ErrosCadastro) =>
    novo || virouBrasileiro || normal[c](dados[c]) !== normal[c](original?.[c])

  if (original) {
    if (!vazio(soDigitos(original.cpf)) && vazio(soDigitos(dados.cpf))) erros.cpf = MSG.cpfApagado
    if (!vazio(original.email) && vazio(dados.email)) erros.email = MSG.emailApagado
  }
  if (dados.estrangeiro) return erros

  if (cfg.exigir_sobrenome && mudou('nome') && !nomeCompletoValido(dados.nome)) {
    erros.nome = MSG.nome
  }
  if (cfg.validar_telefone_br) {
    if (!vazio(dados.telefone) && mudou('telefone') && !telefoneBrValido(dados.telefone)) {
      erros.telefone = MSG.telefone
    }
    if (
      !vazio(dados.contato_emergencia_telefone) &&
      mudou('contato_emergencia_telefone') &&
      !telefoneBrValido(dados.contato_emergencia_telefone)
    ) {
      erros.contato_emergencia_telefone = MSG.emergencia
    }
  }
  if (!erros.cpf && !vazio(dados.cpf) && mudou('cpf') && !cpfValido(dados.cpf)) {
    erros.cpf = MSG.cpf
  }
  if (!erros.email && !vazio(dados.email) && mudou('email') && !emailValido(dados.email?.trim())) {
    erros.email = MSG.email
  }

  const noFunil = (ESTAGIOS_DO_FUNIL as readonly string[]).includes(dados.estagio ?? 'lead')
  const exigePresenca =
    opcoes.exigirPresenca ||
    virouBrasileiro ||
    (novo && (!noFunil || cfg.exigir_cpf_email_no_lead))

  if (exigePresenca) {
    if (cfg.exigir_cpf && vazio(soDigitos(dados.cpf))) erros.cpf ??= MSG.cpfObrigatorio
    if (cfg.exigir_email && vazio(dados.email)) erros.email ??= MSG.emailObrigatorio
  }

  return erros
}

export const temErros = (e: ErrosCadastro) => Object.keys(e).length > 0

// ---- Configuração (tabela `config_cadastro`, linha única) ----

export async function buscarConfigCadastro(): Promise<ConfigCadastro> {
  const { data, error } = await requireSupabase()
    .from('config_cadastro')
    .select(
      'exigir_sobrenome, validar_telefone_br, exigir_cpf, exigir_email, exigir_cpf_email_no_lead',
    )
    .maybeSingle()
  if (error) throw error
  return data ?? CONFIG_CADASTRO_PADRAO
}

export async function salvarConfigCadastro(cfg: ConfigCadastro) {
  const { error } = await requireSupabase().from('config_cadastro').update(cfg).eq('id', true)
  if (error) throw error
}

/** Configuração vigente; devolve o default enquanto carrega. */
export function useConfigCadastro(): ConfigCadastro {
  const { data } = useQuery({
    queryKey: ['config-cadastro'],
    queryFn: buscarConfigCadastro,
    staleTime: 5 * 60_000,
  })
  return data ?? CONFIG_CADASTRO_PADRAO
}
