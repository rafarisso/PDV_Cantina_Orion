import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { isZapiConfigured, sendWhatsAppText } from './zapiSend'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const batchSize = 20

const handler: Handler = async () => {
  if (!supabaseUrl || !supabaseServiceKey) return { statusCode: 500, body: 'Supabase config missing' }
  if (!isZapiConfigured()) return { statusCode: 200, body: 'Z-API not configured' }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: pending, error } = await supabase
    .from('notification_outbox')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (error) return { statusCode: 500, body: error.message }
  if (!pending?.length) return { statusCode: 200, body: 'no pending messages' }

  for (const msg of pending) {
    const attempt = (msg.attempt_count ?? 0) + 1
    const message = msg.payload?.message ?? ''
    const toPhone = msg.to_phone
    const result = await sendWhatsAppText(toPhone, message)

    if (result.ok) {
      await supabase
        .from('notification_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), attempt_count: attempt, last_error: null })
        .eq('id', msg.id)
    } else {
      await supabase
        .from('notification_outbox')
        .update({ status: 'failed', attempt_count: attempt, last_error: result.error ?? 'send error' })
        .eq('id', msg.id)
    }
  }

  return { statusCode: 200, body: `processed ${pending.length}` }
}

export { handler }
