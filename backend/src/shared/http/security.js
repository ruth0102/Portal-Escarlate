import { timingSafeEqual } from 'node:crypto'

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a ?? ''))
  const bBuffer = Buffer.from(String(b ?? ''))

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer)
}

export function getInternalServiceToken() {
  return process.env.INTERNAL_SERVICE_TOKEN?.trim() || ''
}

export function buildInternalHeaders(headers = {}) {
  const token = getInternalServiceToken()

  if (!token) {
    return headers
  }

  return {
    ...headers,
    'x-internal-service-token': token,
  }
}

export function verifyInternalRequest(request) {
  const expected = getInternalServiceToken()

  if (!expected) {
    return false
  }

  return safeEqual(request.headers['x-internal-service-token'], expected)
}

export function validateInternalRequest(request, response, json) {
  if (verifyInternalRequest(request)) {
    return true
  }

  json(response, 401, { message: 'Chamada interna nao autorizada.' })
  return false
}

function normalizeOrigin(value) {
  if (!value) {
    return ''
  }

  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

export function getAllowedOrigins() {
  const origins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])
  const appOrigin = normalizeOrigin(process.env.APP_URL)

  if (appOrigin) {
    origins.add(appOrigin)
  }

  const extraOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? []

  for (const origin of extraOrigins) {
    const normalized = normalizeOrigin(origin.trim())

    if (normalized) {
      origins.add(normalized)
    }
  }

  return origins
}

export function isStateChangingMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method ?? '').toUpperCase())
}

export function isAllowedRequestOrigin(request) {
  if (!isStateChangingMethod(request.method)) {
    return true
  }

  return Boolean(getAllowedOriginForRequest(request))
}

export function getAllowedOriginForRequest(request) {
  const origin = normalizeOrigin(request.headers.origin)

  if (origin) {
    return getAllowedOrigins().has(origin) ? origin : ''
  }

  const refererOrigin = normalizeOrigin(request.headers.referer)

  if (refererOrigin) {
    return getAllowedOrigins().has(refererOrigin) ? refererOrigin : ''
  }

  return ''
}
