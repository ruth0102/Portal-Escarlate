import { sendGmailApiEmail } from './send-gmail-api.js'

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export async function sendVerificationEmail(input) {
  const safeUrl = escapeHtml(input.verificationUrl)

  await sendGmailApiEmail({
    to: input.to,
    subject: 'Confirme seu e-mail para concluir seu cadastro',
    text: [
      'PORTAL ESCARLATE',
      '',
      'Confirme seu e-mail para concluir seu cadastro.',
      '',
      'Abra o link abaixo em ate 5 minutos:',
      input.verificationUrl,
      '',
      'Se voce nao solicitou este cadastro, ignore esta mensagem.',
    ].join('\n'),
    html: `
      <div style="margin:0;padding:32px 16px;background:#f6f1e8;">
        <div style="max-width:640px;margin:0 auto;background:#fffaf4;border:1px solid #e8d3a1;border-radius:24px;overflow:hidden;font-family:Segoe UI,Arial,sans-serif;">
          <div style="padding:34px;background:linear-gradient(135deg,#3f0910,#7b1621);color:#fff6e2;">
            <p style="margin:0 0 14px;color:#f6dfab;letter-spacing:.24em;text-transform:uppercase;">Portal Escarlate</p>
            <h1 style="margin:0;font-family:Georgia,serif;font-size:36px;">Confirme seu e-mail</h1>
            <p style="line-height:1.7;color:rgba(255,241,214,.82);">Seu acesso ao ambiente reservado esta quase pronto.</p>
          </div>
          <div style="padding:34px;color:#372126;">
            <p>Este link expira em <strong>5 minutos</strong> e deve ser usado uma unica vez.</p>
            <p style="text-align:center;margin:28px 0;">
              <a href="${safeUrl}" style="display:inline-block;padding:16px 28px;border-radius:16px;background:#8d1320;color:#fff7e8;text-decoration:none;font-weight:700;">Confirmar e-mail</a>
            </p>
            <p>Se o botao nao abrir, copie e cole este link:</p>
            <p style="word-break:break-word;"><a href="${safeUrl}" style="color:#8d1320;">${safeUrl}</a></p>
          </div>
        </div>
      </div>
    `,
  })
}
