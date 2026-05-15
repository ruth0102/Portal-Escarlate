import { buildInternalHeaders } from '../../shared/http/security.js'

const SERVICE_REQUEST_TIMEOUT_MS = 70000

function getEventServiceUrl() {
  if (process.env.EVENT_SERVICE_URL) {
    return process.env.EVENT_SERVICE_URL.replace(/\/+$/g, '')
  }

  const host = process.env.EVENT_SERVICE_HOST ?? process.env.HOST ?? '127.0.0.1'
  const port = process.env.EVENT_SERVICE_PORT ?? '3007'

  return `http://${host}:${port}`
}

export async function requestService(service, path, options = {}) {
  const body = options.body == null ? null : Buffer.from(String(options.body))
  const response = await fetch(new URL('/internal/service-request', getEventServiceUrl()), {
    method: 'POST',
    headers: {
      ...buildInternalHeaders(),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      source: options.source || 'internal-service',
      service,
      method: options.method ?? 'GET',
      path,
      headers: options.headers ?? {},
      bodyBase64: body ? body.toString('base64') : '',
    }),
    signal: options.signal ?? AbortSignal.timeout(SERVICE_REQUEST_TIMEOUT_MS),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? 'Barramento de eventos indisponivel.')
  }

  return new Response(
    payload.bodyBase64 ? Buffer.from(payload.bodyBase64, 'base64') : null,
    {
      status: payload.status,
      headers: payload.headers ?? {},
    },
  )
}
