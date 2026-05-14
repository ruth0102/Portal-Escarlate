import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { getRequiredEnv } from '../env.js'

const PREFIX = 'enc:v1:'

function getKey() {
  return createHash('sha256').update(getRequiredEnv('SECRETS_ENCRYPTION_KEY')).digest()
}

export function isEncryptedSecret(value) {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export function encryptSecret(value) {
  const plaintext = String(value ?? '')

  if (!plaintext) {
    return plaintext
  }

  if (isEncryptedSecret(plaintext)) {
    return plaintext
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${PREFIX}${Buffer.concat([iv, authTag, ciphertext]).toString('base64url')}`
}

export function decryptSecret(value) {
  const secret = String(value ?? '')

  if (!secret || !isEncryptedSecret(secret)) {
    return secret
  }

  const payload = Buffer.from(secret.slice(PREFIX.length), 'base64url')
  const iv = payload.subarray(0, 12)
  const authTag = payload.subarray(12, 28)
  const ciphertext = payload.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)

  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
