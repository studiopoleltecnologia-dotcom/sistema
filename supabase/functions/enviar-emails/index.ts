// Disparo de e-mails do Studio Pole L.
//
// Varre a fila de avisos pendentes e envia pela Resend. Hoje trata o
// aviso de "vaga liberada" da lista de espera (lista_espera com
// status='notificada' e email_enviado_em nulo = pendente). É desenhado
// para crescer: outros tipos de e-mail entram como novas varreduras aqui.
//
// Segredos (env, nunca no repo — o repositório é público):
//   RESEND_API_KEY            — chave da Resend (cofre do Supabase)
//   SUPABASE_URL / SERVICE    — injetados pelo Supabase automaticamente
//
// Invocada de tempos em tempos pelo pg_cron (ver migration do cron).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const REMETENTE = 'Studio Pole L <contato@studiopolel.com.br>'
const RESPONDER_PARA = 'carolinedsnunes@gmail.com'
const PORTAL = 'https://studiopoleltecnologia-dotcom.github.io/sistema/#/portal'

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

function dataExtenso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(a, m - 1, d, 12)
  return `${DIAS[dt.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

function hhmm(hora: string | null): string {
  return (hora ?? '').slice(0, 5)
}

async function enviarResend(para: string, assunto: string, html: string) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: REMETENTE,
      to: [para],
      reply_to: RESPONDER_PARA,
      subject: assunto,
      html,
    }),
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Resend ${resp.status}: ${txt}`)
  }
}

function layout(titulo: string, corpo: string, cta?: { texto: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f5fa;padding:24px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#241f33">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e7e2ef">
    <div style="background:#574a78;padding:20px 24px">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:#fff;color:#574a78;font-weight:800;font-size:15px">L</span>
      <span style="color:#fff;font-weight:700;letter-spacing:.04em;margin-left:8px;font-size:14px">STUDIO POLE L</span>
    </div>
    <div style="padding:28px 24px">
      <h1 style="margin:0 0 12px;font-size:20px;letter-spacing:-.01em">${titulo}</h1>
      <div style="font-size:15px;line-height:1.6;color:#5b5470">${corpo}</div>
      ${cta ? `<a href="${cta.url}" style="display:inline-block;margin-top:20px;background:#6a5d8f;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600;font-size:14px">${cta.texto}</a>` : ''}
    </div>
    <div style="padding:16px 24px;border-top:1px solid #f0edf5;font-size:12px;color:#928aa6">
      Studio Pole L · você recebeu este e-mail porque está cadastrado no nosso sistema.
    </div>
  </div></body></html>`
}

async function processarListaEspera(): Promise<number> {
  const { data: cfg } = await supabase
    .from('config_agendamento')
    .select('minutos_reserva_espera')
    .single()
  const minutos = cfg?.minutos_reserva_espera ?? 30

  const { data: pendentes, error } = await supabase
    .from('lista_espera')
    .select('id, data, cliente:clientes(nome, email), turma:turmas(modalidade, horario)')
    .eq('status', 'notificada')
    .is('email_enviado_em', null)
  if (error) throw error

  let enviados = 0
  for (const p of pendentes ?? []) {
    const cliente = p.cliente as unknown as { nome: string; email: string | null } | null
    const turma = p.turma as unknown as { modalidade: string | null; horario: string | null } | null
    if (!cliente?.email) continue

    const primeiroNome = cliente.nome?.split(' ')[0] ?? 'Olá'
    const modalidade = turma?.modalidade ?? 'sua aula'
    const assunto = `Vaga liberada — ${modalidade} · ${dataExtenso(p.data)}`
    const corpo = `Oi, ${primeiroNome}! 🎉<br><br>
      Abriu uma vaga na aula que você estava esperando:<br><br>
      <strong style="color:#241f33">${modalidade}</strong><br>
      ${dataExtenso(p.data)} às ${hhmm(turma?.horario ?? null)}<br><br>
      A vaga está <strong>reservada para você por ${minutos} minutos</strong>. Entre no app e confirme para garantir seu lugar — passado o prazo, ela vai para a próxima da fila.`
    const html = layout('Sua vaga abriu!', corpo, { texto: 'Confirmar minha vaga', url: PORTAL })

    try {
      await enviarResend(cliente.email, assunto, html)
      await supabase
        .from('lista_espera')
        .update({ email_enviado_em: new Date().toISOString() })
        .eq('id', p.id)
      enviados++
    } catch (e) {
      console.error(`Falha ao enviar para ${cliente.email}:`, (e as Error).message)
      // não marca como enviado: tenta de novo na próxima varredura
    }
  }
  return enviados
}

Deno.serve(async () => {
  try {
    const enviados = await processarListaEspera()
    return new Response(JSON.stringify({ ok: true, enviados }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Erro no disparo:', (e as Error).message)
    return new Response(JSON.stringify({ ok: false, erro: (e as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
