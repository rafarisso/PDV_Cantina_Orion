import type { Handler } from '@netlify/functions'

const handler: Handler = async () => {
  return { statusCode: 200, body: 'ok' }
}

export { handler }
