import http from 'node:http'
import { requestPasswordRecovery, resetPasswordWithToken } from '../../lib/auth/password-recovery.js'
import {
  flattenFieldErrors,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../lib/auth/validation.js'
import { getClientIp } from '../../shared/http/client-ip.js'
import { json, noContent, readJson } from '../../shared/http/json.js'

const port = Number.parseInt(process.env.PASSWORD_RECOVERY_SERVICE_PORT ?? '3009', 10)
const hostname = process.env.HOST ?? '127.0.0.1'

async function handleForgotRequest(request, response) {
  let payload

  try {
    payload = await readJson(request)
  } catch (error) {
    json(response, error?.status === 413 ? 413 : 400, {
      message:
        error?.status === 413
          ? 'Dados da recuperacao muito grandes.'
          : 'Nao foi possivel ler os dados da recuperacao.',
    })
    return
  }

  const parsed = forgotPasswordSchema.safeParse(payload)

  if (!parsed.success) {
    json(response, 400, {
      message: parsed.error.issues[0]?.message ?? 'Revise os campos informados.',
      fieldErrors: flattenFieldErrors(parsed.error),
    })
    return
  }

  try {
    const result = await requestPasswordRecovery({
      email: parsed.data.email,
      ip: getClientIp(request),
    })

    json(response, result.status, { message: result.message })
  } catch (error) {
    console.error('[password-recovery-service] Forgot request failed', error)
    json(response, 500, {
      message:
        error instanceof Error
          ? error.message
          : 'Nao foi possivel iniciar a recuperacao de senha agora.',
    })
  }
}

async function handleResetRequest(request, response, url) {
  const code = url.searchParams.get('code')?.trim()

  if (!code) {
    json(response, 400, { message: 'Codigo de recuperacao ausente.' })
    return
  }

  let payload

  try {
    payload = await readJson(request)
  } catch (error) {
    json(response, error?.status === 413 ? 413 : 400, {
      message:
        error?.status === 413
          ? 'Dados da nova senha muito grandes.'
          : 'Nao foi possivel ler os dados da nova senha.',
    })
    return
  }

  const parsed = resetPasswordSchema.safeParse(payload)

  if (!parsed.success) {
    json(response, 400, {
      message: parsed.error.issues[0]?.message ?? 'Revise os campos informados.',
      fieldErrors: flattenFieldErrors(parsed.error),
    })
    return
  }

  try {
    const result = await resetPasswordWithToken({
      code,
      password: parsed.data.password,
    })

    if (!result.ok) {
      json(response, result.status ?? 400, {
        message: result.message ?? 'Codigo expirado ou invalido.',
      })
      return
    }

    json(response, 200, { message: result.message })
  } catch (error) {
    console.error('[password-recovery-service] Reset request failed', error)
    json(response, 500, { message: 'Nao foi possivel redefinir a senha agora.' })
  }
}

async function route(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${hostname}:${port}`}`)

  if (request.method === 'OPTIONS') {
    noContent(response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { service: 'password-recovery', status: 'ok' })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/password/forgot') {
    await handleForgotRequest(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/password/reset') {
    await handleResetRequest(request, response, url)
    return
  }

  json(response, 404, { error: 'Not found' })
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error('[password-recovery-service] Unhandled error', error)
    json(response, 500, { message: 'Erro interno do servico de recuperacao de senha.' })
  })
})

server.listen(port, hostname, () => {
  console.log(`Password recovery service running at http://${hostname}:${port}`)
})
