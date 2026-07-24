// Disparo de e-mails do Studio Pole L.
//
// Varre a fila (emails_fila, status='pendente'), renderiza pelo `tipo` e
// envia pela Resend. Novos e-mails = novo caso no render(). Quem enfileira
// são os gatilhos/crons no banco (migration fila_emails_e_gatilhos).
//
// Segredos (env, nunca no repo — o repositório é público):
//   RESEND_API_KEY   — chave da Resend (cofre do Supabase)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — injetados pelo Supabase.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const REMETENTE = 'Studio Pole L <contato@studiopolel.com.br>'
const RESPONDER_PARA = 'carolinedsnunes@gmail.com'
const PORTAL = 'https://studiopoleltecnologia-dotcom.github.io/sistema/#/portal'
const LOGO_URL = 'https://fgvxhwpqsxohqrccrlfn.supabase.co/storage/v1/object/public/publico/logo.png'
const MAX_TENTATIVAS = 5

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const dataExtenso = (iso?: string | null): string => {
  if (!iso) return ''
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(a, m - 1, d, 12)
  return `${DIAS[dt.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}
const hhmm = (hora?: string | null): string => (hora ?? '').slice(0, 5)
const fmtReais = (cent?: number | null): string =>
  cent == null ? '' : `R$ ${(cent / 100).toFixed(2).replace('.', ',')}`
const primeiroNome = (nome?: string | null): string => (nome ?? '').split(' ')[0] || 'Olá'

function layout(titulo: string, corpo: string, cta?: { texto: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f5fa;padding:24px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#241f33">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e7e2ef">
    <div style="padding:22px 24px 18px;text-align:center;border-bottom:1px solid #f0edf5">
      <img src="${LOGO_URL}" alt="Studio Pole L" width="60" height="60" style="display:inline-block;border:0;border-radius:50%" />
      <div style="margin-top:8px;color:#574a78;font-weight:700;letter-spacing:.1em;font-size:12px">STUDIO POLE L</div>
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

type Dados = Record<string, unknown>
type Render = { assunto: string; html: string } | null

function render(tipo: string, d: Dados): Render {
  const nome = primeiroNome(d.nome as string)
  const modalidade = (d.modalidade as string) || 'sua aula'
  const data = dataExtenso(d.data as string)
  const hora = hhmm(d.horario as string)

  switch (tipo) {
    case 'vaga_liberada': {
      const mins = (d.minutos as number) ?? 30
      return {
        assunto: `Vaga liberada — ${modalidade} · ${data}`,
        html: layout('Sua vaga abriu! 🎉',
          `Oi, ${nome}!<br><br>Abriu uma vaga na aula que você estava esperando:<br><br>
           <strong style="color:#241f33">${modalidade}</strong><br>${data} às ${hora}<br><br>
           A vaga está <strong>reservada para você por ${mins} minutos</strong>. Confirme no app para garantir seu lugar — passado o prazo, ela vai para a próxima da fila.`,
          { texto: 'Confirmar minha vaga', url: PORTAL }),
      }
    }
    case 'confirmacao_agendamento':
      return {
        assunto: `Aula confirmada — ${modalidade} · ${data}`,
        html: layout('Presença confirmada ✓',
          `Oi, ${nome}! Sua aula está reservada:<br><br>
           <strong style="color:#241f33">${modalidade}</strong><br>${data} às ${hora}<br><br>
           Te esperamos! Se precisar desmarcar, é só cancelar pelo app dentro do prazo.`,
          { texto: 'Ver minhas aulas', url: PORTAL }),
      }
    case 'lembrete_aula':
      return {
        assunto: `Lembrete: sua aula é amanhã — ${modalidade}`,
        html: layout('Sua aula é amanhã 💜',
          `Oi, ${nome}! Passando para lembrar da sua aula:<br><br>
           <strong style="color:#241f33">${modalidade}</strong><br>${data} às ${hora}<br><br>
           Não vai poder ir? Cancele pelo app para liberar a vaga para outra aluna. 🙏`,
          { texto: 'Abrir o app', url: PORTAL }),
      }
    case 'vencimento': {
      const plano = (d.plano as string) || 'seu plano'
      const fim = dataExtenso(d.data_fim as string)
      const valor = fmtReais(d.valor_centavos as number)
      return {
        assunto: 'Sua mensalidade está vencendo',
        html: layout('Hora de renovar 🗓️',
          `Oi, ${nome}! Seu plano <strong style="color:#241f33">${plano}</strong> vence em <strong>${fim}</strong>.<br><br>
           ${valor ? `Valor da renovação: <strong>${valor}</strong>.<br><br>` : ''}
           Renove para não perder seus créditos e seguir agendando suas aulas normalmente.`,
          { texto: 'Renovar meu plano', url: PORTAL }),
      }
    }
    default:
      return null
  }
}

async function enviarResend(para: string, assunto: string, html: string) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMETENTE, to: [para], reply_to: RESPONDER_PARA, subject: assunto, html }),
  })
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`)
}

Deno.serve(async () => {
  const { data: pendentes, error } = await supabase
    .from('emails_fila')
    .select('*')
    .eq('status', 'pendente')
    .order('criado_em')
    .limit(100)
  if (error) {
    return new Response(JSON.stringify({ ok: false, erro: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  let enviados = 0
  for (const e of pendentes ?? []) {
    try {
      const r = render(e.tipo, e.dados ?? {})
      if (!r) {
        await supabase.from('emails_fila')
          .update({ status: 'erro', ultimo_erro: `tipo desconhecido: ${e.tipo}` })
          .eq('id', e.id)
        continue
      }
      await enviarResend(e.destinatario, r.assunto, r.html)
      await supabase.from('emails_fila')
        .update({ status: 'enviado', enviado_em: new Date().toISOString() })
        .eq('id', e.id)
      enviados++
    } catch (err) {
      const tentativas = (e.tentativas ?? 0) + 1
      await supabase.from('emails_fila')
        .update({
          tentativas,
          ultimo_erro: (err as Error).message,
          status: tentativas >= MAX_TENTATIVAS ? 'erro' : 'pendente',
        })
        .eq('id', e.id)
    }
  }

  return new Response(JSON.stringify({ ok: true, enviados }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
