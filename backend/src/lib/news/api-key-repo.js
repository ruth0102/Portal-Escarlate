import { query } from '../db/postgres.js'

export async function listActiveNewsApiKeys() {
  const result = await query(
    `select id, provider, label, api_key, priority
     from news_api_keys
     where active = true
     order by priority asc, created_at asc`,
  )

  return result.rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    label: row.label,
    apiKey: row.api_key,
    priority: row.priority,
  }))
}

export async function markNewsApiKeyFailure(input) {
  await query(
    `update news_api_keys
     set last_failed_at = now(),
         last_error = $2,
         updated_at = now()
     where id = $1`,
    [input.id, input.error],
  )
}
