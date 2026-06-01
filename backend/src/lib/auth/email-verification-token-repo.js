import { createHash } from 'node:crypto'
import { query } from '../db/postgres.js'

const TOKENS_TABLE = 'email_verification_tokens'
const DEFAULT_TTL_MS = 5 * 60 * 1000

export function getEmailVerificationTtlMs() {
  const raw = process.env.EMAIL_VERIFICATION_TTL_MS?.trim()
  const parsed = raw ? Number(raw) : DEFAULT_TTL_MS

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_MS
  }

  return parsed
}

export function hashVerificationToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function getVerificationExpiryDate() {
  return new Date(Date.now() + getEmailVerificationTtlMs()).toISOString()
}

export async function removePendingRegistrationByEmail(email) {
  await query(
    `delete from ${TOKENS_TABLE}
      where email = $1
        and consumed_at is null`,
    [email],
  )
}

export async function upsertPendingRegistration(input) {
  await removePendingRegistrationByEmail(input.email)

  const result = await query(
    `insert into ${TOKENS_TABLE} (email, password_hash, token_hash, expires_at)
     values ($1, $2, $3, $4)
     returning id, email, password_hash, token_hash, expires_at, consumed_at`,
    [input.email, input.passwordHash, input.tokenHash, input.expiresAt],
  )

  return result.rows[0] ?? null
}

export async function findPendingRegistrationByTokenHash(tokenHash) {
  const result = await query(
    `select id, email, password_hash, token_hash, expires_at, consumed_at
       from ${TOKENS_TABLE}
      where token_hash = $1
      limit 1`,
    [tokenHash],
  )

  return result.rows[0] ?? null
}

export async function consumePendingRegistration(id) {
  try {
    const result = await query(
      `update ${TOKENS_TABLE}
          set consumed_at = now()
        where id = $1
          and consumed_at is null
      returning id, email, password_hash, token_hash, expires_at, consumed_at`,
      [id],
    )

    return result.rows[0] ?? null
  } catch (error) {
    throw new Error(`Failed to consume verification token: ${error.message}`)
  }
}
