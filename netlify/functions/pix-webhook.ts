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

    await supabase.from('pix_charges').update({ status, br_code: payload.qr_codes?.[0]?.emv }).eq('txid', txid)

    if (status === 'paid') {
      if (charge.student_id) {
        const { data: wallet } = await supabase.from('wallets').select('*').eq('student_id', charge.student_id).maybeSingle()
        if (wallet) {
          const isPrepaid = wallet.model === 'prepaid'
          const newBalance = isPrepaid ? Number(wallet.balance) + amount : Math.max(Number(wallet.balance) - amount, 0)
          await supabase
            .from('wallets')
            .update({ balance: newBalance, blocked: false, blocked_reason: null, allow_negative_once_used: isPrepaid ? wallet.allow_negative_once_used : wallet.allow_negative_once_used })
            .eq('id', wallet.id)
          await supabase.from('ledger').insert({
            wallet_id: wallet.id,
            kind: 'payment',
            amount: amount,
            balance_after: newBalance,
            description: 'Pagamento via Pix (PagSeguro)',
          })
        }
      }
    }

    return { statusCode: 200, body: 'ok' }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: (err as Error).message }
  }
}

export { handler }
