// ============================================================
// Publica a grade real (turmas) como Class/Slot na Wellhub Booking API
// (docs/interno/wellhub-api-referencia.md §5, plano de 23/08/2026).
//
// Rodada 1x/dia via pg_cron -> net.http_post (mesmo molde de
// disparar_emails(), 20260806120000_cron_emails_via_vault.sql). Também pode
// ser invocada manualmente para homologação no sandbox.
//
// MECÂNICA: a Booking API não tem recorrência semanal — Slot é uma
// ocorrência DATADA (occur_date). Para cada turma ativa, geramos os Slots
// das próximas JANELA_DIAS a partir de hoje que ainda não foram publicados
// (turmas_wellhub_slots é o mapa turma+data -> slot, criado na migration
// 20260823100000). Idempotente: unique(turma_id, data) e o filtro por
// "ainda não publicado" evitam duplicar.
//
// Uma Class por MODALIDADE (não por turma) — criada uma vez, reaproveitada.
// `reference` carrega o id da modalidade, pro lado de lá saber de onde veio.
//
// Segredos: os mesmos do wellhub-webhook (WELLHUB_API_BASE, WELLHUB_GYM_ID,
// WELLHUB_API_TOKEN) + WELLHUB_DEFAULT_PRODUCT_ID — o "produto" Wellhub
// (ex.: 1095 Outdoor no sandbox) não é escolha nossa, vem de
// GET /setup/v1/gyms/:gym_id/products; todas as nossas turmas são
// presenciais, então um produto fixo serve por ora.
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const API_BASE = Deno.env.get('WELLHUB_API_BASE') ??
  'https://apitesting.partners.gympass.com'
const GYM_ID = Deno.env.get('WELLHUB_GYM_ID') ?? ''
const PRODUCT_ID = Deno.env.get('WELLHUB_DEFAULT_PRODUCT_ID') ?? ''
const JANELA_DIAS = 14

Deno.serve(async (_req) => {
  const bearer = Deno.env.get('WELLHUB_API_TOKEN') ?? ''
  if (!bearer || !GYM_ID || !PRODUCT_ID) {
    return json(500, { erro: 'WELLHUB_API_TOKEN/WELLHUB_GYM_ID/WELLHUB_DEFAULT_PRODUCT_ID ausentes' })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: turmas, error: erroTurmas } = await sb
    .from('turmas')
    .select(`
      id, dia_semana, horario, duracao_minutos, capacidade, modalidade_id,
      modalidades ( id, nome, wellhub_class_id ),
      salas ( nome ),
      professoras ( nome )
    `)
    .eq('ativa', true)
    .not('modalidade_id', 'is', null)

  if (erroTurmas) {
    return json(500, { erro: erroTurmas.message })
  }

  let classesCriadas = 0
  let slotsCriados = 0
  const falhas: string[] = []
  // Cache em memória por execução: turmas da MESMA modalidade aparecem em
  // linhas separadas na consulta acima, e sem isso cada uma recriaria a
  // Class (o `wellhub_class_id` só é atualizado no banco, não no array
  // `turmas` já carregado) — foi exatamente o que gerou Class duplicada no
  // primeiro teste em sandbox (23/08).
  const classIdPorModalidade = new Map<string, string>()

  for (const turma of turmas ?? []) {
    // deno-lint-ignore no-explicit-any
    const modalidade = (turma as any).modalidades
    // deno-lint-ignore no-explicit-any
    const sala = (turma as any).salas
    // deno-lint-ignore no-explicit-any
    const professora = (turma as any).professoras
    if (!modalidade || !sala || !professora) continue

    // ---- Class (1 por modalidade, criada só na primeira turma que precisar) ----
    let classId = classIdPorModalidade.get(modalidade.id) ??
      (modalidade.wellhub_class_id as string | null)
    if (!classId) {
      const criada = await criarClass(bearer, modalidade.nome, modalidade.id)
      if (!criada) {
        falhas.push(`class da modalidade ${modalidade.nome}`)
        continue
      }
      classId = criada
      classesCriadas++
      await sb
        .from('modalidades')
        .update({ wellhub_class_id: classId })
        .eq('id', modalidade.id)
    }
    classIdPorModalidade.set(modalidade.id, classId)

    // ---- Ocorrências futuras desta turma na janela, ainda não publicadas ----
    const datas = proximasOcorrencias(turma.dia_semana, JANELA_DIAS)
    if (datas.length === 0) continue

    const { data: jaPublicadas } = await sb
      .from('turmas_wellhub_slots')
      .select('data')
      .eq('turma_id', turma.id)
      .in('data', datas)

    const publicadasSet = new Set((jaPublicadas ?? []).map((r: { data: string }) => r.data))
    const novasDatas = datas.filter((d) => !publicadasSet.has(d))
    if (novasDatas.length === 0) continue

    const { count: agendados } = await sb
      .from('agendamentos')
      .select('id', { count: 'exact', head: true })
      .eq('turma_id', turma.id)
      .eq('status', 'agendado')

    for (const data of novasDatas) {
      const occurDate = `${data}T${turma.horario}-03:00`
      const slotId = await criarSlot(bearer, classId, {
        occur_date: occurDate,
        room: sala.nome,
        length_in_minutes: turma.duracao_minutos,
        total_capacity: turma.capacidade,
        total_booked: agendados ?? 0,
        product_id: Number(PRODUCT_ID),
        instructors: [{ name: professora.nome, substitute: false }],
      })
      if (!slotId) {
        falhas.push(`slot da turma ${turma.id} em ${data}`)
        continue
      }
      const { error: erroInsert } = await sb
        .from('turmas_wellhub_slots')
        .insert({ turma_id: turma.id, data, wellhub_slot_id: slotId })
      if (erroInsert) {
        falhas.push(`gravar mapa turma ${turma.id}/${data}: ${erroInsert.message}`)
        continue
      }
      slotsCriados++
    }
  }

  return json(200, { classesCriadas, slotsCriados, falhas })
})

// ------------------------------------------------------------
// POST /booking/v1/gyms/:gym_id/classes
// ------------------------------------------------------------
async function criarClass(
  bearer: string,
  nomeModalidade: string,
  modalidadeId: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/booking/v1/gyms/${GYM_ID}/classes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        classes: [{
          name: nomeModalidade,
          description: nomeModalidade,
          bookable: true,
          visible: true,
          product_id: Number(PRODUCT_ID),
          // reference é só courtesy — a Wellhub limita a 20 chars, então cabe
          // truncado. Não é usado pra lookup do nosso lado: quem faz esse
          // papel é wellhub_class_id, gravado de volta em modalidades após
          // a resposta desta chamada.
          reference: modalidadeId.replace(/-/g, '').slice(0, 20),
        }],
      }),
    })
    if (!res.ok) {
      console.error(`criarClass(${nomeModalidade}) HTTP ${res.status}: ${await res.text()}`)
      return null
    }
    const body = await res.json()
    // formato de resposta a confirmar na homologação (id da 1ª class criada)
    const id = body?.classes?.[0]?.id ?? body?.id
    return id ? String(id) : null
  } catch (e) {
    console.error(`criarClass(${nomeModalidade}) falha de rede:`, (e as Error).message)
    return null
  }
}

// ------------------------------------------------------------
// POST /booking/v1/gyms/:gym_id/classes/:class_id/slots
// ------------------------------------------------------------
async function criarSlot(
  bearer: string,
  classId: string,
  slot: {
    occur_date: string
    room: string
    length_in_minutes: number
    total_capacity: number
    total_booked: number
    product_id: number
    instructors: { name: string; substitute: boolean }[]
  },
): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_BASE}/booking/v1/gyms/${GYM_ID}/classes/${classId}/slots`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slot),
      },
    )
    const textoResposta = await res.text()
    if (!res.ok) {
      console.error(`criarSlot(${classId}, ${slot.occur_date}) HTTP ${res.status}: ${textoResposta}`)
      return null
    }
    let body: Record<string, unknown> = {}
    try {
      body = JSON.parse(textoResposta)
    } catch {
      console.error(`criarSlot(${classId}, ${slot.occur_date}) resposta não-JSON: ${textoResposta}`)
      return null
    }
    // Confirmado em sandbox (23/08): a resposta vem embrulhada em
    // { metadata, results: [{ id, ... }] }, igual ao /access/v1/validate —
    // não em `id` direto nem em `slots`.
    const id = (body?.results as { id?: unknown }[] | undefined)?.[0]?.id as
      | string
      | number
      | undefined
    if (!id) {
      console.error(`criarSlot(${classId}, ${slot.occur_date}) sem id reconhecível: ${textoResposta}`)
      return null
    }
    return String(id)
  } catch (e) {
    console.error(`criarSlot(${classId}, ${slot.occur_date}) falha de rede:`, (e as Error).message)
    return null
  }
}

// Próximas ocorrências (YYYY-MM-DD) de um dia_semana (0=domingo) dentro dos
// próximos `janelaDias`, a partir de hoje (inclusive).
function proximasOcorrencias(diaSemana: number, janelaDias: number): string[] {
  const datas: string[] = []
  const hoje = new Date()
  for (let i = 0; i < janelaDias; i++) {
    const d = new Date(hoje)
    d.setDate(hoje.getDate() + i)
    if (d.getDay() === diaSemana) {
      datas.push(d.toISOString().slice(0, 10))
    }
  }
  return datas
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
