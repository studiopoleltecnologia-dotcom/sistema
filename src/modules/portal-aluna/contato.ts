/**
 * WhatsApp oficial da recepção — só dígitos, com DDI (ex.: 5511912345678).
 *
 * É número público (está no Instagram e no site), então mora no código e
 * não em secret. Vazio, as telas que dependem dele orientam a falar com a
 * recepção sem oferecer link — melhor que apontar para um número errado.
 */
export const WHATSAPP_RECEPCAO: string = ''

/** Link wa.me com a mensagem já escrita, ou null se o número não foi configurado. */
export function linkWhatsApp(mensagem: string): string | null {
  if (!WHATSAPP_RECEPCAO) return null
  return `https://wa.me/${WHATSAPP_RECEPCAO}?text=${encodeURIComponent(mensagem)}`
}
