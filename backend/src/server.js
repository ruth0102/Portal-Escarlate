import http from 'node:http'
import { json } from './shared/http/json.js'
import {
  buildInternalHeaders,
  getAllowedOriginForRequest,
  isAllowedRequestOrigin,
  isStateChangingMethod,
} from './shared/http/security.js'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const hostname = process.env.HOST ?? '127.0.0.1'
const PROXY_TIMEOUT_MS = 70000

function getServiceTarget(urlEnvName, hostEnvName, portEnvName, fallbackPort) {
  const serviceUrl = process.env[urlEnvName]?.trim()

  if (serviceUrl) {
    return serviceUrl.replace(/\/+$/g, '')
  }

  return `http://${process.env[hostEnvName] ?? hostname}:${process.env[portEnvName] ?? fallbackPort}`
}

const services = {
  auth: {
    name: 'auth',
    target: getServiceTarget('AUTH_SERVICE_URL', 'AUTH_SERVICE_HOST', 'AUTH_SERVICE_PORT', '3001'),
  },
  registration: {
    name: 'registration',
    target: getServiceTarget(
      'REGISTRATION_SERVICE_URL',
      'REGISTRATION_SERVICE_HOST',
      'REGISTRATION_SERVICE_PORT',
      '3003',
    ),
  },
  passwordRecovery: {
    name: 'password-recovery',
    target: getServiceTarget(
      'PASSWORD_RECOVERY_SERVICE_URL',
      'PASSWORD_RECOVERY_SERVICE_HOST',
      'PASSWORD_RECOVERY_SERVICE_PORT',
      '3009',
    ),
  },
  email: {
    name: 'email',
    target: getServiceTarget('EMAIL_SERVICE_URL', 'EMAIL_SERVICE_HOST', 'EMAIL_SERVICE_PORT', '3005'),
  },
  news: {
    name: 'news',
    target: getServiceTarget('NEWS_SERVICE_URL', 'NEWS_SERVICE_HOST', 'NEWS_SERVICE_PORT', '3002'),
  },
  articleSummary: {
    name: 'article-summary',
    target: getServiceTarget(
      'ARTICLE_SUMMARY_SERVICE_URL',
      'ARTICLE_SUMMARY_SERVICE_HOST',
      'ARTICLE_SUMMARY_SERVICE_PORT',
      '3008',
    ),
  },
  ai: {
    name: 'ai',
    target: getServiceTarget(
      'AI_SERVICE_URL',
      'AI_SERVICE_HOST',
      'AI_SERVICE_PORT',
      '3004',
    ),
  },
  newsSummary: {
    name: 'news-summary',
    target: getServiceTarget(
      'NEWS_SUMMARY_SERVICE_URL',
      'NEWS_SUMMARY_SERVICE_HOST',
      'NEWS_SUMMARY_SERVICE_PORT',
      '3006',
    ),
  },
  events: {
    name: 'events',
    target: getServiceTarget('EVENT_SERVICE_URL', 'EVENT_SERVICE_HOST', 'EVENT_SERVICE_PORT', '3007'),
  },
}

function pickService(pathname) {
  if (
    pathname === '/api/auth/register' ||
    pathname === '/api/auth/register/request' ||
    pathname === '/api/auth/verify-email'
  ) {
    return services.registration
  }

  if (
    pathname === '/api/auth/password/forgot' ||
    pathname === '/api/auth/password/reset'
  ) {
    return services.passwordRecovery
  }

  if (pathname.startsWith('/api/auth')) {
    return services.auth
  }

  if (
    pathname === '/api/news-summary' ||
    pathname === '/api/ai/news-summary' ||
    pathname === '/api/ai-summary/news'
  ) {
    return services.newsSummary
  }

  if (pathname === '/api/news/summarize' || pathname.startsWith('/api/news/summaries/')) {
    return services.articleSummary
  }

  if (pathname.startsWith('/api/news')) {
    return services.news
  }

  if (pathname.startsWith('/api/ai')) {
    return services.ai
  }

  if (pathname.startsWith('/api/email-connections') || pathname === '/api/google/callback') {
    return services.email
  }

  return null
}

async function readRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return null
  }

  const chunks = []

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

function normalizeResponseHeaders(headers) {
  const normalized = { ...(headers ?? {}) }

  delete normalized.connection
  delete normalized['content-length']
  delete normalized['transfer-encoding']

  return normalized
}

async function proxy(request, response, service, url) {
  const headers = { ...request.headers }
  const corsHeaders = getCorsHeaders(request)

  delete headers.host

  try {
    const body = await readRequestBody(request)
    const busResponse = await fetch(new URL('/internal/service-request', services.events.target), {
      method: 'POST',
      headers: {
        ...buildInternalHeaders(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        source: 'gateway',
        service: service.name,
        method: request.method,
        path: url.pathname + url.search,
        headers,
        bodyBase64: body ? body.toString('base64') : '',
      }),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    })
    const busPayload = await busResponse.json().catch(() => null)

    if (!busResponse.ok || !busPayload) {
      throw new Error(busPayload?.message ?? 'Barramento de eventos indisponivel.')
    }

    const responseHeaders = normalizeResponseHeaders(busPayload.headers)
    Object.assign(responseHeaders, corsHeaders)

    response.writeHead(busPayload.status, responseHeaders)
    response.end(
      busPayload.bodyBase64 ? Buffer.from(busPayload.bodyBase64, 'base64') : undefined,
    )
  } catch (error) {
    console.error(`[gateway] Failed to route ${url.pathname} to ${service.name} via event bus`, error)
    json(response, 502, { message: `Servico ${service.name} indisponivel.` })
  }
}

function getCorsHeaders(request) {
  const origin = getAllowedOriginForRequest(request)

  if (!origin) {
    return {}
  }

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  }
}

function handlePreflight(request, response, url) {
  if (!url.pathname.startsWith('/api/')) {
    return false
  }

  const origin = getAllowedOriginForRequest(request)

  if (!origin) {
    json(response, 403, { message: 'Origem da requisicao nao permitida.' })
    return true
  }

  response.writeHead(204, {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers':
      request.headers['access-control-request-headers'] ?? 'content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  })
  response.end()
  return true
}

async function health(response) {
  const entries = await Promise.all(
    Object.values(services).map(async (service) => {
      try {
        if (service.name === 'events') {
          const healthResponse = await fetch(new URL('/health', service.target), {
            signal: AbortSignal.timeout(2000),
          })
          return [service.name, healthResponse.ok ? 'ok' : 'unhealthy']
        }

        const healthResponse = await fetch(new URL('/internal/service-request', services.events.target), {
          method: 'POST',
          headers: {
            ...buildInternalHeaders(),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            source: 'gateway',
            service: service.name,
            method: 'GET',
            path: '/health',
            headers: {},
            bodyBase64: '',
          }),
          signal: AbortSignal.timeout(2000),
        })
        const payload = await healthResponse.json().catch(() => null)

        return [service.name, healthResponse.ok && payload?.status === 200 ? 'ok' : 'unhealthy']
      } catch {
        return [service.name, 'unavailable']
      }
    }),
  )

  const serviceStatus = Object.fromEntries(entries)
  const allHealthy = Object.values(serviceStatus).every((status) => status === 'ok')

  json(response, allHealthy ? 200 : 503, {
    service: 'gateway',
    status: allHealthy ? 'ok' : 'degraded',
    services: serviceStatus,
  })
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${hostname}:${port}`}`)

  if (request.method === 'OPTIONS' && handlePreflight(request, response, url)) {
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    health(response).catch((error) => {
      console.error('[gateway] Health check failed', error)
      json(response, 500, { message: 'Falha ao verificar servicos.' })
    })
    return
  }

  const service = pickService(url.pathname)

  if (!service) {
    json(response, 404, { error: 'Not found' })
    return
  }

  if (url.pathname.startsWith('/api/') && isStateChangingMethod(request.method) && !isAllowedRequestOrigin(request)) {
    json(response, 403, { message: 'Origem da requisicao nao permitida.' })
    return
  }

  proxy(request, response, service, url)
})

server.listen(port, hostname, () => {
  console.log(`API gateway running at http://${hostname}:${port}`)
})
