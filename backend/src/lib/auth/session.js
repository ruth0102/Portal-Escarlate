import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { getRequiredEnv } from '../env.js'

const SESSION_COOKIE_NAME = 'portal_session'
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64url')
}

function base64UrlJson(input) {
  return base64UrlEncode(JSON.stringify(input))
}

function sign(input) {
  return createHmac('sha256', getRequiredEnv('AUTH_SECRET')).update(input).digest('base64url')
}

export function createSessionToken(user) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' })
  const payload = base64UrlJson({
    sub: user.id,
    email: user.email,
    role: user.role,
    jti: randomUUID(),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  })
  const unsigned = `${header}.${payload}`

  return `${unsigned}.${sign(unsigned)}`
}

export function verifySessionToken(token) {
  if (!token) {
    return null
  }

  const parts = token.split('.')

  if (parts.length !== 3) {
    return null
  }

  const [header, payload, signature] = parts
  const unsigned = `${header}.${payload}`
  const expected = sign(unsigned)
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null
  }

  let decoded

  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  const now = Math.floor(Date.now() / 1000)

  if (!decoded.exp || decoded.exp <= now) {
    return null
  }

  return {
    id: typeof decoded.sub === 'string' ? decoded.sub : '',
    email: typeof decoded.email === 'string' ? decoded.email : '',
    role: typeof decoded.role === 'string' ? decoded.role : 'user',
  }
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME
}

export function buildSessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''

  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    secure,
  ]
    .filter(Boolean)
    .join('; ')
}

export function buildExpiredSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
