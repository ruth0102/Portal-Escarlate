import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthForm, type AuthMessage } from './AuthForm'
import { PasswordField } from './PasswordField'
import { apiFetch } from '../../lib/api'
import { sanitizeLoginRedirect } from '../../lib/auth/redirect'
import { loginSchema } from '../../lib/auth/validation'
import styles from './AuthPortal.module.css'

type LoginFormProps = {
  active: boolean
  initialNotice?: string
  onUnknownEmail?: (email: string) => void
}

const defaultMessage: AuthMessage = {
  tone: 'neutral',
  text: 'Informe suas credenciais para acessar sua área de pesquisa.',
}

export function LoginForm({ active, initialNotice, onUnknownEmail }: LoginFormProps) {
  const navigate = useNavigate()
  const redirectTo = sanitizeLoginRedirect(new URLSearchParams(window.location.search).get('redirect'))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<AuthMessage>(
    initialNotice
      ? {
          tone: 'success',
          text: initialNotice,
        }
      : defaultMessage,
  )

  return (
    <AuthForm
      active={active}
      busy={busy}
      formId="panel-login"
      actionLabel="Entrar no portal"
      message={message}
      meta={
        <>
          <Link className={styles.textLink} to="/termos-de-uso">
            Termos de uso
          </Link>
          <span className={styles.privacyNotice}>
            Ao entrar, você concorda com as políticas de coleta e uso de dados.
          </span>
        </>
      }
      onSubmit={async (event) => {
        event.preventDefault()

        const formData = new FormData(event.currentTarget)
        const parsed = loginSchema.safeParse({
          email: formData.get('email'),
          password: formData.get('password'),
        })

        if (!parsed.success) {
          setMessage({
            tone: 'error',
            text: parsed.error.issues[0]?.message ?? 'Revise os dados informados.',
          })
          return
        }

        setBusy(true)
        setMessage(defaultMessage)

        try {
          const response = await apiFetch('/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(parsed.data),
          })

          const payload = (await response.json().catch(() => ({}))) as {
            code?: string
            message?: string
          }

          if (!response.ok) {
            if (payload.code === 'user_not_found') {
              onUnknownEmail?.(parsed.data.email)
              return
            }

            setMessage({
              tone: 'error',
              text:
                response.status === 404
                  ? 'Serviço de autenticação ainda não foi migrado.'
                  : payload.message ?? 'Credenciais inválidas ou conta indisponível no momento.',
            })
            return
          }

          setMessage({
            tone: 'success',
            text: 'Acesso confirmado. Validando sessão...',
          })

          const sessionResponse = await apiFetch('/api/auth/me')

          if (!sessionResponse.ok) {
            setMessage({
              tone: 'error',
              text: 'Login aceito, mas a sessão não foi persistida pelo navegador. Recarregue a página e tente novamente.',
            })
            return
          }

          setMessage({
            tone: 'success',
            text: 'Sessão validada. Redirecionando para a ala reservada...',
          })
          navigate(redirectTo, { replace: true })
        } catch {
          setMessage({
            tone: 'error',
            text: 'Serviço de autenticação ainda não está disponível.',
          })
        } finally {
          setBusy(false)
        }
      }}
    >
      <label className={styles.field}>
        <span className={styles.fieldLabel}>E-mail</span>
        <span className={styles.inputWrap}>
          <input
            className={styles.fieldInput}
            type="email"
            name="email"
            autoComplete="username"
            placeholder="usuario@exemplo.com.br"
            required
          />
        </span>
      </label>

      <PasswordField
        label="Senha"
        name="password"
        placeholder="Digite sua senha"
        autoComplete="current-password"
      />
    </AuthForm>
  )
}
