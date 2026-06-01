import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { forgotPasswordSchema } from '../../lib/auth/validation'
import styles from './forgot-password.module.css'

type Status =
  | { tone: 'neutral'; text: string }
  | { tone: 'error'; text: string }
  | { tone: 'success'; text: string }

const defaultStatus: Status = {
  tone: 'neutral',
  text: 'Informe o e-mail cadastrado e enviaremos um link para redefinir sua senha.',
}

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(defaultStatus)
  const [sent, setSent] = useState(false)

  const statusClassName = [
    styles.status,
    status.tone === 'error' ? styles.statusError : '',
    status.tone === 'success' ? styles.statusSuccess : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <span className={styles.kicker}>Recuperação de senha</span>
        <h1 className={styles.title}>Esqueci minha senha</h1>
        <p className={styles.copy}>
          Vamos enviar um link de redefinição para o e-mail cadastrado. O link expira em alguns minutos.
        </p>

        <div className={statusClassName}>
          <span>{status.text}</span>
        </div>

        <form
          className={styles.form}
          onSubmit={async (event) => {
            event.preventDefault()

            const formData = new FormData(event.currentTarget)
            const parsed = forgotPasswordSchema.safeParse({
              email: formData.get('email'),
            })

            if (!parsed.success) {
              setStatus({
                tone: 'error',
                text: parsed.error.issues[0]?.message ?? 'Revise o e-mail informado.',
              })
              return
            }

            setBusy(true)
            setStatus(defaultStatus)

            try {
              const response = await apiFetch('/api/auth/password/forgot', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(parsed.data),
              })

              const payload = (await response.json().catch(() => ({}))) as {
                message?: string
              }

              if (!response.ok) {
                setStatus({
                  tone: 'error',
                  text:
                    payload.message ??
                    (response.status === 404
                      ? 'Serviço de recuperação ainda não foi migrado.'
                      : 'Não foi possível iniciar a recuperação agora.'),
                })
                return
              }

              setSent(true)
              setStatus({
                tone: 'success',
                text:
                  payload.message ??
                  'Se este e-mail estiver cadastrado, enviaremos um link de recuperação em instantes.',
              })
            } catch {
              setStatus({
                tone: 'error',
                text: 'Serviço de recuperação ainda não está disponível.',
              })
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className={styles.field}>
            <span className={styles.fieldLabel}>E-mail</span>
            <input
              className={styles.fieldInput}
              type="email"
              name="email"
              autoComplete="username"
              placeholder="usuario@exemplo.com.br"
              required
            />
          </label>

          <button className={styles.action} type="submit" disabled={busy}>
            {busy ? 'Enviando...' : sent ? 'Reenviar link' : 'Enviar link de recuperação'}
          </button>
        </form>

        <Link className={styles.backLink} to="/login">
          Voltar para login
        </Link>
      </section>
    </main>
  )
}
