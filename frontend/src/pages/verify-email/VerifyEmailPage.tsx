import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import styles from './verify-email.module.css'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')?.trim()
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>(
    code ? 'loading' : 'error',
  )
  const [message, setMessage] = useState(
    code
      ? 'Validando seu codigo de verificacao.'
      : 'Este link nao pode mais ser usado. Solicite um novo cadastro para receber outro e-mail de confirmacao.',
  )
  const verificationStartedRef = useRef(false)

  useEffect(() => {
    if (!code) {
      return
    }

    if (verificationStartedRef.current) {
      return
    }

    verificationStartedRef.current = true

    const controller = new AbortController()
    const verificationCode = code

    async function verifyEmail() {
      try {
        const response = await fetch(
          `/api/auth/verify-email?code=${encodeURIComponent(verificationCode)}`,
          {
            signal: controller.signal,
          },
        )
        const payload = (await response.json().catch(() => ({}))) as { message?: string }

        if (!response.ok) {
          setState('error')
          setMessage(payload.message ?? 'Codigo expirado ou invalido.')
          return
        }

        setState('success')
        setMessage(payload.message ?? 'E-mail verificado com sucesso. Agora faca login para acessar.')
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setState('error')
        setMessage('Nao foi possivel verificar o e-mail agora.')
      }
    }

    verifyEmail()

    return () => controller.abort()
  }, [code])

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <span className={styles.kicker}>Verificacao de e-mail</span>
        <h1 className={styles.title}>
          {state === 'success'
            ? 'E-mail verificado'
            : state === 'loading'
              ? 'Verificando e-mail'
              : 'Codigo expirado ou invalido'}
        </h1>
        <p className={styles.copy}>{message}</p>
        <Link className={styles.action} to="/login">
          {state === 'success' ? 'Ir para login' : 'Voltar para login'}
        </Link>
      </section>
    </main>
  )
}
