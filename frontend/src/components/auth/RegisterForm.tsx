import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthForm, type AuthMessage } from './AuthForm'
import { PasswordField } from './PasswordField'
import { apiFetch } from '../../lib/api'
import { registerSchema } from '../../lib/auth/validation'
import styles from './AuthPortal.module.css'

type RegisterFormProps = {
  active: boolean
  initialEmail?: string
}

const defaultMessage: AuthMessage = {
  tone: 'neutral',
  text: 'Crie sua conta e confirme o e-mail para liberar o acesso.',
}

export function RegisterForm({ active, initialEmail = '' }: RegisterFormProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<AuthMessage>(defaultMessage)
  const [email, setEmail] = useState(initialEmail)
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

  useEffect(() => {
    if (!initialEmail) {
      return
    }

    setEmail(initialEmail)
    setMessage({
      tone: 'error',
      text: 'Este e-mail não está cadastrado. Complete o cadastro para solicitar o acesso.',
    })
  }, [initialEmail])

  return (
    <AuthForm
      active={active}
      busy={busy}
      formId="panel-register"
      actionLabel="Criar acesso"
      message={message}
      note="O cadastro só será concluído depois que o link enviado ao e-mail for aberto dentro do prazo."
      meta={
        <>
          <label className={styles.checkline}>
            <input type="checkbox" name="terms" required />
            <span>Aceito os termos de acesso e coleta de dados</span>
          </label>
          <Link className={styles.textLink} to="/termos-de-uso">
            Ler condições
          </Link>
        </>
      }
      onSubmit={async (event) => {
        event.preventDefault()

        const formData = new FormData(event.currentTarget)
        const parsed = registerSchema.safeParse({
          email: formData.get('email'),
          password: formData.get('password'),
          confirmPassword: formData.get('confirmPassword'),
          terms: formData.get('terms') === 'on',
        })

        if (!parsed.success) {
          setMessage({
            tone: 'error',
            text: parsed.error.issues[0]?.message ?? 'Revise os dados do cadastro.',
          })
          return
        }

        setBusy(true)
        setMessage(defaultMessage)

        try {
          const response = await apiFetch('/api/auth/register/request', {
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
            setMessage({
              tone: 'error',
              text:
                payload.message ??
                (response.status === 404
                  ? 'Serviço de cadastro ainda não foi migrado.'
                  : 'Não foi possível concluir o cadastro.'),
            })
            return
          }

          setMessage({
            tone: 'success',
            text:
              payload.message ??
              'Se este e-mail puder receber acesso, enviaremos um link de confirmação em instantes.',
          })
        } catch {
          setMessage({
            tone: 'error',
            text: 'Serviço de cadastro ainda não está disponível.',
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
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            autoComplete="username"
            placeholder="novo@exemplo.com.br"
            required
          />
        </span>
      </label>

      <PasswordField
        label="Senha"
        name="password"
        value={password}
        onChange={(event) => setPassword(event.currentTarget.value)}
        placeholder="Crie uma senha"
        autoComplete="new-password"
      />

      <ul className={styles.passwordRequirements} aria-label="Requisitos da senha">
        {passwordRules.map((rule) => (
          <li
            className={`${styles.passwordRequirement} ${
              rule.valid ? styles.passwordRequirementValid : ''
            }`}
            key={rule.label}
          >
            {rule.label}
          </li>
        ))}
      </ul>

      <PasswordField
        label="Confirmar senha"
        name="confirmPassword"
        placeholder="Repita a senha"
        autoComplete="new-password"
      />
    </AuthForm>
  )
}
