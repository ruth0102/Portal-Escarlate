import { buildInternalHeaders } from '../../shared/http/security.js'

function getEventServiceUrl() {
  if (process.env.EVENT_SERVICE_URL) {
    return process.env.EVENT_SERVICE_URL.replace(/\/+$/g, '')
  }

  const host = process.env.EVENT_SERVICE_HOST ?? process.env.HOST ?? '127.0.0.1'
  const port = process.env.EVENT_SERVICE_PORT ?? '3007'

  return `http://${host}:${port}`
}

export async function publishEvent(input) {
  const response = await fetch(new URL('/internal/events', getEventServiceUrl()), {
    method: 'POST',
    headers: {
      ...buildInternalHeaders(),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: input.type,
      source: input.source,
      payload: input.payload,
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Nao foi possivel publicar o evento.')
  }

  return payload
}

export async function publishEventSafely(input) {
  try {
    return await publishEvent(input)
  } catch (error) {
    console.warn('[event-client] Failed to publish event', {
      type: input.type,
      source: input.source,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}
