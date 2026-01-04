import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppText } from './zapiSend'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const appBase = process.env.APP_BASE_URL ?? ''
const fromName = process.env.WHATSAPP_FROM_NAME ?? 'Cantina Órion'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }
  if (!supabaseUrl || !supabaseServiceKey) return { statusCode: 500, body: 'Supabase config missing' }

  try {
    const { orderId } = JSON.parse(event.body ?? '{}')
    if (!orderId) return { statusCode: 400, body: 'orderId obrigatorio' }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        `
        id,
        student_id,
        total,
        created_at,
        students:student_id (
          full_name,
          grade,
          period,
          guardian_id,
          pricing_model
        )
      `,
      )
      .eq('id', orderId)
      .maybeSingle()
    if (orderError || !order) return { statusCode: 404, body: 'Pedido nao encontrado' }

    const { data: items } = await supabase
      .from('order_items')
      .select(
        `
        quantity,
        unit_price,
        products:product_id (name)
      `,
      )
      .eq('order_id', orderId)

    const studentRel = Array.isArray(order.students) ? order.students[0] : order.students
    const student = studentRel as any
    const guardianId = student?.guardian_id
    if (!guardianId) return { statusCode: 400, body: 'Responsavel nao encontrado' }

    const { data: guardian } = await supabase
      .from('guardians')
      .select('full_name, phone')
      .eq('id', guardianId)
      .maybeSingle()

    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance, credit_limit, model')
      .eq('student_id', order.student_id)
      .maybeSingle()

    const toPhoneRaw = guardian?.phone ?? ''
    const toPhone = await normalizePhoneDb(supabase, toPhoneRaw)

    const safeItems: any[] = Array.isArray(items) ? items : items ? [items] : []
    const itemsStr =
      safeItems.map((it) => `${it.quantity}x ${it.products?.name ?? 'Item'} (${formatCurrency(it.unit_price)})`).join(', ') ||
      'Itens indisponiveis'

    const available =
      wallet?.model === 'prepaid'
        ? Number(wallet?.balance ?? 0)
        : Math.max(Number(wallet?.credit_limit ?? 0) - Number(wallet?.balance ?? 0), 0)

    const message = [
      `${fromName} 🍔`,
      `Compra registrada ✅`,
      `Aluno: ${student?.full_name ?? ''} (${student?.grade ?? ''} - ${student?.period ?? ''})`,
      `Itens: ${itemsStr}`,
      `Total: ${formatCurrency(order.total)}`,
      `Situacao: ${student?.pricing_model === 'prepaid' ? 'Pre-pago' : 'Fiado'} | Saldo/Limite disponivel: ${formatCurrency(available)}`,
      appBase ? `Adicionar saldo: ${appBase}/portal` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const { data: outbox } = await supabase
      .from('notification_outbox')
      .insert({
        guardian_id: guardianId,
        student_id: order.student_id,
        kind: 'purchase',
        to_phone: toPhone,
        payload: { message, orderId },
      })
      .select('id')
      .maybeSingle()

    // Optional eager send
    const sendResult = await sendWhatsAppText(toPhone, message)
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

    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    return { statusCode: 500, body: (err as Error).message }
  }
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0))

const normalizePhoneDb = async (supabase: any, phone: string) => {
  const { data } = await supabase.rpc('normalize_phone', { p_input: phone }).maybeSingle()
  return data ?? phone
}

export { handler }
