import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  if (!supabaseUrl || !supabaseServiceKey) return { statusCode: 500, body: 'Supabase service key ausente' }

  try {
    const body = JSON.parse(event.body ?? '{}')
    const { studentId, items } = body
    if (!studentId || !Array.isArray(items)) {
      return { statusCode: 400, body: 'studentId e items sao obrigatorios' }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data, error } = await supabase.rpc('process_purchase', {
      p_student_id: studentId,
      p_items: items,
    })
    if (error) {
      return { statusCode: 400, body: error.message }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ orderId: data }),
    }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: (err as Error).message }
  }
}

export { handler }
