import { useState, type ChangeEventHandler } from 'react'
import styles from './AuthPortal.module.css'

type PasswordFieldProps = {
  label: string
  name: string
  placeholder: string
  autoComplete?: string
  value?: string
  onChange?: ChangeEventHandler<HTMLInputElement>
}

export function PasswordField({
  label,
  name,
  placeholder,
  autoComplete,
  value,
  onChange,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const actionLabel = visible ? 'Ocultar' : 'Mostrar'

  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.inputWrap}>
        <input
          className={`${styles.fieldInput} ${styles.passwordInput}`}
          type={visible ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
        />
        <button
          className={styles.passwordToggle}
          type="button"
          aria-label={`${actionLabel} ${label.toLowerCase()}`}
          title={`${actionLabel} ${label.toLowerCase()}`}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12s3.5-8 9-8 9 8 9 8-3.5 8-9 8-9-8-9-8Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
              <path d="M9.9 4.3A9.7 9.7 0 0 1 12 4c5.5 0 9 5.3 9 8a7.2 7.2 0 0 1-1.5 3.2" />
              <path d="M6.5 6.5C4.3 8 3 10.2 3 12c0 2.7 3.5 8 9 8 1.4 0 2.7-.3 3.8-.8" />
            </svg>
          )}
          <span className={styles.srOnly}>{actionLabel}</span>
        </button>
      </span>
    </label>
  )
}
