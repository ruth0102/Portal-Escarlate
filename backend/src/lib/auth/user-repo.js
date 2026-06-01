import { query } from '../db/postgres.js'

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
  const result = await query(
    `select ${select}
       from ${USERS_TABLE}
      where email = $1
      limit 1`,
    [normalizedEmail],
  )

  return result.rows[0] ?? null
}

export async function findUserByEmailForAuth(email) {
  try {
    return await findFirstByEmail('id,email,password,role,created_at', email)
  } catch (error) {
    throw new Error(`Failed to fetch user for auth: ${error.message}`)
  }
}

export async function findUserByEmail(email) {
  try {
    return await findFirstByEmail('id,email,role,created_at', email)
  } catch (error) {
    throw new Error(`Failed to fetch public user data: ${error.message}`)
  }
}

export async function createUser(input) {
  try {
    const result = await query(
      `insert into ${USERS_TABLE} (email, password, role)
       values ($1, $2, 'user')
       returning id, email, role, created_at`,
      [normalizeEmail(input.email), input.passwordHash],
    )

    return result.rows[0] ?? null
  } catch (error) {
    if (error.code === '23505') {
      throw new DuplicateEmailError()
    }

    throw new Error(`Failed to create user: ${error.message}`)
  }
}

export async function updateUserPasswordByEmail(email, passwordHash) {
  try {
    const result = await query(
      `update ${USERS_TABLE}
          set password = $2
        where email = $1
      returning id, email, role, created_at`,
      [normalizeEmail(email), passwordHash],
    )

    return result.rows[0] ?? null
  } catch (error) {
    throw new Error(`Failed to update user password: ${error.message}`)
  }
}

export function toSessionUser(user) {
  return {
    id: String(user.id),
    email: normalizeEmail(user.email),
    role: typeof user.role === 'string' ? user.role : 'user',
  }
}
