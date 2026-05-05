import { google } from 'googleapis'
import { getRequiredEnv } from '../env.js'

function getSenderHeader() {
  const address = getRequiredEnv('GOOGLE_SENDER_EMAIL')
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

function buildMimeMessage(input) {
  const boundary = `portal-escarlate-${Date.now()}`

  return [
    `From: ${getSenderHeader()}`,
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

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    getRequiredEnv('GOOGLE_CLIENT_ID'),
    getRequiredEnv('GOOGLE_CLIENT_SECRET'),
  )

  client.setCredentials({
    refresh_token: getRequiredEnv('GOOGLE_REFRESH_TOKEN'),
  })

  return client
}

export async function sendGmailApiEmail(input) {
  const auth = getOAuthClient()
  const gmail = google.gmail({
    version: 'v1',
    auth,
  })

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: toBase64Url(buildMimeMessage(input)),
    },
  })
}
