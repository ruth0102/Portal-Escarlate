import http from 'node:http'
import { requestEmailVerification, verifyPendingEmailToken } from '../../lib/auth/email-verification.js'
import { flattenFieldErrors, registerSchema } from '../../lib/auth/validation.js'
import { getClientIp } from '../../shared/http/client-ip.js'
import { json, noContent, readJson } from '../../shared/http/json.js'

const port = Number.parseInt(process.env.REGISTRATION_SERVICE_PORT ?? '3003', 10)
const hostname = process.env.HOST ?? '127.0.0.1'

async function handleRegisterRequest(request, response) {
  let payload

  try {
    payload = await readJson(request)
  } catch {
    json(response, 400, { message: 'Nao foi possivel ler os dados do cadastro.' })
    return
  }

  const parsed = registerSchema.safeParse(payload)

  if (!parsed.success) {
    json(response, 400, {
      message: parsed.error.issues[0]?.message ?? 'Revise os campos informados.',
      fieldErrors: flattenFieldErrors(parsed.error),
    })
    return
  }

  try {
    const result = await requestEmailVerification({
      email: parsed.data.email,
      password: parsed.data.password,
      ip: getClientIp(request),
    })

    json(response, result.status, { message: result.message })
  } catch (error) {
    console.error('[registration-service] Register request failed', error)
    json(response, 500, {
      message:
        error instanceof Error
          ? error.message
          : 'Nao foi possivel iniciar a verificacao por e-mail agora.',
    })
  }
}

async function handleVerifyEmail(response, url) {
  const code = url.searchParams.get('code')?.trim()

  if (!code) {
    json(response, 400, { message: 'Codigo de verificacao ausente.' })
    return
  }

  try {
    const result = await verifyPendingEmailToken(code)

    if (!result.ok) {
      json(response, result.status ?? 400, {
        message: result.message ?? 'Codigo expirado ou invalido.',
      })
      return
    }

    json(response, 200, {
      message: 'E-mail verificado com sucesso. Agora faca login para acessar.',
    })
  } catch (error) {
    console.error('[registration-service] Email verification failed', error)
    json(response, 500, { message: 'Nao foi possivel verificar o e-mail agora.' })
  }
}

async function route(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${hostname}:${port}`}`)

  if (request.method === 'OPTIONS') {
    noContent(response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { service: 'registration', status: 'ok' })
    return
  }

  if (
    request.method === 'POST' &&
    (url.pathname === '/api/auth/register/request' || url.pathname === '/api/auth/register')
  ) {
    await handleRegisterRequest(request, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/verify-email') {
    await handleVerifyEmail(response, url)
    return
  }

  json(response, 404, { error: 'Not found' })
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error('[registration-service] Unhandled error', error)
    json(response, 500, { message: 'Erro interno do servico de cadastro.' })
  })
})

server.listen(port, hostname, () => {
  console.log(`Registration service running at http://${hostname}:${port}`)
})
