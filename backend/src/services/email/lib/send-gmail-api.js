import { google } from 'googleapis'
import { getRequiredEnv } from '../../../lib/env.js'
import { findActiveEmailConnection } from './email-connection-repo.js'

function getSenderHeader(address) {
  const name = process.env.EMAIL_FROM_NAME?.trim()

  if (!name) {
    return address
  }

  return `"${name}" <${address}>`
}

function toBase64Url(input) {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function buildMimeMessage(input, senderEmail) {
  const boundary = `portal-escarlate-${Date.now()}`

  return [
    `From: ${getSenderHeader(senderEmail)}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    input.text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    input.html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

function getOAuthClient(refreshToken) {
  const client = new google.auth.OAuth2(
    getRequiredEnv('GOOGLE_CLIENT_ID'),
    getRequiredEnv('GOOGLE_CLIENT_SECRET'),
  )

  client.setCredentials({
    refresh_token: refreshToken,
  })

  return client
}

export async function sendGmailApiEmail(input) {
  const connection = await findActiveEmailConnection()

  if (!connection) {
    throw new Error('Nenhuma conexao de e-mail ativa foi encontrada.')
  }

  if (connection.provider !== 'gmail') {
    throw new Error(`Provedor de e-mail nao suportado: ${connection.provider}`)
  }

  const auth = getOAuthClient(connection.refresh_token)
  const gmail = google.gmail({
    version: 'v1',
    auth,
  })

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: toBase64Url(buildMimeMessage(input, connection.email)),
    },
  })
}
