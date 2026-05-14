import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { buildInternalHeaders, validateInternalRequest } from '../../shared/http/security.js'
import { getSubscribersForEvent } from './subscribers.js'

const port = Number.parseInt(process.env.EVENT_SERVICE_PORT ?? '3007', 10)
const hostname = process.env.HOST ?? '127.0.0.1'
const MAX_ATTEMPTS = 3
const BASE_RETRY_DELAY_MS = 1000
const MAX_EVENT_LOG_SIZE = 500
const SENSITIVE_PAYLOAD_FIELDS = new Set([
  'apiKey',
  'password',
  'passwordHash',
  'refreshToken',
  'token',
  'verificationUrl',
])

const eventLog = []
const queue = []
let dispatching = false

function validateEventPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Evento ausente.'
  }

  if (typeof payload.type !== 'string' || !payload.type.trim()) {
    return 'Tipo do evento ausente.'
  }

  if (typeof payload.source !== 'string' || !payload.source.trim()) {
    return 'Servico de origem ausente.'
  }

  if (!payload.payload || typeof payload.payload !== 'object' || Array.isArray(payload.payload)) {
    return 'Payload do evento deve ser um objeto JSON.'
  }

  return null
}

function createEvent(payload) {
  return {
    id: typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID(),
    type: payload.type.trim(),
    source: payload.source.trim(),
    payload: payload.payload,
    status: 'queued',
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastError: '',
  }
}

function enqueue(event) {
  eventLog.push(event)

  if (eventLog.length > MAX_EVENT_LOG_SIZE) {
    eventLog.shift()
  }

  queue.push(event)
  scheduleDispatch()
}

function sanitizePayloadForOutput(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizePayloadForOutput)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_PAYLOAD_FIELDS.has(key) ? '[redacted]' : sanitizePayloadForOutput(entry),
    ]),
  )
}

function sanitizeEventForOutput(event) {
  return {
    ...event,
    payload: sanitizePayloadForOutput(event.payload),
  }
}

function scheduleDispatch(delay = 0) {
  setTimeout(() => {
    void dispatchQueue()
  }, delay)
}

async function deliverEvent(event, subscriber) {
  const response = await fetch(subscriber.url, {
    method: 'POST',
    headers: {
      ...buildInternalHeaders(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.message ?? `Assinante respondeu com status ${response.status}.`)
  }
}

async function dispatchEvent(event) {
  const subscribers = getSubscribersForEvent(event.type)

  if (subscribers.length === 0) {
    event.status = 'no_subscribers'
    event.deliveredAt = new Date().toISOString()
    return
  }

  event.status = 'delivering'
  event.attempts += 1

  for (const subscriber of subscribers) {
    await deliverEvent(event, subscriber)
  }

  event.status = 'delivered'
  event.deliveredAt = new Date().toISOString()
  event.lastError = ''
}

async function dispatchQueue() {
  if (dispatching) {
    return
  }

  dispatching = true

  try {
    while (queue.length > 0) {
      const event = queue.shift()

      try {
        await dispatchEvent(event)
      } catch (error) {
        event.lastError = error instanceof Error ? error.message : 'Erro desconhecido.'

        if (event.attempts < MAX_ATTEMPTS) {
          event.status = 'queued'
          queue.push(event)
          scheduleDispatch(BASE_RETRY_DELAY_MS * event.attempts)
          break
        }

        event.status = 'failed'
        event.failedAt = new Date().toISOString()
        console.error('[event-service] Event delivery failed', {
          id: event.id,
          type: event.type,
          attempts: event.attempts,
          message: event.lastError,
        })
      }
    }
  } finally {
    dispatching = false
  }
}

async function handlePublishEvent(request, response) {
  if (!validateInternalRequest(request, response, json)) {
    return
  }

  let payload

  try {
    payload = await readJson(request)
  } catch (error) {
    json(response, error?.status === 413 ? 413 : 400, {
      message:
        error?.status === 413
          ? 'Evento muito grande.'
          : 'Nao foi possivel ler os dados do evento.',
    })
    return
  }

  const validationError = validateEventPayload(payload)

  if (validationError) {
    json(response, 400, { message: validationError })
    return
  }

  const event = createEvent(payload)
  enqueue(event)

  json(response, 202, {
    message: 'Evento aceito para entrega.',
    eventId: event.id,
    status: event.status,
  })
}

async function route(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${hostname}:${port}`}`)

  if (request.method === 'OPTIONS') {
    noContent(response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, {
      service: 'events',
      status: 'ok',
      queued: queue.length,
      events: eventLog.length,
    })
    return
  }

  if (request.method === 'POST' && url.pathname === '/internal/events') {
    await handlePublishEvent(request, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/internal/events') {
    if (!validateInternalRequest(request, response, json)) {
      return
    }

    json(response, 200, {
      events: eventLog.slice(-50).map(sanitizeEventForOutput),
    })
    return
  }

  json(response, 404, { error: 'Not found' })
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error('[event-service] Unhandled error', error)
    json(response, 500, { message: 'Erro interno do barramento de eventos.' })
  })
})

server.listen(port, hostname, () => {
  console.log(`Event service running at http://${hostname}:${port}`)
})
