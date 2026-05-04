import { getSupabaseServiceRoleKey, getSupabaseUrl } from './env.js'

export class SupabaseApiError extends Error {
  constructor(status, payload) {
    super(typeof payload === 'string' ? payload : payload.message)
    this.name = 'SupabaseApiError'
    this.status = status
    this.code = typeof payload === 'string' ? undefined : payload.code
  }
}

function buildRestUrl(path) {
  return `${getSupabaseUrl()}/rest/v1/${path}`
}

function buildAdminHeaders(extra = {}) {
  const serviceRoleKey = getSupabaseServiceRoleKey()

  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

export async function supabaseAdminRequest(path, init = {}) {
  let response

  try {
    response = await fetch(buildRestUrl(path), {
      ...init,
      headers: buildAdminHeaders(init.headers),
      cache: 'no-store',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch failure'
    throw new Error(`Supabase API request failed: ${message}`)
  }

  if (!response.ok) {
    const text = await response.text()

    try {
      throw new SupabaseApiError(response.status, JSON.parse(text))
    } catch (error) {
      if (error instanceof SupabaseApiError) {
        throw error
      }

      throw new SupabaseApiError(response.status, text)
    }
  }

  if (response.status === 204) {
    return undefined
  }

  return response.json()
}
