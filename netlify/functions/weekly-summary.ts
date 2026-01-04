import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppText } from './zapiSend'

export const config = {
  schedule: '0 21 * * 5', // sexta 18:00 America/Sao_Paulo (UTC-3)
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const fromName = process.env.WHATSAPP_FROM_NAME ?? 'Cantina Órion'
const appBase = process.env.APP_BASE_URL ?? ''

const handler: Handler = async () => {
  if (!supabaseUrl || !supabaseServiceKey) return { statusCode: 500, body: 'Supabase service key ausente' }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data, error } = await supabase.from('weekly_consumption').select('*')
  if (error) return { statusCode: 500, body: error.message }

  const grouped: Record<string, any[]> = {}
  data?.forEach((row: any) => {
    const gid = row.guardian_id
    if (!grouped[gid]) grouped[gid] = []
    grouped[gid].push(row)
  })

  const messages: { guardian_id: string; to_phone: string; payload: any }[] = []

  for (const guardianId of Object.keys(grouped)) {
    const rows = grouped[guardianId]
    const { data: guardian } = await supabase
      .from('guardians')
      .select('full_name, phone')
      .eq('id', guardianId)
      .maybeSingle()
    const toPhone = await normalizePhoneDb(supabase, guardian?.phone ?? '')
    const bodyLines = rows.map(
      (r) =>
        `- ${r.full_name}: ${formatCurrency(r.total_spent)} (de ${formatDate(r.first_purchase)} a ${formatDate(r.last_purchase)})`,
    )
    const message = [
      `${fromName} 🍔`,
      `Resumo semanal`,
      ...bodyLines,
      appBase ? `Acompanhe: ${appBase}/portal` : '',
    ]
      .filter(Boolean)
      .join('\n')

    messages.push({
      guardian_id: guardianId,
      to_phone: toPhone,
      payload: { message, kind: 'weekly' },
    })
  }

  for (const msg of messages) {
    const { data: outbox } = await supabase
      .from('notification_outbox')
      .insert({
        guardian_id: msg.guardian_id,
        kind: 'weekly',
        to_phone: msg.to_phone,
        payload: msg.payload,
        status: 'pending',
      })
      .select('id')
      .maybeSingle()

    const sendResult = await sendWhatsAppText(msg.to_phone, msg.payload.message)
    if (sendResult.ok) {
      await supabase
        .from('notification_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), attempt_count: 1 })
        .eq('id', outbox?.id)
    } else {
      await supabase
        .from('notification_outbox')
        .update({
          status: 'failed',
          attempt_count: 1,
          last_error: sendResult.error ?? 'Erro ao enviar',
        })
        .eq('id', outbox?.id)
    }
  }

  return { statusCode: 200, body: 'weekly summary processed' }
}

export { handler }

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0))

const formatDate = (iso: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(iso))

const normalizePhoneDb = async (supabase: any, phone: string) => {
  const { data } = await supabase.rpc('normalize_phone', { p_input: phone }).maybeSingle()
  return data ?? phone
}
