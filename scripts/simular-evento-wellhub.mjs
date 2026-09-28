// Simula um evento de booking da Wellhub no nosso webhook: monta o payload
// no formato real (o mesmo do cURL da Wellhub de 28/09/2026), assina como
// eles assinam (HMAC-SHA1 do corpo cru, hex MAIÚSCULO, X-Gympass-Signature)
// e mostra HTTP, tempo e o corpo JSON que o webhook devolve.
//
// Uso (PowerShell):
//   $env:WELLHUB_WEBHOOK_SECRET = '<secret do ambiente alvo>'
//   node scripts/simular-evento-wellhub.mjs booking-requested --slot 311563 --class 15614 --booking BK_TESTE_01
//   node scripts/simular-evento-wellhub.mjs booking-canceled  --slot 311563 --class 15614 --booking BK_TESTE_01
//   node scripts/simular-evento-wellhub.mjs checkin-booking-occurred --booking BK_TESTE_01
//
// Opções:
//   --url <url>        padrão: produção. Para o DEV, a URL do sistema-dev.
//   --token <id>       unique_token do aluno (padrão: 1000000000001, do sandbox)
//   --nome <nome>      padrão: Mike Hightower
//   --repetir <n>      manda o MESMO corpo n vezes (testa idempotência)
//   --paralelo         com --repetir, dispara todas ao mesmo tempo
//
// O secret nunca vai no código: o repositório é público (CLAUDE.md §3).

import { createHmac, randomUUID } from 'node:crypto'

const URL_PADRAO =
  'https://fgvxhwpqsxohqrccrlfn.supabase.co/functions/v1/wellhub-webhook'

const [evento, ...resto] = process.argv.slice(2)
const opcoes = {}
for (let i = 0; i < resto.length; i++) {
  const chave = resto[i].replace(/^--/, '')
  const proximo = resto[i + 1]
  if (proximo === undefined || proximo.startsWith('--')) {
    opcoes[chave] = true
  } else {
    opcoes[chave] = proximo
    i++
  }
}

const EVENTOS = [
  'booking-requested',
  'booking-canceled',
  'booking-late-canceled',
  'checkin-booking-occurred',
]
if (!EVENTOS.includes(evento) || !opcoes.booking) {
  console.error(`Uso: node scripts/simular-evento-wellhub.mjs <${EVENTOS.join('|')}> --booking <BK_...> [--slot <id> --class <id>]`)
  process.exit(1)
}

const secret = process.env.WELLHUB_WEBHOOK_SECRET
if (!secret) {
  console.error('Defina WELLHUB_WEBHOOK_SECRET no ambiente antes de rodar.')
  process.exit(1)
}

const url = opcoes.url ?? URL_PADRAO
const user = {
  unique_token: String(opcoes.token ?? '1000000000001'),
  name: String(opcoes.nome ?? 'Mike Hightower'),
  email: 'mike@mail.com',
  phone_number: '+15165930060',
}

const eventData = evento === 'checkin-booking-occurred'
  ? { user, booking: { booking_number: opcoes.booking } }
  : {
    user,
    slot: {
      id: Number(opcoes.slot),
      gym_id: 548,
      class_id: Number(opcoes.class),
      booking_number: opcoes.booking,
    },
  }

const corpo = JSON.stringify({
  event_data: { ...eventData, timestamp: Date.now(), event_id: randomUUID() },
  event_type: evento,
})
const assinatura = createHmac('sha1', secret).update(corpo).digest('hex').toUpperCase()

async function enviar(n) {
  const inicio = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-gympass-signature': assinatura },
    body: corpo,
  })
  const texto = (await res.text()).trim()
  console.log(`#${n} HTTP ${res.status} em ${Date.now() - inicio} ms — ${texto}`)
}

const vezes = Number(opcoes.repetir ?? 1)
console.log(`${evento} -> ${new URL(url).host}\n`)
if (opcoes.paralelo) {
  await Promise.all(Array.from({ length: vezes }, (_, i) => enviar(i + 1)))
} else {
  for (let i = 1; i <= vezes; i++) await enviar(i)
}
