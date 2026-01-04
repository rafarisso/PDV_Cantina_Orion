import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const pagSeguroToken = process.env.PAGSEGURO_TOKEN
const pagSeguroBase = process.env.PAGSEGURO_BASE_URL ?? 'https://pix.api.pagseguro.com'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }
  try {
    const body = JSON.parse(event.body ?? '{}')
    const { studentId, guardianId, amount, description } = body
    if (!guardianId || !amount) {
      return { statusCode: 400, body: 'guardianId e amount sao obrigatorios' }
    }
    if (!pagSeguroToken) {
      return { statusCode: 500, body: 'PAGSEGURO_TOKEN ausente' }
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const payload = {
      reference_id: studentId ?? guardianId,
      expiration_date: expiresAt,
      value: { amount: Number(amount).toFixed(2) },
      additional_information: [{ name: 'descricao', value: description ?? 'Cantina Orion' }],
    }

    const response = await fetch(`${pagSeguroBase}/charges`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${pagSeguroToken}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await response.text()
      return { statusCode: response.status, body: `Erro PagSeguro: ${text}` }
    }

    const result = await response.json()
    const txid = result.charge_id ?? result.txid ?? crypto.randomUUID()
    const brCode = result.qr_codes?.[0]?.emv ?? result.brCode ?? result.payload ?? ''

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      await supabase.from('pix_charges').insert({
        guardian_id: guardianId,
        student_id: studentId,
        amount,
        status: 'pending',
        br_code: brCode,
        txid,
        description,
        expires_at: expiresAt,
      })
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ txid, brCode, expiresAt }),
    }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: (err as Error).message }
  }
}

export { handler }
