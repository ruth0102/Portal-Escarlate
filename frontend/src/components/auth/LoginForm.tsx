import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthForm, type AuthMessage } from './AuthForm'
import { loginSchema } from '../../lib/auth/validation'
import styles from './AuthPortal.module.css'

type LoginFormProps = {
  active: boolean
  initialNotice?: string
}

const defaultMessage: AuthMessage = {
  tone: 'neutral',
  text: 'Login: pronto para conectar sua autenticacao e liberar a area de monitoramento e pesquisa publica.',
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
          <label className={styles.checkline}>
            <input type="checkbox" name="remember" />
            <span>Manter acesso ativo</span>
          </label>
          <span className={styles.textLink} aria-disabled="true">
            Recuperacao em breve
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
                  ? 'Backend de autenticacao ainda nao foi migrado.'
                  : 'Credenciais invalidas ou conta indisponivel no momento.',
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
            text: 'Backend de autenticacao ainda nao esta disponivel.',
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
            placeholder="voce@dominio.com"
            required
          />
          <span className={styles.fieldIcon}>✦</span>
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Senha</span>
        <span className={styles.inputWrap}>
          <input
            className={styles.fieldInput}
            type="password"
            name="password"
            placeholder="Digite sua senha"
            required
          />
          <span className={styles.fieldIcon}>✧</span>
        </span>
      </label>
    </AuthForm>
  )
}
