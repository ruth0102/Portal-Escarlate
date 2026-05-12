import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthForm, type AuthMessage } from './AuthForm'
import { registerSchema } from '../../lib/auth/validation'
import styles from './AuthPortal.module.css'

type RegisterFormProps = {
  active: boolean
}

const defaultMessage: AuthMessage = {
  tone: 'neutral',
  text: 'Cadastro: informe seus dados para receber um link de confirmacao por e-mail antes da criacao da conta.',
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
      note="O cadastro so sera concluido depois que o link enviado ao e-mail for aberto dentro do prazo."
      meta={
        <>
          <label className={styles.checkline}>
            <input type="checkbox" name="terms" required defaultChecked />
            <span>Aceito os termos de acesso e coleta de dados</span>
          </label>
          <Link className={styles.textLink} to="/termos-de-uso">
            Ler condicoes
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
                  ? 'Backend de cadastro ainda nao foi migrado.'
                  : 'Nao foi possivel concluir o cadastro.'),
            })
            return
          }

          setMessage({
            tone: 'success',
            text:
              payload.message ??
              'Se este e-mail puder receber acesso, enviaremos um link de confirmacao em instantes.',
          })
        } catch {
          setMessage({
            tone: 'error',
            text: 'Backend de cadastro ainda nao esta disponivel.',
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
            placeholder="Crie uma senha"
            required
          />
          <span className={styles.fieldIcon}>✧</span>
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Confirmar senha</span>
        <span className={styles.inputWrap}>
          <input
            className={styles.fieldInput}
            type="password"
            name="confirmPassword"
            placeholder="Repita a senha"
            required
          />
          <span className={styles.fieldIcon}>✦</span>
        </span>
      </label>
    </AuthForm>
  )
}
