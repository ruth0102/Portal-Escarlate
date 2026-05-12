import { createHmac, timingSafeEqual } from 'node:crypto'
import { google } from 'googleapis'
import { getAppUrl, getRequiredEnv } from '../../../lib/env.js'

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
]
const STATE_TTL_MS = 10 * 60 * 1000

function getOAuthClient() {
  return new google.auth.OAuth2(
    getRequiredEnv('GOOGLE_CLIENT_ID'),
    getRequiredEnv('GOOGLE_CLIENT_SECRET'),
    getRequiredEnv('GOOGLE_REDIRECT_URI'),
  )
}

function signStatePayload(payload) {
  return createHmac('sha256', getRequiredEnv('AUTH_SECRET')).update(payload).digest('base64url')
}

function encodeStatePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodeStatePayload(payload) {
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
}

export function createGoogleOAuthState(user) {
  const payload = encodeStatePayload({
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: Date.now(),
  })

  return `${payload}.${signStatePayload(payload)}`
}

export function verifyGoogleOAuthState(state) {
  const [payload, signature] = String(state ?? '').split('.')

  if (!payload || !signature) {
    return null
  }

  const expected = signStatePayload(payload)
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null
  }

  try {
    const decoded = decodeStatePayload(payload)

    if (decoded.role !== 'admin' || Date.now() - Number(decoded.iat) > STATE_TTL_MS) {
      return null
    }

    return decoded
  } catch {
    return null
  }
}

export function buildGoogleOAuthUrl(user) {
  return getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: OAUTH_SCOPES,
    state: createGoogleOAuthState(user),
  })
}

export async function exchangeGoogleCode(code) {
  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)

  if (!tokens.refresh_token) {
    throw new Error('Google nao retornou refresh token. Revogue o acesso anterior e tente novamente.')
  }

  client.setCredentials(tokens)

  const oauth2 = google.oauth2({
    version: 'v2',
    auth: client,
  })
  const profile = await oauth2.userinfo.get()
  const email = profile.data.email

  if (!email) {
    throw new Error('Nao foi possivel identificar o e-mail conectado.')
  }

  return {
    email,
    refreshToken: tokens.refresh_token,
  }
}

export function buildAdminConnectionsUrl(status) {
  const url = new URL('/admin/email-connections', getAppUrl())
  url.searchParams.set('google', status)
  return url.toString()
}

export async function testGoogleRefreshToken(refreshToken) {
  const client = getOAuthClient()
  client.setCredentials({
    refresh_token: refreshToken,
  })

  await client.getAccessToken()
}
