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
// A fila de pedidos de contratação — é desta aba que a gestão aprova a vaga.
const CONTRATACOES_ERP = 'https://sistema.studiopolel.com.br/#/matriculas?aba=contratacoes'
const AGENDA_ERP = 'https://sistema.studiopolel.com.br/#/agenda'
const MATRICULAS_PAUSAS = 'https://sistema.studiopolel.com.br/#/matriculas?aba=pausas'
const MATRICULAS_CONVIDADOS = 'https://sistema.studiopolel.com.br/#/matriculas?aba=convidados'
const MATRICULAS_EM_ABERTO = 'https://sistema.studiopolel.com.br/#/matriculas?aba=em_aberto'
const WELLHUB_ERP = 'https://sistema.studiopolel.com.br/#/financeiro/wellhub'
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
      // O abatimento da experimental (10.1) precisa estar DITO: o aluno
      // comparou o preço na tela do plano e vai estranhar um valor
      // menor. Dizer que é o desconto dele transforma susto em bônus.
      const abatido = Number(d.abatimento_centavos ?? 0)
      return {
        assunto: 'Sua mensalidade do Studio Pole L',
        html: layout('Mensalidade disponível 💜',
          `Oi, ${nome}! A mensalidade de <strong style="color:#241f33">${produto}</strong> já pode ser paga.<br><br>
           Valor: <strong>${valor}</strong><br>
           Vence em: <strong>${venc}</strong><br><br>
           ${abatido > 0
             ? `Já com <strong>${fmtReais(abatido)}</strong> abatidos da sua aula experimental 💜 O abatimento vale nesta primeira cobrança.<br><br>`
             : ''}
           É só abrir o link e escolher como pagar.`,
          { texto: 'Pagar agora', url }),
      }
    }
    // Regulamento 4.7 + procedimento interno: "quando a terceira falta
    // acontecer, avisar por escrito no mesmo dia e registrar. Não deixar
    // a pessoa descobrir sozinha na hora de agendar." Este e-mail é a
    // parte "por escrito" — sem ele a regra vira uma surpresa ruim.
    case 'suspensao_faltas': {
      // Os padrões acompanham o regulamento 4.7 de 01/10/2026 (2 faltas,
      // 20 dias). Eles só entram se o enfileiramento vier sem os campos —
      // mas um padrão errado é uma mentira esperando a hora de sair.
      const faltas = (d.faltas as number) ?? 2
      const dias = (d.dias as number) ?? 20
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
    // ---- Contratação ----
    // Os quatro avisos de `solicitacoes_contratacao` NÃO EXISTIAM aqui.
    // `avisar_aluno_contratacao()` os enfileirava desde 24/09 e o laço
    // abaixo marcava cada um como "tipo desconhecido: …" — ou seja: todo
    // aluno que contratou um plano pelo portal, por crédito ou não, não
    // recebeu e-mail nenhum, e a fila foi acumulando linhas em `erro`.
    // Achado ao fechar o fluxo da turma fixa, que depende de e-mail para
    // existir.
    case 'contratacao_para_aprovar': {
      const turmas = (d.turmas as string[]) ?? []
      const fixa = ((d.turmas_fixas as number) ?? 0) > 0
      return {
        assunto: `${fixa ? 'Turma fixa' : 'Contratação'} para confirmar — ${esc(d.nome)}`,
        html: layout(fixa ? 'Pedido de turma fixa' : 'Contratação para aprovar',
          `${esc(d.nome)} pediu <strong style="color:#241f33">${esc(d.produto)}</strong> pelo ${d.origem === 'portal' ? 'portal do aluno' : 'atendimento'} em ${esc(d.solicitada_em)}.<br><br>
           ${fixa
             ? `<strong style="color:#241f33">Nenhuma cobrança foi emitida.</strong> O assento sai da capacidade da sala, então o pedido espera a confirmação da vaga:<br><br>
                <table style="border-collapse:collapse;font-size:14px;line-height:1.5">
                  ${turmas.map((t) => `<tr><td style="padding:3px 0;color:#241f33">• ${esc(t)}</td></tr>`).join('')}
                </table><br>
                Confira a vaga na Agenda antes de aprovar. Aprovar é o que libera a cobrança.`
             : '<strong style="color:#241f33">Nenhuma cobrança foi emitida.</strong> Este produto exige aprovação antes do pagamento.'}
           <br><br>
           <table style="border-collapse:collapse;font-size:14px;line-height:1.5">
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Valor</td><td style="padding:3px 0;color:#241f33">${fmtReais(d.valor_centavos as number)}</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Telefone</td><td style="padding:3px 0;color:#241f33">${esc(d.telefone) || '—'}</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">E-mail</td><td style="padding:3px 0;color:#241f33">${esc(d.email) || '—'}</td></tr>
           </table>`,
          { texto: 'Ver pedidos de contratação', url: CONTRATACOES_ERP }),
      }
    }
    case 'contratacao_aguardando_aprovacao': {
      const turmas = (d.turmas as string[]) ?? []
      return {
        assunto: 'Recebemos seu pedido — estamos confirmando a vaga',
        html: layout('Pedido recebido',
          `Oi, ${nome}! Recebemos seu pedido de <strong style="color:#241f33">${esc(d.produto)}</strong> em ${esc(d.solicitada_em)}.<br><br>
           ${turmas.length
             ? `Turma${turmas.length > 1 ? 's' : ''} que você escolheu:<br>
                <table style="border-collapse:collapse;font-size:14px;line-height:1.5;margin-top:6px">
                  ${turmas.map((t) => `<tr><td style="padding:3px 0;color:#241f33">• ${esc(t)}</td></tr>`).join('')}
                </table><br>
                Como a sua vaga fica reservada durante todo o plano, ela sai da capacidade da turma — por isso a equipe confere se há lugar antes de qualquer cobrança.<br><br>`
             : 'A equipe confirma seu pedido antes de qualquer cobrança.<br><br>'}
           <strong style="color:#241f33">Nada foi cobrado.</strong> Você recebe um e-mail assim que a vaga for confirmada, e só então o pagamento é liberado.<br><br>
           Mudou de ideia? Dá para desistir do pedido no app, em “Meu plano”.`,
          { texto: 'Ver meu pedido', url: `${PORTAL}/meu-plano` }),
      }
    }
    case 'contratacao_aprovada': {
      const turmas = (d.turmas as string[]) ?? []
      return {
        assunto: turmas.length ? 'Sua vaga está confirmada!' : 'Sua contratação foi aprovada',
        html: layout(turmas.length ? 'Vaga confirmada 💜' : 'Contratação aprovada',
          `Oi, ${nome}! ${turmas.length ? 'Sua vaga está garantida' : 'Seu pedido foi aprovado'} em <strong style="color:#241f33">${esc(d.produto)}</strong>.<br><br>
           ${turmas.length
             ? `<table style="border-collapse:collapse;font-size:14px;line-height:1.5;margin-bottom:14px">
                  ${turmas.map((t) => `<tr><td style="padding:3px 0;color:#241f33">• ${esc(t)}</td></tr>`).join('')}
                </table>`
             : ''}
           Faltam dois passos, os dois no app: <strong style="color:#241f33">ler e aceitar o Contrato de Adesão</strong> e pagar. Valor: <strong>${fmtReais(d.valor_centavos as number)}</strong>.<br><br>
           ${turmas.length ? 'Seu lugar fica reservado a partir do primeiro pagamento confirmado.' : 'Seus créditos são liberados assim que o pagamento for confirmado.'}`,
          { texto: 'Aceitar o contrato e pagar', url: `${PORTAL}/meu-plano` }),
      }
    }
    case 'contratacao_recusada':
      return {
        assunto: 'Sobre o seu pedido de plano',
        html: layout('Não conseguimos confirmar seu pedido',
          `Oi, ${nome}. Não foi possível seguir com o pedido de <strong style="color:#241f33">${esc(d.produto)}</strong>.<br><br>
           <strong style="color:#241f33">Motivo:</strong> ${esc(d.motivo)}<br><br>
           <strong>Nada foi cobrado.</strong> Se quiser, dá para escolher outra turma ou outro plano no app — e, se preferir conversar, é só responder este e-mail.`,
          { texto: 'Ver os planos', url: `${PORTAL}/planos` }),
      }
    case 'contratacao_concluida':
      return {
        assunto: 'Tudo certo! Seu plano está ativo',
        html: layout('Plano ativo 💜',
          `Oi, ${nome}! Recebemos seu pagamento e o plano <strong style="color:#241f33">${esc(d.produto)}</strong> já está ativo.<br><br>
           O contrato que você aceitou, com data e hora, fica guardado em “Meu plano → Documentos”.<br><br>
           Bons treinos!`,
          { texto: 'Ver minhas aulas', url: PORTAL }),
      }
    // Regulamento 5.1–5.2: a aula abaixo do mínimo se cancela sozinha, e a
    // equipe fica sabendo. Cancelamento automático sem aviso é o pior dos
    // dois mundos — ninguém confia no sistema e ninguém sabe o que houve.
    //
    // O assunto leva a turma e a hora porque este e-mail é lido no celular,
    // de relance, e a pergunta é sempre "qual aula?".
    case 'aula_cancelada_quorum': {
      const agendados = (d.agendados as number) ?? 0
      return {
        assunto: `Aula cancelada por quórum — ${esc(d.turma)}`,
        html: layout('Aula cancelada automaticamente',
          `A aula abaixo não atingiu o mínimo de alunos até o prazo de conferência e <strong style="color:#241f33">foi cancelada pelo sistema</strong>.<br><br>
           <table style="border-collapse:collapse;font-size:14px;line-height:1.5">
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Turma</td><td style="padding:3px 0;color:#241f33">${esc(d.turma)}</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Data</td><td style="padding:3px 0;color:#241f33">${dataCompleta(d.data as string)} às ${hhmm(d.horario as string)}</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Agendados</td><td style="padding:3px 0;color:#241f33">${agendados} de ${d.minimo} necessários</td></tr>
           </table><br>
           ${agendados > 0
             ? 'Quem estava agendado já foi avisado por e-mail e teve o crédito devolvido.'
             : 'Ninguém estava agendado, então não houve aviso a aluno.'}
           <br><br>
           Quer fazer a aula mesmo assim? Reabra em <strong>Agenda → Canceladas</strong>: a vaga volta a ser oferecida, mas os alunos avisados precisam agendar de novo.`,
          { texto: 'Abrir a Agenda', url: AGENDA_ERP }),
      }
    }
    // ---- Pausa do plano (regulamento §7) ----
    // Seis avisos para um fluxo que o aluno não vê acontecer: ele pede e
    // espera. Sem e-mail em cada passo, a única forma de saber em que pé
    // está é abrir o app — e a pausa mexe na data de cobrança dele, que é
    // a informação que mais gera dúvida depois.
    case 'pausa_solicitada': {
      const dias = (d.dias as number) ?? 0
      return {
        assunto: `Pausa solicitada — ${esc(d.nome)} · ${dias} dias`,
        html: layout('Pedido de pausa de plano',
          `${esc(d.nome)} pediu pausa do plano <strong style="color:#241f33">${esc(d.plano)}</strong> em ${esc(d.solicitada_em)}.<br><br>
           <table style="border-collapse:collapse;font-size:14px;line-height:1.5">
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Tipo</td><td style="padding:3px 0;color:#241f33">${esc(d.tipo)}</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Período</td><td style="padding:3px 0;color:#241f33">${dataCompleta(d.inicio as string)} a ${dataCompleta(d.fim as string)} (${dias} dias)</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Telefone</td><td style="padding:3px 0;color:#241f33">${esc(d.telefone) || '—'}</td></tr>
             ${d.observacao ? `<tr><td style="padding:3px 12px 3px 0;color:#928aa6;vertical-align:top">Observação</td><td style="padding:3px 0;color:#241f33">“${esc(d.observacao)}”</td></tr>` : ''}
           </table><br>
           <strong style="color:#241f33">A pausa só vale depois de aprovada.</strong> Enquanto isso o plano segue ativo e a cobrança também.`,
          { texto: 'Ver pedidos de pausa', url: MATRICULAS_PAUSAS }),
      }
    }
    case 'pausa_recebida':
      return {
        assunto: 'Recebemos seu pedido de pausa',
        html: layout('Pedido de pausa recebido',
          `Oi, ${nome}! Recebemos seu pedido de pausa do plano <strong style="color:#241f33">${esc(d.plano)}</strong> em ${esc(d.solicitada_em)}, de ${dataCompleta(d.inicio as string)} a ${dataCompleta(d.fim as string)}.<br><br>
           <strong style="color:#241f33">Seu plano continua ativo até a pausa ser confirmada</strong> — inclusive a cobrança. A equipe analisa e você recebe um e-mail com a resposta.<br><br>
           A data e a hora deste pedido ficam registradas: é o que garante que ele foi feito antes da pausa começar.`,
          { texto: 'Ver meu plano', url: `${PORTAL}/meu-plano` }),
      }
    case 'pausa_aprovada':
      return {
        assunto: 'Sua pausa foi aprovada',
        html: layout('Pausa aprovada',
          `Oi, ${nome}! Sua pausa do plano <strong style="color:#241f33">${esc(d.plano)}</strong> está confirmada para <strong>${dataCompleta(d.inicio as string)} a ${dataCompleta(d.fim as string)}</strong>.<br><br>
           Durante esse período a cobrança e o ciclo ficam <strong style="color:#241f33">congelados</strong>: você não é cobrado, não perde créditos, e os dias pausados são devolvidos no fim da vigência.<br><br>
           Quer voltar antes? É só avisar — você só "gasta" os dias que de fato pausar.
           ${d.motivo ? `<br><br>Observação da equipe: ${esc(d.motivo)}` : ''}`,
          { texto: 'Ver meu plano', url: `${PORTAL}/meu-plano` }),
      }
    case 'pausa_recusada':
      return {
        assunto: 'Sobre o seu pedido de pausa',
        html: layout('Não conseguimos aprovar a pausa',
          `Oi, ${nome}. Não foi possível aprovar a pausa do plano <strong style="color:#241f33">${esc(d.plano)}</strong>.<br><br>
           <strong style="color:#241f33">Motivo:</strong> ${esc(d.motivo)}<br><br>
           Seu plano <strong>continua ativo normalmente</strong>, sem nenhuma alteração. Se quiser conversar sobre outra data, é só responder este e-mail.`,
          { texto: 'Ver meu plano', url: `${PORTAL}/meu-plano` }),
      }
    case 'pausa_iniciada':
      return {
        assunto: 'Seu plano está pausado',
        html: layout('Plano pausado 🤍',
          `Oi, ${nome}! A partir de hoje seu plano <strong style="color:#241f33">${esc(d.plano)}</strong> está pausado, com volta prevista para <strong>${dataCompleta(d.fim as string)}</strong>.<br><br>
           Enquanto estiver pausado você não é cobrado e não consegue agendar aulas. Seus créditos ficam guardados: a validade deles anda junto com a pausa.<br><br>
           Até já! 💜`,
          { texto: 'Ver meu plano', url: `${PORTAL}/meu-plano` }),
      }
    // O único e-mail da série que precisa dizer um número novo: a data de
    // cobrança do aluno MUDOU, porque a pausa empurra o aniversário do
    // ciclo. Descobrir isso só quando a cobrança chega em outro dia é o
    // tipo de surpresa que gera desconfiança.
    case 'pausa_encerrada': {
      const dias = (d.dias as number) ?? 0
      return {
        assunto: 'Seu plano voltou!',
        html: layout('De volta aos treinos 💜',
          `Oi, ${nome}! Seu plano <strong style="color:#241f33">${esc(d.plano)}</strong> está ativo de novo e você já pode agendar.<br><br>
           A pausa durou <strong>${dias} ${dias === 1 ? 'dia' : 'dias'}</strong>, e esses dias foram devolvidos no fim da sua vigência${d.nova_vigencia ? `: ela agora vai até <strong>${dataCompleta(d.nova_vigencia as string)}</strong>` : ''}.<br><br>
           <strong style="color:#241f33">Por isso a sua data de cobrança mudou</strong> — ela acompanhou os dias pausados, para você não pagar por tempo que não usou.`,
          { texto: 'Agendar uma aula', url: PORTAL }),
      }
    }
    // ---- Convidado do semestral (regulamento 11.1) ----
    // O convidado não tem conta no portal, então o e-mail é o único canal
    // deste fluxo: quem indicou só descobre a decisão por aqui. O aviso à
    // gestão carrega o telefone de propósito — é o que permite dar um
    // retorno à pessoa quando o convite é recusado por nível.
    case 'convidado_indicado':
      return {
        assunto: `Convidado indicado — ${esc(d.convidado)} (${esc(d.nome)})`,
        html: layout('Um convidado esperando confirmação',
          `${esc(d.nome)} indicou um convidado em ${esc(d.solicitada_em)}.<br><br>
           <table style="border-collapse:collapse;font-size:14px;line-height:1.5">
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Convidado</td><td style="padding:3px 0;color:#241f33">${esc(d.convidado)}</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Telefone</td><td style="padding:3px 0;color:#241f33">${esc(d.telefone_convidado) || '—'}</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Aula</td><td style="padding:3px 0;color:#241f33">${esc(d.turma)}</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Data</td><td style="padding:3px 0;color:#241f33">${dataCompleta(d.data as string)}${d.horario ? ` às ${hhmm(d.horario as string)}` : ''}</td></tr>
             ${d.observacao ? `<tr><td style="padding:3px 12px 3px 0;color:#928aa6;vertical-align:top">Observação</td><td style="padding:3px 0;color:#241f33">“${esc(d.observacao)}”</td></tr>` : ''}
           </table><br>
           O sistema já conferiu plano ativo, carência de 6 meses, benefício do ciclo e se o titular está nessa aula.
           <strong style="color:#241f33">O que falta é a sua parte: nível e segurança.</strong> A vaga só é tomada quando você confirmar.`,
          { texto: 'Ver os convidados', url: MATRICULAS_CONVIDADOS }),
      }
    case 'convidado_confirmado':
      return {
        assunto: `Convidado confirmado — ${esc(d.convidado)}`,
        html: layout('Convidado confirmado 💜',
          `Oi, ${nome}! <strong style="color:#241f33">${esc(d.convidado)}</strong> está confirmado na sua aula de ${esc(d.turma)}, em ${dataCompleta(d.data as string)}.<br><br>
           A vaga já está reservada no nome dele. Peça para chegar uns 10 minutos antes, com roupa de treino — na primeira vez tem um cadastrinho rápido na recepção.<br><br>
           Se ele não puder mais vir, avise com antecedência pelo app: dentro do prazo de cancelamento da aula, o seu convidado do ciclo volta a ficar disponível.`,
          { texto: 'Ver meu plano', url: `${PORTAL}/meu-plano` }),
      }
    case 'convidado_recusado':
      return {
        assunto: 'Sobre o seu convidado',
        html: layout('Não conseguimos confirmar o convidado',
          `Oi, ${nome}. Não foi possível confirmar <strong style="color:#241f33">${esc(d.convidado)}</strong> na aula de ${esc(d.turma)}, em ${dataCompleta(d.data as string)}.<br><br>
           <strong style="color:#241f33">Motivo:</strong> ${esc(d.motivo)}<br><br>
           <strong>O seu convidado deste ciclo não foi gasto</strong> — você pode indicar outra pessoa, ou a mesma em outra aula. Se quiser ajuda para escolher a turma, é só responder este e-mail.`,
          { texto: 'Ver meu plano', url: `${PORTAL}/meu-plano` }),
      }
    // ---- Desistência de 7 dias (regulamento 9.7 / CDC art. 49) ----
    // Este e-mail é o comprovante do acerto para o lado de lá. Quem
    // desiste fica esperando um Pix: sem o valor por escrito, não tem
    // como conferir se o que chegou está certo.
    case 'desistencia_registrada': {
      const aulas = (d.aulas as number) ?? 0
      const retido = Number(d.retido_centavos ?? 0)
      const devolvido = Number(d.devolvido_centavos ?? 0)
      return {
        assunto: 'Sua desistência foi registrada',
        html: layout('Desistência registrada',
          `Oi, ${nome}. Registramos a sua desistência de <strong style="color:#241f33">${esc(d.produto)}</strong>,
           dentro do prazo de arrependimento previsto no art. 49 do Código de Defesa do Consumidor.<br><br>
           <table style="border-collapse:collapse;font-size:14px;line-height:1.5">
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Valor pago</td><td style="padding:3px 0;color:#241f33">${fmtReais(Number(d.pago_centavos ?? 0))}</td></tr>
             ${retido > 0
               ? `<tr><td style="padding:3px 12px 3px 0;color:#928aa6">Aulas utilizadas</td><td style="padding:3px 0;color:#241f33">${aulas} ${aulas === 1 ? 'aula' : 'aulas'} · ${fmtReais(retido)}</td></tr>`
               : ''}
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6"><strong>A devolver</strong></td><td style="padding:3px 0;color:#241f33"><strong>${fmtReais(devolvido)}</strong></td></tr>
           </table><br>
           ${devolvido > 0
             ? 'A devolução é feita por Pix pela equipe. Se a chave que você quer usar for diferente da do pagamento, é só responder este e-mail.<br><br>'
             : ''}
           Seu plano foi encerrado hoje e as aulas que estavam marcadas foram canceladas.
           Esperamos ver você por aqui outra vez 💜`,
          { texto: 'Falar com a gente', url: PORTAL }),
      }
    }
    // ---- A cobrança que não foi paga (A27) ----
    // A gestão foi explícita sobre o limite: "não precisa ser algo no
    // sistema, será algo manual. O sistema só precisa nos avisar que a
    // cobrança não foi realizada." Então este e-mail não propõe régua de
    // cobrança nem fala em liberar vaga — ele conta o que houve e diz
    // quem é a pessoa, que é o que permite agir.
    case 'cobranca_falhou':
      return {
        assunto: `Cobrança não paga — ${esc(d.nome)}`,
        html: layout('Uma cobrança venceu sem pagamento',
          `A cobrança de <strong style="color:#241f33">${esc(d.nome)}</strong> venceu e não foi paga.<br><br>
           <table style="border-collapse:collapse;font-size:14px;line-height:1.5">
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Plano</td><td style="padding:3px 0;color:#241f33">${esc(d.plano)}</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Valor</td><td style="padding:3px 0;color:#241f33">${fmtReais(Number(d.valor_centavos ?? 0))}</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Venceu em</td><td style="padding:3px 0;color:#241f33">${dataCompleta(d.vencimento as string)}</td></tr>
             <tr><td style="padding:3px 12px 3px 0;color:#928aa6">Telefone</td><td style="padding:3px 0;color:#241f33">${esc(d.telefone) || '—'}</td></tr>
           </table><br>
           O plano ficou como <strong>pagamento em aberto</strong>: o aluno não consegue agendar novas aulas até regularizar, e os créditos dele não foram apagados.
           ${d.turma_fixa
             ? '<br><br><strong style="color:#241f33">Atenção: este aluno tem turma fixa.</strong> A vaga continua guardada — o sistema não libera sozinho. Se for o caso de oferecê-la a outra pessoa, isso é feito à mão na matrícula.'
             : ''}`,
          { texto: 'Ver quem está em aberto', url: MATRICULAS_EM_ABERTO }),
      }
    // ---- Plano Wellhub que o sistema não conhecia ----
    // O repasse da Wellhub depende do plano do assinante (Silver+, Gold…),
    // e o plano chega no payload do check-in. Quando aparece um que não
    // está na tabela, o sistema o cadastra sozinho pelo valor padrão e
    // pede o valor certo — porque receita prevista errada só aparece no
    // dia 15, quando o repasse real não bate.
    case 'wellhub_plano_novo':
      return {
        assunto: `Plano Wellhub novo: ${esc(d.nome)}`,
        html: layout('Um plano Wellhub que não conhecíamos',
          `Chegou um check-in de um plano novo: <strong style="color:#241f33">${esc(d.nome)}</strong> (id ${esc(String(d.product_id))}).<br><br>
           Por enquanto ele entra no financeiro pelo valor padrão, ${fmtReais(Number(d.valor_padrao_centavos ?? 0))} por check-in.
           Se o repasse desse plano for outro, é só informar — a previsão de receita passa a usar o valor certo daí em diante.<br><br>
           Isso não trava nada: o check-in foi registrado, a aula conta na chamada e a professora é paga normalmente.`,
          { texto: 'Informar o valor', url: WELLHUB_ERP }),
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
