import http from 'node:http'
import { json } from './shared/http/json.js'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const hostname = process.env.HOST ?? '127.0.0.1'

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
  email: {
    name: 'email',
    target: getServiceTarget('EMAIL_SERVICE_URL', 'EMAIL_SERVICE_HOST', 'EMAIL_SERVICE_PORT', '3005'),
  },
  news: {
    name: 'news',
    target: getServiceTarget('NEWS_SERVICE_URL', 'NEWS_SERVICE_HOST', 'NEWS_SERVICE_PORT', '3002'),
  },
  aiSummary: {
    name: 'ai-summary',
    target: getServiceTarget(
      'AI_SUMMARY_SERVICE_URL',
      'AI_SUMMARY_SERVICE_HOST',
      'AI_SUMMARY_SERVICE_PORT',
      '3004',
    ),
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

  if (pathname.startsWith('/api/auth')) {
    return services.auth
  }

  if (pathname.startsWith('/api/news')) {
    return services.news
  }

  if (pathname.startsWith('/api/ai-summary')) {
    return services.aiSummary
  }

  if (pathname.startsWith('/api/email-connections') || pathname === '/api/google/callback') {
    return services.email
  }

  return null
}

async function proxy(request, response, service, url) {
  const target = new URL(url.pathname + url.search, service.target)
  const headers = { ...request.headers }

  delete headers.host

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request,
      duplex: 'half',
      redirect: 'manual',
    })

    const responseHeaders = {}

    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    response.writeHead(upstream.status, responseHeaders)

    if (!upstream.body) {
      response.end()
      return
    }

    const reader = upstream.body.getReader()

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      response.write(Buffer.from(value))
    }

    response.end()
  } catch (error) {
    console.error(`[gateway] Failed to proxy ${url.pathname} to ${service.name}`, error)
    json(response, 502, { message: `Servico ${service.name} indisponivel.` })
  }
}

async function health(response) {
  const entries = await Promise.all(
    Object.values(services).map(async (service) => {
      try {
        const healthResponse = await fetch(new URL('/health', service.target), {
          signal: AbortSignal.timeout(2000),
        })
        return [service.name, healthResponse.ok ? 'ok' : 'unhealthy']
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

  proxy(request, response, service, url)
})

server.listen(port, hostname, () => {
  console.log(`API gateway running at http://${hostname}:${port}`)
})
