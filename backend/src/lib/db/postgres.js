import pg from 'pg'

const { Pool } = pg

let pool

function getServiceDatabaseEnvName() {
  const entrypoint = process.argv[1] ?? ''

  if (entrypoint.includes('/services/auth/')) {
    return 'AUTH_DATABASE_URL'
  }

  if (entrypoint.includes('/services/registration/')) {
    return 'REGISTRATION_DATABASE_URL'
  }

  if (entrypoint.includes('/services/news/')) {
    return 'NEWS_DATABASE_URL'
  }

  if (entrypoint.includes('/services/ai-summary/')) {
    return 'AI_SUMMARY_DATABASE_URL'
  }

  if (entrypoint.includes('/services/email/')) {
    return 'EMAIL_DATABASE_URL'
  }

  return 'GATEWAY_DATABASE_URL'
}

function getDatabaseUrl() {
  const serviceEnvName = getServiceDatabaseEnvName()
  const serviceUrl = process.env[serviceEnvName]?.trim()

  if (serviceUrl) {
    return serviceUrl
  }

  const fallback = process.env.DATABASE_URL?.trim()

  if (fallback) {
    return fallback
  }

  throw new Error(`Missing required environment variable: ${serviceEnvName}`)
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      ssl:
        process.env.DATABASE_SSL === 'false'
          ? false
          : {
              rejectUnauthorized: false,
            },
    })
  }

  return pool
}

export async function query(text, params = []) {
  return getPool().query(text, params)
}

export async function withTransaction(callback) {
  const client = await getPool().connect()

  try {
    await client.query('begin')
    const result = await callback(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
