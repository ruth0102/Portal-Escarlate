import { randomBytes } from 'node:crypto'
import { getAppUrl } from '../env.js'
import { publishEvent, publishEventSafely } from '../events/event-client.js'
import { requestService } from '../events/service-request-client.js'
import { consumePasswordRecoveryRateLimit } from './password-recovery-rate-limit.js'
import {
  consumeValidPendingRecoveryByTokenHash,
  getRecoveryExpiryDate,
  hashRecoveryToken,
  removePendingRecoveryByEmail,
  upsertPendingRecovery,
} from './password-recovery-token-repo.js'
import { normalizeEmail } from './user-repo.js'

const GENERIC_REQUEST_MESSAGE =
  'Se este e-mail estiver cadastrado, enviaremos um link de recuperacao em instantes.'

function buildRecoveryUrl(token) {
  return `${getAppUrl()}/reset-password?code=${encodeURIComponent(token)}`
}

function generateRecoveryToken() {
  return randomBytes(32).toString('base64url')
}

async function requestRecoveryEmail(input) {
  await publishEvent({
    type: 'email.password_recovery_requested',
    source: 'password-recovery-service',
    payload: input,
  })
}

async function checkAuthUserExists(email) {
  const path = `/internal/auth/users/exists?email=${encodeURIComponent(email)}`
  const response = await requestService('auth', path, {
    source: 'password-recovery-service',
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Nao foi possivel consultar o usuario.')
  }

  return Boolean(payload?.exists)
}

async function requestAuthPasswordUpdate(input) {
  const response = await requestService('auth', '/internal/auth/users/password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
    source: 'password-recovery-service',
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: payload?.message ?? 'Nao foi possivel atualizar a senha.',
    }
  }

  return {
    ok: true,
    status: response.status,
    message: payload?.message ?? 'Senha atualizada com sucesso.',
  }
}

export async function requestPasswordRecovery(input) {
  const email = normalizeEmail(input.email)
  const allowed = consumePasswordRecoveryRateLimit({
    email,
    ip: input.ip,
  })

  if (!allowed) {
    return {
      ok: false,
      status: 429,
      message: 'Muitas tentativas de recuperacao. Tente novamente em instantes.',
    }
  }

  const existingUser = await checkAuthUserExists(email)

  if (!existingUser) {
    return {
      ok: true,
      status: 200,
      message: GENERIC_REQUEST_MESSAGE,
    }
  }

  const token = generateRecoveryToken()
  const tokenHash = hashRecoveryToken(token)

  await upsertPendingRecovery({
    email,
    tokenHash,
    expiresAt: getRecoveryExpiryDate(),
  })

  try {
    await requestRecoveryEmail({
      to: email,
      recoveryUrl: buildRecoveryUrl(token),
    })
  } catch (error) {
    await removePendingRecoveryByEmail(email)
    throw error
  }

  return {
    ok: true,
    status: 200,
    message: GENERIC_REQUEST_MESSAGE,
  }
}

export async function resetPasswordWithToken(input) {
  const tokenHash = hashRecoveryToken(input.code)
  const pending = await consumeValidPendingRecoveryByTokenHash(tokenHash)

  if (!pending) {
    return { ok: false }
  }

  const updated = await requestAuthPasswordUpdate({
    email: pending.email,
    password: input.password,
  })

  if (!updated.ok) {
    return {
      ok: false,
      status: updated.status,
      message: updated.message,
    }
  }

  void publishEventSafely({
    type: 'auth.password_reset',
    source: 'password-recovery-service',
    payload: {
      email: pending.email,
    },
  })

  return {
    ok: true,
    message: 'Senha redefinida com sucesso. Agora faca login com a nova senha.',
  }
}
