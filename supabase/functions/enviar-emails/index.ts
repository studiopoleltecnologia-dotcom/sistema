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
const MATRICULAS_ERP = 'https://sistema.studiopolel.com.br/#/matriculas?aba=cancelamentos'
// ?v muda quando a logo troca — fura o cache do Gmail (que guarda imagem por URL).
const LOGO_URL = 'https://fgvxhwpqsxohqrccrlfn.supabase.co/storage/v1/object/public/publico/logo.png?v=2'
const MAX_TENTATIVAS = 5

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const dataExtenso = (iso?: string | null): string => {
  if (!iso) return ''
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(a, m - 1, d, 12)
  return `${DIAS[dt.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}
/** "2026-10-16" → "16/10/2026" — prazo de contrato leva o ano. */
const dataCompleta = (iso?: string | null): string => {
  if (!iso) return ''
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
// Texto digitado pelo aluno (motivo do cancelamento) entra no HTML de
// um e-mail que a gestão abre: sem escapar, vira injeção de HTML.
const esc = (t?: unknown): string =>
  String(t ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const hhmm = (hora?: string | null): string => (hora ?? '').slice(0, 5)
const fmtReais = (cent?: number | null): string =>
  cent == null ? '' : `R$ ${(cent / 100).toFixed(2).replace('.', ',')}`
const primeiroNome = (nome?: string | null): string => (nome ?? '').split(' ')[0] || 'Olá'

function layout(titulo: string, corpo: string, cta?: { texto: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f5fa;padding:24px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#241f33">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e7e2ef">
    <div style="padding:22px 24px 18px;text-align:center;border-bottom:1px solid #f0edf5">
      <img src="${LOGO_URL}" alt="Studio Pole L" style="display:inline-block;border:0;height:64px;width:auto;max-width:220px" />
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
          `Oi, ${nome}! Sua aula está agendada:<br><br>
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
           Não vai poder ir? Cancele pelo app para liberar a vaga para outra pessoa. 🙏`,
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
    // A cobrança do ciclo, emitida sozinha pelo cron `emitir-cobrancas`.
    // Diferente de `vencimento`, que só avisa: aqui vai o LINK de
    // pagamento, e por isso o botão aponta para ele e não para o portal
    // — é o clique que resolve, sem escala pelo app.
    case 'cobranca_do_ciclo': {
      const produto = (d.produto as string) || 'seu plano'
      const valor = fmtReais(d.valor_centavos as number)
      const venc = dataExtenso(d.vencimento as string)
      const url = (d.url as string) || PORTAL
      return {
        assunto: 'Sua mensalidade do Studio Pole L',
        html: layout('Mensalidade disponível 💜',
          `Oi, ${nome}! A mensalidade de <strong style="color:#241f33">${produto}</strong> já pode ser paga.<br><br>
           Valor: <strong>${valor}</strong><br>
           Vence em: <strong>${venc}</strong><br><br>
           É só abrir o link e escolher como pagar.`,
          { texto: 'Pagar agora', url }),
      }
    }
    // Regulamento 4.7 + procedimento interno: "quando a terceira falta
    // acontecer, avisar por escrito no mesmo dia e registrar. Não deixar
    // a pessoa descobrir sozinha na hora de agendar." Este e-mail é a
    // parte "por escrito" — sem ele a regra vira uma surpresa ruim.
    case 'suspensao_faltas': {
      const faltas = (d.faltas as number) ?? 3
      const dias = (d.dias as number) ?? 15
      const ate = dataExtenso(d.ate as string)
      return {
        assunto: 'Sobre suas aulas — agendamento antecipado pausado',
        html: layout('Precisamos falar sobre as faltas',
          `Oi, ${nome}. Registramos <strong>${faltas} faltas sem cancelamento</strong> no seu ciclo atual.<br><br>
           Quando alguém falta sem avisar, a vaga fica vazia e quem estava na lista de espera perde a aula. Por isso, pelo nosso regulamento, seu <strong>agendamento antecipado fica pausado por ${dias} dias</strong>, até <strong>${ate}</strong>.<br><br>
           <strong style="color:#241f33">Você continua treinando nesse período.</strong> A diferença é que o agendamento passa a ser no mesmo dia da aula ou pela lista de espera.<br><br>
           Se algo aconteceu e você quer conversar, é só responder este e-mail.`,
          { texto: 'Ver minhas aulas', url: PORTAL }),
      }
    }
    // Regulamento 7.1. Os três e-mails do pedido de cancelamento: aviso à
    // gestão, comprovante ao aluno e a confirmação "por escrito".
    // As datas vêm prontas do banco (regras_cancelamento_plano) — aqui só
    // se formata, nunca se recalcula prazo.
    case 'cancelamento_solicitado': {
      const dentro = d.dentro_prazo === true
      const linha = (rotulo: string, valor: string) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#928aa6;white-space:nowrap;vertical-align:top">${rotulo}</td>` +
        `<td style="padding:4px 0;color:#241f33">${valor}</td></tr>`
      const situacao = dentro
        ? `<strong style="color:#1f726f">Dentro do prazo</strong> — a renovação de ${dataCompleta(d.proxima_renovacao as string)} não deve acontecer; plano ativo até ${dataCompleta(d.vigente_ate as string)}.`
        : `<strong style="color:#9c5a18">Fora do prazo</strong> — a renovação de ${dataCompleta(d.proxima_renovacao as string)} acontece (item 7.1); plano ativo até ${dataCompleta(d.vigente_ate as string)}.`
      const devolucao = d.saida_antecipada
        ? d.devolucao_centavos != null
          ? `${fmtReais(d.devolucao_centavos as number)} (estimativa pelo item 7.4 — isenta com atestado ou mudança de cidade, 7.5)`
          : 'Sai antes do fim do semestral — calcular pelo item 7.4'
        : ''
      return {
        assunto: `Cancelamento solicitado — ${d.nome as string} · ${dentro ? 'dentro do prazo' : 'FORA do prazo'}`,
        html: layout('Pedido de cancelamento de plano',
          `Um aluno pediu o cancelamento pelo portal. <strong style="color:#241f33">Nada foi cancelado ainda</strong> — o pedido espera a confirmação da gestão.<br><br>
           <table style="border-collapse:collapse;font-size:14px;line-height:1.5">
             ${linha('Aluno', esc(d.nome))}
             ${linha('Telefone', esc(d.telefone) || '—')}
             ${linha('E-mail', esc(d.email) || '—')}
             ${linha('Plano', `${esc(d.plano)} · ${esc(d.formato)} · ${esc(d.contrato)}`)}
             ${linha('Contratado em', dataCompleta(d.data_contratacao as string))}
             ${linha('Próxima renovação', dataCompleta(d.proxima_renovacao as string))}
             ${linha('Prazo do pedido', `até ${dataCompleta(d.prazo_limite as string)} (${d.dias_antecedencia} dias antes)`)}
             ${linha('Pedido feito em', esc(d.solicitada_em))}
             ${linha('Situação', situacao)}
             ${devolucao ? linha('Devolução do desconto', devolucao) : ''}
             ${linha('Motivo', d.motivo ? `“${esc(d.motivo)}”` : '<span style="color:#928aa6">não informado</span>')}
           </table>`,
          { texto: 'Ver pedidos de cancelamento', url: MATRICULAS_ERP }),
      }
    }
    case 'cancelamento_recebido': {
      const dentro = d.dentro_prazo === true
      const renovacao = dataCompleta(d.proxima_renovacao as string)
      const ate = dataCompleta(d.vigente_ate as string)
      return {
        assunto: 'Recebemos seu pedido de cancelamento',
        html: layout('Pedido recebido',
          `Oi, ${esc(nome)}! Recebemos o pedido de cancelamento do seu plano <strong style="color:#241f33">${esc(d.plano)}</strong> em ${esc(d.solicitada_em)}.<br><br>
           ${dentro
             ? `Como o pedido chegou dentro do prazo, a renovação de ${renovacao} não acontece. <strong style="color:#241f33">Seu plano continua ativo normalmente até ${ate}.</strong>`
             : `O prazo para impedir a renovação de ${renovacao} terminou em ${dataCompleta(d.prazo_limite as string)}. Pelo regulamento (item 7.1), o pedido vale para a renovação seguinte: a de ${renovacao} acontece normalmente e <strong style="color:#241f33">seu plano fica ativo até ${ate}</strong>.`}
           ${d.saida_antecipada
             ? `<br><br>Como o semestral ainda não completou os 6 ciclos, sair agora devolve o desconto já recebido (item 7.4)${d.devolucao_centavos != null ? `: <strong style="color:#241f33">${fmtReais(d.devolucao_centavos as number)}</strong>` : ''}. Não há cobrança em caso de problema de saúde com atestado ou mudança de cidade.`
             : ''}
           <br><br>A equipe confirma o cancelamento por escrito em breve. Mudou de ideia? Enquanto o pedido estiver em análise, dá para desistir dele no app.`,
          { texto: 'Ver meu plano', url: `${PORTAL}/meu-plano` }),
      }
    }
    case 'cancelamento_confirmado': {
      const ate = dataCompleta(d.vigente_ate as string)
      return {
        assunto: 'Cancelamento do plano confirmado',
        html: layout('Cancelamento confirmado',
          `Oi, ${esc(nome)}. Confirmamos o cancelamento do seu plano <strong style="color:#241f33">${esc(d.plano)}</strong>.<br><br>
           Seu plano continua ativo até <strong style="color:#241f33">${ate}</strong> e não há cobranças depois disso.
           ${d.devolucao_centavos != null
             ? `<br><br>Devolução do desconto do semestral (item 7.4): <strong style="color:#241f33">${fmtReais(d.devolucao_centavos as number)}</strong>. A equipe combina com você a forma de pagamento.`
             : ''}
           ${d.observacao ? `<br><br>${esc(d.observacao)}` : ''}
           <br><br>Foi muito bom ter você com a gente. Quando quiser voltar, é só escolher um plano no app. 💜`,
          { texto: 'Ver meu plano', url: `${PORTAL}/meu-plano` }),
      }
    }
    // Regulamento 7.7 — o semestral não renova por mais 6: vira mensal.
    // Aviso ANTES (com o prazo de cancelamento) e confirmação na virada.
    case 'fim_semestral': {
      const noPrazo = d.ainda_no_prazo === true
      return {
        assunto: `Seu semestral termina em ${dataCompleta(d.fim_semestral as string)}`,
        html: layout('Seu semestral está chegando ao fim',
          `Oi, ${esc(nome)}! Os 6 ciclos do seu plano <strong style="color:#241f33">${esc(d.plano)}</strong> terminam em <strong>${dataCompleta(d.fim_semestral as string)}</strong>.<br><br>
           Pelo regulamento (item 7.7), o semestral não renova por mais 6 ciclos: a partir de <strong>${dataCompleta(d.inicio_mensal as string)}</strong> seu plano passa a <strong style="color:#241f33">${esc(d.sucessor)}</strong>, por <strong>${fmtReais(d.preco_sucessor_centavos as number)}/mês</strong>, sem compromisso de permanência.<br><br>
           ${noPrazo
             ? `Não quer continuar? Peça o cancelamento pelo app até <strong>${dataCompleta(d.prazo_cancelamento as string)}</strong> para essa renovação não acontecer.`
             : `O prazo para impedir esta renovação terminou em ${dataCompleta(d.prazo_cancelamento as string)} — um pedido de cancelamento feito agora vale para a renovação seguinte.`}
           <br><br>Prefere manter o valor do semestral? Fale com a equipe para contratar um novo semestral.`,
          { texto: 'Ver meu plano', url: `${PORTAL}/meu-plano` }),
      }
    }
    case 'plano_virou_mensal':
      return {
        assunto: 'Seu plano agora é mensal',
        html: layout('Seu plano agora é mensal',
          `Oi, ${esc(nome)}! Seu semestral terminou e, como previsto no regulamento (item 7.7), seu plano passou a <strong style="color:#241f33">${esc(d.plano_novo)}</strong>, por <strong>${fmtReais(d.valor_centavos as number)}/mês</strong>, a partir de ${dataCompleta(d.inicio as string)}.<br><br>
           Próxima renovação: <strong>${dataCompleta(d.proxima_renovacao as string)}</strong>. Para cancelar antes dela, peça pelo app até ${dataCompleta(d.prazo_cancelamento as string)}.`,
          { texto: 'Ver meu plano', url: `${PORTAL}/meu-plano` }),
      }
    // Aula cancelada pelo estúdio. Uma mensagem para cada situação: quem
    // agendou recebe o crédito de volta, quem tem turma fixa recebe a
    // reposição (2.3.10), quem estava na fila só é avisado.
    case 'aula_cancelada': {
      const quando = `${dataExtenso(d.data as string)} às ${hora}`
      const situacao = d.situacao as string
      const recado = d.mensagem ? `<br><br><em>“${esc(d.mensagem)}”</em>` : ''
      let consequencia = ''
      if (situacao === 'agendada') {
        consequencia = d.credito_devolvido
          ? 'O crédito dessa aula já <strong>voltou para o seu saldo</strong> — é só escolher outra aula no app.'
          : 'Seu agendamento foi cancelado.'
      } else if (situacao === 'turma_fixa') {
        consequencia = d.reposicao
          ? `Como é a sua turma fixa, você ganhou <strong>1 crédito de reposição</strong>, válido até ${dataCompleta(d.validade_reposicao as string)}, para fazer outra aula.`
          : 'A equipe vai falar com você sobre a reposição dessa aula.'
      } else if (situacao === 'fila') {
        consequencia = 'Você estava na lista de espera dessa aula; a lista foi encerrada.'
      } else if (situacao === 'app') {
        consequencia = 'Seu agendamento foi feito pelo aplicativo parceiro: confira por lá.'
      }
      return {
        assunto: `Aula cancelada — ${modalidade} · ${data}`,
        html: layout('Aula cancelada',
          `Oi, ${esc(nome)}. A aula de <strong style="color:#241f33">${esc(modalidade)}</strong> de ${quando} foi cancelada pelo estúdio (${esc(d.motivo)}).${recado}<br><br>
           ${consequencia}<br><br>Sentimos pelo transtorno.`,
          { texto: 'Ver agenda', url: `${PORTAL}/agenda` }),
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
