import Link from "next/link";
import axios from "axios";
import styles from "./verify-email.module.css";
import { SuccessButton } from "./SuccessButton"; 

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  const code = params.code?.trim();

  let verificadoComSucesso = false;

  if (code) {
    try {
      await axios.post("http://localhost:4000/verificar-email", { code });
      verificadoComSucesso = true;
    } catch (error) {
      console.error("Falha ao verificar código.");
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <span className={styles.kicker}>Verificação de e-mail</span>

        {/* Renderização Condicional: Se deu certo, mostra uma tela. Se deu erro, mostra outra. */}
        {verificadoComSucesso ? (
          <>
            <h1 className={styles.title}>E-mail Verificado!</h1>
            <p className={styles.copy}>
              Sua conta foi validada com sucesso. Para aplicar as mudanças e liberar seu acesso completo, por favor, faça o login novamente.
            </p>
            <SuccessButton />
          </>
        ) : (
          <>
            <h1 className={styles.title}>Código expirado ou inválido</h1>
            <p className={styles.copy}>
              Este link não pode mais ser usado, já foi validado ou não existe. 
              Acesse seu perfil ou solicite um novo cadastro.
            </p>
            <Link className={styles.action} href="/dashboard">
              Voltar para o Dashboard
            </Link>
          </>
        )}

      </section>
    </main>
  );
}