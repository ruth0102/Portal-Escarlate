import { getSessionCookieName, verifySessionToken } from '../../lib/auth/session.js'
import { parseCookies } from './cookies.js'

export function getSessionUser(request) {
  const cookies = parseCookies(request)
  return verifySessionToken(cookies[getSessionCookieName()])
}

