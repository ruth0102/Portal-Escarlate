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

export function getSupabaseUrl() {
  const value = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL')

  if (value.includes('your-project-id.supabase.co')) {
    throw new Error('Supabase URL still uses the placeholder value.')
  }

  return value.replace(/\/+$/, '')
}

export function getSupabaseServiceRoleKey() {
  const value = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (value === 'your-server-only-service-role-key') {
    throw new Error('Supabase service role key still uses the placeholder value.')
  }

  return value
}
