import { randomBytes } from 'node:crypto'
import { getAppUrl } from '../env.js'
import { publishEvent, publishEventSafely } from '../events/event-client.js'
import { requestService } from '../events/service-request-client.js'
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
import { normalizeEmail } from './user-repo.js'

function buildVerificationUrl(token) {
  return `${getAppUrl()}/verify-email?code=${encodeURIComponent(token)}`
}

function generateVerificationToken() {
  return randomBytes(32).toString('base64url')
}

async function requestVerificationEmail(input) {
  await publishEvent({
    type: 'email.verification_requested',
    source: 'registration-service',
    payload: input,
  })
}

async function checkAuthUserExists(email) {
  const path = `/internal/auth/users/exists?email=${encodeURIComponent(email)}`
  const response = await requestService('auth', path, {
    source: 'registration-service',
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Nao foi possivel consultar o usuario.')
  }

  return Boolean(payload?.exists)
}

async function requestAuthUserCreation(input) {
  const response = await requestService('auth', '/internal/auth/users', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
    source: 'registration-service',
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: payload?.message ?? 'Nao foi possivel criar o usuario.',
    }
  }

  return {
    ok: true,
    status: response.status,
    message: payload?.message ?? 'Usuario criado com sucesso.',
  }
}

async function ensureAuthUserCreated(input) {
  const created = await requestAuthUserCreation(input)

  if (created.ok) {
    return created
  }

  if (created.status === 409 && (await checkAuthUserExists(input.email))) {
    return {
      ok: true,
      status: 200,
      message: 'Usuario criado com sucesso.',
    }
  }

  return created
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

  const existingUser = await checkAuthUserExists(email)

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
    await requestVerificationEmail({
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

  const created = await ensureAuthUserCreated({
    email: pending.email,
    passwordHash: pending.password_hash,
  })

  if (!created.ok) {
    return {
      ok: false,
      status: created.status,
      message: created.message,
    }
  }

  const consumed = await consumePendingRegistration(pending.id)

  if (!consumed) {
    return { ok: false }
  }

  void publishEventSafely({
    type: 'registration.email_verified',
    source: 'registration-service',
    payload: {
      email: pending.email,
    },
  })

  return {
    ok: true,
    message: created.message,
  }
}
