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
    let storedApiKey = row.api_key

    if (storedApiKey && !isEncryptedSecret(storedApiKey)) {
      storedApiKey = encryptSecret(storedApiKey)
      await query(
        `update news_api_keys
            set api_key = $2,
                updated_at = now()
          where id = $1`,
        [row.id, storedApiKey],
      )
    }

    try {
      apiKeys.push({
        id: row.id,
        provider: row.provider,
        apiKey: decryptSecret(storedApiKey),
        priority: row.priority,
      })
    } catch (error) {
      await markNewsApiKeyFailure({
        id: row.id,
        error: 'Nao foi possivel descriptografar a chave da NewsAPI. Verifique SECRETS_ENCRYPTION_KEY ou recadastre a chave.',
      }).catch(() => undefined)

      console.warn('[news-service] Ignoring unreadable NewsAPI key', {
        id: row.id,
        provider: row.provider,
        message: error instanceof Error ? error.message : 'Unknown decryption error',
      })
    }
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
