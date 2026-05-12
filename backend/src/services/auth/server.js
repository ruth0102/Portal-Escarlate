import http from 'node:http'
import { verifyPassword } from '../../lib/auth/password.js'
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
  buildExpiredSessionCookie,
  buildSessionCookie,
  createSessionToken,
} from '../../lib/auth/session.js'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'

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
  } catch {
    json(response, 400, { message: 'Nao foi possivel ler os dados de login.' })
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

  try {
    const user = await findUserByEmailForAuth(parsed.data.email)

    if (!user) {
      json(response, 401, { message: 'Credenciais invalidas.' })
      return
    }

    const passwordIsValid = await verifyPassword(parsed.data.password, user.password)

    if (!passwordIsValid) {
      json(response, 401, { message: 'Credenciais invalidas.' })
      return
    }

    const sessionUser = toSessionUser(user)
    const token = createSessionToken(sessionUser)

    json(response, 200, { user: sessionUser }, { 'set-cookie': buildSessionCookie(token) })
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
  } catch {
    json(response, 400, { message: 'Nao foi possivel ler os dados do usuario.' })
    return
  }

  const errorMessage = validateInternalUserPayload(payload)

  if (errorMessage) {
    json(response, 400, { message: errorMessage })
    return
  }

  try {
    await createUser({
      email: normalizeEmail(payload.email),
      passwordHash: payload.passwordHash,
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
    await handleInternalUserExists(response, url)
    return
  }

  if (request.method === 'POST' && url.pathname === '/internal/auth/users') {
    await handleInternalCreateUser(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    await handleLogin(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    json(response, 200, { message: 'Sessao encerrada.' }, { 'set-cookie': buildExpiredSessionCookie() })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = getSessionUser(request)

    if (!user) {
      json(response, 401, { message: 'Sessao invalida.' })
      return
    }

    json(response, 200, { user })
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
