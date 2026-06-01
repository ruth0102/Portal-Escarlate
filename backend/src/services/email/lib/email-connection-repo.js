import { query } from '../../../lib/db/postgres.js'
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../../../lib/crypto/secrets.js'

function toEmailConnection(row) {
  return {
    id: row.id,
    provider: row.provider,
    email: row.email,
    active: row.active,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function findActiveEmailConnection() {
  const result = await query(
    `select
       id,
       provider,
       email,
       refresh_token
     from email_connections
     where active = true
     order by priority asc, created_at asc
     limit 1`,
  )

  const row = result.rows[0]

  if (!row) {
    return null
  }

  if (row.refresh_token && !isEncryptedSecret(row.refresh_token)) {
    await query(
      `update email_connections
          set refresh_token = $2,
              updated_at = now()
        where id = $1`,
      [row.id, encryptSecret(row.refresh_token)],
    )
  }

  return {
    ...row,
    refresh_token: decryptSecret(row.refresh_token),
  }
}

export async function listEmailConnections() {
  const result = await query(
    `select id, provider, email, active, priority, created_at, updated_at
       from email_connections
      order by priority asc, created_at asc`,
  )

  return result.rows.map(toEmailConnection)
}

export async function listEmailConnectionsWithTokens() {
  const result = await query(
    `select id, provider, email, refresh_token, active, priority, created_at, updated_at
       from email_connections
      order by priority asc, created_at asc`,
  )

  const rows = []

  for (const row of result.rows) {
    if (row.refresh_token && !isEncryptedSecret(row.refresh_token)) {
      await query(
        `update email_connections
            set refresh_token = $2,
                updated_at = now()
          where id = $1`,
        [row.id, encryptSecret(row.refresh_token)],
      )
    }

    rows.push({
      ...row,
      refresh_token: decryptSecret(row.refresh_token),
    })
  }

  return rows
}

export async function upsertEmailConnection(input) {
  const result = await query(
    `insert into email_connections (provider, email, refresh_token, active, priority, updated_at)
     values ($1, $2, $3, true, $4, now())
     on conflict (email)
     do update set
       provider = excluded.provider,
       refresh_token = excluded.refresh_token,
       active = true,
       priority = excluded.priority,
       updated_at = now()
     returning id, provider, email, active, priority, created_at, updated_at`,
    [input.provider, input.email, encryptSecret(input.refreshToken), input.priority],
  )

  return toEmailConnection(result.rows[0])
}

export async function updateEmailConnectionPriority(input) {
  const result = await query(
    `update email_connections
        set priority = $2,
            updated_at = now()
      where id = $1
      returning id, provider, email, active, priority, created_at, updated_at`,
    [input.id, input.priority],
  )

  return result.rows[0] ? toEmailConnection(result.rows[0]) : null
}

export async function deleteEmailConnection(id) {
  const result = await query(
    `delete from email_connections
      where id = $1
      returning id`,
    [id],
  )

  return Boolean(result.rows[0])
}
