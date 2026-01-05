const baseUrl = process.env.ZAPI_BASE_URL ?? ''
const instanceId = process.env.ZAPI_INSTANCE_ID ?? ''
const token = process.env.ZAPI_TOKEN ?? ''
const securityToken = process.env.ZAPI_SECURITY_TOKEN ?? ''

interface SendResult {
  ok: boolean
  providerResponse?: unknown
  error?: string
}

const endpoint = () => `${baseUrl.replace(/\/$/, '')}/instances/${instanceId}/token/${token}/message/send-text`

export const isZapiConfigured = () => Boolean(baseUrl && instanceId && token && securityToken)

export const sendWhatsAppText = async (toPhone: string, message: string): Promise<SendResult> => {
  if (!baseUrl || !instanceId || !token || !securityToken) {
    return { ok: false, error: 'Missing Z-API configuration' }
  }

  try {
    const res: Response = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': securityToken,
      },
      body: JSON.stringify({
        phone: toPhone,
        message,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: `Z-API error ${res.status}`, providerResponse: data }
    }
    return { ok: true, providerResponse: data }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
