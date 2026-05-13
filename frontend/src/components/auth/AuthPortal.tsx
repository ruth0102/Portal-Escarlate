import { useState } from 'react'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'
import styles from './AuthPortal.module.css'

type Mode = 'login' | 'register'

type AuthPortalProps = {
  initialMode?: Mode
  loginNotice?: string
}

export function AuthPortal({ initialMode = 'login', loginNotice }: AuthPortalProps) {
  const [mode, setMode] = useState<Mode>(initialMode)

  return (
    <main className={styles.page}>
      <section className={styles.scene}>
        <section className={styles.hero}>
          <div className={styles.brandStack}>
            <div className={styles.crest} aria-hidden="true">
              <img className={styles.crestImage} src="/favicon.ico" alt="" />
            </div>

            <div className={styles.headlineBlock}>
              <span className={styles.eyebrow}>Pesquisa inteligente e análise assistida</span>
              <h1 className={styles.title}>
                Portal <span className={styles.accent}>Escarlate</span>
              </h1>
              <p className={styles.lead}>
                Pesquise temas, conecte sinais entre notícias e transforme resultados em
                sínteses claras com apoio de inteligência artificial.
              </p>
            </div>
          </div>

          <div className={styles.heroFooter}>
            <article className={styles.feature}>
              <span className={styles.featureLabel}>Temas</span>
              <strong className={styles.featureValue}>Pesquise o que importa</strong>
            </article>

            <article className={styles.feature}>
              <span className={styles.featureLabel}>Resumo</span>
              <strong className={styles.featureValue}>Entenda rápido com IA</strong>
            </article>

            <article className={styles.feature}>
              <span className={styles.featureLabel}>Fontes</span>
              <strong className={styles.featureValue}>Compare visões diversas</strong>
            </article>
          </div>
        </section>

        <section className={styles.portal}>
          <div className={styles.portalWrap}>
            <div className={styles.formShell}>
              <header className={styles.formHeader}>
                <span className={styles.formKicker}>Acesso editorial restrito</span>
                <h2 className={styles.formTitle}>Acesse o portal</h2>
                <p className={styles.formCopy}>
                  Entre para explorar temas relevantes com pesquisa inteligente e acompanhar
                  sínteses claras a partir dos resultados encontrados.
                </p>
              </header>

              <div
                className={`${styles.modeSwitch} ${
                  mode === 'register' ? styles.modeSwitchRegister : ''
                }`}
                aria-label="Selecionar modo de acesso"
              >
                <span className={styles.modeIndicator} aria-hidden="true" />
                <button
                  className={`${styles.modeButton} ${
                    mode === 'login' ? styles.modeButtonActive : ''
                  }`}
                  type="button"
                  onClick={() => setMode('login')}
                >
                  Login
                </button>
                <button
                  className={`${styles.modeButton} ${
                    mode === 'register' ? styles.modeButtonActive : ''
                  }`}
                  type="button"
                  onClick={() => setMode('register')}
                >
                  Cadastro
                </button>
              </div>

              <div className={styles.panelArea}>
                <LoginForm active={mode === 'login'} initialNotice={loginNotice} />
                <RegisterForm active={mode === 'register'} />
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
