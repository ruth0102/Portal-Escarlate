import { randomBytes } from 'node:crypto'
import { getAppUrl } from '../env.js'
import { sendVerificationEmail } from '../email/send-verification-email.js'
import { hashPassword } from './password.js'
import { consumeRegisterRateLimit } from './register-rate-limit.js'
import {
  consumePendingRegistration,
  findPendingRegistrationByTokenHash,
  getVerificationExpiryDate,
  hashVerificationToken,
  removePendingRegistrationByEmail,
  upsertPendingRegistration,
} from './email-verification-token-repo.js'
import { createUser, findUserByEmail, normalizeEmail, toSessionUser } from './user-repo.js'

function buildVerificationUrl(token) {
  return `${getAppUrl()}/verify-email?code=${encodeURIComponent(token)}`
}

function generateVerificationToken() {
  return randomBytes(32).toString('base64url')
}

export async function requestEmailVerification(input) {
  const email = normalizeEmail(input.email)
  const allowed = consumeRegisterRateLimit({
    email,
    ip: input.ip,
  })

  if (!allowed) {
    return {
      ok: false,
      status: 429,
      message: 'Muitas tentativas de cadastro. Tente novamente em instantes.',
    }
  }

  const existingUser = await findUserByEmail(email)

  if (existingUser) {
    return {
      ok: false,
      status: 409,
      message: 'Ja existe uma conta com este e-mail. Use o login para entrar no portal.',
    }
  }

  const passwordHash = await hashPassword(input.password)
  const token = generateVerificationToken()
  const tokenHash = hashVerificationToken(token)

  await upsertPendingRegistration({
    email,
    passwordHash,
    tokenHash,
    expiresAt: getVerificationExpiryDate(),
  })

  try {
    await sendVerificationEmail({
      to: email,
      verificationUrl: buildVerificationUrl(token),
    })
  } catch (error) {
    removePendingRegistrationByEmail(email)
    throw error
  }

  return {
    ok: true,
    status: 200,
    message:
      'Se este e-mail puder receber acesso, enviaremos um link de confirmacao em instantes.',
  }
}

export async function verifyPendingEmailToken(code) {
  const tokenHash = hashVerificationToken(code)
  const pending = await findPendingRegistrationByTokenHash(tokenHash)

  if (!pending) {
    return { ok: false }
  }

  if (pending.consumed_at || new Date(pending.expires_at).getTime() <= Date.now()) {
    return { ok: false }
  }

  const consumed = await consumePendingRegistration(pending.id)

  if (!consumed) {
    return { ok: false }
  }

  const existingUser = await findUserByEmail(consumed.email)
  let user = existingUser

  if (!user) {
    user = await createUser({
      email: consumed.email,
      passwordHash: consumed.password_hash,
    })
  }

  if (!user) {
    return { ok: false }
  }

  return {
    ok: true,
    user: toSessionUser(user),
  }
}
