import { query } from '../db/postgres.js'

async function listActiveAiConfigsFromTables(apiKeysTable, modelsTable) {
  const result = await query(
    `select
       keys.id as api_key_id,
       keys.provider,
       keys.label,
       keys.api_key,
       models.model
     from ${apiKeysTable} keys
     join ${modelsTable} models
       on models.api_key_id = keys.id
     where keys.active = true
       and models.active = true
     order by
       keys.priority asc,
       keys.created_at asc,
       models.priority asc,
       models.created_at asc`,
  )

  const configs = []

  for (const row of result.rows) {
    let config = configs.find((item) => item.apiKeyId === row.api_key_id)

    if (!config) {
      config = {
        apiKeyId: row.api_key_id,
        provider: row.provider,
        label: row.label,
        apiKey: row.api_key,
        models: [],
      }
      configs.push(config)
    }

    config.models.push(row.model)
  }

  return configs
}

export async function listActiveAiConfigs() {
  try {
    return await listActiveAiConfigsFromTables('ai_api_keys', 'ai_models')
  } catch (error) {
    if (error.code !== '42P01') {
      throw error
    }

    return listActiveAiConfigsFromTables('ai_summary_api_keys', 'ai_summary_models')
  }
}
