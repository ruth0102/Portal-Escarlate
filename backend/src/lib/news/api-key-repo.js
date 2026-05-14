import { query } from '../db/postgres.js'
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../crypto/secrets.js'

export async function listActiveNewsApiKeys() {
  const result = await query(
    `select id, provider, api_key, priority
     from news_api_keys
     where active = true
     order by priority asc, created_at asc`,
  )

  const apiKeys = []

  for (const row of result.rows) {
    if (row.api_key && !isEncryptedSecret(row.api_key)) {
      await query(
        `update news_api_keys
            set api_key = $2,
                updated_at = now()
          where id = $1`,
        [row.id, encryptSecret(row.api_key)],
      )
    }

    apiKeys.push({
      id: row.id,
      provider: row.provider,
      apiKey: decryptSecret(row.api_key),
      priority: row.priority,
    })
  }

  return apiKeys
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
