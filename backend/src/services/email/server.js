import http from 'node:http'
import { publishEventSafely } from '../../lib/events/event-client.js'
import {
  deleteEmailConnection,
  listEmailConnectionsWithTokens,
  updateEmailConnectionPriority,
  upsertEmailConnection,
} from './lib/email-connection-repo.js'
import {
  buildAdminConnectionsUrl,
  buildGoogleOAuthUrl,
  exchangeGoogleCode,
  testGoogleRefreshToken,
  verifyGoogleOAuthState,
} from './lib/google-oauth.js'
import { sendVerificationEmail } from './lib/send-verification-email.js'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'
import { validateInternalRequest } from '../../shared/http/security.js'

const port = Number.parseInt(process.env.EMAIL_SERVICE_PORT ?? '3005', 10)
const hostname = process.env.HOST ?? '127.0.0.1'

function getAdminUser(request, response) {
  const user = getSessionUser(request)

  if (!user) {
    json(response, 401, { message: 'Sessao invalida.' })
    return null
  }

  if (user.role !== 'admin') {
    json(response, 403, { message: 'Acesso restrito a administradores.' })
    return null
  }

  return user
}

function validateVerificationPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Dados do e-mail ausentes.'
  }

  if (typeof payload.to !== 'string' || !payload.to.trim()) {
    return 'Destinatario do e-mail ausente.'
  }

  if (typeof payload.verificationUrl !== 'string' || !payload.verificationUrl.trim()) {
    return 'URL de verificacao ausente.'
  }

  return null
}

function validateEventPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Evento ausente.'
  }

  if (payload.type !== 'email.verification_requested') {
    return 'Tipo de evento nao suportado pelo servico de e-mail.'
  }

  return validateVerificationPayload(payload.payload)
}

async function handleVerificationEmail(request, response) {
  let payload

  try {
    payload = await readJson(request)
  } catch (error) {
    json(response, error?.status === 413 ? 413 : 400, {
      message:
        error?.status === 413
          ? 'Dados do e-mail muito grandes.'
          : 'Nao foi possivel ler os dados do e-mail.',
    })
    return
  }

  const errorMessage = validateVerificationPayload(payload)

  if (errorMessage) {
    json(response, 400, { message: errorMessage })
    return
  }

  try {
    await sendVerificationEmail({
      to: payload.to.trim(),
      verificationUrl: payload.verificationUrl.trim(),
    })
    void publishEventSafely({
      type: 'email.verification_sent',
      source: 'email-service',
      payload: {
        to: payload.to.trim(),
        via: 'internal-endpoint',
      },
    })

    json(response, 200, { message: 'E-mail de verificacao enviado.' })
  } catch (error) {
    console.error('[email-service] Failed to send verification email', error)
    json(response, 502, { message: 'Nao foi possivel enviar o e-mail de verificacao.' })
  }
}

async function handleInternalEvent(request, response) {
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

  const errorMessage = validateEventPayload(payload)

  if (errorMessage) {
    json(response, 400, { message: errorMessage })
    return
  }

  try {
    await sendVerificationEmail({
      to: payload.payload.to.trim(),
      verificationUrl: payload.payload.verificationUrl.trim(),
    })
    void publishEventSafely({
      type: 'email.verification_sent',
      source: 'email-service',
      payload: {
        to: payload.payload.to.trim(),
        requestedEventId: payload.id ?? '',
        via: 'event-bus',
      },
    })

    json(response, 200, {
      message: 'Evento processado com sucesso.',
      eventId: payload.id,
    })
  } catch (error) {
    console.error('[email-service] Failed to process event', error)
    json(response, 502, { message: 'Nao foi possivel processar o evento de e-mail.' })
  }
}

async function getConnectionStatus(connection) {
  if (!connection.active) {
    return {
      status: 'inactive',
      message: 'Conexao inativa.',
    }
  }

  if (connection.provider !== 'gmail') {
    return {
      status: 'unsupported',
      message: 'Provedor nao suportado para teste automatico.',
    }
  }

  try {
    await testGoogleRefreshToken(connection.refresh_token)
    return {
      status: 'valid',
      message: 'Refresh token valido.',
    }
  } catch (error) {
    return {
      status: 'expired',
      message: error instanceof Error ? error.message : 'Refresh token invalido ou expirado.',
    }
  }
}

async function handleListConnections(request, response) {
  if (!getAdminUser(request, response)) {
    return
  }

  try {
    const rows = await listEmailConnectionsWithTokens()
    const connections = await Promise.all(
      rows.map(async (connection) => ({
        id: connection.id,
        provider: connection.provider,
        email: connection.email,
        active: connection.active,
        priority: connection.priority,
        createdAt: connection.created_at,
        updatedAt: connection.updated_at,
        health: await getConnectionStatus(connection),
      })),
    )

    json(response, 200, { connections })
  } catch (error) {
    console.error('[email-service] Failed to list email connections', error)
    json(response, 500, { message: 'Nao foi possivel carregar as conexoes de e-mail.' })
  }
}

async function handleGoogleStart(request, response) {
  const user = getAdminUser(request, response)

  if (!user) {
    return
  }

  try {
    json(response, 200, { url: buildGoogleOAuthUrl(user) })
  } catch (error) {
    console.error('[email-service] Failed to build Google OAuth URL', error)
    json(response, 500, { message: 'Nao foi possivel iniciar a conexao com o Google.' })
  }
}

async function handleGoogleCallback(request, response, url) {
  const code = url.searchParams.get('code')?.trim()
  const state = verifyGoogleOAuthState(url.searchParams.get('state'))

  if (!code || !state) {
    response.writeHead(302, { location: buildAdminConnectionsUrl('invalid') })
    response.end()
    return
  }

  try {
    const connection = await exchangeGoogleCode(code)

    await upsertEmailConnection({
      provider: 'gmail',
      email: connection.email,
      refreshToken: connection.refreshToken,
      priority: 100,
    })
    void publishEventSafely({
      type: 'email.connection_created',
      source: 'email-service',
      payload: {
        provider: 'gmail',
        email: connection.email,
        priority: 100,
      },
    })

    response.writeHead(302, { location: buildAdminConnectionsUrl('connected') })
    response.end()
  } catch (error) {
    console.error('[email-service] Google OAuth callback failed', error)
    response.writeHead(302, { location: buildAdminConnectionsUrl('failed') })
    response.end()
  }
}

async function handleUpdatePriority(request, response, id) {
  if (!getAdminUser(request, response)) {
    return
  }

  let payload

  try {
    payload = await readJson(request)
  } catch (error) {
    json(response, error?.status === 413 ? 413 : 400, {
      message:
        error?.status === 413
          ? 'Dados da conexao muito grandes.'
          : 'Nao foi possivel ler os dados da conexao.',
    })
    return
  }

  const priority = Number.parseInt(String(payload?.priority ?? ''), 10)

  if (!Number.isFinite(priority) || priority < 1) {
    json(response, 400, { message: 'Informe uma prioridade valida.' })
    return
  }

  try {
    const connection = await updateEmailConnectionPriority({ id, priority })

    if (!connection) {
      json(response, 404, { message: 'Conexao nao encontrada.' })
      return
    }
    void publishEventSafely({
      type: 'email.connection_priority_updated',
      source: 'email-service',
      payload: {
        id: connection.id,
        provider: connection.provider,
        email: connection.email,
        priority: connection.priority,
      },
    })

    json(response, 200, { connection })
  } catch (error) {
    console.error('[email-service] Failed to update email connection priority', error)
    json(response, 500, { message: 'Nao foi possivel atualizar a prioridade.' })
  }
}

async function handleDeleteConnection(request, response, id) {
  if (!getAdminUser(request, response)) {
    return
  }

  try {
    const deleted = await deleteEmailConnection(id)

    if (!deleted) {
      json(response, 404, { message: 'Conexao nao encontrada.' })
      return
    }
    void publishEventSafely({
      type: 'email.connection_deleted',
      source: 'email-service',
      payload: {
        id,
      },
    })

    noContent(response)
  } catch (error) {
    console.error('[email-service] Failed to delete email connection', error)
    json(response, 500, { message: 'Nao foi possivel remover a conexao.' })
  }
}

async function route(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${hostname}:${port}`}`)

  if (request.method === 'OPTIONS') {
    noContent(response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { service: 'email', status: 'ok' })
    return
  }

  if (request.method === 'POST' && url.pathname === '/internal/email/verification') {
    if (!validateInternalRequest(request, response, json)) {
      return
    }

    await handleVerificationEmail(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/internal/events') {
    await handleInternalEvent(request, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/email-connections') {
    await handleListConnections(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/email-connections/google/start') {
    await handleGoogleStart(request, response)
    return
  }

  if (
    request.method === 'GET' &&
    (url.pathname === '/api/email-connections/google/callback' ||
      url.pathname === '/api/google/callback')
  ) {
    await handleGoogleCallback(request, response, url)
    return
  }

  const priorityMatch = url.pathname.match(/^\/api\/email-connections\/([^/]+)\/priority$/)

  if (request.method === 'PATCH' && priorityMatch) {
    await handleUpdatePriority(request, response, priorityMatch[1])
    return
  }

  const deleteMatch = url.pathname.match(/^\/api\/email-connections\/([^/]+)$/)

  if (request.method === 'DELETE' && deleteMatch) {
    await handleDeleteConnection(request, response, deleteMatch[1])
    return
  }

  json(response, 404, { error: 'Not found' })
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error('[email-service] Unhandled error', error)
    json(response, 500, { message: 'Erro interno do servico de e-mail.' })
  })
})

server.listen(port, hostname, () => {
  console.log(`Email service running at http://${hostname}:${port}`)
})
