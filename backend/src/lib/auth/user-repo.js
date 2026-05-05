import { SupabaseApiError, supabaseAdminRequest } from '../supabase.js'

const USERS_TABLE = 'users_2'

export class DuplicateEmailError extends Error {
  constructor() {
    super('Já existe uma conta com esse e-mail.')
    this.name = 'DuplicateEmailError'
  }
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

async function findFirstByEmail(select, email) {
  const normalizedEmail = normalizeEmail(email)
  const query = new URLSearchParams({
    select,
    email: `eq.${normalizedEmail}`,
    limit: '1',
  })

  const rows = await supabaseAdminRequest(`${USERS_TABLE}?${query.toString()}`, {
    method: 'GET',
  })

  return rows[0] ?? null
}

export async function findUserByEmailForAuth(email) {
  try {
    return await findFirstByEmail('id,email,password,role,created_at', email)
  } catch (error) {
    if (error instanceof SupabaseApiError) {
      throw new Error(`Failed to fetch user for auth: ${error.message}`)
    }

    throw error
  }
}

export async function findUserByEmail(email) {
  try {
    return await findFirstByEmail('id,email,role,created_at', email)
  } catch (error) {
    if (error instanceof SupabaseApiError) {
      throw new Error(`Failed to fetch public user data: ${error.message}`)
    }

    throw error
  }
}

export async function createUser(input) {
  try {
    const rows = await supabaseAdminRequest(`${USERS_TABLE}?select=id,email,role,created_at`, {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        email: normalizeEmail(input.email),
        password: input.passwordHash,
        role: 'user',
      }),
    })

    return rows[0] ?? null
  } catch (error) {
    if (error instanceof SupabaseApiError && error.code === '23505') {
      throw new DuplicateEmailError()
    }

    if (error instanceof SupabaseApiError) {
      throw new Error(`Failed to create user: ${error.message}`)
    }

    throw error
  }
}

export function toSessionUser(user) {
  return {
    id: user.id,
    email: normalizeEmail(user.email),
    role: typeof user.role === 'string' ? user.role : 'user',
  }
}
