export function getRequiredEnv(name) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getAppUrl() {
  return getRequiredEnv('APP_URL').replace(/\/+$/, '')
}
