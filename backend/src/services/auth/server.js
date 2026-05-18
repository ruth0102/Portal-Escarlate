import http from 'node:http'
import { publishEventSafely } from '../../lib/events/event-client.js'
import { verifyPassword } from '../../lib/auth/password.js'
import { clearLoginRateLimit, consumeLoginRateLimit } from '../../lib/auth/login-rate-limit.js'
import {
  DuplicateEmailError,
  createUser,
  findUserByEmail,
  findUserByEmailForAuth,
  normalizeEmail,
  toSessionUser,
} from '../../lib/auth/user-repo.js'
import { flattenFieldErrors, loginSchema } from '../../lib/auth/validation.js'
import {
  buildExpiredSessionCookies,
  buildSessionCookie,
  createSessionToken,
  getSessionCookieName,
  verifySessionToken,
} from '../../lib/auth/session.js'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'
import { validateInternalRequest } from '../../shared/http/security.js'
import { getClientIp } from '../../shared/http/client-ip.js'
import { getCookieValues } from '../../shared/http/cookies.js'

const port = Number.parseInt(process.env.AUTH_SERVICE_PORT ?? '3001', 10)
const hostname = process.env.HOST ?? '127.0.0.1'

function validateInternalUserPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Dados do usuario ausentes.'
  }

  if (typeof payload.email !== 'string' || !payload.email.trim()) {
    return 'E-mail do usuario ausente.'
  }

  if (typeof payload.passwordHash !== 'string' || !payload.passwordHash.trim()) {
    return 'Hash da senha ausente.'
  }

  return null
}

async function handleLogin(request, response) {
  let payload

  try {
    payload = await readJson(request)
  } catch (error) {
    json(response, error?.status === 413 ? 413 : 400, {
      message:
        error?.status === 413
          ? 'Dados de login muito grandes.'
          : 'Nao foi possivel ler os dados de login.',
    })
    return
  }

  const parsed = loginSchema.safeParse(payload)

  if (!parsed.success) {
    json(response, 400, {
      message: parsed.error.issues[0]?.message ?? 'Revise os campos informados.',
      fieldErrors: flattenFieldErrors(parsed.error),
    })
    return
  }

  const loginIdentity = {
    email: normalizeEmail(parsed.data.email),
    ip: getClientIp(request),
  }

  if (!consumeLoginRateLimit(loginIdentity)) {
    json(response, 429, {
      message: 'Muitas tentativas de login. Tente novamente em instantes.',
    })
    return
  }

  try {
    const user = await findUserByEmailForAuth(parsed.data.email)

    if (!user) {
      json(response, 401, {
        code: 'user_not_found',
        message: 'E-mail não cadastrado.',
      })
      return
    }

    const passwordIsValid = await verifyPassword(parsed.data.password, user.password)

    if (!passwordIsValid) {
      json(response, 401, { message: 'Credenciais invalidas.' })
      return
    }

    const sessionUser = toSessionUser(user)
    const token = createSessionToken(sessionUser)
    clearLoginRateLimit(loginIdentity)
    void publishEventSafely({
      type: 'auth.login_succeeded',
      source: 'auth-service',
      payload: {
        userId: sessionUser.id,
        email: sessionUser.email,
        role: sessionUser.role,
        ip: loginIdentity.ip,
      },
    })

    json(response, 200, { user: sessionUser }, {
      'set-cookie': [...buildExpiredSessionCookies(), buildSessionCookie(token)],
    })
  } catch (error) {
    console.error('[auth-service] Login failed', error)
    json(response, 500, { message: 'Nao foi possivel autenticar agora.' })
  }
}

async function handleInternalUserExists(response, url) {
  const email = url.searchParams.get('email')?.trim()

  if (!email) {
    json(response, 400, { message: 'E-mail ausente.' })
    return
  }

  try {
    const user = await findUserByEmail(email)

    json(response, 200, { exists: Boolean(user) })
  } catch (error) {
    console.error('[auth-service] Failed to check internal user existence', error)
    json(response, 500, { message: 'Nao foi possivel consultar o usuario.' })
  }
}

async function handleInternalCreateUser(request, response) {
  let payload

  try {
    payload = await readJson(request)
  } catch (error) {
    json(response, error?.status === 413 ? 413 : 400, {
      message:
        error?.status === 413
          ? 'Dados do usuario muito grandes.'
          : 'Nao foi possivel ler os dados do usuario.',
    })
    return
  }

  const errorMessage = validateInternalUserPayload(payload)

  if (errorMessage) {
    json(response, 400, { message: errorMessage })
    return
  }

  try {
    const createdUser = await createUser({
      email: normalizeEmail(payload.email),
      passwordHash: payload.passwordHash,
    })
    void publishEventSafely({
      type: 'auth.user_created',
      source: 'auth-service',
      payload: {
        userId: createdUser.id,
        email: createdUser.email,
        role: createdUser.role,
      },
    })

    json(response, 201, { message: 'Usuario criado com sucesso.' })
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      json(response, 409, { message: 'Ja existe uma conta com este e-mail.' })
      return
    }

    console.error('[auth-service] Failed to create internal user', error)
    json(response, 500, { message: 'Nao foi possivel criar o usuario.' })
  }
}

async function handleCurrentUser(request, response) {
  const sessionTokens = getCookieValues(request, getSessionCookieName())
  const sessionUsers = sessionTokens
    .map((token) => verifySessionToken(token))
    .filter(Boolean)

  if (sessionUsers.length === 0) {
    json(response, 401, { message: 'Sessao invalida.' }, { 'set-cookie': buildExpiredSessionCookies() })
    return
  }

  try {
    for (const user of sessionUsers) {
      const storedUser = await findUserByEmail(user.email)

      if (storedUser && String(storedUser.id) === String(user.id)) {
        json(response, 200, { user: toSessionUser(storedUser) })
        return
      }
    }

    json(response, 401, { message: 'Sessao invalida.' }, { 'set-cookie': buildExpiredSessionCookies() })
  } catch (error) {
    console.error('[auth-service] Failed to validate current session', error)
    json(response, 500, { message: 'Nao foi possivel validar a sessao.' })
  }
}

async function route(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${hostname}:${port}`}`)

  if (request.method === 'OPTIONS') {
    noContent(response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { service: 'auth', status: 'ok' })
    return
  }

  if (request.method === 'GET' && url.pathname === '/internal/auth/users/exists') {
    if (!validateInternalRequest(request, response, json)) {
      return
    }

    await handleInternalUserExists(response, url)
    return
  }

  if (request.method === 'POST' && url.pathname === '/internal/auth/users') {
    if (!validateInternalRequest(request, response, json)) {
      return
    }

    await handleInternalCreateUser(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    await handleLogin(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const user = getSessionUser(request)

    if (user) {
      void publishEventSafely({
        type: 'auth.logout_requested',
        source: 'auth-service',
        payload: {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
      })
    }

    json(response, 200, { message: 'Sessao encerrada.' }, { 'set-cookie': buildExpiredSessionCookies() })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    await handleCurrentUser(request, response)
    return
  }

  json(response, 404, { error: 'Not found' })
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error('[auth-service] Unhandled error', error)
    json(response, 500, { message: 'Erro interno do servico de autenticacao.' })
  })
})

server.listen(port, hostname, () => {
  console.log(`Auth service running at http://${hostname}:${port}`)
})
