import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

export const config = {
  schedule: '0 21 * * 5', // sexta 18:00 America/Sao_Paulo (UTC-3)
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const fromName = process.env.WHATSAPP_FROM_NAME ?? 'Cantina Orion'
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

  for (const guardianId of Object.keys(grouped)) {
    const rows = grouped[guardianId]
    const { data: guardian } = await supabase
      .from('guardians')
      .select('full_name, phone')
      .eq('id', guardianId)
      .maybeSingle()

    const toPhone = await normalizePhoneDb(supabase, guardian?.phone ?? '')
    const summary = rows.map((row) => ({
      student_id: row.student_id,
      student_name: row.full_name,
      total_spent: Number(row.total_spent ?? 0),
      first_purchase: row.first_purchase,
      last_purchase: row.last_purchase,
    }))
    const totalSpent = summary.reduce((acc, row) => acc + row.total_spent, 0)
    const firstPurchase = summary.reduce<string | null>((acc, row) => {
      if (!row.first_purchase) return acc
      if (!acc || Date.parse(row.first_purchase) < Date.parse(acc)) return row.first_purchase
      return acc
    }, null)
    const lastPurchase = summary.reduce<string | null>((acc, row) => {
      if (!row.last_purchase) return acc
      if (!acc || Date.parse(row.last_purchase) > Date.parse(acc)) return row.last_purchase
      return acc
    }, null)

    const bodyLines = summary.map(
      (row) =>
        `- ${row.student_name}: ${formatCurrency(row.total_spent)} (de ${formatDateSafe(
          row.first_purchase,
        )} a ${formatDateSafe(row.last_purchase)})`,
    )
    const message = [
      `${fromName}`,
      'Resumo semanal',
      ...bodyLines,
      appBase ? `Acompanhe: ${appBase}/painel-do-responsavel` : '',
    ]
      .filter(Boolean)
      .join('\n')

    await supabase.from('notification_outbox').insert({
      guardian_id: guardianId,
      kind: 'weekly_report',
      to_phone: toPhone,
      payload: {
        message,
        period: {
          start: firstPurchase,
          end: lastPurchase,
        },
        total_spent: totalSpent,
        first_purchase: firstPurchase,
        last_purchase: lastPurchase,
        summary,
      },
      status: 'pending',
    })
  }

  return { statusCode: 200, body: 'weekly report queued' }
}

export { handler }

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0))

const formatDate = (iso: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(iso))

const formatDateSafe = (iso?: string | null) => (iso ? formatDate(iso) : '-')

const normalizePhoneDb = async (supabase: any, phone: string) => {
  const { data } = await supabase.rpc('normalize_phone', { p_input: phone }).maybeSingle()
  return data ?? phone
}
