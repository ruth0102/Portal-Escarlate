import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PasswordField } from '../../components/auth/PasswordField'
import authStyles from '../../components/auth/AuthPortal.module.css'
import { apiFetch } from '../../lib/api'
import { resetPasswordSchema } from '../../lib/auth/validation'
import styles from './reset-password.module.css'

type Status =
  | { tone: 'neutral'; text: string }
  | { tone: 'error'; text: string }
  | { tone: 'success'; text: string }

const defaultStatus: Status = {
  tone: 'neutral',
  text: 'Defina uma nova senha forte para concluir a recuperação do acesso.',
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')?.trim() ?? ''
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(defaultStatus)
  const [password, setPassword] = useState('')

  const passwordRules = [
    {
      label: 'Ao menos 8 caracteres',
      valid: password.length >= 8,
    },
    {
      label: 'Pelo menos uma letra',
      valid: /[A-Za-z]/.test(password),
    },
    {
      label: 'Pelo menos um número',
      valid: /[0-9]/.test(password),
    },
    {
      label: 'Pelo menos um caractere especial',
      valid: /[^A-Za-z0-9]/.test(password),
    },
  ]

  const statusClassName = [
    styles.status,
    status.tone === 'error' ? styles.statusError : '',
    status.tone === 'success' ? styles.statusSuccess : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (!code) {
    return (
      <main className={styles.page}>
        <section className={styles.panel}>
          <span className={styles.kicker}>Recuperação de senha</span>
          <h1 className={styles.title}>Link inválido</h1>
          <p className={styles.copy}>
            Este link de recuperação não é válido ou expirou. Solicite um novo link para redefinir sua senha.
          </p>
          <Link className={styles.action} to="/forgot-password">
            Solicitar novo link
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <span className={styles.kicker}>Recuperação de senha</span>
        <h1 className={styles.title}>Redefinir senha</h1>
        <p className={styles.copy}>
          Escolha uma nova senha segura. O link expira em poucos minutos e só pode ser usado uma vez.
        </p>

        <div className={statusClassName}>
          <span>{status.text}</span>
        </div>

        <form
          className={styles.form}
          autoComplete="on"
          onSubmit={async (event) => {
            event.preventDefault()

            const formData = new FormData(event.currentTarget)
            const parsed = resetPasswordSchema.safeParse({
              password: formData.get('password'),
              confirmPassword: formData.get('confirmPassword'),
            })

            if (!parsed.success) {
              setStatus({
                tone: 'error',
                text: parsed.error.issues[0]?.message ?? 'Revise os dados informados.',
              })
              return
            }

            setBusy(true)
            setStatus(defaultStatus)

            try {
              const response = await apiFetch(
                `/api/auth/password/reset?code=${encodeURIComponent(code)}`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(parsed.data),
                },
              )

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
                      : 'Não foi possível redefinir a senha agora.'),
                })
                return
              }

              setStatus({
                tone: 'success',
                text: payload.message ?? 'Senha redefinida com sucesso. Redirecionando...',
              })
              navigate('/login?reset=1', { replace: true })
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
          <PasswordField
            label="Nova senha"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            placeholder="Crie uma nova senha"
            autoComplete="new-password"
          />

          <ul className={authStyles.passwordRequirements} aria-label="Requisitos da senha">
            {passwordRules.map((rule) => (
              <li
                className={`${authStyles.passwordRequirement} ${
                  rule.valid ? authStyles.passwordRequirementValid : ''
                }`}
                key={rule.label}
              >
                {rule.label}
              </li>
            ))}
          </ul>

          <PasswordField
            label="Confirmar nova senha"
            name="confirmPassword"
            placeholder="Repita a nova senha"
            autoComplete="new-password"
          />

          <button className={styles.action} type="submit" disabled={busy}>
            {busy ? 'Redefinindo...' : 'Redefinir senha'}
          </button>
        </form>

        <Link className={styles.backLink} to="/login">
          Voltar para login
        </Link>
      </section>
    </main>
  )
}
