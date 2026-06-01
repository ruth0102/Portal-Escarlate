import type { FormEventHandler, ReactNode } from 'react'
import styles from './AuthPortal.module.css'

export type AuthMessage = {
  tone: 'neutral' | 'error' | 'success'
  text: string
}

type AuthFormProps = {
  active: boolean
  busy: boolean
  formId: string
  actionLabel: string
  message: AuthMessage
  meta?: ReactNode
  note?: ReactNode
  onSubmit: FormEventHandler<HTMLFormElement>
  children: ReactNode
}

export function AuthForm({
  active,
  busy,
  formId,
  actionLabel,
  message,
  meta,
  note,
  onSubmit,
  children,
}: AuthFormProps) {
  const statusClassName = [
    styles.status,
    message.tone === 'error' ? styles.statusError : '',
    message.tone === 'success' ? styles.statusSuccess : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <form
      id={formId}
      className={[styles.panel, active ? styles.panelActive : ''].filter(Boolean).join(' ')}
      autoComplete="on"
      onSubmit={onSubmit}
    >
      <div className={styles.fieldGroup}>{children}</div>

      {meta ? <div className={styles.rowMeta}>{meta}</div> : null}

      <button className={styles.action} type="submit" disabled={busy}>
        {busy ? 'Processando...' : actionLabel}
      </button>

      <div className={styles.microline}>notícias de alto impacto • consulta reservada</div>

      <div className={statusClassName}>
        <span>{message.text}</span>
      </div>

      {note ? <div className={styles.panelNote}>{note}</div> : null}
    </form>
  )
}
