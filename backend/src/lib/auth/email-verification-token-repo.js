import { createHash } from 'node:crypto'
import { SupabaseApiError, supabaseAdminRequest } from '../supabase.js'

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
  const query = new URLSearchParams({
    email: `eq.${email}`,
    consumed_at: 'is.null',
  })

  await supabaseAdminRequest(`${TOKENS_TABLE}?${query.toString()}`, {
    method: 'DELETE',
  })
}

export async function upsertPendingRegistration(input) {
  await removePendingRegistrationByEmail(input.email)

  const rows = await supabaseAdminRequest(
    `${TOKENS_TABLE}?select=id,email,password_hash,token_hash,expires_at,consumed_at`,
    {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        email: input.email,
        password_hash: input.passwordHash,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
      }),
    },
  )

  return rows[0] ?? null
}

export async function findPendingRegistrationByTokenHash(tokenHash) {
  const query = new URLSearchParams({
    select: 'id,email,password_hash,token_hash,expires_at,consumed_at',
    token_hash: `eq.${tokenHash}`,
    limit: '1',
  })

  const rows = await supabaseAdminRequest(`${TOKENS_TABLE}?${query.toString()}`, {
    method: 'GET',
  })

  return rows[0] ?? null
}

export async function consumePendingRegistration(id) {
  try {
    const query = new URLSearchParams({
      id: `eq.${id}`,
      consumed_at: 'is.null',
    })

    const rows = await supabaseAdminRequest(
      `${TOKENS_TABLE}?select=id,email,password_hash,token_hash,expires_at,consumed_at&${query.toString()}`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          consumed_at: new Date().toISOString(),
        }),
      },
    )

    return rows[0] ?? null
  } catch (error) {
    if (error instanceof SupabaseApiError) {
      throw new Error(`Failed to consume verification token: ${error.message}`)
    }

    throw error
  }
}
