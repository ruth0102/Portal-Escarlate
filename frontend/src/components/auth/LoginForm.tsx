import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthForm, type AuthMessage } from './AuthForm'
import { PasswordField } from './PasswordField'
import { loginSchema } from '../../lib/auth/validation'
import styles from './AuthPortal.module.css'

type LoginFormProps = {
  active: boolean
  initialNotice?: string
}

const defaultMessage: AuthMessage = {
  tone: 'neutral',
  text: 'Informe suas credenciais para acessar sua área de pesquisa.',
}

export function LoginForm({ active, initialNotice }: LoginFormProps) {
  const navigate = useNavigate()
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
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(parsed.data),
          })

          if (!response.ok) {
            setMessage({
              tone: 'error',
              text:
                response.status === 404
                  ? 'Backend de autenticação ainda não foi migrado.'
                  : 'Credenciais inválidas ou conta indisponível no momento.',
            })
            return
          }

          setMessage({
            tone: 'success',
            text: 'Acesso confirmado. Redirecionando para a ala reservada...',
          })
          navigate('/dashboard')
        } catch {
          setMessage({
            tone: 'error',
            text: 'Backend de autenticação ainda não está disponível.',
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
            placeholder="usuario@dominio.com"
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
