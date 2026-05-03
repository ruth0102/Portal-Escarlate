"use client";

import { useState } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import styles from "./AuthPortal.module.css";

type Mode = "login" | "register";

type AuthPortalProps = {
  initialMode?: Mode;
  loginNotice?: string; // Usado para mensagens de sucesso
  loginError?: string;  // NOVO: Usado para mensagens de erro
};

export function AuthPortal({
  initialMode = "login",
  loginNotice,
  loginError, // Recebendo a nova prop aqui
}: AuthPortalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <main className={styles.page}>
      <span className={`${styles.ambientOrb} ${styles.orb1}`} />
      <span className={`${styles.ambientOrb} ${styles.orb2}`} />
      <span className={`${styles.ambientOrb} ${styles.orb3}`} />

      <section className={styles.scene}>
        <span className={`${styles.corner} ${styles.tl}`} />
        <span className={`${styles.corner} ${styles.tr}`} />
        <span className={`${styles.corner} ${styles.bl}`} />
        <span className={`${styles.corner} ${styles.br}`} />
        <span className={styles.sigil} />
        <span className={styles.verticalInsignia}>
          curadoria de impacto publico • arquivos publicos • poder sob analise
        </span>

        <section className={styles.hero}>
          <div className={styles.brandStack}>
            <div className={styles.brandTopline}>Colecao privada</div>

            <div className={styles.crest} aria-hidden="true">
              <span className={styles.crestMark}>S</span>
            </div>

            <div className={styles.headlineBlock}>
              <span className={styles.eyebrow}>
                Inteligencia editorial de alto impacto
              </span>
              <h1 className={styles.title}>
                Portal <span className={styles.accent}>Escarlate</span>
              </h1>
              <p className={styles.lead}>
                Uma pagina de noticias feita para quem nao quer ruido. O foco
                aqui sao apenas acontecimentos capazes de afetar a vida publica,
                a economia, o poder institucional e a sociedade em escala real.
                Em vez de volume, a proposta e curadoria severa: crises,
                decisoes, aliancas, investigacoes, disputas estrategicas e
                movimentos de pessoas com influencia concreta sobre o presente e
                o futuro.
              </p>
              <p className={styles.lead}>
                A experiencia tambem apoia pesquisa em arquivos publicos para
                rastrear sinais relevantes em torno de agentes politicos e
                figuras de poder: contratos, licitacoes, votacoes, patrimonio
                declarado, diarios oficiais, atos administrativos, processos,
                investigacoes e registros disponiveis ao cidadao. Tudo com
                estetica nobre, atmosfera reservada e sensacao de acesso a uma
                ala restrita da informacao.
              </p>
            </div>
          </div>

          <div className={styles.heroFooter}>
            <article className={styles.feature}>
              <span className={styles.featureLabel}>Curadoria</span>
              <strong className={styles.featureValue}>
                So o que move o tabuleiro
              </strong>
              <p className={styles.featureCopy}>
                Noticias filtradas por impacto real na vida publica, no poder e
                nas decisoes que alcancam milhoes.
              </p>
            </article>

            <article className={styles.feature}>
              <span className={styles.featureLabel}>Arquivos publicos</span>
              <strong className={styles.featureValue}>Rastro documental</strong>
              <p className={styles.featureCopy}>
                Apoio a pesquisa em fontes abertas para cruzar nomes, atos
                oficiais, contratos, votacoes e registros publicos.
              </p>
            </article>

            <article className={styles.feature}>
              <span className={styles.featureLabel}>Foco editorial</span>
              <strong className={styles.featureValue}>
                Poder, crise e relevancia
              </strong>
              <p className={styles.featureCopy}>
                Uma vitrine de fatos decisivos, investigacoes sensiveis e
                personagens com influencia institucional ou economica.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.portal}>
          <div className={styles.portalWrap}>
            <div className={styles.formShell}>
              <header className={styles.formHeader}>
                <span className={styles.formKicker}>
                  Acesso editorial restrito
                </span>
                <h2 className={styles.formTitle}>Entre na ala reservada</h2>
                <p className={styles.formCopy}>
                  Faça login para acompanhar a curadoria de noticias realmente
                  relevantes e acessar a area de pesquisa documental em arquivos
                  publicos. O cadastro mantem a entrada simples, mas a
                  apresentacao comunica vigilancia, exclusividade e analise
                  seria de temas sensiveis.
                </p>
              </header>

              <div
                className={styles.modeSwitch}
                aria-label="Selecionar modo de acesso"
              >
                <button
                  className={`${styles.modeButton} ${
                    mode === "login" ? styles.modeButtonActive : ""
                  }`}
                  type="button"
                  onClick={() => setMode("login")}
                >
                  Login
                </button>
                <button
                  className={`${styles.modeButton} ${
                    mode === "register" ? styles.modeButtonActive : ""
                  }`}
                  type="button"
                  onClick={() => setMode("register")}
                >
                  Cadastro
                </button>
              </div>

              <div className={styles.panelArea}>
                <LoginForm
                  active={mode === "login"}
                  initialNotice={loginNotice} // Passa o sucesso se houver
                  errorMessage={loginError}   // Passa o erro se houver
                />
                <RegisterForm active={mode === "register"} />
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}