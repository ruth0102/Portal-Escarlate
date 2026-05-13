import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthForm, type AuthMessage } from './AuthForm'
import { PasswordField } from './PasswordField'
import { registerSchema } from '../../lib/auth/validation'
import styles from './AuthPortal.module.css'

type RegisterFormProps = {
  active: boolean
}

const defaultMessage: AuthMessage = {
  tone: 'neutral',
  text: 'Crie sua conta e confirme o e-mail para liberar o acesso.',
}

export function RegisterForm({ active }: RegisterFormProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<AuthMessage>(defaultMessage)

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
          const response = await fetch('/api/auth/register/request', {
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
                  ? 'Backend de cadastro ainda não foi migrado.'
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
            text: 'Backend de cadastro ainda não está disponível.',
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
            placeholder="novo@dominio.com"
            required
          />
        </span>
      </label>

      <PasswordField
        label="Senha"
        name="password"
        placeholder="Crie uma senha"
        autoComplete="new-password"
      />

      <PasswordField
        label="Confirmar senha"
        name="confirmPassword"
        placeholder="Repita a senha"
        autoComplete="new-password"
      />
    </AuthForm>
  )
}
