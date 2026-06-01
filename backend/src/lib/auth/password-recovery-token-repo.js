import { createHash } from 'node:crypto'
import { query } from '../db/postgres.js'

const TOKENS_TABLE = 'password_recovery_tokens'
const DEFAULT_TTL_MS = 5 * 60 * 1000

export function getPasswordRecoveryTtlMs() {
  const raw = process.env.PASSWORD_RECOVERY_TTL_MS?.trim()
  const parsed = raw ? Number(raw) : DEFAULT_TTL_MS

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_MS
  }

  return parsed
}

export function hashRecoveryToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function getRecoveryExpiryDate() {
  return new Date(Date.now() + getPasswordRecoveryTtlMs()).toISOString()
}

export async function removePendingRecoveryByEmail(email) {
  await query(
    `delete from ${TOKENS_TABLE}
      where email = $1
        and consumed_at is null`,
    [email],
  )
}

export async function upsertPendingRecovery(input) {
  await removePendingRecoveryByEmail(input.email)

  const result = await query(
    `insert into ${TOKENS_TABLE} (email, token_hash, expires_at)
     values ($1, $2, $3)
     returning id, email, token_hash, expires_at, consumed_at`,
    [input.email, input.tokenHash, input.expiresAt],
  )

  return result.rows[0] ?? null
}

export async function consumeValidPendingRecoveryByTokenHash(tokenHash) {
  try {
    const result = await query(
      `update ${TOKENS_TABLE}
          set consumed_at = now()
        where token_hash = $1
          and consumed_at is null
          and expires_at > now()
      returning id, email, token_hash, expires_at, consumed_at`,
      [tokenHash],
    )

    return result.rows[0] ?? null
  } catch (error) {
    throw new Error(`Failed to consume password recovery token: ${error.message}`)
  }
}
