import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const webhookSecret = process.env.PAGSEGURO_WEBHOOK_SECRET

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  if (!supabaseUrl || !supabaseServiceKey) return { statusCode: 500, body: 'Supabase service key ausente' }

  try {
    const signature = event.headers['x-pagseguro-signature'] || event.headers['X-Pagseguro-Signature']
    if (webhookSecret && signature !== webhookSecret) {
      return { statusCode: 401, body: 'Assinatura invalida' }
    }

    const payload = JSON.parse(event.body ?? '{}')
    const txid = payload.txid ?? payload.charge_id
    const status = payload.status ?? payload.charge_status
    const amount = Number(payload.amount ?? payload.value?.amount ?? 0)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: charge } = await supabase.from('pix_charges').select('*').eq('txid', txid).maybeSingle()

    if (!charge) {
      return { statusCode: 404, body: 'Cobranca nao localizada' }
    }

    const brCode = payload.qr_codes?.[0]?.emv ?? charge.br_code ?? ''
    const { error: rpcError } = await supabase.rpc('create_topup_charge', {
      p_guardian_id: charge.guardian_id,
      p_student_id: charge.student_id,
      p_amount: amount,
      p_status: status,
      p_br_code: brCode,
      p_txid: txid,
      p_description: charge.description ?? 'Pagamento Pix',
    })
    if (rpcError) {
      return { statusCode: 400, body: rpcError.message }
    }

    return { statusCode: 200, body: 'ok' }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: (err as Error).message }
  }
}

export { handler }
